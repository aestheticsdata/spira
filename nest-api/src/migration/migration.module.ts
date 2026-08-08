import { Module } from "@nestjs/common";
import { MigrationController } from "@migration/migration.controller";
import { MigrationService } from "@migration/migration.service";

@Module({
  controllers: [MigrationController],
  providers: [MigrationService],
})
export class MigrationModule {}
