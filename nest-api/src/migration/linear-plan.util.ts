/**
 * The export, turned into exactly what will be written — and everything that
 * would be wrong about writing it (COS-283).
 *
 * Nothing here touches a database. The whole mapping is a pure function from
 * rows to a plan plus a report, which is what makes `--dry-run` honest: the dry
 * run and the real run compute the *same* plan, and the only difference between
 * them is whether it is handed to Prisma afterwards. A dry run that took a
 * different path through the code would be a report about a program nobody is
 * going to run.
 *
 * Problems are split in two, because they want different reactions:
 *
 * - **errors** — the row cannot be written, or writing it would be wrong.
 *   These block the import.
 * - **warnings** — the row will be written, but a human should know. Flattened
 *   nesting is the loudest of these: the ticket says the data was one level
 *   deep at planning time, so anything logged here means the shape changed.
 */

import { FIELD_LIMITS } from "@config/field-limits";
import { readRow } from "@migration/linear-columns.util";
import {
  CANCELED_STATES,
  COMPLETED_STATES,
  dateFrom,
  labelsFrom,
  priorityFor,
  projectKeyFor,
  stateFor,
  suggestKeyFor,
  type SpiraState,
} from "@migration/linear-vocabulary";

import type { LinearField } from "@migration/linear-columns.util";

/** Manual ordering leaves room between neighbours, exactly as `seed.ts` does. */
const SORT_ORDER_STEP = 1024;

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the target workspace already holds. Empty at cutover; not in dev. */
export interface ExistingWorkspace {
  /** Spira identifiers already taken — `PFA-12`. */
  identifiers: Set<string>;
  /** Linear identifiers already imported — `COS-177`. */
  legacyIdentifiers: Set<string>;
  /** Project key to its last allocated issue number. */
  counters: Map<string, number>;
}

export const EMPTY_WORKSPACE: ExistingWorkspace = {
  identifiers: new Set(),
  legacyIdentifiers: new Set(),
  counters: new Map(),
};

export interface PlannedIssue {
  /** The line of the CSV this came from, header counted. For the report. */
  line: number;
  legacyIdentifier: string;
  projectKey: string;
  projectName: string;
  number: number;
  identifier: string;
  title: string;
  description: string | null;
  state: SpiraState;
  priority: number;
  labels: string[];
  isEpic: boolean;
  /** The epic's *legacy* identifier — resolved to real ids at write time. */
  epicOf: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  canceledAt: Date | null;
  archivedAt: Date | null;
}

export interface ImportReport {
  rowsRead: number;
  rowsPlanned: number;

  // --- errors: these block the import -------------------------------------
  malformed: { line: number; id: string | null; reasons: string[] }[];
  unknownProjects: { name: string; count: number; suggestedKey: string }[];
  unmappedStatuses: { name: string; count: number }[];
  duplicateIds: { id: string; lines: number[] }[];
  danglingParents: { id: string; parent: string }[];
  /** A parent chain that loops. Impossible in Linear; fatal if it appears. */
  cycles: string[][];
  keyCollisions: { key: string; projects: string[] }[];
  identifierCollisions: string[];
  legacyCollisions: string[];
  /** Parents given as UUIDs with no UUID column to match them against. */
  unmatchableUuidParents: number;
  /** Values too long for their column and too load-bearing to truncate. */
  tooLong: { id: string; field: string; length: number; limit: number }[];

  // --- warnings: written anyway, but say so -------------------------------
  flattened: { id: string; from: string; to: string; depth: number }[];
  demoted: string[];
  crossProjectEpics: { id: string; project: string; epic: string; epicProject: string }[];
  unknownPriorities: { value: string; count: number }[];
  unreadableDates: { line: number; field: string; value: string }[];
  /** Closed issues whose closing timestamp had to come from `Updated`. */
  timestampFallbacks: { completed: number; canceled: number };
  /** Projects already holding issues, so numbering does not start at 1. */
  continuedNumbering: { key: string; from: number }[];
  /** Titles that will be cut to fit `Issue.title`. */
  truncatedTitles: { id: string; length: number }[];

