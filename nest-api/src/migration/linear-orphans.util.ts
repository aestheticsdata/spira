/**
 * Rows belonging to no project. Lifted out of `scripts/import-linear.ts` when
 * Settings grew a button for the same import (COS-455), so the CLI and the
 * endpoint drop exactly the same rows.
 */

import { readRow } from "@migration/linear-columns.util";

import type { LinearField } from "@migration/linear-columns.util";

export interface Orphan {
  line: number;
  id: string;
  title: string;
}

/**
 * Splits off the rows with an empty `Project` cell.
 *
 * Linear allows an issue to sit outside every project, and creates several such itself: the
 * onboarding tickets a workspace is born with. Spira has no home for one — `Issue.projectId` is
 * `NOT NULL` — so the planner is right to call the row malformed. What it cannot do is let the
 * operator past it, and one abandoned "Get familiar with Linear" is otherwise enough to refuse a
 * five-hundred-issue migration with no way through but hand-editing the export.
 *
 * Opt-in, and never silent: every dropped row is returned with its line and identifier, because
 * "skipped" and "lost" are the same thing to an issue that nobody notices is missing.
 */
export function withoutOrphans(
  body: string[][],
  index: Partial<Record<LinearField, number>>,
): { rows: string[][]; orphans: Orphan[] } {
  const rows: string[][] = [];
  const orphans: Orphan[] = [];

  body.forEach((row, position) => {
    // Blank lines are the planner's business, not this function's — it counts them out of `rowsRead`
    // and would otherwise report a file's trailing newline as a lost issue.
    if (row.every((cell) => (cell ?? "").trim() === "")) {
      rows.push(row);
      return;
    }

    const cells = readRow(row, index);
    if (cells.project === "") {
      // +2: one for the header, one because a line number is 1-based.
      orphans.push({ line: position + 2, id: cells.id, title: cells.title });
      return;
    }
    rows.push(row);
  });

  return { rows, orphans };
}
