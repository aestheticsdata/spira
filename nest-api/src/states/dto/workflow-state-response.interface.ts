export type StateType = "backlog" | "unstarted" | "started" | "completed" | "canceled";

export interface WorkflowStateDto {
  id: string;
  name: string;
  type: StateType;
  color: string;
  position: number;
}
