"use client";

import {
  COLUMN_LABELS,
  COLUMNS,
  countChangedDisplay,
  DEFAULT_DISPLAY,
  GROUP_LABELS,
  GROUP_MODES,
  ORDER_LABELS,
  ORDERS,
  showsColumn,
  toggleColumn,
} from "@components/filters/display-options";
import { useListView } from "@components/filters/use-list-view";
import { Button } from "@components/ui/button";
import { cn } from "@lib/utils";
import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";

import type { ColumnKey, DisplayOptions } from "@components/filters/display-options";

const ROW = "flex h-8 w-full items-center gap-2 px-3 text-left text-125 hover:bg-surface-hover";
const HEADING = "px-3 pt-2.5 pb-1 text-11 font-semibold tracking-section text-ink-8";

/** Hidden from the accessibility tree; selection is on the button's aria-pressed. */
function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn("w-3 flex-none text-center text-11", on ? "text-ink-1" : "text-transparent")}
    >
      ✓
    </span>
  );
}

/**
 * Linear's display popover: grouping, ordering, which columns a row carries,
 * and whether empty buckets are drawn (COS-274).
 *
 * It replaces the two standalone Group and Legacy buttons. Every one of these
 * settings lives in the URL, so the list you are looking at is the list a link
 * reproduces — including how it is grouped, not only what is in it.
 */
export function DisplayButton() {
  const { display, setDisplay } = useListView();
  const [open, setOpen] = useState(false);
  const changed = countChangedDisplay(display);

  const set = (patch: Partial<DisplayOptions>) => setDisplay({ ...display, ...patch });

  return (
    <Popover.Root
      open={open}
      onOpenChange={setOpen}
    >
      <Popover.Trigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-1.5", changed > 0 && "bg-surface-active text-ink-1")}
        >
          Display
          {changed > 0 && <span className="identifier text-10 text-ink-5">{changed}</span>}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="sp-scroll z-50 max-h-[520px] w-[248px] overflow-y-auto rounded-lg border border-line-overlay bg-overlay pb-1.5 shadow-[0_18px_50px_rgba(0,0,0,.5)]"
        >
          {/* Every section's options are named for their section. "Priority",
              "Status", "Created" and "Updated" each appear twice in this
              popover — the headings tell them apart on screen, and nothing
              would tell them apart to a screen reader without this. */}
          <p className={HEADING}>GROUPING</p>
          {GROUP_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={display.group === mode}
              aria-label={mode === "none" ? "Do not group" : `Group by ${GROUP_LABELS[mode]}`}
              onClick={() => set({ group: mode })}
              className={cn(ROW, display.group === mode ? "text-ink-1" : "text-ink-4")}
            >
              <Tick on={display.group === mode} />
              <span className="flex-1 truncate">{GROUP_LABELS[mode]}</span>
            </button>
          ))}

          <p className={HEADING}>ORDERING</p>
          {ORDERS.map((order) => (
            <button
              key={order}
              type="button"
              aria-pressed={display.order === order}
              aria-label={`Order by ${ORDER_LABELS[order]}`}
              onClick={() => set({ order })}
              className={cn(ROW, display.order === order ? "text-ink-1" : "text-ink-4")}
            >
              <Tick on={display.order === order} />
              <span className="flex-1 truncate">{ORDER_LABELS[order]}</span>
            </button>
          ))}

          <p className={HEADING}>COLUMNS</p>
          {COLUMNS.map((column: ColumnKey) => (
            <button
              key={column}
              type="button"
              aria-pressed={showsColumn(display, column)}
              aria-label={`Show the ${COLUMN_LABELS[column]} column`}
              onClick={() => setDisplay(toggleColumn(display, column))}
              className={cn(ROW, showsColumn(display, column) ? "text-ink-1" : "text-ink-4")}
            >
              <Tick on={showsColumn(display, column)} />
              <span className="flex-1 truncate">{COLUMN_LABELS[column]}</span>
            </button>
          ))}

          <p className={HEADING}>OTHER</p>
          <button
            type="button"
            aria-pressed={display.emptyGroups}
            onClick={() => set({ emptyGroups: !display.emptyGroups })}
            className={cn(ROW, display.emptyGroups ? "text-ink-1" : "text-ink-4")}
          >
            <Tick on={display.emptyGroups} />
            <span className="flex-1 truncate">Empty groups</span>
          </button>
          <button
            type="button"
            aria-pressed={display.legacy}
            onClick={() => set({ legacy: !display.legacy })}
            className={cn(ROW, display.legacy ? "text-ink-1" : "text-ink-4")}
          >
            <Tick on={display.legacy} />
            <span className="flex-1 truncate">Legacy identifiers</span>
          </button>

          {changed > 0 && (
            <>
              <div className="my-1 h-px bg-line" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setDisplay(DEFAULT_DISPLAY);
                }}
                className={cn(ROW, "text-ink-6")}
              >
                <span className="w-3 flex-none" />
                <span className="flex-1 truncate">Reset to default</span>
              </button>
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
