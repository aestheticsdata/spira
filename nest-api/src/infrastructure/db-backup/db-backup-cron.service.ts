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

import type { DbBackupConfig } from "@config/db-backup.config";

/** Six fields, seconds first — `@nestjs/schedule`'s own form. Midnight and noon, in the process's zone. */
const BACKUP_SCHEDULE = "0 0 */12 * * *";

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
   * Dumps the database and copies it to `vps-debian`, twice a day.
   *
   * Spira had no backup at all before this — the rotation documented in `DEPLOY.md` was a crontab
   * snippet nobody had installed, on a box that has no cron daemon to install it into. That is why
   * the schedule lives in the app process, the way PFA's and bkmk's do: it depends on nothing but
   * the API being up, which is the one thing already being watched.
   */
  @Cron(BACKUP_SCHEDULE)
  async handleDbBackup(): Promise<void> {
    const config = this.configService.get<DbBackupConfig>("dbBackup");

    if (!config?.enabled) {
      return;
    }

    const missing = REQUIRED_CONFIG.filter(([key]) => !config[key]).map(([, variable]) => variable);
    if (missing.length > 0) {
      // Named rather than counted. "Missing config" sends the reader back to the source to find out
      // which one; this is actionable on its own.
      this.logger.warn(`DB backup skipped — missing config: ${missing.join(", ")}`);
      return;
    }

    try {
      const localPath = await this.dump(config);
      await this.pruneLocal(config);
      await this.shipOffBox(config, localPath);
    } catch (err) {
      // Swallowed deliberately: an unhandled rejection here lands in `@nestjs/schedule` and takes
      // down more than the backup. The log is the report.
      this.logger.error(`DB backup failed: ${(err as Error).message}`);
    }
  }

  /** Dumps and gzips in one pass, returning the path of the finished file. */
  private async dump(config: DbBackupConfig): Promise<string> {
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

    return finalPath;
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

  /** The copy that survives ks-b itself being lost. */
  private async shipOffBox(config: DbBackupConfig, localPath: string): Promise<void> {
    if (!this.sshBackup.enabled) {
      this.logger.warn("Off-server copy skipped — SSH backup is not configured; the dump is local only");
      return;
    }

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
