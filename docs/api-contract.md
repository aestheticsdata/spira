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
  /** Non-null once archived. Always null on a list row, since lists exclude
   *  archived issues by default; the detail route returns them either way. */
  archivedAt: string | null;
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

interface SavedViewDto {
  id: string;
  name: string;
  icon: string | null;
  /** Null for a workspace-wide view. */
  project: ProjectSummaryDto | null;
  /** The canonical list query; null when the stored one no longer validates. */
  query: string | null;
  position: number;
  /** Why it no longer validates, or null when it does. */
  invalid: string | null;
  createdAt: string;
  updatedAt: string;
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

Four keys are refused outright with a 400: `ISSUE`, `LOGIN`, `API`, `NEW`. A project is reached at
`/<key>/issues`, where Next resolves the static segment before the dynamic `[key]` one, so a project
holding one of those names would be permanently unreachable. `suggest-key` never proposes them
either. `PROJECTS` and `SETTINGS` need no entry: both are longer than the five characters the column
allows. The front mirrors the list in `components/shared/config/constants.ts` to say so before the
request leaves the browser; this side is what decides.

A key already in use answers 409; the create/edit form shows it against the key field.

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
`priority` (int, repeatable), `epic` (identifier), `excludeEpic` (identifier), `hasEpic` (bool),
`isEpic` (bool), `includeArchived` (bool, default false),
`orderBy` (`manual` | `created` | `updated` | `priority` | `title`, default `manual`).

The four epic arms compose through `AND`, so they can be combined rather than overwriting each other:

| arm | params |
| --- | --- |
| is | `epic=PFA-1` |
| is not | `excludeEpic=PFA-1` |
| any | `hasEpic=true` |
| none | `hasEpic=false` |

`excludeEpic` **keeps** issues that belong to no epic — "not in PFA-1" is true of an issue with no
epic at all, even though the SQL comparison against NULL is not. `epic` naming an identifier that
does not resolve returns `[]` (an epic that does not exist has no children); `excludeEpic` naming
one excludes nothing.

`CreateIssueDto`: `{ projectKey, title, description?, stateId?, priority?, isEpic?, epicId?, labelIds?[] }`.
`UpdateIssueDto`: every field of the above except `projectKey`, all optional, plus `archived?: boolean`.

An issue never changes project: the identifier was allocated from the project's counter and is
stored, so moving one would either break the identifier or lie about it.

`labelIds` is the whole set, not a delta — the service replaces the join rows with what it is sent.

**Archiving.** `DELETE /issues/:identifier` archives, and there is no un-DELETE, so restoring rides
on `PATCH { archived: false }` the way it does for projects. Re-archiving an archived issue leaves
`archivedAt` where it was: the column records when the issue left, and a second PATCH is not a
second departure.

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

### Saved views — `src/views`

| Verb | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/views` | `?project=SPI` | `SavedViewDto[]`, workspace views first, then each project's, by `position` |
| POST | `/views` | `{ name, icon?, projectKey?, query }` | `SavedViewDto` |
| PATCH | `/views/:id` | `{ name?, icon?, query?, position? }` | `SavedViewDto` |
| DELETE | `/views/:id` | — | `{ ok: true }` |

`?project=SPI` returns that project's views **and** the workspace's, because both apply on a project
page; without it every view comes back. `projectKey` on create scopes the view — omitted or null
makes it workspace-wide. The scope cannot be PATCHed: a view's project is half of what it means, and
widening one silently would change every list it draws.

**A view is a stored query string, not a schema of its own.** `query` is the list URL's own query —
`state=…&priority=1&group=epic&cols=identifier,status` — kept whole. Saving a view is persisting the
current query; opening one is pushing it back into the URL. That is only possible because the filter
keys the front writes to the address bar are already the keys `GET /issues` takes (see Issues), so
there is no translation layer and nothing to keep in step.

The vocabulary a view may use is `IssuesQueryDto` **extended** with the display half — `group`,
`order`, `cols`, `empty`, `legacy` — rather than restated. Adding a filter to the issues endpoint
adds it to views by construction. Two inherited keys are refused:

| Refused | Why |
|---|---|
| `project` | the scope is a column; a view stored against SPI whose query said `project=PFA` would be two answers to one question |
| `orderBy` | the same choice as `order`, spelt the way the endpoint takes it rather than the way the URL writes it — accepting both would let a view disagree with itself |

What is stored is **canonical**: keys alphabetical, lists sorted and de-duplicated, empty values
dropped, `?` stripped. `?state=b,a` and `?state=a&state=b` store the same string. A client comparing
"has this view changed?" should compare the two queries *parsed*, not as text — the API's key order is
alphabetical and the front's serialiser writes its own.

Validation runs on **write and on read**. On write a query that could not be replayed is a 400 before
anything is stored. On read a view whose query no longer validates comes back with `query: null` and
`invalid` set to the reason, rather than throwing — a view outlives the vocabulary it was saved
against, and one stale row must not take the whole sidebar down with it. An unknown key is an error,
not something ignored: that is the case the rule exists for.
