import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { WORKFLOW_STATE_SELECT, toWorkflowStateDto } from "@states/workflow-state.mapper";

import type { WorkflowStateDto } from "@states/dto/workflow-state-response.interface";

@Injectable()
export class StatesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<WorkflowStateDto[]> {
    const states = await this.prisma.workflowState.findMany({
      select: WORKFLOW_STATE_SELECT,
      orderBy: { position: "asc" },
    });

    return states.map(toWorkflowStateDto);
  }
}
