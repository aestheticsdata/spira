import { compareStatesForGrouping, priorityName } from "@lib/status";

import type { GroupMode } from "@components/filters/display-options";
import type { IssueListItemDto, ProjectSummaryDto, WorkflowStateDto } from "@lib/api-types";

export type { GroupMode };

export interface IssueGroupData {
  key: string;
  /**
   * The header treatment, not the grouping mode: an epic group is raised and
   * carries the accent rail, everything else — including "No epic" — is a plain
   * status-style header. `none` draws no header at all.
   */
  kind: "status" | "epic" | "priority" | "project" | "none";
  label: string;
  /** Epic groups only: the epic's own identifier pair, shown before the label. */
  identifier: string | null;
  legacy: string | null;
  count: number;
  /** The 2px left rail, as a CSS colour. */
  accent: string;
  /**
   * Drives the header's state ring, when the group is one a state can describe.
   * Null for priority and project groups: they are not workflow states, and
   * borrowing a state's glyph to say "Urgent" would be a lie told in colour.
   */
  state: WorkflowStateDto | null;
  /** Priority groups only: the header draws the bars instead of a state ring. */
  priority: number | null;
  /** Corner radius of that ring: a circle for a real state, a rounded square
   *  for the synthetic "No epic" header, as in the design. */
  iconRadius: string;
  progress: { done: number; total: number } | null;
  rows: IssueListItemDto[];
  /** Left padding of this group's rows, in px. */
  indent: number;
  /**
   * What the group's quick-add files into: grouping by status means the new
   * issue takes the group's state, grouping by epic means it takes the group's
   * epic. "No epic" implies neither, and both `null` is the API's own default —
   * first workflow state, no parent.
   */
  quickAdd: { stateId: string | null; epicId: string | null };
}

export interface GroupOptions {
  /** Draw buckets nothing is in. Only status and priority have buckets. */
  showEmpty?: boolean;
  /**
   * The server has already ordered these rows, so leave them alone. Without it
   * the epics-first and by-state tie-breaks below would quietly undo whichever
   * ordering the display asked for.
   */
  preserveOrder?: boolean;
}

const EPIC_ACCENT = "var(--accent)";
const STATUS_ACCENT = "var(--line)";

const RING = "50%";
/** The design draws the "No epic" header glyph as a dashed rounded square. */
const SQUARE = "3px";

const ROW_INDENT = 16;
const CHILD_INDENT = 40;

/** Linear's order: urgent first, no-priority last rather than first. */
const PRIORITY_ORDER = [1, 2, 3, 4, 0];

/**
 * "No epic" is not a workflow state, but the header still draws a glyph. A
 * dashed backlog-coloured one reads as "unassigned" without inventing a colour.
 */
const NO_EPIC_STATE: WorkflowStateDto = {
  id: "no-epic",
  name: "No epic",
  type: "backlog",
  color: "var(--state-backlog)",
  position: -1,
};

/** Everything a bucket-style group shares, so each mode states only its own bit. */
function bucket(fields: Partial<IssueGroupData> & Pick<IssueGroupData, "key" | "label" | "rows">): IssueGroupData {
  return {
    kind: "status",
    identifier: null,
    legacy: null,
    count: fields.rows.length,
    accent: STATUS_ACCENT,
    state: null,
    priority: null,
    iconRadius: RING,
    progress: null,
    indent: ROW_INDENT,
    quickAdd: { stateId: null, epicId: null },
    ...fields,
  };
}

/**
 * Turns a flat issue list into the list's groups. Pure: neither `issues` nor
 * `states` is mutated, and nothing is read from the URL or the API — the page
 * decides the mode, this decides the shape.
 */
export function groupIssues(
  issues: IssueListItemDto[],
  states: WorkflowStateDto[],
  mode: GroupMode,
  options: GroupOptions = {},
): IssueGroupData[] {
  switch (mode) {
    case "epic":
      return groupByEpic(issues, options);
    case "priority":
      return groupByPriority(issues, options);
    case "project":
      return groupByProject(issues);
    case "none":
      return groupNone(issues);
    default:
      return groupByStatus(issues, states, options);
  }
}

/** Epics to the top of their bucket, unless the server was asked to order. */
function withEpicsFirst(rows: IssueListItemDto[], options: GroupOptions): IssueListItemDto[] {
  return options.preserveOrder ? rows : rows.sort((a, b) => Number(b.isEpic) - Number(a.isEpic));
}

