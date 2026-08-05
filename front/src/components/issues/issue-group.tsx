"use client";

import { Identifier } from "@components/ui/identifier";
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
  iconRadius,
  progress,
  quickAdd,
  children,
}: Pick<
  IssueGroupData,
  "kind" | "label" | "identifier" | "legacy" | "count" | "accent" | "state" | "iconRadius" | "progress"
> & {
  children: React.ReactNode;
  /** The group's own creator, hidden with the rows when the group collapses. */
  quickAdd?: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const isEpic = kind === "epic";

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
        <StateIcon
          state={state}
          size={12}
          radius={iconRadius}
        />
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
