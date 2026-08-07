import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { spawn } from "child_process";
import { createWriteStream } from "fs";
import { mkdir, readdir, rename, rm, stat } from "fs/promises";
import { join } from "path";
import { pipeline } from "stream/promises";
import { createGzip } from "zlib";
import { SshBackupService } from "@infrastructure/ssh-backup/ssh-backup.service";
import { withZeusReport } from "@infrastructure/zeus-report";

import type { DbBackupConfig } from "@config/db-backup.config";
import type { ZeusCronOutcome } from "@infrastructure/zeus-report";

/**
 * Six fields, seconds first — `@nestjs/schedule`'s own form. Midnight and noon, in the process's
 * zone. Declared once because Zeus is told the same string the scheduler runs on, and the two
 * drifting apart is exactly how a healthy job starts being reported as late.
 */
const BACKUP_SCHEDULE = "0 0 */12 * * *";

/** The slug this job reports under. Stable: it is the identity of the row on Zeus's `/cron`. */
const BACKUP_CRON_KEY = "db-backup";

/** Zeus caps a summary at 200 characters and rejects anything longer outright. */
const MAX_SUMMARY = 200;

const FILE_PREFIX = "spira-";
const FILE_SUFFIX = ".sql.gz";

/** Written under this name until the dump has succeeded, so a half-finished file is never shippable. */
const PARTIAL_SUFFIX = ".part";

/** Config value → the environment variable an operator would have to go and set. */
const REQUIRED_CONFIG: ReadonlyArray<[keyof DbBackupConfig, string]> = [
  ["dbUser", "DATABASE_URL (user)"],
  ["dbPassword", "DATABASE_URL (password)"],
  ["dbName", "DATABASE_URL (database)"],
  ["dumpPath", "SPIRA_DUMP_PATH"],
  ["remoteBackupPath", "SPIRA_BACKUP_SERVER_PATH"],
];

/**
 * A gzipped dump smaller than this is empty in every practical sense — a dump of nothing at all
 * compresses to a few hundred bytes. It is a floor for "obviously broken", not a health check.
 */
const MIN_PLAUSIBLE_BYTES = 1024;

const MS_PER_DAY = 86_400_000;

/** `spira-2026-08-07T00-00.sql.gz` — ISO to the minute, so the names sort chronologically. */
function dumpFileName(now: Date): string {
  return `${FILE_PREFIX}${now.toISOString().slice(0, 16).replace(":", "-")}${FILE_SUFFIX}`;
}

function isDumpFile(name: string): boolean {
  return name.startsWith(FILE_PREFIX) && name.endsWith(FILE_SUFFIX);
}

@Injectable()
export class DbBackupCronService {
  private readonly logger = new Logger(DbBackupCronService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly sshBackup: SshBackupService,
  ) {}

  /**
   * Dumps the database and copies it to `vps-debian`, twice a day — and tells Zeus what happened
   * (COS-447).
   *
   * Spira had no backup at all before COS-441 — the rotation documented in `DEPLOY.md` was a crontab
   * snippet nobody had installed, on a box that has no cron daemon to install it into. That is why
   * the schedule lives in the app process, the way PFA's and bkmk's do: it depends on nothing but
   * the API being up, which is the one thing already being watched.
   *
   * Watched by whom, though, was the part still missing. The very first real run failed with
   * `EACCES: permission denied, mkdir '/home/spira'` and was caught only because it had been
   * triggered by hand; left to fire at midnight it would have failed into a log nobody reads. Both
   * of PFA's recorded failure modes — a dump erroring for weeks, and a deploy that dropped one
   * variable so the job never ran — now surface on Zeus's `/cron`, and the schedule reported
   * alongside is what lets Zeus flag the job overdue if it stops firing altogether.
   */
  @Cron(BACKUP_SCHEDULE)
  async handleDbBackup(): Promise<void> {
    await withZeusReport(BACKUP_CRON_KEY, BACKUP_SCHEDULE, () => this.runBackup());
  }

  /**
   * No `timezone` is reported, deliberately: the `@Cron` above pins none, so it fires in the
   * process's own zone — UTC on ks-b — which is what Zeus reads a schedule in by default. Naming
   * `Europe/Paris` here would have it expect every run two hours early in summer.
   */
  private async runBackup(): Promise<ZeusCronOutcome> {
    const config = this.configService.get<DbBackupConfig>("dbBackup");

    if (!config?.enabled) {
      return { status: "skipped", summary: "backups are disabled in this environment" };
    }

    const missing = REQUIRED_CONFIG.filter(([key]) => !config[key]).map(([, variable]) => variable);
    if (missing.length > 0) {
      // Named rather than counted. "Missing config" sends the reader back to the source to find out
      // which one; this is actionable on its own.
      this.logger.warn(`DB backup skipped — missing config: ${missing.join(", ")}`);
      return { status: "skipped", summary: `missing config: ${missing.join(", ")}`.slice(0, MAX_SUMMARY) };
    }

    try {
      const { path, bytes } = await this.dump(config);
      await this.pruneLocal(config);

      // Checked here rather than inside `shipOffBox` so the dump still happens when the SSH leg is
      // unconfigured: a local copy is worth having, and is what the operator restores from nine
      // times in ten.
      if (!this.sshBackup.enabled) {
        const missingSsh = this.sshBackup.missingConfig;
        const reason = missingSsh.length > 0 ? `missing config: ${missingSsh.join(", ")}` : "SSH backup is disabled";
        this.logger.error(`Off-server copy skipped — ${reason}; the dump is local only`);

        // `failed`, not `ok` with a caveat. The job's reason for existing is a copy that survives
        // losing ks-b; a dump sitting on the box that was lost is not one. A green row here would be
        // precisely the backup that looks healthy right up until the day it is needed.
        return {
          status: "failed",
          summary: `dumped locally but not shipped — ${reason}`.slice(0, MAX_SUMMARY),
          detail: { bytes, file: path, offBox: false },
        };
      }

      await this.shipOffBox(config, path);

      // The size is the one number worth carrying: a dump that succeeds and shrinks by an order of
      // magnitude is a broken backup that looks exactly like a working one.
      return {
        summary: `dumped ${config.dbName} (${bytes} bytes) → ${config.remoteBackupPath}`.slice(0, MAX_SUMMARY),
        detail: { bytes, file: path, offBox: true },
      };
    } catch (err) {
      const message = (err as Error).message;

      // Reported rather than rethrown. `withZeusReport` would report and rethrow, and the throw
      // would land in `@nestjs/schedule` as an unhandled rejection that takes down more than the
      // backup — this job swallowed its errors before and continues to, so the report changes what
      // is *visible* without changing what the scheduler does.
      this.logger.error(`DB backup failed: ${message}`);
      return { status: "failed", summary: message.slice(0, MAX_SUMMARY) };
    }
  }

