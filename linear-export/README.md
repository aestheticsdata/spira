# The Linear export (SPI-2 / COS-252)

`Export Sat Aug 08 2026.csv` is the workspace as Linear held it at cutover, 8 August 2026 — the
migration input, and the fixture `M2`'s parsing is written against. Kept because the source is gone:
once the Linear subscription lapses this file is the only record of what was imported, and the only
thing a future importer bug can be diagnosed against.

**519 rows, 34 columns, 2.1 MB.** 456 `COS-`, 63 `WEA-`. One header row, `\r\n` line endings, UTF-8
with no BOM.

`side-file.json` and `projects.json` sit beside it and are described at the bottom.

## Columns, in export order

The importer resolves these **by name, never by position** (`linear-columns.util.ts`) — Linear has
changed its export shape before, and a column inserted in the middle would otherwise shift
`Description` into `Status` and import a workspace of plausible-looking garbage.

| # | Column | Importer |
|---|---|---|
| 0 | `ID` | → `legacyIdentifier` (`COS-141`) |
| 1 | `Team` | ignored — one team; the split that matters is the project |
| 2 | `Title` | → `title` |
| 3 | `Description` | → `description` |
| 4 | `Status` | → state, by name |
| 5 | `Estimate` | ignored · **always empty** |
| 6 | `Priority` | → `priority` |
| 7 | `Project ID` | ignored — projects match on name |
| 8 | `Project` | → project |
| 9 | `Creator` | ignored — Spira has no creator field |
| 10 | `Assignee` | ignored — Spira has no assignees |
| 11 | `Labels` | → labels |
| 12–15 | `Cycle Number`, `Cycle Name`, `Cycle Start`, `Cycle End` | ignored · **always empty** |
| 16 | `Created` | → `createdAt` |
| 17 | `Updated` | → `updatedAt` |
| 18 | `Started` | ignored |
| 19 | `Triaged` | ignored · **always empty** |
| 20 | `Completed` | → `completedAt` |
| 21 | `Canceled` | → `canceledAt` |
| 22 | `Archived` | → `archivedAt` · **always empty** |
| 23 | `Due Date` | ignored · **always empty** |
| 24 | `Parent issue` | → epic |
| 25 | `Initiatives` | **unrecognised** · always empty |
| 26–27 | `Project Milestone ID`, `Project Milestone` | ignored |
| 28 | `SLA Status` | ignored · **always empty** |
| 29 | `UUID` | → `uuid` |
| 30 | `Time in status (minutes)` | **unrecognised** |
| 31–33 | `Related to`, `Blocked by`, `Duplicate of` | **unrecognised** — see below |

14 fields mapped, 15 ignored, 5 unrecognised, 0 required missing.

**Ignored and unrecognised are different things.** Ignored is a decision on record: Linear has it,
Spira has nowhere to put it. Unrecognised means no rule knows the column — never fatal, always
printed, because being told is the only way to discover the export gained something worth keeping.
That is exactly how the relation columns were found.

Ten columns are empty in every one of the 519 rows: `Estimate`, the four `Cycle *`, `Triaged`,
`Archived`, `Due Date`, `Initiatives`, `SLA Status`. Empty **here**, not empty by definition — a
future export from a workspace that uses cycles or due dates would fill them.

## Encoding

**`Description` is markdown, and every one of the 519 rows contains newlines.** They are real `\n`
inside a quoted cell, not escaped — so the file cannot be split on lines, and 236 rows also contain
`"` doubled to `""` per RFC 4180. Any parser that handles quoted multiline cells is fine; anything
hand-rolled on `split("\n")` produces silent nonsense. It is also the one field the importer does
**not** trim: four leading spaces make the first line a code block, and trimming would quietly
re-render it as a paragraph.

**`Labels` packs several into one cell, comma-space separated** — `Catégories, de-mock, Feature`.
Label names in this workspace contain no commas, which is what makes that safe; the packing is
ambiguous in principle and a future export could break it.

