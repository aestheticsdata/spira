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
  sortOrder: number;
  /** Non-null once archived. Always null on a list row — lists exclude archived
   *  issues — so only the detail route ever carries a value here. */
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
  /** The live identifier. Differs from `requestedIdentifier` on a legacy hit. */
  canonicalIdentifier: string;
  requestedIdentifier: string;
}

export interface SearchResultDto {
  identifier: string;
  legacyIdentifier: string | null;
  /** Only an exact identifier match can be archived; the browse passes filter them out. */
  archived: boolean;
  title: string;
  projectKey: string;
  state: WorkflowStateDto;
  matchedOn: "identifier" | "legacy" | "text";
}

export interface SearchResponseDto {
  legacyResolved: { legacy: string; identifier: string } | null;
  results: SearchResultDto[];
}

export interface ApiTokenDto {
  id: string;
  name: string;
  /** Last four characters of the raw token — the list's only handle on which secret this is. */
  suffix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/**
 * Only the creation response carries `token`. It is hashed at rest and never returned again, so this
 * is the one object in the app that has ever held the raw value.
 */
export interface CreatedApiTokenDto extends ApiTokenDto {
  token: string;
}

/**
 * A saved view is a stored list query, not a schema of its own: `query` is the
 * address bar's own query string, so opening a view is pushing it back and
 * saving one is persisting what is already there (COS-265).
 */
export interface SavedViewDto {
  id: string;
  name: string;
  icon: string | null;
  /** Null for a workspace-wide view. */
  project: ProjectSummaryDto | null;
  /** Null when the stored query no longer validates — see `invalid`. */
  query: string | null;
  position: number;
  /** Why the stored query no longer validates, or null when it does. */
  invalid: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthenticatedUserDto {
  id: string;
  username: string;
  csrfToken: string;
}

/* ------------------------------------------------------- Linear CSV import */

/**
 * The dry-run report (COS-455), mirroring `nest-api/src/migration/dto/
 * import-response.interface.ts`. `errors` and `warnings` are the very lines
 * `pnpm import:linear` prints, computed by the same functions, so the terminal
 * and the screen cannot disagree about whether an export is importable.
 */
export interface ImportPreviewDto {
  /** Binds a later commit to this exact file. */
  checksum: string;
  target: string;
  columns: {
    read: { field: string; header: string }[];
    ignored: string[];
    unrecognised: string[];
    missingRequired: string[];
    duplicated: { field: string; headers: string[] }[];
  };
  orphans: { line: number; id: string; title: string }[];
  skippedOrphans: boolean;
  sideFile: { relations: number; comments: number; problems: string[] } | null;
  report: ImportReportDto;
  errors: string[];
  warnings: string[];
  clean: boolean;
  continuedNumbering: { key: string; from: number }[];
}

/** Only the parts of the API's `ImportReport` this UI renders. */
export interface ImportReportDto {
  rowsRead: number;
  rowsPlanned: number;
  byProject: { key: string; name: string; names: string[]; count: number; first: string; last: string }[];
  byState: { state: string; count: number }[];
  labels: { name: string; count: number }[];
  epics: number;
  epicChildren: number;
  continuedNumbering: { key: string; from: number }[];
}

export interface ImportResultDto {
  issues: number;
  projects: number;
  labels: number;
  relations: number;
  comments: number;
}
