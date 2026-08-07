import { Logger } from "@nestjs/common";
import { registerAs } from "@nestjs/config";

export interface DbBackupConfig {
  enabled: boolean;
  dbUser: string;
  dbPassword: string;
  dbName: string;
  dbHost: string;
  dbPort: string;
  dumpPath: string;
  remoteBackupPath: string;
  dumpBinary: string;
  localRetentionDays: number;
  remoteRetentionCopies: number;
}

const logger = new Logger("DbBackupConfig");

/** Two dumps a day for fourteen days — the local rotation's depth, expressed off-server. */
const DEFAULT_REMOTE_COPIES = 28;

const DEFAULT_LOCAL_RETENTION_DAYS = 14;

interface DatabaseCredentials {
  user: string;
  password: string;
  name: string;
  host: string;
  port: string;
}

const EMPTY_CREDENTIALS: DatabaseCredentials = { user: "", password: "", name: "", host: "", port: "" };

/**
 * Derives the dump credentials from `DATABASE_URL` rather than from a second set of `DB_USER` /
 * `DB_PASSWORD` / `DB` variables.
 *
 * PFA keeps both, and the failure that follows is predictable: the password gets rotated in one place
 * and the backup starts failing authentication silently. Spira already has exactly one statement of
 * how to reach its database, and the backup should not be entitled to its own opinion.
 */
function parseDatabaseUrl(url: string | undefined): DatabaseCredentials {
  if (!url) return EMPTY_CREDENTIALS;

  try {
    const parsed = new URL(url);
    return {
      // The URL object hands back percent-encoded components; mysqldump wants the real bytes.
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      name: parsed.pathname.replace(/^\//, ""),
      host: parsed.hostname,
      port: parsed.port || "3306",
    };
  } catch (err) {
    logger.error(`DATABASE_URL is not a parseable URL: ${(err as Error).message}`);
    return EMPTY_CREDENTIALS;
  }
}

export default registerAs("dbBackup", (): DbBackupConfig => {
  const enabled = process.env.NODE_ENV === "production";
  const credentials = parseDatabaseUrl(process.env.DATABASE_URL);

  return {
    enabled,
    dbUser: credentials.user,
    dbPassword: credentials.password,
    dbName: credentials.name,
    dbHost: credentials.host,
    dbPort: credentials.port,
    dumpPath: process.env.SPIRA_DUMP_PATH ?? "",
    remoteBackupPath: process.env.SPIRA_BACKUP_SERVER_PATH ?? "",
    // ks-b runs MySQL, where the binary is `mysqldump`. MariaDB ships the same tool as `mariadb-dump`
    // and only sometimes keeps the compatibility symlink, so the name stays overridable.
    dumpBinary: process.env.SPIRA_DUMP_BINARY ?? "mysqldump",
    localRetentionDays: Number(process.env.SPIRA_LOCAL_RETENTION_DAYS ?? DEFAULT_LOCAL_RETENTION_DAYS),
    remoteRetentionCopies: Number(process.env.SPIRA_REMOTE_RETENTION_COPIES ?? DEFAULT_REMOTE_COPIES),
  };
});
