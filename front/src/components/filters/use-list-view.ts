"use client";

import { deriveEpic, epicToParams, LIST_PARSERS } from "@components/filters/list-params";
import { useQueryState, useQueryStates } from "nuqs";

import type { DisplayOptions } from "@components/filters/display-options";
import type { IssueFilters } from "@components/filters/issue-filters";

/**
 * The list's whole URL state: which rows (COS-277), how they are drawn
 * (COS-274), and which saved view — if any — is open (COS-278).
 *
 * One hook rather than three, because a write has to leave the other two
 * alone and a hook that knew only part of the query could not promise that.
 * The first version of this rebuilt the query by hand and kept a list of
 * foreign keys to copy across, which works right up until someone adds a key
 * and forgets to add it to the list. `useQueryStates` patches only the keys it
 * is given, so there is nothing left to forget.
 *
 * Two options carry the weight, and both are off by default in nuqs:
 *
 * - `shallow: false` — the list is a Server Component, so a change that only
 *   reached the client router would rewrite the address bar and leave the rows
 *   exactly as they were. This is the failure that looks like nothing is wrong.
 * - `history: "push"` — each change is its own entry, so Back walks through the
 *   filters you tried rather than leaving the list in one place.
 */
export function useListView(): {
  filters: IssueFilters;
  display: DisplayOptions;
  /**
   * The saved view this list was opened from, and still set while its filters
   * are being edited — which is what lets the bar offer "Update view" instead
   * of only ever "Save".
   */
  viewId: string | null;
  setFilters: (next: IssueFilters) => void;
  setDisplay: (next: DisplayOptions) => void;
  /** Enter or leave a view without disturbing the list it is showing. */
  setViewId: (next: string | null) => void;
} {
  const [values, setValues] = useQueryStates(LIST_PARSERS, { shallow: false, history: "push" });

  /**
   * Kept out of `LIST_PARSERS` deliberately. It is an annotation on the list
   * rather than part of it: the serialisers never write it, the API refuses it
   * inside a stored query, and keeping it a separate key is what stops a view
   * from ever pointing at itself.
   */
  const [viewId, setViewId] = useQueryState("view", { shallow: false, history: "push" });

  return {
    filters: {
      states: values.state,
      priorities: values.priority,
      labels: values.label,
      excludeLabels: values.excludeLabel,
      epic: deriveEpic(values),
    },
    display: {
      group: values.group,
      order: values.order,
      columns: values.cols,
      emptyGroups: values.empty,
      legacy: values.legacy,
    },
    viewId,
    setFilters: (next) =>
      void setValues({
        state: next.states,
        priority: next.priorities,
        label: next.labels,
        excludeLabel: next.excludeLabels,
        // All three epic keys every time, two of them null — writing only the
        // arm being selected would leave the previous one behind for the
        // precedence in `deriveEpic` to find.
        ...epicToParams(next.epic),
      }),
    setDisplay: (next) =>
      void setValues({
        group: next.group,
        order: next.order,
        cols: next.columns,
        empty: next.emptyGroups,
        legacy: next.legacy,
      }),
    setViewId: (next) => void setViewId(next),
  };
}
