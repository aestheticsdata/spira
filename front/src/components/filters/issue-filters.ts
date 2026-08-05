/**
 * The filter set, and the one place that knows how to write it down (COS-277).
 *
 * The URL keys are deliberately the **same keys the API takes**. A filtered list
 * is therefore its own API query: what you read in the address bar is what the
 * server is asked, which makes a wrong list debuggable by looking at it, and
 * makes a saved view (COS-265) a stored querystring rather than a second schema
 * that has to be kept in step with this one.
 *
 * Display options — grouping, ordering, whether legacy identifiers show — are
 * *not* filters and are not in here. They change how the same rows are drawn,
 * they belong to COS-274, and mixing them in would mean a saved "view" could not
 * distinguish the two.
 */

import { deriveEpic, FILTER_PARSERS } from "@components/filters/list-params";
import { createLoader } from "nuqs/server";

import type { RawParams } from "@components/filters/query-params";

/** Owned by the parser that enforces it; re-exported from where it has always been imported. */
export { MAX_PRIORITY } from "@components/filters/list-params";

/** The four arms of the epic filter. `is`/`isNot` name one; the others count. */
export type EpicFilter =
  | { kind: "is"; identifier: string }
  | { kind: "isNot"; identifier: string }
  | { kind: "any" }
  | { kind: "none" };

export interface IssueFilters {
  /** Workflow state ids. */
  states: string[];
  priorities: number[];
  /** Label ids an issue must carry at least one of. */
  labels: string[];
  /** Label ids an issue must carry none of. */
  excludeLabels: string[];
  epic: EpicFilter | null;
}

export const EMPTY_FILTERS: IssueFilters = {
  states: [],
  priorities: [],
  labels: [],
  excludeLabels: [],
  epic: null,
};

/**
 * One loader, both read paths. `createLoader` accepts a `URLSearchParams` and
 * the plain object Next hands a page, which is exactly `RawParams` — so this
 * signature is unchanged and no caller had to move.
 */
const loadFilters = createLoader(FILTER_PARSERS);

export function parseIssueFilters(params: RawParams): IssueFilters {
  const values = loadFilters(params);

  return {
    states: values.state,
    priorities: values.priority,
    labels: values.label,
    excludeLabels: values.excludeLabel,
    epic: deriveEpic(values),
  };
}

/**
 * The filters as query params. Absent keys mean "not filtered" — an empty value
 * is never written, so a cleared filter leaves no trace in the URL and a
 * bookmark taken with nothing selected is just the list.
 */
export function issueFiltersToParams(filters: IssueFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.states.length > 0) {
    params.set("state", filters.states.join(","));
  }
  if (filters.priorities.length > 0) {
    params.set("priority", filters.priorities.join(","));
  }
  if (filters.labels.length > 0) {
    params.set("label", filters.labels.join(","));
  }
  if (filters.excludeLabels.length > 0) {
    params.set("excludeLabel", filters.excludeLabels.join(","));
  }

  switch (filters.epic?.kind) {
    case "is":
      params.set("epic", filters.epic.identifier);
      break;
    case "isNot":
      params.set("excludeEpic", filters.epic.identifier);
      break;
    case "any":
      params.set("hasEpic", "true");
      break;
    case "none":
      params.set("hasEpic", "false");
      break;
    default:
      break;
  }

  return params;
}

/**
 * The API query for a list: the filter params, plus the project when there is
 * one.
 *
 * Identical to {@link issueFiltersToParams} except for the project, which is
 * the route rather than a filter — that sameness is the point, and the reason
 * this returns params rather than a bespoke request object.
 *
 * Without a key the query spans every project, which is what a workspace-level
 * saved view (COS-278) asks for: it has no project to be scoped to, so leaving
 * the param off is not an omission but the whole of what it means.
 */
export function issueFiltersToApiQuery(filters: IssueFilters, projectKey?: string): URLSearchParams {
  const params = issueFiltersToParams(filters);

  if (projectKey) {
    params.set("project", projectKey);
  }

  return params;
}

export function hasActiveFilters(filters: IssueFilters): boolean {
  return countActiveFilters(filters) > 0;
}

/** How many *chips* the bar draws — each list counts once, however long it is. */
export function countActiveFilters(filters: IssueFilters): number {
  return (
    (filters.states.length > 0 ? 1 : 0) +
    (filters.priorities.length > 0 ? 1 : 0) +
    (filters.labels.length > 0 ? 1 : 0) +
    (filters.excludeLabels.length > 0 ? 1 : 0) +
    (filters.epic ? 1 : 0)
  );
}

/** Add when absent, drop when present — the whole behaviour of a multi-select. */
export function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

/**
 * A label can be included or excluded, never both: the two lists are one
 * three-state control per label, and an id in both would ask the API for issues
 * that carry the label and do not.
 */
export function setLabelMode(
  filters: IssueFilters,
  labelId: string,
  mode: "include" | "exclude" | "off",
): IssueFilters {
  const labels = filters.labels.filter((id) => id !== labelId);
  const excludeLabels = filters.excludeLabels.filter((id) => id !== labelId);

  return {
    ...filters,
    labels: mode === "include" ? [...labels, labelId].sort() : labels,
    excludeLabels: mode === "exclude" ? [...excludeLabels, labelId].sort() : excludeLabels,
  };
}

export function labelMode(filters: IssueFilters, labelId: string): "include" | "exclude" | "off" {
  if (filters.labels.includes(labelId)) {
    return "include";
  }
  if (filters.excludeLabels.includes(labelId)) {
    return "exclude";
  }
  return "off";
}
