import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { AppController } from "./app.controller";
import appConfig from "@config/app.config";
import dbBackupConfig from "@config/db-backup.config";
import sshBackupConfig from "@config/ssh-backup.config";
import { validate } from "@config/env.validation";
import { DbBackupModule } from "@infrastructure/db-backup/db-backup.module";
import { RedisModule } from "@redis/redis.module";
import { PrismaModule } from "./prisma/prisma.module";
import { UsersModule } from "@users/users.module";
import { StatesModule } from "@states/states.module";
import { LabelsModule } from "@labels/labels.module";
import { ProjectsModule } from "@projects/projects.module";
import { IssuesModule } from "@issues/issues.module";
import { SearchModule } from "@search/search.module";
import { ViewsModule } from "@views/views.module";
import { TokensModule } from "@tokens/tokens.module";
import { MigrationModule } from "@migration/migration.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
      validate,
      load: [appConfig, dbBackupConfig, sshBackupConfig],
    }),
    ScheduleModule.forRoot(),
    DbBackupModule,
    RedisModule,
    PrismaModule,
    UsersModule,
    StatesModule,
    LabelsModule,
    ProjectsModule,
    IssuesModule,
    SearchModule,
    ViewsModule,
    TokensModule,
    MigrationModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
