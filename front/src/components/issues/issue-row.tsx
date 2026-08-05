import { ROUTES } from "@components/shared/config/constants";
import { EpicGlyph } from "@components/ui/epic-glyph";
import { Identifier } from "@components/ui/identifier";
import { LabelChip } from "@components/ui/label-chip";
import { PriorityBars } from "@components/ui/priority-bars";
import { ProgressPill } from "@components/ui/progress-pill";
import { StateIcon } from "@components/ui/state-icon";
import { cn } from "@lib/utils";
import { format } from "date-fns";
import Link from "next/link";

import type { GroupMode } from "@components/issues/group-issues";
import type { IssueListItemDto } from "@lib/api-types";

/**
 * One line of the issues list. An epic gets three signals at once — a taller
 * raised row, an accent rail and a heavier title — so it is never mistaken for
 * an ordinary issue sitting in the same status group.
 */
export function IssueRow({
  issue,
  indent,
  showLegacy,
  mode,
}: {
  issue: IssueListItemDto;
  indent: number;
  showLegacy: boolean;
  mode: GroupMode;
}) {
  // Grouped by epic, the group header already says which epic this is; the chip
  // would only repeat it.
  const parent = mode === "status" ? issue.epic : null;

  return (
    <Link
      href={ROUTES.issue.path(issue.identifier)}
      className={cn(
        "flex items-center gap-2.5 border-b border-line-soft pr-4 hover:bg-surface-hover",
        issue.isEpic && "bg-surface-hi",
      )}
      style={{
        height: issue.isEpic ? 42 : 36,
        paddingLeft: indent,
        boxShadow: issue.isEpic ? "inset 2px 0 0 var(--accent)" : undefined,
      }}
    >
      <StateIcon
        state={issue.state}
        size={12}
      />
      <Identifier
        identifier={issue.identifier}
        legacy={showLegacy ? issue.legacyIdentifier : null}
        variant="row"
        emphasised={issue.isEpic}
        className="w-[138px] flex-none"
      />
      {issue.isEpic && <EpicGlyph size={13} />}
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-13 tracking-[-.005em]",
          issue.isEpic ? "font-semibold text-ink-1" : "text-ink-2",
        )}
      >
        {issue.title}
      </span>
      {issue.isEpic && issue.epicProgress && (
        <ProgressPill
          done={issue.epicProgress.done}
          total={issue.epicProgress.total}
        />
      )}
      {parent && (
        <span className="flex max-w-[190px] min-w-0 flex-initial items-center gap-[5px] rounded-sm border border-line-strong bg-surface-hi py-px pr-[7px] pl-[5px]">
          <span className="size-[9px] flex-none rounded-[2px] border-[1.5px] border-glyph-soft" />
          <span className="truncate text-11 text-ink-5">{parent.title}</span>
        </span>
      )}
      {issue.labels.map((label) => (
        <LabelChip
          key={label.id}
          label={label}
        />
      ))}
      <PriorityBars priority={issue.priority} />
      <span className="identifier w-11 flex-none text-right text-105 text-ink-7">
        {format(new Date(issue.updatedAt), "MMM d")}
      </span>
    </Link>
  );
}
