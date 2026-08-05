import { Module } from "@nestjs/common";
import { LabelsController } from "@labels/labels.controller";
import { LabelsService } from "@labels/labels.service";

@Module({
  controllers: [LabelsController],
  providers: [LabelsService],
  exports: [LabelsService],
})
export class LabelsModule {}