function groupByStatus(
  issues: IssueListItemDto[],
  states: WorkflowStateDto[],
  options: GroupOptions,
): IssueGroupData[] {
  const groups: IssueGroupData[] = [];

  for (const state of [...states].sort(compareStatesForGrouping)) {
    const rows = issues.filter((issue) => issue.state.id === state.id);
    // A state nobody is in gets no header by default — an empty group is noise
    // on a list that already has six of them.
    if (rows.length === 0 && !options.showEmpty) {
      continue;
    }

    groups.push(
      bucket({
        key: state.id,
        label: state.name,
        state,
        rows: withEpicsFirst(rows, options),
        quickAdd: { stateId: state.id, epicId: null },
      }),
    );
  }

  return groups;
}

function groupByPriority(issues: IssueListItemDto[], options: GroupOptions): IssueGroupData[] {
  const groups: IssueGroupData[] = [];

  for (const priority of PRIORITY_ORDER) {
    const rows = issues.filter((issue) => issue.priority === priority);
    if (rows.length === 0 && !options.showEmpty) {
      continue;
    }

    groups.push(
      bucket({
        key: `priority-${priority}`,
        kind: "priority",
        label: priorityName(priority),
        priority,
        rows: withEpicsFirst(rows, options),
      }),
    );
  }

  return groups;
}

/**
 * Buckets taken from the rows rather than from a list of projects: this page
 * only ever holds one project, and a cross-project list does not exist yet, so
 * there is no vocabulary of absent projects to draw empty groups from.
 */
function groupByProject(issues: IssueListItemDto[]): IssueGroupData[] {
  const seen = new Map<string, ProjectSummaryDto>();
  for (const issue of issues) {
    if (!seen.has(issue.project.id)) {
      seen.set(issue.project.id, issue.project);
    }
  }

  return [...seen.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((project) =>
      bucket({
        key: project.id,
        kind: "project",
        label: project.name,
        identifier: project.key,
        rows: issues.filter((issue) => issue.project.id === project.id),
      }),
    );
}

/** One flat run of rows. The group exists only to carry them and the creator. */
function groupNone(issues: IssueListItemDto[]): IssueGroupData[] {
  if (issues.length === 0) {
    return [];
  }

  return [bucket({ key: "all", kind: "none", label: "All issues", rows: issues })];
}

function groupByEpic(issues: IssueListItemDto[], options: GroupOptions): IssueGroupData[] {
  const groups: IssueGroupData[] = issues
    .filter((issue) => issue.isEpic)
    .map((epic) => {
      const rows = byStateUnlessOrdered(
        issues.filter((issue) => issue.epicId === epic.id),
        options,
      );

      return {
        key: epic.id,
        kind: "epic" as const,
        label: epic.title,
        identifier: epic.identifier,
        legacy: epic.legacyIdentifier,
        count: rows.length,
        accent: EPIC_ACCENT,
        state: epic.state,
        priority: null,
        iconRadius: RING,
        // The API counts every child; the rows here may be a filtered subset,
        // so the epic's own tally is the honest one when it exists.
        progress: epic.epicProgress ?? countCompleted(rows),
        rows,
        indent: CHILD_INDENT,
        quickAdd: { stateId: null, epicId: epic.id },
      };
    });

  // Deliberately not subject to `showEmpty`: a childless epic is a real issue
  // you may be about to file children into, not an empty bucket from a fixed
  // vocabulary. Hiding it would take the only way of reaching it off the list.

  const loose = byStateUnlessOrdered(
    issues.filter((issue) => !issue.isEpic && !issue.epicId),
    options,
  );

  if (loose.length > 0) {
    groups.push(
      bucket({
        key: "no-epic",
        label: "No epic",
        state: NO_EPIC_STATE,
        iconRadius: SQUARE,
        rows: loose,
      }),
    );
  }

  return groups;
}

function byStateUnlessOrdered(rows: IssueListItemDto[], options: GroupOptions): IssueListItemDto[] {
  return options.preserveOrder ? rows : rows.sort((a, b) => compareStatesForGrouping(a.state, b.state));
}

function countCompleted(rows: IssueListItemDto[]): {
  done: number;
  total: number;
} {
  return {
    done: rows.filter((row) => row.state.type === "completed").length,
    total: rows.length,
  };
}
