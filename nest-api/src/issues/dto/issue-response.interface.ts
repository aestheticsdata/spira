/**
 * Response shapes for `/issues`, mirroring `docs/api-contract.md`. They are the
 * contract the front compiles against — keep the two in step.
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

export interface IssueRefDto {
  id: string;
  identifier: string;
  legacyIdentifier: string | null;
  title: string;
  state: WorkflowStateDto;
}

export interface RelatedIssueDto extends IssueRefDto {
  relationId: string;
}

export interface EpicProgressDto {
  done: number;
  total: number;
}

export interface IssueListItemDto {
  id: string;
  identifier: string;
  legacyIdentifier: string | null;
  title: string;
  priority: number;
  isEpic: boolean;
  epicId: string | null;
  /** The epic this issue belongs to — the "parent chip" on a child row. */
  epic: IssueRefDto | null;
  state: WorkflowStateDto;
  labels: LabelDto[];
  project: ProjectSummaryDto;
  /** Only for epics: children completed / children total. */
  epicProgress: EpicProgressDto | null;
  /** How many issues block this one — the row badge that says "stuck". */
  blockedByCount: number;
  /** How many issues this one blocks — shown lighter, it is not a warning about this issue. */
  blocksCount: number;
  sortOrder: number;
  /** Non-null once archived. Lists leave archived issues out by default, so on
   *  a list row this is always null; the detail route returns them either way,
   *  which is what makes a restore reachable. */
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueDetailDto extends IssueListItemDto {
  description: string | null;
  relations: {
    blocks: RelatedIssueDto[];
    blockedBy: RelatedIssueDto[];
    related: RelatedIssueDto[];
  };
  /** The live identifier. Differs from `requestedIdentifier` on a legacy hit. */
  canonicalIdentifier: string;
  /** Whatever the caller asked for — the front issues a 308 when they differ. */
  requestedIdentifier: string;
}
