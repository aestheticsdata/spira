"use client";

import { Button } from "@components/ui/button";
import { cn } from "@lib/utils";
import * as Popover from "@radix-ui/react-popover";
import { parseAsBoolean, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

import type { LabelDto } from "@lib/api-types";

const GROUP_MODES = ["status", "epic"] as const;

/**
 * The whole view lives in the URL: a grouped, filtered list is a link someone
 * can send. The page reads the same three keys back out of `searchParams`.
 */
const ISSUES_VIEW = {
  group: parseAsStringLiteral(GROUP_MODES).withDefault("status"),
  legacy: parseAsBoolean.withDefault(true),
  label: parseAsString,
};

// The list is a Server Component, so a change has to reach the server rather
// than only the client router.
const VIEW_OPTIONS = { shallow: false, clearOnDefault: true };

export function IssuesToolbar({ labels }: { labels: LabelDto[] }) {
  const [{ group, legacy, label }, setView] = useQueryStates(ISSUES_VIEW, VIEW_OPTIONS);

  return (
    <div className="flex items-center gap-1.5">
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-1.5", label && "bg-surface-active text-ink-1")}
          >
            Filter
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={6}
            className="z-50 w-[228px] overflow-hidden rounded-lg border border-line-overlay bg-overlay py-1.5 shadow-[0_18px_50px_rgba(0,0,0,.5)]"
          >
            <p className="px-3 py-1.5 text-11 font-semibold tracking-section text-ink-8">LABELS</p>
            {labels.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setView({ label: item.id === label ? null : item.id })}
                className={cn(
                  "flex h-8 w-full items-center gap-2 px-3 text-left text-125 hover:bg-surface-hover",
                  item.id === label ? "text-ink-1" : "text-ink-4",
                )}
              >
                <span
                  className="size-1.5 flex-none rounded-full"
                  style={{ background: item.color }}
                />
                <span className="flex-1 truncate">{item.name}</span>
                <span className="identifier text-10 text-ink-7">{item.issueCount}</span>
              </button>
            ))}
            {labels.length === 0 && <p className="px-3 py-2 text-125 text-ink-7">No labels yet.</p>}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setView({ group: group === "status" ? "epic" : "status" })}
      >
        Group:
        <span className="font-medium text-ink-2">{group === "status" ? "Status" : "Epic"}</span>
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setView({ legacy: !legacy })}
      >
        Legacy IDs:
        <span className="font-medium text-ink-2">{legacy ? "Shown" : "Hidden"}</span>
      </Button>
    </div>
  );
}

/** The active-filter bar, sitting under the tabs whenever a label is selected. */
export function IssuesFilterBar({ labels }: { labels: LabelDto[] }) {
  const [{ label }, setView] = useQueryStates(ISSUES_VIEW, VIEW_OPTIONS);
  const active = labels.find((item) => item.id === label);

  if (!active) {
    return null;
  }

  return (
    <div className="flex flex-none items-center gap-2 border-b border-line-chrome px-4 py-2">
      <div className="flex h-6 items-center overflow-hidden rounded-md border border-line text-115">
        <span className="flex h-full items-center px-2 text-ink-5">Labels</span>
        <span className="flex h-full items-center border-l border-line px-2 text-ink-6">include</span>
        <span className="flex h-full items-center gap-[5px] border-l border-line bg-line-soft px-2 text-ink-2">
          <span
            className="size-1.5 rounded-full"
            style={{ background: active.color }}
          />
          {active.name}
        </span>
        <button
          type="button"
          aria-label={`Remove the ${active.name} filter`}
          onClick={() => setView({ label: null })}
          className="flex h-full items-center border-l border-line px-[7px] text-ink-7 hover:text-ink-2"
        >
          ×
        </button>
      </div>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => setView({ label: null })}
        className="px-1.5 text-115 text-ink-6 hover:text-ink-2"
      >
        Clear
      </button>
      {/* Saved views need a table of their own; until then the URL is the view. */}
      <span
        title="Saved views arrive in v2. This filter is already shareable — copy the URL."
        className="cursor-default px-1.5 text-115 text-ink-link opacity-60"
      >
        Save view
      </span>
    </div>
  );
}
