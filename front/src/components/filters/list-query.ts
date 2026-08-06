import { displayOptionsToParams, parseDisplayOptions } from "@components/filters/display-options";
import { issueFiltersToParams, parseIssueFilters } from "@components/filters/issue-filters";

import type { DisplayOptions } from "@components/filters/display-options";
import type { IssueFilters } from "@components/filters/issue-filters";

/**
 * The list written down as one query string: which rows (COS-277) and how they
 * are drawn (COS-274).
 *
 * Pure, and deliberately not part of `use-list-view` — the hook needs it, a
 * saved view needs it, and a Server Component comparing the two needs it
 * without pulling a client hook into its bundle.
 */
export function toListQuery(filters: IssueFilters, display: DisplayOptions): string {
  const params = issueFiltersToParams(filters);

  for (const [key, value] of displayOptionsToParams(display)) {
    params.set(key, value);
  }

  return params.toString();
}

/**
 * A query string as *this app* would have written it.
 *
 * The API stores its own canonical form with the keys alphabetical, and these
 * serialisers write theirs in their own order. Both describe the same list;
 * only the spelling differs. Comparing the two as text would therefore call
 * two identical views different — which is precisely the question "has this
 * view changed?" asks, so it has to be asked of the meaning rather than of the
 * characters.
 *
 * Anything neither parser recognises is dropped, `view=<id>` included. That is
 * what lets the current URL be compared against a stored query without
 * stripping the marker by hand first.
 */
export function normaliseListQuery(raw: string): string {
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);

  return toListQuery(parseIssueFilters(params), parseDisplayOptions(params));
}

export function sameListQuery(a: string, b: string): boolean {
  return normaliseListQuery(a) === normaliseListQuery(b);
}
