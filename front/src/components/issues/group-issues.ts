import { compareStatesForGrouping } from "@lib/status";

import type { IssueListItemDto, WorkflowStateDto } from "@lib/api-types";

export type GroupMode = "status" | "epic";

export interface IssueGroupData {
  key: string;
  /**
   * The header treatment, not the grouping mode: an epic group is raised and
   * carries the accent rail, everything else — including "No epic" — is a plain
   * status-style header.
   */
  kind: "status" | "epic";
  label: string;
  /** Epic groups only: the epic's own identifier pair, shown before the label. */
  identifier: string | null;
  legacy: string | null;
  count: number;
  /** The 2px left rail, as a CSS colour. */
  accent: string;
  /** Drives the header's state ring. */
  state: WorkflowStateDto;
  /** Corner radius of that ring: a circle for a real state, a rounded square
   *  for the synthetic "No epic" header, as in the design. */
  iconRadius: string;
  progress: { done: number; total: number } | null;
  rows: IssueListItemDto[];
  /** Left padding of this group's rows, in px. */
  indent: number;
}

const EPIC_ACCENT = "var(--accent)";
const STATUS_ACCENT = "var(--line)";

const RING = "50%";
/** The design draws the "No epic" header glyph as a dashed rounded square. */
const SQUARE = "3px";

const ROW_INDENT = 16;
const CHILD_INDENT = 40;

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

/**
 * Turns a flat issue list into the list's groups. Pure: neither `issues` nor
 * `states` is mutated, and nothing is read from the URL or the API — the page
 * decides the mode, this decides the shape.
 */
export function groupIssues(issues: IssueListItemDto[], states: WorkflowStateDto[], mode: GroupMode): IssueGroupData[] {
  return mode === "epic" ? groupByEpic(issues) : groupByStatus(issues, states);
}

function groupByStatus(issues: IssueListItemDto[], states: WorkflowStateDto[]): IssueGroupData[] {
  const groups: IssueGroupData[] = [];

  for (const state of [...states].sort(compareStatesForGrouping)) {
    const rows = issues.filter((issue) => issue.state.id === state.id);
    // A state nobody is in gets no header — an empty group is noise on a list
    // that already has six of them.
    if (rows.length === 0) {
      continue;
    }

    rows.sort((a, b) => Number(b.isEpic) - Number(a.isEpic));

    groups.push({
      key: state.id,
      kind: "status",
      label: state.name,
      identifier: null,
      legacy: null,
      count: rows.length,
      accent: STATUS_ACCENT,
      state,
      iconRadius: RING,
      progress: null,
      rows,
      indent: ROW_INDENT,
    });
  }

  return groups;
}

function groupByEpic(issues: IssueListItemDto[]): IssueGroupData[] {
  const groups: IssueGroupData[] = issues
    .filter((issue) => issue.isEpic)
    .map((epic) => {
      const rows = issues.filter((issue) => issue.epicId === epic.id).sort(byStateOrder);

      return {
        key: epic.id,
        kind: "epic" as const,
        label: epic.title,
        identifier: epic.identifier,
        legacy: epic.legacyIdentifier,
        count: rows.length,
        accent: EPIC_ACCENT,
        state: epic.state,
        iconRadius: RING,
        // The API counts every child; the rows here may be a filtered subset,
        // so the epic's own tally is the honest one when it exists.
        progress: epic.epicProgress ?? countCompleted(rows),
        rows,
        indent: CHILD_INDENT,
      };
    });

  const loose = issues.filter((issue) => !issue.isEpic && !issue.epicId).sort(byStateOrder);

  if (loose.length > 0) {
    groups.push({
      key: "no-epic",
      kind: "status",
      label: "No epic",
      identifier: null,
      legacy: null,
      count: loose.length,
      accent: STATUS_ACCENT,
      state: NO_EPIC_STATE,
      iconRadius: SQUARE,
      progress: null,
      rows: loose,
      indent: ROW_INDENT,
    });
  }

  return groups;
}

function byStateOrder(a: IssueListItemDto, b: IssueListItemDto): number {
  return compareStatesForGrouping(a.state, b.state);
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
