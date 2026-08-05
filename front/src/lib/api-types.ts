/**
 * Mirrors `docs/api-contract.md`. The Nest API is the source of truth; these
 * types are the front's copy of it and must move with the contract.
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
  /** 0..1 */
  progress: number;
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
  sortOrder: number;
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
  /** The live identifier. Differs from `requestedIdentifier` on a legacy hit. */
  canonicalIdentifier: string;
  requestedIdentifier: string;
}

export interface SearchResultDto {
  identifier: string;
  legacyIdentifier: string | null;
  title: string;
  projectKey: string;
  state: WorkflowStateDto;
  matchedOn: "identifier" | "legacy" | "text";
}

export interface SearchResponseDto {
  legacyResolved: { legacy: string; identifier: string } | null;
  results: SearchResultDto[];
}

export interface AuthenticatedUserDto {
  id: string;
  username: string;
  csrfToken: string;
}
