/**
 * The connector's copy of `docs/api-contract.md`. The Nest API is the source of truth; these move
 * with the contract, exactly as `front/src/lib/api-types.ts` does.
 *
 * Only the fields the tools actually read are mirrored — an unlisted field still arrives, it is just
 * not something the connector claims to understand.
 */

export type StateType = "backlog" | "unstarted" | "started" | "completed" | "canceled";

export interface WorkflowStateDto {
  id: string;
  name: string;
  type: StateType;
  color: string;
  position: number;
}

export interface LabelDto {
  id: string;
  name: string;
  color: string;
  issueCount: number;
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
  issueCount: number;
  completedCount: number;
  progress: number;
  legacyCount: number;
  archivedAt: string | null;
  createdAt: string;
}

export interface ProjectDto extends ProjectListItemDto {
  description: string | null;
  startDate: string | null;
  targetDate: string | null;
  issueCounter: number;
  updatedAt: string;
}

export interface IssueRefDto {
  id: string;
  identifier: string;
  legacyIdentifier: string | null;
  title: string;
  state: WorkflowStateDto;
}

export interface IssueListItemDto {
  id: string;
  identifier: string;
  legacyIdentifier: string | null;
  title: string;
  priority: number;
  isEpic: boolean;
  epicId: string | null;
  epic: IssueRefDto | null;
  state: WorkflowStateDto;
  labels: LabelDto[];
  project: ProjectSummaryDto;
  epicProgress: { done: number; total: number } | null;
  blockedByCount: number;
  blocksCount: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RelationRefDto = IssueRefDto & { relationId: string };

export interface IssueDetailDto extends IssueListItemDto {
  description: string | null;
  relations: {
    blocks: RelationRefDto[];
    blockedBy: RelationRefDto[];
    related: RelationRefDto[];
  };
  canonicalIdentifier: string;
  requestedIdentifier: string;
}
