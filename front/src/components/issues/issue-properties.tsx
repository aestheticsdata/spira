"use client";

import { countedIssues } from "@components/issues/epic-children.util";
import { toggleLabel } from "@components/issues/issue-form.util";
import { parentEpicOptions, typeChangeBlocker } from "@components/issues/issue-properties.util";
import { EpicGlyph } from "@components/ui/epic-glyph";
import { LabelChip } from "@components/ui/label-chip";
import { PriorityBars } from "@components/ui/priority-bars";
import { ProjectIcon } from "@components/ui/project-icon";
import { StateIcon } from "@components/ui/state-icon";
import useRequestHelper from "@helpers/useRequestHelper";
import { PRIORITY_NAMES, priorityName } from "@lib/status";
import { cn } from "@lib/utils";
import * as Popover from "@radix-ui/react-popover";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import type { IssueDetailDto, IssueListItemDto, LabelDto, WorkflowStateDto } from "@lib/api-types";

/** Everything `PATCH /issues/:identifier` accepts that this panel can set. */
interface IssuePatch {
  stateId?: string;
  priority?: number;
  labelIds?: string[];
  epicId?: string | null;
  isEpic?: boolean;
}

const MENU =
  "z-50 max-h-[320px] w-[248px] overflow-y-auto rounded-lg border border-line-overlay bg-overlay py-1.5 shadow-[0_18px_50px_rgba(0,0,0,.5)]";
const OPTION = "flex min-h-8 w-full items-center gap-2 px-3 py-1 text-left text-125 hover:bg-surface-hover";

/**
 * Every glyph in this app labels itself — `StateIcon`, `PriorityBars` and
 * `EpicGlyph` are all `role="img"` with the value as their name, which is right
 * on a list row where the glyph stands alone. Beside the same word in a menu it
 * doubles it, so each option states its name outright rather than letting one
 * be computed as "Urgent Urgent".
 */

/** One `[74px label][value]` line of the rail. */
function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 py-[7px]">
      <div className="w-[74px] flex-none text-12 text-ink-7">{label}</div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-[7px] text-125 text-ink-3">{children}</div>
    </div>
  );
}

/**
 * A property that opens a menu. The trigger is the value itself, as in Linear —
 * the row does not grow a control, it becomes one.
 */
