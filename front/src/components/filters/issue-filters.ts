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

import { PRIORITY_NAMES } from "@lib/status";

/** Derived rather than restated: `@lib/status` already owns the priority scale. */
export const MAX_PRIORITY = PRIORITY_NAMES.length - 1;

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

type RawParams = URLSearchParams | Record<string, string | string[] | undefined>;

function raw(params: RawParams, key: string): string | null {
  if (params instanceof URLSearchParams) {
    // Repeated params are accepted as well as comma-joined ones, because the
    // API accepts both and a hand-edited URL should not be the odd one out.
    const all = params.getAll(key);
    return all.length > 0 ? all.join(",") : null;
  }

  const value = params[key];
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(",") : null;
  }

  return value ?? null;
}

function list(params: RawParams, key: string): string[] {
  const value = raw(params, key);
  if (value === null) {
    return [];
  }

  // Sorted, so that picking the same three labels in a different order gives
  // the same link — which is what lets COS-265 tell two saved views apart by
  // their query alone.
  return [
    ...new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  ].sort();
}

function intList(params: RawParams, key: string, max: number): number[] {
  const entries = list(params, key)
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= max);

  return [...new Set(entries)].sort((a, b) => a - b);
}

function parseEpic(params: RawParams): EpicFilter | null {
  const is = raw(params, "epic")?.trim().toUpperCase();
  if (is) {
    return { kind: "is", identifier: is };
  }

  const isNot = raw(params, "excludeEpic")?.trim().toUpperCase();
  if (isNot) {
    return { kind: "isNot", identifier: isNot };
  }

  const has = raw(params, "hasEpic");
  if (has === "true") {
    return { kind: "any" };
  }
  if (has === "false") {
    return { kind: "none" };
  }

  return null;
}

export function parseIssueFilters(params: RawParams): IssueFilters {
  return {
    states: list(params, "state"),
    priorities: intList(params, "priority", MAX_PRIORITY),
    labels: list(params, "label"),
    excludeLabels: list(params, "excludeLabel"),
    epic: parseEpic(params),
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
 * The API query for a project's list: the filter params plus the project.
 *
 * Identical to {@link issueFiltersToParams} except for the project, which is
 * the route rather than a filter — that sameness is the point, and the reason
 * this returns params rather than a bespoke request object.
 */
export function issueFiltersToApiQuery(filters: IssueFilters, projectKey: string): URLSearchParams {
  const params = issueFiltersToParams(filters);
  params.set("project", projectKey);
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
