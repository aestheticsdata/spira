"use client";

import { parseDisplayOptions } from "@components/filters/display-options";
import { parseIssueFilters } from "@components/filters/issue-filters";
import { toListQuery } from "@components/filters/list-query";
import { raw } from "@components/filters/query-params";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import type { DisplayOptions } from "@components/filters/display-options";
import type { IssueFilters } from "@components/filters/issue-filters";

/**
 * The list's whole URL state: which rows (COS-277), how they are drawn
 * (COS-274), and which saved view — if any — is open (COS-278).
 *
 * One hook rather than three, because each write rebuilds the query from
 * scratch and a hook that knew only part of it would erase the rest. The first
 * version of this kept a list of foreign keys to copy across, which works right
 * up until someone adds a key and forgets to add it to the list.
 *
 * A real navigation rather than a shallow one: the list is a Server Component,
 * so a change that only reached the client router would rewrite the address bar
 * and leave the rows exactly as they were.
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
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const filters = useMemo(() => parseIssueFilters(params), [params]);
  const display = useMemo(() => parseDisplayOptions(params), [params]);
  const viewId = raw(params, "view");

  const write = useCallback(
    (nextFilters: IssueFilters, nextDisplay: DisplayOptions) => {
      const query = new URLSearchParams(toListQuery(nextFilters, nextDisplay));

      // Carried across an edit, and written last so it reads as the annotation
      // it is rather than as part of the list. It is not one of the list's own
      // keys — the serialisers never write it and the API refuses it inside a
      // stored query — so a view can never end up pointing at itself.
      if (viewId) {
        query.set("view", viewId);
      }

      const search = query.toString();
      router.push(search ? `${pathname}?${search}` : pathname);
    },
    [router, pathname, viewId],
  );

  return {
    filters,
    display,
    viewId,
    setFilters: (next) => write(next, display),
    setDisplay: (next) => write(filters, next),
  };
}
