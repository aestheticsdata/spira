import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import appConfig from "@config/app.config";
import { validate } from "@config/env.validation";
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
      validate,
      load: [appConfig],
    }),
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
  ],
  controllers: [AppController],
})
export class AppModule {}