function PropertyMenu({
  label,
  disabled,
  disabledReason,
  busy,
  children,
  options,
}: {
  label: string;
  disabled?: boolean;
  /** Shown as the trigger's tooltip; it is the service's own sentence. */
  disabledReason?: string | null;
  busy: boolean;
  children: React.ReactNode;
  /**
   * Radix leaves an open popover open when its content is clicked, so each
   * menu is handed the way to close itself. Every single-choice menu here uses
   * it; Labels deliberately does not, because ticking three of them should not
   * cost three trips back to the trigger.
   */
  options: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Property label={label}>
      <Popover.Root
        open={open}
        onOpenChange={setOpen}
      >
        <Popover.Trigger
          disabled={disabled || busy}
          title={disabledReason ?? undefined}
          aria-label={`${label}: change`}
          className={cn(
            "-mx-1.5 flex min-w-0 flex-1 items-center gap-[7px] rounded-md px-1.5 py-1 text-left",
            disabled ? "cursor-default opacity-70" : "hover:bg-surface-hover",
            busy && "opacity-50",
          )}
        >
          {children}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            // The rail is 300px against the right edge and the menu is 248px
            // aligned to a trigger inside it, so it always collides. Radix
            // shifts it back on its own; the padding is what keeps it off the
            // glass rather than flush against it.
            collisionPadding={12}
            className={MENU}
          >
            {options(() => setOpen(false))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </Property>
  );
}

/**
 * The properties rail on the issue detail page — and, until now, the reason
 * Spira was write-once: it drew the status, priority, labels and epic without
 * ever offering to change one.
 *
 * Every menu writes through the same `PATCH /issues/:identifier` and then calls
 * `router.refresh()`, so the server re-renders the page around the new value.
 * Nothing is held optimistically: a status that flips back after a failed
 * request is worse than one that takes a moment to move.
 *
 * The lists come from the server render rather than a client fetch — the page
 * is already fetching, and a panel that has to load before it can be used is a
 * panel you wait for on every issue you open.
 */
export function IssueProperties({
  issue,
  states,
  labels,
  epics,
}: {
  issue: IssueDetailDto;
  states: WorkflowStateDto[];
  labels: LabelDto[];
  /** The project's epics, as the parent options. */
  epics: IssueListItemDto[];
}) {
  const router = useRouter();
  const { privateRequest } = useRequestHelper();
  const [busy, setBusy] = useState(false);

  const patch = async (body: IssuePatch) => {
    setBusy(true);
    try {
      await privateRequest<IssueDetailDto>(`/issues/${issue.identifier}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      router.refresh();
    } catch (error) {
      // The service's refusals are written to be read — an epic that still has
      // children says so, and says how many. Passing the message straight
      // through beats replacing it with something vaguer.
      toast.error(error instanceof Error ? error.message : "The issue could not be updated.");
    } finally {
      setBusy(false);
    }
  };

  const ordered = [...states].sort((a, b) => a.position - b.position);
  const parents = parentEpicOptions(issue, epics);
  const typeBlocker = typeChangeBlocker(issue);
  const selectedLabels = issue.labels.map((label) => label.id);

  return (
    <div>
      <div className="mb-3.5 text-11 font-semibold tracking-section text-ink-8">PROPERTIES</div>

      <PropertyMenu
        label="Status"
        busy={busy}
        options={(close) =>
          ordered.map((state) => (
            <button
              key={state.id}
              type="button"
              aria-label={state.name}
              onClick={() => {
                close();
                void patch({ stateId: state.id });
              }}
              className={cn(OPTION, state.id === issue.state.id ? "text-ink-1" : "text-ink-4")}
            >
              <StateIcon
                state={state}
                size={11}
              />
              <span className="flex-1 truncate">{state.name}</span>
              {state.id === issue.state.id && <span className="text-ink-7">✓</span>}
            </button>
          ))
        }
      >
        <StateIcon
          state={issue.state}
          size={11}
        />
        {issue.state.name}
      </PropertyMenu>

      <PropertyMenu
        label="Priority"
        busy={busy}
        options={(close) =>
          PRIORITY_NAMES.map((name, priority) => (
            <button
              key={name}
              type="button"
              aria-label={name}
              onClick={() => {
                close();
                void patch({ priority });
              }}
              className={cn(OPTION, priority === issue.priority ? "text-ink-1" : "text-ink-4")}
            >
              <PriorityBars priority={priority} />
              <span className="flex-1 truncate">{name}</span>
              {priority === issue.priority && <span className="text-ink-7">✓</span>}
            </button>
          ))
        }
      >
        <PriorityBars priority={issue.priority} />
        {priorityName(issue.priority)}
      </PropertyMenu>

      <PropertyMenu
        label="Labels"
        busy={busy}
        options={() =>
          labels.length === 0 ? (
            <p className="px-3 py-2 text-125 text-ink-7">No labels yet — add some in Settings.</p>
          ) : (
            // The API replaces the whole set on every write, so each toggle
            // sends the set it wants rather than the one it changed.
            labels.map((label) => {
              const selected = selectedLabels.includes(label.id);
              return (
                <button
                  key={label.id}
                  type="button"
                  aria-label={label.name}
                  aria-pressed={selected}
                  onClick={() => patch({ labelIds: toggleLabel(selectedLabels, label.id) })}
                  className={cn(OPTION, selected ? "text-ink-1" : "text-ink-4")}
                >
                  <span
                    className="size-1.5 flex-none rounded-full"
                    style={{ background: label.color }}
                  />
                  <span className="flex-1 truncate">{label.name}</span>
                  {selected && <span className="text-ink-7">✓</span>}
                </button>
              );
            })
          )
        }
      >
        {issue.labels.length > 0 ? (
          issue.labels.map((label) => (
            <LabelChip
              key={label.id}
              label={label}
            />
          ))
        ) : (
          <span className="text-ink-7">None</span>
        )}
      </PropertyMenu>

      <Property label="Project">
        <ProjectIcon
          project={issue.project}
          size={13}
        />
        {/* Not a menu: the identifier was allocated from this project's counter
            and is stored, so moving the issue would either break the number or
            lie about it. */}
        {issue.project.name}
      </Property>

      <PropertyMenu
        label="Type"
        busy={busy}
        disabled={typeBlocker !== null}
        disabledReason={typeBlocker}
        options={(close) =>
          [false, true].map((epic) => (
            <button
              key={String(epic)}
              type="button"
              aria-label={epic ? "Epic" : "Issue"}
              onClick={() => {
                close();
                void patch({ isEpic: epic });
              }}
              className={cn(OPTION, issue.isEpic === epic ? "text-ink-1" : "text-ink-4")}
            >
              <span aria-hidden="true">
                {epic ? (
                  <EpicGlyph size={11} />
                ) : (
                  <span className="block size-[11px] rounded-[3px] border-[1.5px] border-glyph" />
                )}
              </span>
              <span className="flex-1 truncate">{epic ? "Epic" : "Issue"}</span>
              {issue.isEpic === epic && <span className="text-ink-7">✓</span>}
            </button>
          ))
        }
      >
        <span aria-hidden="true">
          {issue.isEpic ? (
            <EpicGlyph size={11} />
          ) : (
            <span className="block size-[11px] rounded-[3px] border-[1.5px] border-glyph" />
          )}
        </span>
        {issue.isEpic ? `Epic · ${countedIssues(issue.epicProgress?.total ?? 0)}` : "Issue"}
      </PropertyMenu>

      <PropertyMenu
        label="Epic"
        busy={busy}
        disabled={issue.isEpic}
        disabledReason={issue.isEpic ? "An epic cannot belong to another epic." : null}
        options={(close) => (
          <>
            <button
              type="button"
              aria-label="No epic"
              onClick={() => {
                close();
                void patch({ epicId: null });
              }}
              className={cn(OPTION, issue.epicId === null ? "text-ink-1" : "text-ink-4")}
            >
              <span className="size-[11px] flex-none rounded-[3px] border-[1.5px] border-dashed border-glyph-soft" />
              <span className="flex-1 truncate">No epic</span>
              {issue.epicId === null && <span className="text-ink-7">✓</span>}
            </button>
            {parents.map((epic) => (
              <button
                key={epic.id}
                type="button"
                aria-label={`${epic.identifier} ${epic.title}`}
                onClick={() => {
                  close();
                  void patch({ epicId: epic.id });
                }}
                className={cn(OPTION, epic.id === issue.epicId ? "text-ink-1" : "text-ink-4")}
              >
                <EpicGlyph size={11} />
                <span className="identifier flex-none text-105 text-ink-6">{epic.identifier}</span>
                <span className="flex-1 truncate">{epic.title}</span>
              </button>
            ))}
            {parents.length === 0 && !issue.isEpic && (
              <p className="px-3 py-2 text-125 text-ink-7">This project has no epic yet.</p>
            )}
          </>
        )}
      >
        {issue.epic ? (
          <>
            <EpicGlyph size={11} />
            <span className="identifier flex-none text-105 text-ink-6">{issue.epic.identifier}</span>
            <span className="min-w-0 truncate">{issue.epic.title}</span>
          </>
        ) : (
          <span className="text-ink-7">{issue.isEpic ? "—" : "None"}</span>
        )}
      </PropertyMenu>
    </div>
  );
}
