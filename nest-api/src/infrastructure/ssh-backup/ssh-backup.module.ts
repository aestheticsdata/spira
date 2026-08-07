import { Module } from "@nestjs/common";
import { SshBackupService } from "@infrastructure/ssh-backup/ssh-backup.service";

@Module({
  providers: [SshBackupService],
  exports: [SshBackupService],
})
export class SshBackupModule {}
