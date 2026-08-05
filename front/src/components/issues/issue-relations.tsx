import { ROUTES } from "@components/shared/config/constants";
import { StateIcon } from "@components/ui/state-icon";
import Link from "next/link";

import type { IssueDetailDto, RelationRefDto } from "@lib/api-types";

function RelationSection({ kind, issues }: { kind: string; issues: RelationRefDto[] }) {
  if (issues.length === 0) {
    return null;
  }

  return (
    <div className="mb-3">
      <div className="mb-1.5 text-11 text-ink-7">{kind}</div>
      <div className="flex flex-col gap-1.5">
        {issues.map((issue) => (
          <Link
            key={issue.relationId}
            href={ROUTES.issue.path(issue.identifier)}
            className="flex items-center gap-2 rounded-lg border border-line bg-surface px-[9px] py-[7px] hover:border-line-hover"
          >
            <StateIcon
              state={issue.state}
              size={11}
            />
            <span className="identifier flex-none text-105 text-ink-5">{issue.identifier}</span>
            <span className="min-w-0 truncate text-12 text-ink-3">{issue.title}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** `related` is deliberately left out: only the blocking graph earns rail space. */
export function IssueRelations({ relations }: { relations: IssueDetailDto["relations"] }) {
  return (
    <div>
      <div className="mb-3 text-11 font-semibold tracking-section text-ink-8">RELATIONS</div>
      <RelationSection
        kind="Blocked by"
        issues={relations.blockedBy}
      />
      <RelationSection
        kind="Blocks"
        issues={relations.blocks}
      />
    </div>
  );
}
