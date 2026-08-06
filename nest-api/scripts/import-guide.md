# Import guide — `scripts/import-linear.ts`

Turns the Linear CSV export (`M1`, COS-252) into the Spira workspace. A CLI script, not a UI: it
runs a handful of times at cutover and then never again.

## Command

```bash
pnpm import:linear -- <export.csv> [--commit] [--side-file <file.json>]
```

> The `--` is required so pnpm forwards the arguments to the script.

| Option        | Default | Description                                                              |
| ------------- | ------- | ------------------------------------------------------------------------ |
| `<export.csv>`| —       | The Linear CSV export. Required.                                          |
| `--commit`    | off     | Actually write. **Without it nothing is written.**                        |
| `--dry-run`   | —       | Accepted, but the dry run is already the default.                         |
| `--side-file` | —       | The optional `M1` connector dump: relations and comments. Skipped if absent. |
| `--help`      | —       | Print the usage and exit without touching the database.                   |

**The dry run is the default, and `--commit` is the only thing that writes.** The ticket asks for a
report reviewed before any real run, and a flag you have to *remember* in order to stay safe is not a
safeguard. Both modes compute the same plan through the same code — the only difference is whether
it reaches Prisma afterwards, so the report is about the run you are actually going to make.

Exit code is `1` when the report is not clean, so it can gate a script.

```bash
# 1. states and labels have to exist first — the importer maps onto them
pnpm seed

# 2. read the report
pnpm import:linear -- linear-export.csv

# 3. once it is clean
pnpm import:linear -- linear-export.csv --commit
```

## What it does

### Columns

Never read by position. The header is resolved by name through a table of aliases in
`src/migration/linear-columns.util.ts`, and every column lands in one of three buckets:

- **read** — mapped into the plan
- **ignored** — a Linear column Spira has no home for (estimate, assignee, cycle, milestone). Listed
  by name, so "ignored" is on the record rather than an accident
- **unrecognised** — anything else, printed but never fatal. Linear adding a column is not a reason
  to refuse an import, but it is a reason to be told

Only a **missing required** column (`ID`, `Title`, `Status`, `Project`, `Created`) stops the run.

With fixed indices, an export that gained one column in the middle would read `Description` as
`Status` and import a whole workspace of plausible-looking garbage. Hence the table.

### Projects

Each Linear project name maps to a **hand-confirmed key** in `src/migration/linear-vocabulary.ts`:

| Linear                      | Spira |
| --------------------------- | ----- |
| `Spira`                     | `SPI` |
| `PFA`                       | `PFA` |
| `3D engine`                 | `3DE` |
| `Iknos`                     | `IKN` |
| `Zeus`                      | `ZEU` |
| `Exalus`                    | `EXA` |
| `1991chat — Chat front-end` | `CHT` |
| `Worldweathr`               | `WEA` |
| `BKMK`                      | `BMK` |

`1991chat` heads with `199`, which is not a usable key, so it takes its consonants — the same rule
`suggestProjectKey` applies in the project form.

The last two are **not in the ticket**: both projects were created in Linear after it was written.
That is the growth the ticket warns about, and it is why an unconfirmed project is an **error** that
stops the import rather than a key invented on the spot. The report names it and proposes what the
project form would have proposed; confirm it by adding a row to the table.

> Linear currently holds **two projects both named `Worldweathr`**, with different ids. The CSV
> identifies a project by name, so the two are indistinguishable inside it and merge into `WEA`. If
> that is not wanted, rename one in Linear **before** exporting.

An existing project's name, icon and colour are never overwritten — the workspace's own metadata
outranks the export's. Only a key with nothing behind it is created.

### Statuses

Linear's seven onto the seeded six:

| Linear        | Spira         |
| ------------- | ------------- |
| `Backlog`     | `Backlog`     |
| `Todo`        | `Todo`        |
| `In Progress` | `In Progress` |
| `Verify`      | `In Review`   |
| `Done`        | `Done`        |
| `Canceled`    | `Canceled`    |
| `Duplicate`   | `Canceled`    |

`Duplicate` is a state type of its own in Linear with no equivalent in v1: a duplicate is closed
without being done, which is what `Canceled` means.

A status the table does not know is an **error**. Dropping it in `Backlog` would be the kind of
silent wrong answer nobody finds for months.

### Labels

Created on the fly from the export, preserving names. Matched on name against what already exists,
so `Feature` lands on the seeded `Feature` rather than beside it. New labels get a colour from the
seeded palette, picked from the name so two runs agree.

The `Labels` cell is split on comma **and** semicolon — which separator an export uses is a property
of the export, not something documented. A label with a comma in its own name would be split wrongly
and there is no way to tell from inside the cell, so the report prints the full label set with
counts. Read it.

### Epics and the nesting guard

An issue that is another's `Parent issue` becomes `isEpic`, and its children get its `epicId`.
Parents are matched by identifier **or** by UUID, because `M1` leaves open which the export uses;
if the export names parents by UUID and carries no UUID column, the report says exactly that
instead of listing three hundred dangling parents.

