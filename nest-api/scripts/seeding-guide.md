# Seeding guide — `scripts/seed.ts`

Creates the workspace Spira needs to be usable at all: **the one account** (there is no signup UI),
the six workflow states, the six labels, and the nine demo projects with their issues, epics and
relations — the exact dataset the design handoff renders.

It is safe to run **repeatedly**: every row is upserted on its natural key.

## Command

```bash
pnpm seed -- [--username <name>] [--password <secret>] [--wipe]
```

> The `--` is required so pnpm forwards the flags to the script.

| Option       | Env           | Default                 | Description                                                     |
| ------------ | ------------- | ----------------------- | --------------------------------------------------------------- |
| `--username` | `SEED_USERNAME` | `cosmokaat`           | The account to seed. Also the login.                             |
| `--password` | `SEED_PASSWORD` | —                     | Sets the account password. See below when omitted.               |
| `--wipe`     | —             | off                     | Delete the workspace before seeding. The account row is kept.    |
| `--help`     | —             | —                       | Print the usage and exit without touching the database.          |

Flags win over the environment, which wins over the default. Bad or missing arguments print the usage
and exit without touching the database.

## The password

There is no hardcoded default — every password is either given or generated.

- **`--password` (or `SEED_PASSWORD`) given** → it is hashed with bcrypt (12 rounds) and written,
  whether the account is new or not. This is also how you reset a forgotten password.
- **omitted, account does not exist** → a random 20-character password is generated and **printed once**
  at the end of the run. Only its bcrypt hash is stored, so that line is the only copy — save it.
- **omitted, account already exists** → the stored hash is left alone. A routine re-seed never locks you
  out of the account it created last time.

Minimum length when you pass one: 8 characters.

## Two modes

### Upsert (default — nothing is deleted)

The common case, and what you want after pulling changes to the demo data. Each row is matched on its
natural key and updated in place:

| Table           | Natural key                                                 |
| --------------- | ----------------------------------------------------------- |
| `User`          | `username`                                                   |
| `WorkflowState` | `name` (the column has no unique index, so it is matched by hand) |
| `Label`         | `name`                                                       |
| `Project`       | `key`                                                        |
| `Issue`         | `identifier`                                                 |
| `IssueLabel`    | `(issueId, labelId)`                                         |
| `IssueRelation` | `(fromIssueId, toIssueId, type)`                             |

Rows you created through the app are untouched — the seeder only ever writes the identifiers listed in
its own tables.

Two things it deliberately does **not** undo, because both would fight real usage:

- **`Project.issueCounter` never goes down.** It is set to `max(current, highest seeded number)`, so a
  project where you have created real issues past the demo range keeps handing out fresh numbers instead
  of colliding on `Issue.identifier`.
- **Label assignments are only added.** Removing a label from a seeded issue in the app survives a
  re-seed; use `--wipe` if you want the design's exact label set back.

### `--wipe` then reseed (destructive rebuild)

```bash
pnpm seed -- --wipe
```

Deletes, in foreign-key-safe order: `IssueRelation`, `IssueLabel`, `Comment`, `Issue`, `SavedView`,
`Project`, `WorkflowState`, `Label` — **then** rebuilds the whole workspace from the tables in the script.

⚠️ This drops the **entire** workspace, including projects, issues and saved views you created yourself,
not just the seeded rows.

The `User` row is deliberately **not** deleted: a rebuild must not invalidate the password a previous run
printed. Pass `--password` alongside `--wipe` if you want a genuinely clean account.

To drop the schema itself as well, reset the database first and let migrations rebuild it:

```bash
pnpm prisma migrate reset   # drops + re-migrates, then
pnpm seed                   # repopulates (a fresh account ⇒ a printed password)
```

## What gets seeded

- **1 user** — the only account; there is no signup route.
- **6 workflow states** — Backlog, Todo, In Progress, In Review, Done, Canceled, in that `position`
  order, with the design's colours. Shared by every project.
- **6 labels** — Feature, Improvement, Bug, de-mock, Dashboard, design system.
- **9 projects** — SPI, PFA, 3DE, IKN, ZEU, EXA, CHT, WEA, BMK, with their Material Symbols icon,
  colour and summary. `issueCounter` is set to the highest number each project allocated, so the next
  create continues the sequence.
- **85 issues** — transcribed from the design file's `ISSUES` array: identifiers, the `COS-` legacy
  identifiers, states, priorities, labels, and the four epics (`SPI-1`, `3DE-2`, `3DE-15`, `IKN-1`) with
  their children. Two carry the long markdown descriptions from the design: `SPI-24` and `PFA-41`.
- **3 relations** — `SPI-34` blocks `SPI-24`, `SPI-24` blocks `SPI-39`, and `SPI-2` related to `SPI-34`,
  so the detail page's Blocks / Blocked by panel has content.

All demo issues are dated in July 2026, matching the design's date column.

## Output

The run ends with a summary: row counts per table, one line per project with its issue count and the next
identifier it will hand out, and the account line — carrying the generated password when there is one.

```
=== SUMMARY ===
Rows: { users: 1, states: 6, labels: 6, projects: 9, issues: 85, issueLabels: 62, relations: 3 }
  SPI  39 issues · next identifier SPI-40  Spira
  ...

Account: cosmokaat@spira.local
Password: unchanged — pass --password to set a new one.
```

## Prerequisites

- A reachable MySQL/MariaDB through `DATABASE_URL` in `nest-api/.env` (the script has its own inline
  `.env` loader — it runs outside Nest, so `@nestjs/config` is not involved). A `DATABASE_URL` already in
  the environment wins over the file.
- The generated Prisma client: `pnpm prisma generate`, also run by `prebuild`.
- Migrations applied: `pnpm migrate:dev` (or `pnpm migrate:deploy`).
- The project's Node version (≥ 22).
