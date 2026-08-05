# Spira API contract (v1)

The single source of truth shared by `nest-api` and `front`. Everything is under
the global prefix `/api`. Every route except `POST /users/login` is behind
`SessionAuthGuard`; every unsafe verb is additionally behind `CsrfGuard`.

Errors use Nest's default shape: `{ statusCode, message, error }`.

## DTOs

```ts
interface AuthenticatedUser {
  id: string;
  /**
   * The login. There is no email column: nothing in Spira sends mail, and the
   * design's settings screen shows a bare name. 2–60 of [A-Za-z0-9._-].
   */
  username: string;
}

type StateType = "backlog" | "unstarted" | "started" | "completed" | "canceled";

interface WorkflowStateDto {
  id: string;
  name: string;
  type: StateType;
  color: string;
  position: number;
}

interface LabelDto {
  id: string;
  name: string;
  color: string;
  issueCount: number;
}

interface ProjectSummaryDto {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  color: string | null;
}

interface ProjectListItemDto extends ProjectSummaryDto {
  summary: string | null;
  status: WorkflowStateDto;
  priority: number;
  issueCount: number;
  completedCount: number;
  /** 0..1 — completedCount / issueCount, 0 when there are no issues. */
  progress: number;
  /** How many of this project's issues carry a legacyIdentifier. */
  legacyCount: number;
  archivedAt: string | null;
}

interface ProjectDto extends ProjectListItemDto {
  description: string | null;
  startDate: string | null;
  targetDate: string | null;
  issueCounter: number;
  createdAt: string;
  updatedAt: string;
}

interface IssueRefDto {
  id: string;
  identifier: string;
  legacyIdentifier: string | null;
  title: string;
  state: WorkflowStateDto;
}

interface IssueListItemDto {
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
  epicProgress: { done: number; total: number } | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface IssueDetailDto extends IssueListItemDto {
  description: string | null;
  relations: {
    blocks: (IssueRefDto & { relationId: string })[];
    blockedBy: (IssueRefDto & { relationId: string })[];
    related: (IssueRefDto & { relationId: string })[];
  };
  /** The live identifier. Differs from `requestedIdentifier` on a legacy hit. */
  canonicalIdentifier: string;
  /** Whatever the caller asked for — the front issues a 308 when they differ. */
  requestedIdentifier: string;
}

interface SearchResultDto {
  identifier: string;
  legacyIdentifier: string | null;
  title: string;
  projectKey: string;
  state: WorkflowStateDto;
  matchedOn: "identifier" | "legacy" | "text";
}
```

## Routes

### Auth — `src/users`

| Verb | Path | Body | Returns |
|---|---|---|---|
| GET | `/users/me` | — | `AuthenticatedUser & { csrfToken }` |
| GET | `/users/csrf` | — | `{ csrfToken }` |
| POST | `/users/login` | `{ username, password }` | `AuthenticatedUser & { csrfToken }` |
| POST | `/users/logout` | — | `{ ok: true }` |
| POST | `/users/password` | `{ currentPassword, newPassword }` | `{ ok: true }` |

### States — `src/states`

| Verb | Path | Returns |
|---|---|---|
| GET | `/states` | `WorkflowStateDto[]`, ordered by `position` |

### Labels — `src/labels`

| Verb | Path | Body | Returns |
|---|---|---|---|
| GET | `/labels` | — | `LabelDto[]`, ordered by name |
| POST | `/labels` | `{ name, color }` | `LabelDto` |
| PATCH | `/labels/:id` | `{ name?, color? }` | `LabelDto` |
| DELETE | `/labels/:id` | — | `{ ok: true }` |

### Projects — `src/projects`

| Verb | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/projects` | `?includeArchived=false` | `ProjectListItemDto[]`, ordered by `position` then `name` |
| GET | `/projects/suggest-key` | `?name=` | `{ key: string }` |
| GET | `/projects/:key` | — | `ProjectDto` (404 when unknown) |
| POST | `/projects` | `CreateProjectDto` | `ProjectDto` |
| PATCH | `/projects/:key` | `UpdateProjectDto` | `ProjectDto` |

`CreateProjectDto`: `{ key, name, icon?, color?, summary?, description?, statusId?, priority?, startDate?, targetDate? }`.
`key` is uppercased, matches `/^[A-Z0-9]{2,5}$/`, must be unique, and must not start with a digit-only
run that would make it ambiguous — `199` is rejected with a message telling the user to pick another.
`suggest-key` returns the first three alphanumeric characters of the name, uppercased, de-duplicated
against existing keys by appending a digit.

### Issues — `src/issues`

| Verb | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/issues` | filters below | `IssueListItemDto[]` |
| GET | `/issues/:identifier` | — | `IssueDetailDto` (resolves legacy identifiers) |
| POST | `/issues` | `CreateIssueDto` | `IssueDetailDto` |
| PATCH | `/issues/:identifier` | `UpdateIssueDto` | `IssueDetailDto` |
| DELETE | `/issues/:identifier` | — | `{ ok: true }` (sets `archivedAt`) |
| POST | `/issues/:identifier/relations` | `{ type: "blocks" \| "blocked_by" \| "related", targetIdentifier }` | `IssueDetailDto` |
| DELETE | `/issues/:identifier/relations/:relationId` | — | `IssueDetailDto` |

List filters (all optional, all repeatable where plural):
`project` (key), `state` (id, repeatable), `label` (id, repeatable), `excludeLabel` (id, repeatable),
`priority` (int, repeatable), `epic` (identifier), `isEpic` (bool), `includeArchived` (bool, default false),
`orderBy` (`manual` | `created` | `updated` | `priority` | `title`, default `manual`).

`CreateIssueDto`: `{ projectKey, title, description?, stateId?, priority?, isEpic?, epicId?, labelIds?[] }`.
`UpdateIssueDto`: every field of the above except `projectKey`, all optional.

**Identifier allocation** happens inside the create transaction: `SELECT ... FOR UPDATE` on the
project row, increment `issueCounter`, write `{key}-{counter}`. This survives concurrent creates and
survives a later re-key, because the identifier is stored, not derived.

**Epic invariants**, enforced in the service layer (MySQL `CHECK` cannot express the subquery):
- `epicId` may only point at an issue whose `isEpic` is true, and in the same project.
- An issue with `isEpic = true` must have `epicId = null`.
- Converting to an epic is allowed only when the issue has no `epicId`.
- Converting an epic back requires it to have no children; the error says so rather than cascading.

**Relations**: a block is stored once as `{from, to, type: "blocks"}` and read as "from blocks to";
`blocked_by` on the API writes the mirrored row. `related` is symmetric and normalised on write
(lower id first) so the pair is stored once.

### Search — `src/search`

| Verb | Path | Query | Returns |
|---|---|---|---|
| GET | `/search` | `?q=&limit=8` | `{ legacyResolved: { legacy, identifier } \| null, results: SearchResultDto[] }` |

Matching order, identifier hits always ranked above text hits:
1. exact `identifier` (case-insensitive)
2. exact `legacyIdentifier` — also populates `legacyResolved`
3. prefix on either identifier column
4. MySQL `FULLTEXT` on `(title, description)`, falling back to `LIKE %q%` for queries under 3 characters
