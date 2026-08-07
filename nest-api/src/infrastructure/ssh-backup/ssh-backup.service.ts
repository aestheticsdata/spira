import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client } from "ssh2";

import type { SFTPWrapper } from "ssh2";
import type { SshBackupConfig } from "@config/ssh-backup.config";

/** `SSH_FX_NO_SUCH_FILE`. Deleting something already gone is the desired end state, not an error. */
const SFTP_NO_SUCH_FILE = 2;

/** `SSH_FX_FAILURE`, which is what a server returns for "directory already exists". */
const SFTP_FAILURE = 4;

@Injectable()
export class SshBackupService {
  private readonly logger = new Logger(SshBackupService.name);
  private readonly config: SshBackupConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = this.configService.getOrThrow<SshBackupConfig>("sshBackup");
  }

  /**
   * The environment variables standing between this service and a working off-server copy, named.
   *
   * Named rather than counted, and derived rather than duplicated: `enabled` is defined as this list
   * being empty, so what the backup job reports to Zeus and what this service will actually do
   * cannot disagree. Only meaningful in production — outside it `privateKey` is deliberately never
   * read, so every variable would look missing.
   *
   * The username is checked here although it never disabled the service before. An empty one used to
   * surface as an SSH authentication failure at the last step of a job that had already dumped;
   * naming the variable up front is the same information, hours earlier.
   */
  get missingConfig(): string[] {
    const missing: string[] = [];
    if (this.config.host === "") missing.push("SPIRA_BACKUP_SERVER_IP");
    if (this.config.username === "") missing.push("DEBIAN_OVH_VPS_SSH_USER");
    // Null covers both "unset" and "set but unreadable" — `readPrivateKey` logs which at boot.
    if (this.config.privateKey === null) missing.push("DEBIAN_OVH_VPS_SSH_KEY_PATH");
    return missing;
  }

  /**
   * Whether an off-server copy can actually be made. A key that failed to load leaves the service
   * configured but unusable, and the caller reports that as a failure rather than pretending it worked.
   */
  get enabled(): boolean {
    return this.config.enabled && this.missingConfig.length === 0;
  }

  async copyFile(localPath: string, remotePath: string): Promise<void> {
    const sftp = await this.connect();
    try {
      await this.ensureRemoteDir(sftp, remotePath);
      await new Promise<void>((resolve, reject) => {
        sftp.fastPut(localPath, remotePath, {}, (err) => (err ? reject(err) : resolve()));
      });
      this.logger.log(`Backup copy OK: ${remotePath}`);
    } finally {
      sftp.end();
    }
  }

  /** Filenames only, unsorted — the caller decides what order means. */
  async listDir(remoteDir: string): Promise<string[]> {
    const sftp = await this.connect();
    try {
      return await new Promise<string[]>((resolve, reject) => {
        sftp.readdir(remoteDir, (err, entries) => {
          if (err) {
            if ((err as { code?: number }).code === SFTP_NO_SUCH_FILE) {
              resolve([]);
              return;
            }
            reject(err);
            return;
          }
          resolve(entries.map((entry) => entry.filename));
        });
      });
    } finally {
      sftp.end();
    }
  }

  async deleteFile(remotePath: string): Promise<void> {
    const sftp = await this.connect();
    try {
      await new Promise<void>((resolve, reject) => {
        sftp.unlink(remotePath, (err) => {
          if (err && (err as { code?: number }).code !== SFTP_NO_SUCH_FILE) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    } finally {
      sftp.end();
    }
  }

  private connect(): Promise<SFTPWrapper> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      conn.on("error", (err) => {
        this.logger.error(`SSH connection error: ${err.message}`);
        reject(err);
      });
      conn.on("ready", () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }
          sftp.on("close", () => conn.end());
          resolve(sftp);
        });
      });
      conn.connect({
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        privateKey: this.config.privateKey ?? undefined,
      });
    });
  }

  private async ensureRemoteDir(sftp: SFTPWrapper, filePath: string): Promise<void> {
    await this.mkdirRecursive(sftp, filePath.substring(0, filePath.lastIndexOf("/")));
  }

  private mkdirRecursive(sftp: SFTPWrapper, dir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (dir === "" || dir === "/") {
        resolve();
        return;
      }
      sftp.stat(dir, (err) => {
        if (!err) {
          resolve();
          return;
        }
        this.mkdirRecursive(sftp, dir.substring(0, dir.lastIndexOf("/")))
          .then(() => {
            sftp.mkdir(dir, (mkdirErr) => {
              // A concurrent run may have created it between the stat and the mkdir.
              if (mkdirErr && (mkdirErr as { code?: number }).code !== SFTP_FAILURE) {
                reject(mkdirErr);
                return;
              }
              resolve();
            });
          })
          .catch(reject);
      });
    });
  }
}