  /** Dumps and gzips in one pass, returning the finished file and its size. */
  private async dump(config: DbBackupConfig): Promise<{ path: string; bytes: number }> {
    await mkdir(config.dumpPath, { recursive: true });

    const finalPath = join(config.dumpPath, dumpFileName(new Date()));
    const partialPath = `${finalPath}${PARTIAL_SUFFIX}`;

    // `spawn` without a shell: the password never becomes a command line, so it never appears in
    // `ps`, and no part of DATABASE_URL can be read as shell syntax.
    const proc = spawn(
      config.dumpBinary,
      [
        "--single-transaction",
        // The dump user has no PROCESS privilege, which MySQL 8 requires for tablespace metadata.
        "--no-tablespaces",
        `--host=${config.dbHost}`,
        `--port=${config.dbPort}`,
        `--user=${config.dbUser}`,
        config.dbName,
      ],
      { env: { ...process.env, MYSQL_PWD: config.dbPassword } },
    );

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const exited = new Promise<number>((resolve, reject) => {
      proc.on("error", reject);
      proc.on("close", resolve);
    });
    const piped = pipeline(proc.stdout, createGzip(), createWriteStream(partialPath));

    // Both are awaited below, but one at a time. A binary that does not exist rejects `exited`
    // immediately — while the await is still on `piped` — and an unhandled rejection there does not
    // reach the catch below at all: it kills the process, and pm2 restarts the API over a failed
    // backup. Parking a no-op handler on each keeps whichever settles first merely pending.
    exited.catch(() => {});
    piped.catch(() => {});

    try {
      await piped;
      const code = await exited;
      if (code !== 0) {
        throw new Error(`${config.dumpBinary} exited ${code}: ${stderr.trim()}`);
      }
    } catch (err) {
      await rm(partialPath, { force: true });
      throw err;
    }

    const { size } = await stat(partialPath);
    if (size < MIN_PLAUSIBLE_BYTES) {
      await rm(partialPath, { force: true });
      throw new Error(`dump was ${size} bytes — refusing to keep it`);
    }

    // Only now does the file take a name the shipping and pruning steps will recognise.
    await rename(partialPath, finalPath);
    this.logger.log(`Dumped ${config.dbName} → ${finalPath} (${size} bytes)`);

    return { path: finalPath, bytes: size };
  }

  /** The first line of defense: recent history, on the box, cheap to restore from. */
  private async pruneLocal(config: DbBackupConfig): Promise<void> {
    const cutoff = Date.now() - config.localRetentionDays * MS_PER_DAY;
    const names = await readdir(config.dumpPath);

    for (const name of names) {
      // `.part` files from a crashed run are collected here too; nothing else ever removes them.
      const isStale = isDumpFile(name) || name.endsWith(PARTIAL_SUFFIX);
      if (!isStale) continue;

      const path = join(config.dumpPath, name);
      const { mtimeMs } = await stat(path);
      if (mtimeMs < cutoff) {
        await rm(path, { force: true });
        this.logger.log(`Pruned local backup ${name}`);
      }
    }
  }

  /** The copy that survives ks-b itself being lost. The caller has already checked it can be made. */
  private async shipOffBox(config: DbBackupConfig, localPath: string): Promise<void> {
    const remoteDir = config.remoteBackupPath.replace(/\/$/, "");
    const fileName = localPath.split("/").pop()!;
    await this.sshBackup.copyFile(localPath, `${remoteDir}/${fileName}`);
    await this.pruneRemote(config, remoteDir);
  }

  /**
   * Keeps the newest `remoteRetentionCopies` generations off-box.
   *
   * PFA overwrites a single `pfadump.sql` on every run, which means one dump that succeeds while
   * corrupt destroys the last good off-server copy. Generations cost a few megabytes and remove that
   * failure mode entirely.
   */
  private async pruneRemote(config: DbBackupConfig, remoteDir: string): Promise<void> {
    const names = (await this.sshBackup.listDir(remoteDir)).filter(isDumpFile).sort();
    const doomed = names.slice(0, Math.max(0, names.length - config.remoteRetentionCopies));

    for (const name of doomed) {
      await this.sshBackup.deleteFile(`${remoteDir}/${name}`);
      this.logger.log(`Pruned remote backup ${name}`);
    }
  }
}