  // --- counts, for the eye ------------------------------------------------
  /**
   * `name` is the first Linear name seen for the key and is what a *created*
   * project is called. `names` is every name that mapped to it, which is what
   * the report prints — joining them was fine for the eye and wrong for the
   * column, and at cutover the projects do not exist yet, so the create branch
   * is exactly the path that runs.
   */
  byProject: { key: string; name: string; names: string[]; count: number; first: string; last: string }[];
  byState: { state: SpiraState; count: number }[];
  labels: { name: string; count: number }[];
  epics: number;
  epicChildren: number;
}

export interface ImportPlan {
  issues: PlannedIssue[];
  report: ImportReport;
}

/** Every field of a row, once it is known to be usable. */
interface Draft {
  line: number;
  legacyIdentifier: string;
  uuid: string;
  parentRef: string;
  projectKey: string;
  projectName: string;
  title: string;
  description: string | null;
  state: SpiraState;
  priority: number;
  labels: string[];
  createdAt: Date;
  updatedAt: Date | null;
  completedAt: Date | null;
  canceledAt: Date | null;
  archivedAt: Date | null;
}

const bump = <K>(counts: Map<K, number>, key: K): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

/**
 * `COS-9` before `COS-10`. Plain string order would put `COS-10` first, and
 * since this is the tie-break for issues created in the same second, it decides
 * a handful of identifiers on every import.
 */
