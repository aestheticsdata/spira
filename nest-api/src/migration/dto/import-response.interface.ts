import type { ColumnResolution } from "@migration/linear-columns.util";
import type { ImportReport } from "@migration/linear-plan.util";
import type { Orphan } from "@migration/linear-orphans.util";

/**
 * What a dry run answers — the CLI's report, in the shape it already computes
 * it, plus the two prose lists it prints.
 *
 * `errors` and `warnings` come from `errorsIn`/`warningsIn`, the same functions
 * the terminal report uses, so the two renderings cannot drift into disagreeing
 * about whether an export is importable. The structured `report` rides along
 * for the counts a screen can show better than a terminal can.
 */
export interface ImportPreviewDto {
  /** Binds a later commit to this exact file. */
  checksum: string;
  /** The account being imported into — the session's, never a guess. */
  target: string;

  columns: {
    read: { field: string; header: string }[];
    ignored: string[];
    unrecognised: string[];
    missingRequired: string[];
    duplicated: ColumnResolution["duplicated"];
  };

  /** Rows with no project. Present only when `skipOrphans` was asked for. */
  orphans: Orphan[];
  /** Whether orphans were dropped, so "0 orphans" and "not asked" differ. */
  skippedOrphans: boolean;

  sideFile: { relations: number; comments: number; problems: string[] } | null;

  report: ImportReport;
  errors: string[];
  warnings: string[];

  /** No errors: the export is importable as it stands. */
  clean: boolean;
  /**
   * Projects that already hold issues, so numbering would continue rather than
   * start at 1. A commit refuses on these unless explicitly allowed — it is
   * the one warning that is irreversible once written.
   */
  continuedNumbering: ImportReport["continuedNumbering"];
}

/** What a commit answers. */
export interface ImportResultDto {
  issues: number;
  projects: number;
  labels: number;
  relations: number;
  comments: number;
}
