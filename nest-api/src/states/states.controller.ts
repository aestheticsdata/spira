import { Controller, Get, UseGuards } from "@nestjs/common";
import { StatesService } from "@states/states.service";
import { ApiAuthGuard } from "@auth/guards/api-auth.guard";

import type { WorkflowStateDto } from "@states/dto/workflow-state-response.interface";

@Controller("states")
export class StatesController {
  constructor(private readonly statesService: StatesService) {}

  @Get()
  @UseGuards(ApiAuthGuard)
  findAll(): Promise<WorkflowStateDto[]> {
    return this.statesService.findAll();
  }
}
