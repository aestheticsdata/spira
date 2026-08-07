import { Logger } from "@nestjs/common";
import { registerAs } from "@nestjs/config";
import { readFileSync } from "fs";

export interface SshBackupConfig {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  privateKey: Buffer | null;
}

const logger = new Logger("SshBackupConfig");

/**
 * Reads the key without letting a bad path take the API down with it.
 *
 * A missing or unreadable key is a broken backup, not a broken app — Spira should keep serving
 * tickets and report the failure through the backup job, which names the reason. Throwing here would
 * turn a degraded backup into an outage, and it would happen at boot, which is exactly when nobody
 * is looking at the backup.
 */
function readPrivateKey(keyPath: string | undefined): Buffer | null {
  if (!keyPath) return null;

  try {
    return readFileSync(keyPath);
  } catch (err) {
    logger.error(`SSH key unreadable at ${keyPath}: ${(err as Error).message} — off-server backup disabled`);
    return null;
  }
}

/**
 * The credentials for `vps-debian`, the off-server backup target.
 *
 * The two `DEBIAN_OVH_VPS_*` names are deliberately the ones PFA already uses on ks-b: the same box,
 * the same key, the same account. Renaming them per-app would mean a second copy of the same secret
 * drifting out of sync with the first.
 */
export default registerAs("sshBackup", (): SshBackupConfig => {
  const enabled = process.env.NODE_ENV === "production";

  return {
    enabled,
    host: process.env.SPIRA_BACKUP_SERVER_IP ?? "",
    port: 22,
    username: process.env.DEBIAN_OVH_VPS_SSH_USER ?? "",
    privateKey: enabled ? readPrivateKey(process.env.DEBIAN_OVH_VPS_SSH_KEY_PATH) : null,
  };
});
