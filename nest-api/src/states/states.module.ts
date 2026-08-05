import { Module } from "@nestjs/common";
import { StatesController } from "@states/states.controller";
import { StatesService } from "@states/states.service";

@Module({
  controllers: [StatesController],
  providers: [StatesService],
  exports: [StatesService],
})
export class StatesModule {}
