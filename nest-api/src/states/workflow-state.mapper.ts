import type { Prisma, WorkflowState } from "../../generated/prisma/client";

import type { StateType, WorkflowStateDto } from "@states/dto/workflow-state-response.interface";

/**
 * Every module that joins a state through — projects, issues, search — selects
 * it with this, so the nested shape cannot drift between endpoints.
 */
export const WORKFLOW_STATE_SELECT = {
  id: true,
  name: true,
  type: true,
  color: true,
  position: true,
} as const satisfies Prisma.WorkflowStateSelect;

export type WorkflowStateRow = Pick<WorkflowState, "id" | "name" | "type" | "color" | "position">;

export function toWorkflowStateDto(state: WorkflowStateRow): WorkflowStateDto {
  return {
    id: state.id,
    name: state.name,
    // The column is a VarChar the seed constrains; MySQL gives no enum to lean on.
    type: state.type as StateType,
    color: state.color,
    position: state.position,
  };
}