Spira's hierarchy is exactly one level. Anything deeper is flattened to its topmost ancestor and
**every flattened issue is logged**. An issue that is a parent *and* has a parent keeps its place as
a child and loses `isEpic` — it is listed separately as demoted. A parent chain that loops is an
error, not an infinite walk.

The data was one level deep at planning time. If this section logs anything, look before continuing.

### Timestamps

`created`, `updated`, `completed`, `canceled` and `archived` are preserved as exported, never
stamped at import time. When a closed issue has no closing timestamp in the export, the fallback is
its exported `Updated` — another exported value, never `now` — and the report counts how often that
happened.

> Issues are written epics-first in a single `createMany` rather than in two passes. `Issue.updatedAt`
> is `@updatedAt`, so a second pass writing `epicId` restamps every child with the moment of the
> import — which looks perfect until the column is read back. See `writeOrder`.

### Numbering

Per project, restarting at 1, ordered by Linear creation date: `PFA-1` is the oldest PFA issue. The
original Linear identifier is kept in `legacyIdentifier`. Issues created in the same second are tied
on their number, so `COS-9` comes before `COS-10`.

Importing into a project that already holds issues continues from its counter instead of colliding,
and warns — because `PFA-1` is then no longer the oldest. An issue whose `legacyIdentifier` is
already in the workspace is an error: the importer will not import the same export twice.

### Values too big for their column

Checked before anything is written, because MySQL's own answer is a truncated row nobody looks at:

- a **title** longer than `Issue.title` is cut and **warned** about, naming every issue — losing the
  tail of a long title is survivable
- a **`legacyIdentifier`** longer than its column is an **error**. It is what every `COS-` reference
  in a commit message resolves through, so a cut one resolves to nothing
- a **label name** longer than `Label.name` is an **error**, because cutting two long names to the
  same prefix merges two labels into one

### The side-file

The CSV carries neither relations nor comments. If the optional `M1` connector dump was taken, pass
it with `--side-file`:

```json
{
  "relations": [{ "from": "COS-283", "type": "blocks", "to": "COS-284" }],
  "comments": [
    { "issue": "COS-283", "body": "markdown", "author": "cosmokaat", "createdAt": "2026-07-28T22:59:53.006Z" }
  ]
}
```

`type` is `blocks` or `related`; `related` is normalised on the lower id, as the API does. Entries
naming an issue that is not in the export are skipped, and malformed entries are counted and printed
rather than throwing. Absent the flag, both are skipped entirely.

`Comment` is read by nothing in v1 — it exists so the decision stays available at cutover rather
than being a schema change against a workspace that no longer exists.

## The report

```
── Columns ──────────────────────────────────────
   read (13): archivedAt, canceledAt, completedAt, createdAt, …
   ignored (6): Team, Estimate, Assignee, Cycle Name, Started, Due Date

── Issues per project ───────────────────────────
   SPI     6  SPI-1 … SPI-6   Spira
   …

── Warnings (1) — imported anyway ───────────────
   • 0 completed and 1 canceled issues had no closing timestamp …

── Verdict ──────────────────────────────────────
   clean: 20 issues ready across 9 projects
```

**Errors** stop the import: malformed rows, unconfirmed projects, unmapped statuses, duplicate ids,
dangling parents, looping parent chains, identifiers or legacy identifiers already in the workspace.

**Warnings** do not: flattened nesting, demoted parents, cross-project epics, unreadable priorities
and optional dates, timestamp fallbacks, continued numbering, and several Linear projects merging
into one Spira key.

## Trying it without the real export

`test/fixtures/linear-export.sample.csv` is a small export in the same shape, carrying the cases that
break naive parsing: a description with a fenced code block, embedded commas, doubled quotes and
newlines; multi-label rows; an epic with children; French titles with accents and guillemets; and a
`Duplicate`.

Against a scratch database:

```bash
mysql -h 127.0.0.1 -u root -p -e "CREATE DATABASE spira_import_check"
export DATABASE_URL="mysql://root:PASSWORD@localhost:3306/spira_import_check"
pnpm exec prisma migrate deploy
pnpm seed -- --password whatever
mysql -h 127.0.0.1 -u root -p spira_import_check -e \
  "DELETE FROM IssueRelation; DELETE FROM IssueLabel; DELETE FROM Issue; DELETE FROM SavedView; DELETE FROM Project;"
pnpm import:linear -- test/fixtures/linear-export.sample.csv --commit
```

The seed is what puts the six states and the labels there; the deletes leave them while clearing the
demo issues, which is roughly the shape a cutover database is in.

## Not this script's job

- **Redirects and search across `legacyIdentifier`** — `M3` (COS-284). This script only writes the
  column.
- **Creating states** — `pnpm seed` does that, and the importer refuses to run without them.
