"use client";

import { ROUTES } from "@components/shared/config/constants";
import { StateIcon } from "@components/ui/state-icon";
import useRequestHelper, { RequestError } from "@helpers/useRequestHelper";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import type { IssueDetailDto } from "@lib/api-types";

/**
 * `ReferenceChip` for the browser, used by the editor's live preview where the
 * server component cannot run.
 *
 * The lookup is cached by identifier, which is what makes a preview that
 * re-renders on every keystroke affordable: typing a sentence after `SPI-24`
 * costs one request, not one per character. A miss is cached too — prose about
 * `AB-12` in the abstract must not retry forever.
 */
export function ClientReferenceChip({ identifier }: { identifier: string }) {
  const { privateRequest } = useRequestHelper();

  const { data: issue } = useQuery({
    queryKey: ["issue-reference", identifier],
    // A 404 is the answer, not a failure: it means this token is prose. Anything
    // else is a real fault and keeps the query's own error path.
    queryFn: async () => {
      try {
        return await privateRequest<IssueDetailDto>(`/issues/${encodeURIComponent(identifier)}`);
      } catch (error) {
        if (error instanceof RequestError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    // The preview must not blow up the page over a reference lookup; the chip
    // simply stays plain text. This is the one place that overrides the
    // provider's throwOnError.
    throwOnError: false,
    staleTime: 60 * 1000,
  });

  // Also the loading state: the identifier is already the right text, so it
  // reads correctly from the first frame and only gains a border and a title.
  if (!issue) {
    return <>{identifier}</>;
  }

  return (
    <Link
      href={ROUTES.issue.path(issue.canonicalIdentifier)}
      className="inline-flex max-w-full items-center gap-1.5 rounded-[5px] border border-line-strong bg-pill px-2 py-0.5 align-baseline hover:border-line-hover"
    >
      <StateIcon
        state={issue.state}
        size={11}
      />
      <span className="identifier shrink-0 whitespace-nowrap text-11 text-ink-link">{issue.identifier}</span>
      <span className="min-w-0 truncate text-12 text-ink-4">{issue.title}</span>
    </Link>
  );
}
