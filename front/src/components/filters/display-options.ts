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

import { COLUMNS, DEFAULT_COLUMNS, DISPLAY_PARSERS, GROUP_MODES, ORDERS } from "@components/filters/list-params";
import { sameSet } from "@components/filters/query-params";
import { createLoader } from "nuqs/server";

import type { ColumnKey, GroupMode, OrderBy } from "@components/filters/list-params";
import type { RawParams } from "@components/filters/query-params";

/**
 * The vocabularies live with the parsers that enforce them, and are re-exported
 * here because this is where the rest of the app has always imported them from.
 * The dependency runs one way only: a parser has to know its allowed values,
 * and `DEFAULT_DISPLAY` below is then derived from the parsers rather than
 * restated beside them.
 */
export { COLUMNS, DEFAULT_COLUMNS, GROUP_MODES, ORDERS };

export type { ColumnKey, GroupMode, OrderBy };

export const GROUP_LABELS: Record<GroupMode, string> = {
  status: "Status",
  epic: "Epic",
  priority: "Priority",
  project: "Project",
  none: "No grouping",
};

export const ORDER_LABELS: Record<OrderBy, string> = {
  manual: "Manual",
  priority: "Priority",
  created: "Created",
  updated: "Updated",
};

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  identifier: "Identifier",
  status: "Status",
  priority: "Priority",
  labels: "Labels",
  created: "Created",
  updated: "Updated",
};

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

/**
 * Read off the parsers rather than written down beside them. The default is a
 * property of how a key is read — an absent key *is* its default — so having it
 * in two places was an invitation for the URL and the object to disagree.
 */
export const DEFAULT_DISPLAY: DisplayOptions = {
  group: DISPLAY_PARSERS.group.defaultValue,
  order: DISPLAY_PARSERS.order.defaultValue,
  columns: DISPLAY_PARSERS.cols.defaultValue,
  emptyGroups: DISPLAY_PARSERS.empty.defaultValue,
  legacy: DISPLAY_PARSERS.legacy.defaultValue,
};

/** The display half of the same map, read the same way on both sides. */
const loadDisplay = createLoader(DISPLAY_PARSERS);

export function parseDisplayOptions(params: RawParams): DisplayOptions {
  const values = loadDisplay(params);

  return {
    group: values.group,
    order: values.order,
    // An empty or unreadable `cols` is not "hide every column" — the parser
    // returns null so this default fires, because a URL truncated in a chat
    // window would otherwise render a list of blank rows.
    columns: values.cols,
    emptyGroups: values.empty,
    legacy: values.legacy,
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
