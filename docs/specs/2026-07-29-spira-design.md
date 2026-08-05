# Spira — design spec

Date: 2026-07-29
Status: approved, ready for implementation planning

## 1. Context and goal

Linear is used today as the ticketing system for six personal projects (1991chat, PFA, Zeus,
Exalus, Iknos, 3D engine, ~236 issues). The paid plan carries features that go unused, and the
workspace-level ticket prefix means every project shares one `COS-` counter — `COS-177` is a PFA
ticket and `COS-201` is a 3D engine ticket, with nothing in the identifier to say so.

Spira is a self-hosted replacement: a single-user ticketing app that keeps what is actually used
and drops the rest. The UI deliberately copies Linear's, because it works and because this is a
personal tool that will never be sold or distributed.

Two hard requirements shape the design:

- **Per-project ticket prefixes.** New issues in PFA are `PFA-1`, `PFA-2`…; new issues in the 3D
  engine project are `3DE-1`, `3DE-2`…
- **Legacy references must keep resolving.** Hundreds of `COS-xxx` identifiers are written into
  commit messages, code comments and PR descriptions. They cannot break.

## 2. Non-goals for v1

Explicitly excluded, to be reconsidered only when a concrete need appears:

board layout, drag & drop, comments, activity history, command palette, keyboard shortcuts,
milestones, cycles, initiatives, attachments, assignees, estimates, GitHub integration,
notifications/inbox, multi-user, organisations/teams, project members and leads.

One qualification on comments: they are not rendered in v1, and Linear's CSV export is unlikely to
contain them. Whether to capture them anyway, through the connector, is a decision taken at cutover
(§6) — the schema has a table ready either way.

Assignees and multi-user are dropped as a pair: the app has exactly one user, so "assigned to me"
carries no information.

## 3. Architecture

One Next.js 16 application (App Router, React 19.2, TypeScript 5.9), deployed as a single Node
process on ks-b behind nginx. No separate API service.

Two data paths, and the split is a rule rather than a preference:

- **Reads** — Server Components query Prisma directly. Page loads do not make an HTTP round-trip
  to their own API.
- **Writes** — every mutation goes through a REST route handler under `/api`. Not server actions.

The reason for the write rule is the MCP connector (§10): it needs a callable HTTP surface. Having
mutations exist only as server actions would force a second, parallel implementation of the same
validation and business rules. One write path, two callers (browser and MCP).

### Stack

| Concern | Choice | Note |
|---|---|---|
| Framework | Next.js 16, App Router | |
| Language | TypeScript 5.9 | |
| ORM | Prisma 7 + `@prisma/adapter-mariadb` | same as PFA |
| Database | MySQL on ks-b | |
| Sessions | Redis | same as PFA |
| Styling | Tailwind v4 | CSS-first tokens |
| Components | shadcn/ui | copy-and-own |
| Icons | lucide-react | |
| URL state | nuqs | filters and view state live in the URL |
| Validation | zod v4 | shared between route handlers and forms |
| Forms | react-hook-form + `@hookform/resolvers` | |
| Client cache | TanStack Query | mutations, optimistic status changes |
| Theming | next-themes | dark default, light available |
| Lint/format | Biome | |
| Tests | vitest (unit), Playwright (e2e) | |

Not used: lodash (explicitly excluded), zustand (nuqs covers the state that mattered in PFA),
axios (native `fetch`).

### Directory shape

```
src/
  app/
    (auth)/login/
    (app)/                     # authenticated shell
      projects/
      projects/[key]/          # overview + issues tabs
      issue/[identifier]/
      views/[id]/
      settings/labels|tokens|account/
    api/
      auth/{login,logout,password}/
      projects/[...]
      issues/[...]
      labels/[...]
      views/[...]
      mcp/                     # MCP HTTP endpoint (§10)
  lib/
    auth/       # session, csrf, rate limit
    db/         # prisma client, repositories
    api/        # route-handler wrapper, error shape
    markdown/   # render + reference auto-linking
  components/
    ui/         # shadcn primitives
    issues/ projects/ filters/ shell/
```

## 4. Auth and security

