import { Module } from "@nestjs/common";
import { ViewsController } from "@views/views.controller";
import { ViewsService } from "@views/views.service";

@Module({
  controllers: [ViewsController],
  providers: [ViewsService],
  exports: [ViewsService],
})
export class ViewsModule {}