function naturalCompare(a: string, b: string): number {
  const split = /^(.*?)(\d+)$/;
  const left = split.exec(a);
  const right = split.exec(b);

  if (left && right && left[1] === right[1]) {
    return Number(left[2]) - Number(right[2]);
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

export function planImport(
  rows: string[][],
  index: Partial<Record<LinearField, number>>,
  existing: ExistingWorkspace = EMPTY_WORKSPACE,
): ImportPlan {
  const drafts: Draft[] = [];
  const malformed: ImportReport["malformed"] = [];
  const unknownProjectCounts = new Map<string, number>();
  const unmappedStatusCounts = new Map<string, number>();
  const unknownPriorityCounts = new Map<string, number>();
  const unreadableDates: ImportReport["unreadableDates"] = [];
  let rowsRead = 0;

  // ---- pass 1: every row on its own -------------------------------------
  rows.forEach((row, offset) => {
    // The header is line 1, so the first data row is line 2 — which is what
    // a spreadsheet will show whoever goes to look at a reported line.
    const line = offset + 2;

    // A wholly blank row is what a trailing newline leaves behind. Reporting it
    // as malformed would put a permanent error in every clean run's report.
    if (row.every((cell) => (cell ?? "").trim() === "")) {
      return;
    }
    rowsRead += 1;

    const cells = readRow(row, index);
    const reasons: string[] = [];

    const legacyIdentifier = cells.id.toUpperCase();
    if (legacyIdentifier === "") {
      reasons.push("no ID");
    }
    if (cells.title === "") {
      reasons.push("no title");
    }

    let projectKey: string | null = null;
    if (cells.project === "") {
      reasons.push("no project — Spira has no home for an issue outside one");
    } else {
      projectKey = projectKeyFor(cells.project);
      if (projectKey === null) {
        bump(unknownProjectCounts, cells.project);
        reasons.push(`project "${cells.project}" has no confirmed key`);
      }
    }

    let state: SpiraState | null = null;
    if (cells.status === "") {
      reasons.push("no status");
    } else {
      state = stateFor(cells.status);
      if (state === null) {
        bump(unmappedStatusCounts, cells.status);
        reasons.push(`status "${cells.status}" maps to no Spira state`);
      }
    }

    const createdAt = dateFrom(cells.createdAt);
    if (createdAt === null) {
      // Fatal rather than defaulted: `Created` decides the whole numbering
      // order, and a row dated now would take the last identifier in its
      // project while claiming to be the oldest thing in it.
      reasons.push(`unreadable Created ${JSON.stringify(cells.createdAt)}`);
    }

    // Not fatal. A priority nobody can read is a wrong sort order at worst,
    // and refusing the row over it would lose the issue entirely.
    let priority = priorityFor(cells.priority);
    if (priority === null) {
      bump(unknownPriorityCounts, cells.priority);
      priority = 0;
    }

    const optionalDate = (field: "updatedAt" | "completedAt" | "canceledAt" | "archivedAt"): Date | null => {
      const raw = cells[field];
      const parsed = dateFrom(raw);
      if (raw !== "" && parsed === null) {
        unreadableDates.push({ line, field, value: raw });
      }
      return parsed;
    };

    if (reasons.length > 0 || createdAt === null || projectKey === null || state === null) {
      malformed.push({ line, id: legacyIdentifier || null, reasons });
      return;
    }

    drafts.push({
      line,
      legacyIdentifier,
      uuid: cells.uuid.toUpperCase(),
      parentRef: cells.parent,
      projectKey,
      projectName: cells.project,
      title: cells.title,
      // Whitespace-only means empty; anything else is kept byte for byte,
      // because leading spaces are markdown's way of spelling a code block.
      description: cells.description.trim() === "" ? null : cells.description,
      state,
      priority,
      labels: labelsFrom(cells.labels),
      createdAt,
      updatedAt: optionalDate("updatedAt"),
      completedAt: optionalDate("completedAt"),
      canceledAt: optionalDate("canceledAt"),
      archivedAt: optionalDate("archivedAt"),
    });
  });

  // ---- duplicates --------------------------------------------------------
  const byLegacy = new Map<string, Draft>();
  const duplicateLines = new Map<string, number[]>();
  const unique: Draft[] = [];

  for (const draft of drafts) {
    const first = byLegacy.get(draft.legacyIdentifier);
    if (first) {
      // Kept out of the plan rather than merged: `Issue.legacyIdentifier` is
      // unique, so the second row has nowhere to go, and choosing which of two
      // rows claiming to be COS-177 is the real one is not a decision a script
      // should make quietly.
      duplicateLines.set(draft.legacyIdentifier, [
        ...(duplicateLines.get(draft.legacyIdentifier) ?? [first.line]),
        draft.line,
      ]);
      continue;
    }
    byLegacy.set(draft.legacyIdentifier, draft);
    unique.push(draft);
  }

  // ---- parents -----------------------------------------------------------
  // Indexed by both columns: M1 leaves open whether `Parent issue` names the
  // parent by identifier or by UUID, so both are accepted and whichever the
  // export actually uses simply works.
  const byRef = new Map<string, Draft>();
  for (const draft of unique) {
    byRef.set(draft.legacyIdentifier, draft);
    if (draft.uuid !== "") {
      byRef.set(draft.uuid, draft);
    }
  }

  const parentOf = new Map<string, string>();
  const danglingParents: ImportReport["danglingParents"] = [];
  let unmatchableUuidParents = 0;

  for (const draft of unique) {
    const ref = draft.parentRef.trim();
    if (ref === "") {
      continue;
    }

    const parent = byRef.get(ref.toUpperCase());
    if (!parent) {
      danglingParents.push({ id: draft.legacyIdentifier, parent: ref });
      if (UUID_SHAPE.test(ref)) {
        unmatchableUuidParents += 1;
      }
      continue;
    }
    if (parent.legacyIdentifier === draft.legacyIdentifier) {
      danglingParents.push({ id: draft.legacyIdentifier, parent: `${ref} (itself)` });
      continue;
    }
    parentOf.set(draft.legacyIdentifier, parent.legacyIdentifier);
  }

  // ---- the nesting guard -------------------------------------------------
  const flattened: ImportReport["flattened"] = [];
  const cycles: string[][] = [];
  const epicOf = new Map<string, string>();

  for (const draft of unique) {
    const direct = parentOf.get(draft.legacyIdentifier);
    if (!direct) {
      continue;
    }

    const chain: string[] = [];
    const seen = new Set([draft.legacyIdentifier]);
    let current = direct;
    let looped = false;

    while (true) {
      if (seen.has(current)) {
        // Linear cannot produce this. If it ever appears, the walk has to stop
        // somewhere, and stopping without saying so would hide it.
        cycles.push([draft.legacyIdentifier, ...chain, current]);
        looped = true;
        break;
      }
      seen.add(current);
      chain.push(current);

      const next = parentOf.get(current);
      if (!next) {
        break;
      }
      current = next;
    }

    if (looped) {
      continue;
    }

    const top = chain[chain.length - 1];
    epicOf.set(draft.legacyIdentifier, top);

    if (chain.length > 1) {
      flattened.push({ id: draft.legacyIdentifier, from: direct, to: top, depth: chain.length });
    }
  }

  // An issue that is somebody's parent while having one of its own cannot be an
  // epic — Spira's hierarchy is exactly one level. It keeps its own place under
  // the top and its children have already been moved up beside it.
  const epics = new Set(epicOf.values());
  const demoted = [...new Set(parentOf.values())].filter((id) => parentOf.has(id)).sort();

  // ---- numbering ---------------------------------------------------------
  const grouped = new Map<string, Draft[]>();
  for (const draft of unique) {
    grouped.set(draft.projectKey, [...(grouped.get(draft.projectKey) ?? []), draft]);
  }

  const issues: PlannedIssue[] = [];
  const byProject: ImportReport["byProject"] = [];
  const continuedNumbering: ImportReport["continuedNumbering"] = [];
  const keyToNames = new Map<string, Set<string>>();
  const identifierCollisions: string[] = [];
  const fallbacks = { completed: 0, canceled: 0 };

  for (const [key, members] of [...grouped.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    // Oldest first, so `PFA-1` is the oldest PFA issue — the rule M3 states.
    const ordered = [...members].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || naturalCompare(a.legacyIdentifier, b.legacyIdentifier),
    );

    const start = existing.counters.get(key) ?? 0;
    if (start > 0) {
      continuedNumbering.push({ key, from: start });
    }

    ordered.forEach((draft, position) => {
      const number = start + position + 1;
      const identifier = `${key}-${number}`;

      if (existing.identifiers.has(identifier)) {
        identifierCollisions.push(identifier);
      }
      keyToNames.set(key, (keyToNames.get(key) ?? new Set()).add(draft.projectName));

      // "Preserved as exported, not stamped at import time" — so when a closed
      // issue's closing column is absent or empty, the fallback is another
      // exported timestamp, never `now`.
      let completedAt = draft.completedAt;
      if (completedAt === null && COMPLETED_STATES.includes(draft.state)) {
        completedAt = draft.updatedAt ?? draft.createdAt;
        fallbacks.completed += 1;
      }
      let canceledAt = draft.canceledAt;
      if (canceledAt === null && CANCELED_STATES.includes(draft.state)) {
        canceledAt = draft.updatedAt ?? draft.createdAt;
        fallbacks.canceled += 1;
      }

      issues.push({
        line: draft.line,
        legacyIdentifier: draft.legacyIdentifier,
        projectKey: key,
        projectName: draft.projectName,
        number,
        identifier,
        title: draft.title,
        description: draft.description,
        state: draft.state,
        priority: draft.priority,
        labels: draft.labels,
        isEpic: epics.has(draft.legacyIdentifier),
        epicOf: epicOf.get(draft.legacyIdentifier) ?? null,
        sortOrder: number * SORT_ORDER_STEP,
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt ?? draft.createdAt,
        completedAt,
        canceledAt,
        archivedAt: draft.archivedAt,
      });
    });

    const first = ordered.length > 0 ? `${key}-${start + 1}` : "—";
    const last = ordered.length > 0 ? `${key}-${start + ordered.length}` : "—";
    const names = [...(keyToNames.get(key) ?? [])];
    byProject.push({ key, name: names[0] ?? key, names, count: ordered.length, first, last });
  }

  // ---- collisions and counts ---------------------------------------------
  const planned = new Map(issues.map((issue) => [issue.legacyIdentifier, issue]));

  const crossProjectEpics: ImportReport["crossProjectEpics"] = [];
  for (const issue of issues) {
    if (issue.epicOf === null) {
      continue;
    }
    const epic = planned.get(issue.epicOf);
    if (epic && epic.projectKey !== issue.projectKey) {
      crossProjectEpics.push({
        id: issue.legacyIdentifier,
        project: issue.projectKey,
        epic: epic.legacyIdentifier,
        epicProject: epic.projectKey,
      });
    }
  }

  const labelCounts = new Map<string, number>();
  const stateCounts = new Map<SpiraState, number>();
  for (const issue of issues) {
    bump(stateCounts as unknown as Map<string, number>, issue.state);
    for (const label of issue.labels) {
      bump(labelCounts, label);
    }
  }

  const takenKeys = [...grouped.keys(), ...existing.counters.keys()];

  // A column too small for its value is silent data loss on write, so both
  // outcomes are said out loud rather than left to MySQL. A title is cut and
  // reported — losing the tail of a long title is survivable. An identifier or
  // a label name is not: `legacyIdentifier` is what every `COS-` reference in
  // a commit message resolves through, and a cut `Label.name` merges two
  // labels into one. Those stop the import.
  const truncatedTitles = issues
    .filter((issue) => issue.title.length > FIELD_LIMITS.issueTitle)
    .map((issue) => ({ id: issue.legacyIdentifier, length: issue.title.length }));

  const tooLong: ImportReport["tooLong"] = [];
  for (const issue of issues) {
    if (issue.legacyIdentifier.length > FIELD_LIMITS.identifier) {
      tooLong.push({
        id: issue.legacyIdentifier,
        field: "legacyIdentifier",
        length: issue.legacyIdentifier.length,
        limit: FIELD_LIMITS.identifier,
      });
    }
  }
  for (const label of labelCounts.keys()) {
    if (label.length > FIELD_LIMITS.labelName) {
      tooLong.push({ id: label, field: "label name", length: label.length, limit: FIELD_LIMITS.labelName });
    }
  }

  return {
    issues,
    report: {
      rowsRead,
      rowsPlanned: issues.length,

      malformed,
      unknownProjects: [...unknownProjectCounts.entries()]
        .map(([name, count]) => ({ name, count, suggestedKey: suggestKeyFor(name, takenKeys) }))
        .sort((a, b) => b.count - a.count),
      unmappedStatuses: [...unmappedStatusCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      duplicateIds: [...duplicateLines.entries()].map(([id, lines]) => ({ id, lines })),
      danglingParents,
      cycles,
      keyCollisions: [...keyToNames.entries()]
        .filter(([, names]) => names.size > 1)
        .map(([key, names]) => ({ key, projects: [...names] })),
      identifierCollisions,
      legacyCollisions: issues
        .filter((issue) => existing.legacyIdentifiers.has(issue.legacyIdentifier))
        .map((issue) => issue.legacyIdentifier),
      unmatchableUuidParents,
      tooLong,

      truncatedTitles,
      flattened,
      demoted,
      crossProjectEpics,
      unknownPriorities: [...unknownPriorityCounts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count),
      unreadableDates,
      timestampFallbacks: fallbacks,
      continuedNumbering,

      byProject,
      byState: [...stateCounts.entries()].map(([state, count]) => ({ state, count })),
      labels: [...labelCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      epics: epics.size,
      epicChildren: issues.filter((issue) => issue.epicOf !== null).length,
    },
  };
}

/**
 * The plan in an order it is safe to insert.
 *
 * Epics first, then everything else. `Issue.epicId` is a foreign key onto
 * `Issue.id`, and MySQL checks it as each row of a multi-row insert lands, so a
 * child written before its epic fails on the spot.
 *
 * The alternative — insert in any order, then a second pass writing `epicId` —
 * is what this replaced, and it was quietly wrong: `Issue.updatedAt` is
 * `@updatedAt`, so every one of those updates restamped the issue with the
 * moment of the import. The ticket asks for timestamps preserved as exported,
 * and nothing about the result looked wrong until the column was read back.
 *
 * Safe because the hierarchy is exactly one level by the time it gets here:
 * flattening has already pointed every child at a topmost ancestor, and a
 * topmost ancestor is by definition an issue with no epic of its own.
 */
export function writeOrder(issues: PlannedIssue[]): PlannedIssue[] {
  return [...issues.filter((issue) => issue.epicOf === null), ...issues.filter((issue) => issue.epicOf !== null)];
}

/**
 * Everything that blocks an import, as lines of prose. Empty means the export
 * is clean — which is the ticket's "done when".
 */
export function errorsIn(report: ImportReport): string[] {
  const errors: string[] = [];
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  if (report.malformed.length > 0) {
    errors.push(`${plural(report.malformed.length, "malformed row")}`);
  }
  for (const project of report.unknownProjects) {
    errors.push(
      `project "${project.name}" (${project.count} issues) has no confirmed key — ` +
        `add it to PROJECT_TABLE, perhaps as "${project.suggestedKey}"`,
    );
  }
  for (const status of report.unmappedStatuses) {
    errors.push(`status "${status.name}" (${status.count} issues) maps to no Spira state`);
  }
  for (const duplicate of report.duplicateIds) {
    errors.push(`${duplicate.id} appears on lines ${duplicate.lines.join(", ")}`);
  }
  if (report.danglingParents.length > 0) {
    errors.push(
      `${plural(report.danglingParents.length, "issue")} name a parent that is not in the export` +
        (report.unmatchableUuidParents > 0
          ? ` — ${report.unmatchableUuidParents} of them by UUID, and the export has no UUID column to match`
          : ""),
    );
  }
  for (const cycle of report.cycles) {
    errors.push(`parent chain loops: ${cycle.join(" → ")}`);
  }
  if (report.identifierCollisions.length > 0) {
    errors.push(
      `${plural(report.identifierCollisions.length, "identifier")} already exist: ${report.identifierCollisions.slice(0, 5).join(", ")}`,
    );
  }
  if (report.legacyCollisions.length > 0) {
    errors.push(
      `${plural(report.legacyCollisions.length, "issue")} already imported: ${report.legacyCollisions.slice(0, 5).join(", ")}`,
    );
  }
  for (const entry of report.tooLong) {
    errors.push(
      `${entry.field} ${JSON.stringify(entry.id)} is ${entry.length} characters, and the column holds ${entry.limit}`,
    );
  }

  return errors;
}

/** Things worth reading before committing, none of which stop the import. */
export function warningsIn(report: ImportReport): string[] {
  const warnings: string[] = [];

  if (report.flattened.length > 0) {
    warnings.push(
      `${report.flattened.length} issues sit more than one level deep and were flattened to their ` +
        `topmost ancestor — the data was one level deep at planning time, so look before continuing`,
    );
  }
  if (report.demoted.length > 0) {
    warnings.push(
      `${report.demoted.length} issues are a parent and have a parent, so they are not epics: ${report.demoted.join(", ")}`,
    );
  }
  if (report.crossProjectEpics.length > 0) {
    warnings.push(`${report.crossProjectEpics.length} issues belong to an epic in another project`);
  }
  for (const collision of report.keyCollisions) {
    // Not an error. `PROJECT_TABLE` is confirmed by hand, so several names on
    // one key is a merge somebody meant — `1991chat` and its full Linear name
    // are the same project. It is printed because a merge nobody meant looks
    // exactly the same from in here.
    warnings.push(
      `${collision.projects.length} Linear projects merge into ${collision.key}: ${collision.projects.join(", ")}`,
    );
  }
  for (const priority of report.unknownPriorities) {
    warnings.push(
      `priority ${JSON.stringify(priority.value)} (${priority.count} issues) is not a value Linear writes — imported as none`,
    );
  }
  if (report.unreadableDates.length > 0) {
    warnings.push(`${report.unreadableDates.length} unreadable optional dates — imported as empty`);
  }
  if (report.truncatedTitles.length > 0) {
    warnings.push(
      `${report.truncatedTitles.length} titles are longer than Issue.title holds and lose their tail: ` +
        report.truncatedTitles.map((entry) => `${entry.id} (${entry.length})`).join(", "),
    );
  }
  if (report.timestampFallbacks.completed + report.timestampFallbacks.canceled > 0) {
    warnings.push(
      `${report.timestampFallbacks.completed} completed and ${report.timestampFallbacks.canceled} canceled issues ` +
        `had no closing timestamp in the export, and took their Updated one`,
    );
  }
  for (const project of report.continuedNumbering) {
    warnings.push(
      `${project.key} already holds issues, so numbering continues at ${project.key}-${project.from + 1} rather than 1`,
    );
  }

  return warnings;
}