Transposed from PFA's Nest implementation, keeping the same guarantees without Express middleware.

- Session id in an httpOnly cookie `spira.sid`: `SameSite=Lax`, `Secure` in production
  (`COOKIE_SECURE=false` escape hatch for HTTP), rolling TTL.
- Session record in Redis under a `spira:` prefix, TTL refreshed on each authenticated request.
- CSRF: a random 32-byte token is minted into the session at login and returned to the client. Every
  unsafe verb (`POST`/`PUT`/`PATCH`/`DELETE`) must echo it in `X-CSRF-Token`. Comparison is
  `timingSafeEqual`. Token rotates on login and is cleared on logout. Ported from
  `nest-api/src/users/csrf-token.util.ts`.
- Password hashing with bcryptjs. Single account, seeded by script — there is no signup UI.
- Login rate limiting: Redis counter keyed by IP, exponential lockout.
- `trust proxy` equivalent: nginx forwards `X-Forwarded-Proto`, required for `Secure` cookies
  behind TLS termination. Same nginx block as PFA's `DEPLOY.md`.

### Runtime constraint

Next middleware runs on the Edge runtime, where a Redis client cannot run. Therefore:

- **Middleware** does a cheap check only: is the `spira.sid` cookie present? If not, redirect to
  `/login`. It is a UX shortcut, not a security boundary.
- **Authorisation** is enforced server-side by `requireSession()` (Node runtime), called by every
  Server Component page and every route handler. A forged or expired cookie fails here.

This distinction is deliberate and must not be collapsed: middleware never authenticates.

API tokens for MCP (§10) bypass the cookie/CSRF path entirely — bearer token, no CSRF needed since
there is no ambient credential to abuse.

## 5. Data model

```prisma
model User {
  id           String   @id @db.Char(36)
  // Implemented as `username String @unique @db.VarChar(60)` instead, with no
  // displayName: nothing in Spira sends mail, the design's settings screen shows
  // a bare name, and a username is a login the owner can actually type.
  email        String   @unique @db.VarChar(255)
  passwordHash String   @db.VarChar(255)
  displayName  String   @db.VarChar(60)
  createdAt    DateTime
}

model Project {
  id           String   @id @db.Char(36)
  key          String   @unique @db.VarChar(5)   // "PFA", "3DE", "SPI"
  name         String   @db.VarChar(120)
  icon         String?  @db.VarChar(40)
  color        String?  @db.VarChar(9)
  summary      String?  @db.VarChar(255)
  description  String?  @db.Text                 // markdown
  statusId     String
  priority     Int      @default(0)
  startDate    DateTime?
  targetDate   DateTime?
  issueCounter Int      @default(0)              // last allocated number
  archivedAt   DateTime?
  createdAt    DateTime
  updatedAt    DateTime
}

model WorkflowState {
  id       String @id @db.Char(36)
  name     String @db.VarChar(40)
  type     String @db.VarChar(12)  // backlog|unstarted|started|completed|canceled
  color    String @db.VarChar(9)
  position Int
}

model Label {
  id    String @id @db.Char(36)
  name  String @unique @db.VarChar(60)
  color String @db.VarChar(9)
}

model Issue {
  id               String   @id @db.Char(36)
  projectId        String
  number           Int
  identifier       String   @unique @db.VarChar(20)  // "PFA-12" — stored, not derived
  legacyIdentifier String?  @unique @db.VarChar(20)  // "COS-177"
  title            String   @db.VarChar(255)
  description      String?  @db.Text                 // markdown
  stateId          String
  priority         Int      @default(0)              // 0 none .. 4 low, Linear order
  isEpic           Boolean  @default(false)
  epicId           String?                           // -> Issue.id where isEpic = true
  sortOrder        Float
  createdAt        DateTime
  updatedAt        DateTime
  completedAt      DateTime?
  canceledAt       DateTime?
  archivedAt       DateTime?

  @@unique([projectId, number])
  @@index([stateId])
  @@index([epicId])
}

model IssueLabel {
  issueId String
  labelId String
  @@id([issueId, labelId])
}

model IssueRelation {
  id          String @id @db.Char(36)
  fromIssueId String
  toIssueId   String
  type        String @db.VarChar(12)   // blocks | related
  @@unique([fromIssueId, toIssueId, type])
}

model SavedView {
  id        String  @id @db.Char(36)
  name      String  @db.VarChar(80)
  icon      String? @db.VarChar(40)
  projectId String?                    // null = workspace-wide
  filters   Json                       // serialised filter set
  groupBy   String  @db.VarChar(20)
  orderBy   String  @db.VarChar(20)
  position  Int
  createdAt DateTime
}

model ApiToken {
  id         String   @id @db.Char(36)
  name       String   @db.VarChar(80)
  tokenHash  String   @unique @db.VarChar(255)
  lastUsedAt DateTime?
  revokedAt  DateTime?
  createdAt  DateTime
}

model Comment {
  id        String   @id @db.Char(36)
  issueId   String
  parentId  String?                     // thread structure as exported
  body      String   @db.Text           // markdown
  authorName String  @db.VarChar(80)
  createdAt DateTime
  updatedAt DateTime
  @@index([issueId])
}
```