**`Parent issue` holds an identifier, not a UUID** — `COS-141`, the same form as `ID`. Worth stating
because `UUID` exists as its own column and the opposite choice would have been just as plausible.

**Dates are ISO-8601 UTC with milliseconds** — `2026-06-22T13:35:05.809Z`. Always `Z`, never a local
offset.

## The relation columns and `side-file.json`

`Related to`, `Blocked by` and `Duplicate of` carry relations as comma-separated identifiers. The
plan had assumed the CSV wouldn't have them and that reconstructing the graph would mean ~1,000
Linear API calls before the subscription ended. It was in the file all along — under a column the
importer reports as unrecognised.

`side-file.json` is generated from those three columns:

```json
{ "relations": [ { "from": "COS-5", "type": "related", "to": "COS-15" } ], "comments": [] }
```

**1,106 links — 897 `related`, 209 `blocks`.** Direction follows the row: `Blocked by: COS-7` on the
COS-9 row means `{ from: "COS-7", type: "blocks", to: "COS-9" }`.

1,104 of the 1,106 were imported. The two dropped are the single pair `COS-416 ↔ COS-419`, both ends
of which point at COS-416 — one of the 5 orphan rows the import skipped.

`comments` is empty: Linear's CSV carries no comment threads, and a sample of the issues most likely
to have them had none. Sampled, not proven across all 519.

## The project descriptions and `projects.json`

**The export is issue-level. It carries no project description, and no project field of any kind
beyond `Project ID` and `Project`** — the name the rows are grouped under. So M2 could not have
imported them: there is no column to read, and none of the five unrecognised columns is one either.
Every project landed in Spira with an empty `summary` and `description`, and that is the export's
shape rather than a mapping bug (SPI-61).

They were pulled from the Linear API instead and committed here as `projects.json`, for the same
reason the CSV is committed: once the subscription lapses this file is the only copy.

```json
{ "spiraKey": "ZEU", "linearId": "8fa159ed-…", "name": "Zeus", "url": "https://linear.app/…",
  "trashed": false, "summary": "Fleet control plane for…", "description": "**Zeus** is the…" }
```

**10 projects for 9 in Spira.** Linear holds two named `Worldweathr`; the WEA rows all carry
`Project ID = 5309647f-…`, so the other one — trashed, an earlier draft, six sky conditions instead
of seven — is recorded with `spiraKey: null` and imported nowhere.

**Three are empty at the source**: `3D engine`, `BKMK` and `PFA` have no summary and no description
in Linear either. They are written as empty strings rather than left out, so the file says so
instead of leaving it to be re-derived.

Descriptions are stored **raw, exactly as Linear returned them**, including its
`<issue id=… href=…>COS-18</issue>` cross-reference markup — three of them in CHT's, 531 characters
of another tracker's HTML. `nest-api/scripts/backfill-project-descriptions.ts` unwraps those to the
bare `COS-18` on the way in: Spira's renderer makes a chip out of the identifier itself, and it
resolves through the legacy column.

```
pnpm backfill:project-descriptions            # report only, from nest-api/
pnpm backfill:project-descriptions -- --commit
```

It reads `SPIRA_API_TOKEN` and goes through the REST API rather than Prisma, so it fills prod and a
local Spira from the same laptop. Re-running is a no-op: a project that already holds text keeps it
unless `--force` says otherwise, because a description edited in Spira is newer than Linear's.

**`SPI` has already diverged**, which is what that guard is for. The text Linear held described a
single-user app that was one Next process talking to Prisma; Spira is neither — it is multi-account
since SPI-50, and a Next front in front of a Nest API since the split. Its live description was
rewritten to match the repo. This file keeps Linear's version, because it is a record of what Linear
held and not of what is true.

## What the import produced

514 issues, 9 projects, 25 labels, 1,104 relations, into `cosmokaat@protonmail.com`.

519 rows − 514 issues = 5 skipped orphans. Separately, `COS-1`..`COS-4` are absent from the export
entirely: Linear's onboarding tickets, created in the same second as the team and deleted since.
