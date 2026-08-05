"use client";

import { issueFiltersToParams, parseIssueFilters } from "@components/filters/issue-filters";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import type { IssueFilters } from "@components/filters/issue-filters";

/**
 * Query keys this hook must not eat. They are display options rather than
 * filters — `issueFiltersToParams` writes the filter set from scratch each time,
 * so anything it does not own has to be carried across by hand or a filter
 * change would silently reset the grouping.
 */
const CARRIED = ["group", "legacy"];

/**
 * The filter set, read from and written to the URL.
 *
 * A real navigation rather than a shallow one: the list is a Server Component,
 * so a filter that only reached the client router would rewrite the address bar
 * and leave the rows exactly as they were.
 */
export function useIssueFilters(): [IssueFilters, (next: IssueFilters) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => parseIssueFilters(new URLSearchParams(searchParams.toString())), [searchParams]);

  const setFilters = useCallback(
    (next: IssueFilters) => {
      const params = issueFiltersToParams(next);

      for (const key of CARRIED) {
        const value = searchParams.get(key);
        if (value !== null) {
          params.set(key, value);
        }
      }

      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [router, pathname, searchParams],
  );

  return [filters, setFilters];
}