`Comment` is read by nothing in v1. It is populated only if the optional connector side-file is taken
during the migration (§6); otherwise it stays empty. It exists so that capturing comments at cutover
is a decision available at the time, rather than a schema change against a workspace that no longer
exists. Rendering them is a later, purely additive change.

Sessions live in Redis, not MySQL.

### Seeded workflow states

`Backlog` (backlog) · `Todo` (unstarted) · `In Progress` (started) · `In Review` (started) ·
`Done` (completed) · `Canceled` (canceled).

The state set is global, shared by all projects. Per-project state sets are a deliberate YAGNI cut.

### Epics

An epic is an ordinary issue with `isEpic = true`. It therefore has its own identifier, description
page, status, priority and labels — exactly like `COS-201` today. Other issues reference it via
`epicId`.

One invariant, enforced in the service layer (MySQL `CHECK` cannot express the subquery):

- `epicId` may only point at an issue whose `isEpic` is `true`.
- An issue with `isEpic = true` must have `epicId = null`.

Together these make the hierarchy exactly one level deep. There is no recursion anywhere: no
recursive CTEs, no cycle detection beyond a direct self-reference, no tree component.

Epic progress = `count(children where state.type = 'completed') / count(children)`.

Converting an issue to an epic is allowed when it has no `epicId`. Converting an epic back to a
normal issue requires it to have no children, and the UI says so rather than cascading.

### Relations

A block is stored once, as a single row `{from: A, to: B, type: 'blocks'}`, read as "A blocks B".
"Blocked by" is the same row read in the other direction. Storing one direction makes it impossible
for the two views to disagree.

`related` is symmetric; it is normalised on write (lower id first) so the pair is stored once.

## 6. Identifiers and the legacy migration

### Scheme

`identifier` is a stored column, not computed at read time. Allocation happens inside the create
transaction: `SELECT ... FOR UPDATE` on the project row, increment `issueCounter`, write
`{key}-{counter}`. This survives concurrent creates and, crucially, survives a project being renamed
or re-keyed later — existing identifiers do not move.

Project keys are auto-suggested from the first three letters of the name, uppercased, but remain
editable and must be unique. Two of the six need manual keys:

| Project | Auto-suggestion | Actual key |
|---|---|---|
| PFA | `PFA` | `PFA` |
| Zeus | `ZEU` | `ZEU` |
| Exalus | `EXA` | `EXA` |
| Iknos | `IKN` | `IKN` |
| 3D engine | `3DE` | `3DE` |
| 1991chat | `199` — unusable | `CHT` |
| Spira | `SPI` | `SPI` |

### Migration

All six projects are imported. Every issue is renumbered under its project's key, in creation-date
order, and its original Linear identifier is preserved in `legacyIdentifier`.

Consequences, all required:

- Both columns are uniquely indexed and both are searched. `COS-177` and `PFA-12` find the same
  issue.
- The issue row and detail header render the new identifier with the legacy one beside it, visually
  subdued: **PFA-12** `COS-177`.
