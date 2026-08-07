import { ROUTES } from "@components/shared/config/constants";
import { StateIcon } from "@components/ui/state-icon";
import { serverFetchOptional } from "@lib/server-api";
import Link from "next/link";
import { cache } from "react";

import type { IssueDetailDto } from "@lib/api-types";

/**
 * One lookup per distinct identifier per render, and never a thrown error.
 *
 * `serverFetchOptional` maps 404 to null but rethrows everything else, which is right for the issue
 * page — a 500 loading the issue itself must not render as "not found". It is wrong here: a chip is
 * decoration inside prose, and one flaky lookup was taking the entire page down with it, against
 * this file's own promise that an unresolvable reference stays plain text.
 *
 * `cache` collapses repeats within a single render, so a description citing COS-177 six times costs
 * one round trip rather than six. Nothing is cached across requests — `server-api` sets `no-store`
 * deliberately, so a chip never shows a stale state icon.
 */
const loadIssue = cache(
  async (identifier: string): Promise<IssueDetailDto | null> =>
    serverFetchOptional<IssueDetailDto>(`/issues/${encodeURIComponent(identifier)}`).catch(() => null),
);

/**
 * A ticket reference written in prose. The lookup goes through the identifier
 * route, which resolves legacy identifiers too, so a `COS-177` left in an old
 * description renders as the issue it became. An identifier that resolves to
 * nothing stays plain text — prose about `AB-12` in the abstract must not turn
 * into a broken link.
 */
export async function ReferenceChip({ identifier }: { identifier: string }) {
  const issue = await loadIssue(identifier);

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
