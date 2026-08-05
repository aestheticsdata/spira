import { Module } from "@nestjs/common";
import { IssuesController } from "@issues/issues.controller";
import { IssuesService } from "@issues/issues.service";

@Module({
  controllers: [IssuesController],
  providers: [IssuesService],
  exports: [IssuesService],
})
export class IssuesModule {}