- `/issue/COS-177` responds `301` to `/issue/PFA-12`, so a pasted legacy URL still lands correctly.
- Markdown auto-linking (§8) resolves both forms, so `COS-177` typed inside an imported description
  renders as a working chip.

### Input: Linear's CSV export

The migration reads Linear's CSV export of all projects.

The importer is written against the real downloaded file, not an assumed schema, and it parses with a
proper CSV reader rather than splitting on commas — descriptions here contain commas, newlines,
quotes and fenced code blocks, each of which breaks naive parsing quietly rather than loudly.

The CSV is unlikely to carry comment threads or issue relations. If either is wanted, the Linear MCP
connector reaches both (`list_comments`, `get_issue` with `includeRelations`) and can produce a JSON
side-file in the same session, while the workspace is still live. That path is optional and
independent; skipping it simply leaves those tables empty.

### Timing: the whole migration runs last

Linear stays in use for the entire build, with tickets still being filed against the other projects.
Any export taken before cutover is stale on arrival. Spira is developed against seed data, which
needs no real ticket data at all, so nothing in this phase runs early:

1. Freeze ticket creation in Linear
2. Full CSV export, committed
3. Importer dry run, review the report
4. Real import
5. Verification set — known references resolve, redirect and render
6. Start using Spira; only then consider the subscription

Cancelling the subscription is the only irreversible act, and the only constraint around it is:
export first.

Note that the *rendering* half of the legacy story is not part of this phase at all. The
`legacyIdentifier` column, resolution of both identifier forms, showing both in rows and headers, the
`301` redirect, reference chips and search across both are built much earlier, in `F2`, `P3`, `I2`,
`I3`, `I5` and `S1`. The migration only supplies the data those already handle.

By cutover the export includes Spira's own tickets: `COS-251` and its children become `SPI-` issues
carrying their `COS-` identifiers, with `COS-251` imported as an epic. Nothing should hardcode
expected totals.

Linear permits arbitrary nesting through its `Parent issue` column. If the export contains depth
greater than one, the importer flattens to the topmost ancestor and logs every flattened issue.
Current data is one level deep, so this is a guard, not an expected path.

## 7. Features

### Projects

List page with name, icon, issue count and progress. Create/edit form with name, key (validated for
uniqueness and format), icon, colour, summary, status, priority, dates. Overview page rendering the
markdown description, matching Linear's project overview layout.

### Issues

Create, edit, archive. Properties: status, priority, labels (many), epic, relations. Editing happens
both inline from the list row context menu and on the detail page.

### List layout

The only layout in v1. Rows grouped into collapsible sections by status, with per-group counts and a
per-group quick-add. Configurable display properties (identifier, status, priority, labels, created,
updated) and ordering, mirroring Linear's display popover. Board layout is out of scope.

### Filters and saved views

Filter by status, label (multi-select, include/exclude), priority, project and epic. Filter state is
held in the URL through nuqs, which makes any filtered list shareable and bookmarkable and makes
saved views a matter of persisting the query.

A saved view stores its filter set, grouping, ordering and layout, is scoped to a project or the
whole workspace, and appears in the sidebar.

### Search

Matches on identifier (new and legacy), title and description. MySQL `FULLTEXT` on
`(title, description)` plus exact-match lookups on both identifier columns. Identifier matches rank
above text matches.

## 8. Markdown and cross-references

Descriptions are stored as raw markdown and rendered through a markdown pipeline with sanitisation.
The editor is a textarea with a live preview beside it.

Trade-off, accepted: the rendered output is identical to Linear's, the typing experience is not —
`## Titre` shows as literal markdown while typing. Because storage is plain markdown, replacing the
editor with a WYSIWYG later is purely additive and requires no data migration.

Reference auto-linking runs at render time on the rendered output: any token matching
`[A-Z0-9]{2,5}-\d+` is looked up against both `identifier` and `legacyIdentifier` and, on a hit,
replaced with a chip showing the issue's state icon, identifier and title — the inline chips visible
in `COS-177` today. Misses render as plain text.

## 9. UI

