import { showsColumn } from "@components/filters/display-options";
import { ROUTES } from "@components/shared/config/constants";
import { DateLabel } from "@components/ui/date-label";
import { EpicGlyph } from "@components/ui/epic-glyph";
import { Identifier } from "@components/ui/identifier";
import { LabelChip } from "@components/ui/label-chip";
import { PriorityBars } from "@components/ui/priority-bars";
import { ProgressPill } from "@components/ui/progress-pill";
import { BlockedGlyph, BlocksGlyph } from "@components/ui/relation-glyphs";
import { StateIcon } from "@components/ui/state-icon";
import { cn } from "@lib/utils";
import Link from "next/link";

import type { DisplayOptions } from "@components/filters/display-options";
import type { IssueListItemDto } from "@lib/api-types";

/**
 * One line of the issues list. An epic gets three signals at once — a taller
 * raised row, an accent rail and a heavier title — so it is never mistaken for
 * an ordinary issue sitting in the same status group.
 *
 * Which columns it carries is a display setting (COS-274). The title is not one
 * of them: a row without it would be a row you cannot read.
 */
export function IssueRow({
  issue,
  indent,
  display,
  withinEpic = false,
}: {
  issue: IssueListItemDto;
  indent: number;
  display: DisplayOptions;
  /** These rows sit under the epic they belong to, so the chip repeats it. */
  withinEpic?: boolean;
}) {
  // Grouped by epic, the group header already says which epic this is; on the
  // epic's own page the whole section does. Either way the chip adds nothing.
  const parent = withinEpic || display.group === "epic" ? null : issue.epic;

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
      {showsColumn(display, "status") && (
        <StateIcon
          state={issue.state}
          size={12}
        />
      )}
      {showsColumn(display, "identifier") && (
        <Identifier
          identifier={issue.identifier}
          legacy={display.legacy ? issue.legacyIdentifier : null}
          variant="row"
          emphasised={issue.isEpic}
          className="w-[138px] flex-none"
        />
      )}
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
      {/* Not a display option: like the epic progress pill, this is a warning
          about the row's own state, not a cosmetic column to hide. */}
      {issue.blockedByCount > 0 && (
        <span
          title={`Blocked by ${issue.blockedByCount} issue${issue.blockedByCount === 1 ? "" : "s"}`}
          className="flex h-5 flex-none items-center gap-1 rounded-md border px-1.5 text-11"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          <BlockedGlyph size={11} />
          {issue.blockedByCount}
        </span>
      )}
      {issue.blocksCount > 0 && (
        <span
          title={`Blocks ${issue.blocksCount} issue${issue.blocksCount === 1 ? "" : "s"}`}
          className="flex h-5 flex-none items-center gap-1 rounded-md border px-1.5 text-11"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          <BlocksGlyph size={11} />
          {issue.blocksCount}
        </span>
      )}
      {showsColumn(display, "labels") &&
        issue.labels.map((label) => (
          <LabelChip
            key={label.id}
            label={label}
          />
        ))}
      {showsColumn(display, "priority") && <PriorityBars priority={issue.priority} />}
      {showsColumn(display, "created") && (
        <DateLabel
          iso={issue.createdAt}
          label="Created"
        />
      )}
      {showsColumn(display, "updated") && (
        <DateLabel
          iso={issue.updatedAt}
          label="Updated"
        />
      )}
    </Link>
  );
}
