import { ROUTES } from "@components/shared/config/constants";
import { StateIcon } from "@components/ui/state-icon";
import { serverFetchOptional } from "@lib/server-api";
import Link from "next/link";

import type { IssueDetailDto } from "@lib/api-types";

/**
 * A ticket reference written in prose. The lookup goes through the identifier
 * route, which resolves legacy identifiers too, so a `COS-177` left in an old
 * description renders as the issue it became. An identifier that resolves to
 * nothing stays plain text — prose about `AB-12` in the abstract must not turn
 * into a broken link.
 */
export async function ReferenceChip({ identifier }: { identifier: string }) {
  const issue = await serverFetchOptional<IssueDetailDto>(`/issues/${encodeURIComponent(identifier)}`);

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