Dark theme by default, light theme available through next-themes. Layout copies Linear: fixed left
sidebar (workspace switcher, Projects, Views, per-project navigation), breadcrumb header with tabs
(Overview / Issues), filter bar under the tabs, list below, and a right-hand properties panel on the
issue detail page.

Design tokens are defined once in Tailwind v4 CSS-first form, so the Linear-like palette is a single
file rather than arbitrary values scattered through components.

## 10. MCP connector

Ships in v1. Without it, cutting over to Spira means losing the ability for Claude Code to file and
update tickets — the workflow currently used with Linear's MCP server.

- **Auth**: `ApiToken` rows, bearer token, hashed at rest, shown once at creation, revocable from
  settings. No cookie, no CSRF.
- **Transport**: an MCP server exposing the REST layer. Same validation and invariants as the UI,
  since both call the same route handlers.
- **Tools**: `list_projects`, `get_project`, `list_issues` (filters: project, state, label, epic,
  query), `get_issue`, `save_issue` (create/update incl. labels, epic, relations), `list_labels`,
  `list_issue_statuses`. Names deliberately mirror Linear's MCP tool names so existing habits carry
  over.

## 11. Deployment (ks-b)

Single Node process behind nginx, matching PFA's deployment shape:

- MySQL database and user provisioned on ks-b; Prisma migrations run on deploy.
- Redis installed, bound to localhost, used for sessions and login rate limiting.
- nginx vhost with TLS, proxying to the Next server, forwarding `Host`, `X-Real-IP`,
  `X-Forwarded-For` and `X-Forwarded-Proto` (the last is required for `Secure` cookies).
- systemd unit for the app process.
- Atomic release directories with a symlink switch, as PFA does.
- Nightly `mysqldump` retained on a rotation, plus an off-server copy.

## 12. Testing

- **Unit (vitest)**: identifier allocation, epic invariants, relation normalisation, CSRF token
  logic, filter serialisation, markdown reference resolution, CSV row mapping.
- **Integration**: route handlers against a test database — auth flow, CSRF rejection, issue CRUD,
  concurrent identifier allocation.
- **E2E (Playwright)**: login, create project, create issue, apply filters, save a view, resolve a
  legacy identifier, epic progress.
- **Migration**: the importer runs against the committed CSV export, with cases for multi-label rows,
  descriptions containing fenced code and embedded commas, and parent references. A dry-run mode
  produces a report (issues per project, key collisions, flattened hierarchies, unmapped
  statuses/labels, malformed rows) that must be reviewed before the real run.

## 13. Delivery plan

| Phase | Content |
|---|---|
| F — Foundations | repo scaffold, Prisma schema, dev environment, seed |
| A — Auth | session layer, CSRF, login/logout, rate limiting, password change |
| P — API | route-handler conventions, projects, issues, labels, relations, views |
| U — UI shell | app shell, sidebar, theme, design tokens |
| R — Projects | list, create/edit with key rules, overview page |
| I — Issues | markdown editor, renderer + chips, list layout, display options, detail page, create |
| V — Filters & views | filter bar with URL state, saved views |
| E — Epics & relations | epic page and progress, relations UI |
| S — Search | identifier, legacy identifier, full text |
| M — Migration | **runs last:** CSV export, importer, renumbering and legacy resolution, cutover |
| C — MCP | API tokens, MCP server |
| D — Deploy | ks-b provisioning, deploy pipeline, backups |

## 14. Open risks

1. **Comment and relation loss.** The CSV export is unlikely to carry either, and both vanish with
   the workspace. The connector side-file (§6) exists as the answer if they turn out to be wanted;
   the decision only has to be made once, at cutover, while Linear is still live. Cancelling the
   subscription is the single irreversible step in the whole project.
2. **Project key collisions on import** if two projects share their first three letters. Mitigated by
   editable keys and a dry-run collision report; `1991chat` is already a known manual case.
3. **Markdown typing experience** is a step down from Linear's editor. Accepted knowingly; the
   storage format keeps the upgrade path open.
4. **Middleware/Edge boundary.** If authorisation ever creeps into middleware, it silently becomes
   unenforceable. `requireSession()` on the Node runtime is the only authorisation point.
