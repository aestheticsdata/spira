"use client";

import { Identifier } from "@components/ui/identifier";
import { PriorityBars } from "@components/ui/priority-bars";
import { ProgressPill } from "@components/ui/progress-pill";
import { StateIcon } from "@components/ui/state-icon";
import { cn } from "@lib/utils";
import { useState } from "react";

import type { IssueGroupData } from "@components/issues/group-issues";

/**
 * The group header, and the only client component in the list. The rows arrive
 * as `children` already rendered on the server, so collapsing costs one boolean
 * and the list itself never ships to the browser.
 */
export function IssueGroup({
  kind,
  label,
  identifier,
  legacy,
  count,
  accent,
  state,
  priority,
  iconRadius,
  progress,
  quickAdd,
  children,
}: Pick<
  IssueGroupData,
  "kind" | "label" | "identifier" | "legacy" | "count" | "accent" | "state" | "priority" | "iconRadius" | "progress"
> & {
  children: React.ReactNode;
  /** The group's own creator, hidden with the rows when the group collapses. */
  quickAdd?: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const isEpic = kind === "epic";

  // Ungrouped: there is one of these holding everything, so a header saying so
  // would be a bar that never changes and a collapse that hides the whole list.
  if (kind === "none") {
    return (
      <section>
        {children}
        {quickAdd}
      </section>
    );
  }

  return (
    <section
      className="border-l-2"
      style={{ borderLeftColor: accent }}
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((current) => !current)}
        className={cn(
          "flex h-9 w-full items-center gap-2.5 border-b border-line-soft pr-4 pl-[14px] text-left",
          isEpic ? "bg-surface-hi" : "bg-surface",
        )}
      >
        {/* A state ring where a state says it, the priority bars where a
            priority does, and nothing at all for a project — rather than
            borrowing one vocabulary's glyph to say something from another. */}
        {state && (
          <StateIcon
            state={state}
            size={12}
            radius={iconRadius}
          />
        )}
        {state === null && priority !== null && (
          <span aria-hidden="true">
            <PriorityBars priority={priority} />
          </span>
        )}
        {identifier && (
          <Identifier
            identifier={identifier}
            legacy={legacy}
            variant="compact"
            emphasised
          />
        )}
        <span className="text-13 font-semibold tracking-row text-ink-2">{label}</span>
        <span className="identifier text-11 text-ink-7">{count}</span>
        {progress && (
          <ProgressPill
            done={progress.done}
            total={progress.total}
            className="ml-0.5"
          />
        )}
        <span className="flex-1" />
        {isEpic && <span className="text-115 text-ink-8">epic</span>}
      </button>
      {!collapsed && (
        <>
          {children}
          {quickAdd}
        </>
      )}
    </section>
  );
}
