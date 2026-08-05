import { Controller, Get, UseGuards } from "@nestjs/common";
import { StatesService } from "@states/states.service";
import { SessionAuthGuard } from "@auth/guards/session-auth.guard";

import type { WorkflowStateDto } from "@states/dto/workflow-state-response.interface";

@Controller("states")
export class StatesController {
  constructor(private readonly statesService: StatesService) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  findAll(): Promise<WorkflowStateDto[]> {
    return this.statesService.findAll();
  }
}
