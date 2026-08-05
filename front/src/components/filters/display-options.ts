/**
 * How the list is drawn, as opposed to which rows are in it (COS-274).
 *
 * A sibling of `issue-filters`, not a part of it, and the split is deliberate:
 * the filters decide the rows and go to the API, these decide the presentation
 * and mostly do not. A saved view (COS-265) stores both, and only by keeping
 * them apart can it tell "the same issues, grouped differently" from "different
 * issues" — which is the difference between two views and one.
 *
 * Same URL discipline as the filters: an absent key means the default, so a
 * link with no query is the plain list and nothing has to be written down to
 * mean "unchanged".
 */

import { boolean, list, literal, sameSet } from "@components/filters/query-params";

import type { RawParams } from "@components/filters/query-params";

export const GROUP_MODES = ["status", "epic", "priority", "project", "none"] as const;
export type GroupMode = (typeof GROUP_MODES)[number];

export const GROUP_LABELS: Record<GroupMode, string> = {
  status: "Status",
  epic: "Epic",
  priority: "Priority",
  project: "Project",
  none: "No grouping",
};

/**
 * The API's `orderBy` values, minus `title`. The ticket asks for four and the
 * server happens to accept a fifth; offering one the spec did not ask for is
 * how a display menu turns into a list of everything the backend can do.
 */
export const ORDERS = ["manual", "priority", "created", "updated"] as const;
export type OrderBy = (typeof ORDERS)[number];

export const ORDER_LABELS: Record<OrderBy, string> = {
  manual: "Manual",
  priority: "Priority",
  created: "Created",
  updated: "Updated",
};

export const COLUMNS = ["identifier", "status", "priority", "labels", "created", "updated"] as const;
export type ColumnKey = (typeof COLUMNS)[number];

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  identifier: "Identifier",
  status: "Status",
  priority: "Priority",
  labels: "Labels",
  created: "Created",
  updated: "Updated",
};

/** The row as it has always looked: everything but the created date. */
export const DEFAULT_COLUMNS: ColumnKey[] = ["identifier", "labels", "priority", "status", "updated"];

export interface DisplayOptions {
  group: GroupMode;
  order: OrderBy;
  /** The visible columns, sorted. The title is not one — it is the row. */
  columns: ColumnKey[];
  /** Draw groups with no rows in them. */
  emptyGroups: boolean;
  /** Show the Linear identifier beside the Spira one where there is one. */
  legacy: boolean;
}

export const DEFAULT_DISPLAY: DisplayOptions = {
  group: "status",
  order: "manual",
  columns: DEFAULT_COLUMNS,
  emptyGroups: false,
  legacy: true,
};

export function parseDisplayOptions(params: RawParams): DisplayOptions {
  const columns = list(params, "cols").filter((entry): entry is ColumnKey => COLUMNS.includes(entry as ColumnKey));

  return {
    group: literal(params, "group", GROUP_MODES, DEFAULT_DISPLAY.group),
    order: literal(params, "order", ORDERS, DEFAULT_DISPLAY.order),
    // An empty or unreadable `cols` is not "hide every column" — a URL truncated
    // in a chat window would otherwise render a list of blank rows.
    columns: columns.length > 0 ? columns : DEFAULT_COLUMNS,
    emptyGroups: boolean(params, "empty") ?? DEFAULT_DISPLAY.emptyGroups,
    legacy: boolean(params, "legacy") ?? DEFAULT_DISPLAY.legacy,
  };
}

export function displayOptionsToParams(display: DisplayOptions): URLSearchParams {
  const params = new URLSearchParams();

  if (display.group !== DEFAULT_DISPLAY.group) {
    params.set("group", display.group);
  }
  if (display.order !== DEFAULT_DISPLAY.order) {
    params.set("order", display.order);
  }
  // Written whole rather than as a diff against the default: a reader can see
  // which columns are on without knowing what the default was.
  if (!sameSet(display.columns, DEFAULT_COLUMNS)) {
    params.set("cols", [...display.columns].sort().join(","));
  }
  if (display.emptyGroups !== DEFAULT_DISPLAY.emptyGroups) {
    params.set("empty", String(display.emptyGroups));
  }
  if (display.legacy !== DEFAULT_DISPLAY.legacy) {
    params.set("legacy", String(display.legacy));
  }

  return params;
}

/**
 * Ordering is the one display option the server has to know about: sorting a
 * page of rows in the browser would order the page rather than the list.
 */
export function applyDisplayToApiQuery(params: URLSearchParams, display: DisplayOptions): URLSearchParams {
  if (display.order !== DEFAULT_DISPLAY.order) {
    params.set("orderBy", display.order);
  }
  return params;
}

export function showsColumn(display: DisplayOptions, key: ColumnKey): boolean {
  return display.columns.includes(key);
}

export function toggleColumn(display: DisplayOptions, key: ColumnKey): DisplayOptions {
  const columns = showsColumn(display, key)
    ? display.columns.filter((entry) => entry !== key)
    : [...display.columns, key].sort();

  // Every column off leaves a list of bare titles and no way back except the
  // reset, so the last one on stays on.
  return columns.length === 0 ? display : { ...display, columns };
}

/** How many settings differ from the default — the count on the trigger. */
export function countChangedDisplay(display: DisplayOptions): number {
  return (
    (display.group !== DEFAULT_DISPLAY.group ? 1 : 0) +
    (display.order !== DEFAULT_DISPLAY.order ? 1 : 0) +
    (sameSet(display.columns, DEFAULT_COLUMNS) ? 0 : 1) +
    (display.emptyGroups !== DEFAULT_DISPLAY.emptyGroups ? 1 : 0) +
    (display.legacy !== DEFAULT_DISPLAY.legacy ? 1 : 0)
  );
}
