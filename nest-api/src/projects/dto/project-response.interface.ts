export type StateType = "backlog" | "unstarted" | "started" | "completed" | "canceled";

export interface WorkflowStateDto {
  id: string;
  name: string;
  type: StateType;
  color: string;
  position: number;
}

export interface ProjectSummaryDto {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  color: string | null;
}

export interface ProjectListItemDto extends ProjectSummaryDto {
  summary: string | null;
  status: WorkflowStateDto;
  priority: number;
  /** Live issues only — archived ones count for nothing here. */
  issueCount: number;
  completedCount: number;
  /** 0..1 — completedCount / issueCount, 0 when there are no issues. */
  progress: number;
  /** How many of this project's issues carry a legacyIdentifier. */
  legacyCount: number;
  archivedAt: string | null;
}

export interface ProjectDto extends ProjectListItemDto {
  description: string | null;
  startDate: string | null;
  targetDate: string | null;
  issueCounter: number;
  createdAt: string;
  updatedAt: string;
}
