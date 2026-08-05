"use client";

import { displayOptionsToParams, parseDisplayOptions } from "@components/filters/display-options";
import { issueFiltersToParams, parseIssueFilters } from "@components/filters/issue-filters";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import type { DisplayOptions } from "@components/filters/display-options";
import type { IssueFilters } from "@components/filters/issue-filters";

/**
 * The list's whole URL state: which rows (COS-277) and how they are drawn
 * (COS-274).
 *
 * One hook rather than two, because each write rebuilds the query from scratch
 * and a hook that knew only half of it would erase the other half. The first
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
  setFilters: (next: IssueFilters) => void;
  setDisplay: (next: DisplayOptions) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const filters = useMemo(() => parseIssueFilters(params), [params]);
  const display = useMemo(() => parseDisplayOptions(params), [params]);

  const write = useCallback(
    (nextFilters: IssueFilters, nextDisplay: DisplayOptions) => {
      const next = issueFiltersToParams(nextFilters);
      for (const [key, value] of displayOptionsToParams(nextDisplay)) {
        next.set(key, value);
      }

      const query = next.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [router, pathname],
  );

  return {
    filters,
    display,
    setFilters: (next) => write(next, display),
    setDisplay: (next) => write(filters, next),
  };
}
