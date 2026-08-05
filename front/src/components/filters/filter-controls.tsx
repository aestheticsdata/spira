"use client";

import { countActiveFilters, EMPTY_FILTERS, labelMode, setLabelMode, toggle } from "@components/filters/issue-filters";
import { useIssueFilters } from "@components/filters/use-issue-filters";
import { Button } from "@components/ui/button";
import { EpicGlyph } from "@components/ui/epic-glyph";
import { PriorityBars } from "@components/ui/priority-bars";
import { StateIcon } from "@components/ui/state-icon";
import { PRIORITY_NAMES, priorityName } from "@lib/status";
import { cn } from "@lib/utils";
import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";

import type { EpicFilter, IssueFilters } from "@components/filters/issue-filters";
import type { IssueListItemDto, LabelDto, WorkflowStateDto } from "@lib/api-types";

interface FilterSources {
  states: WorkflowStateDto[];
  labels: LabelDto[];
  epics: IssueListItemDto[];
}

type Category = "status" | "priority" | "label" | "epic";

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "label", label: "Label" },
  { key: "epic", label: "Epic" },
];

const ROW = "flex h-8 w-full items-center gap-2 px-3 text-left text-125 hover:bg-surface-hover";

/**
 * A tick that holds its column whether or not it is lit, so rows do not jump.
 *
 * Hidden from the accessibility tree: `text-transparent` hides it from the eye
 * but not from a screen reader, so every row would otherwise announce a tick it
 * does not have. The state is on the button, as `aria-pressed`.
 */
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

/* ------------------------------------------------------------------ button */

export function FilterButton(sources: FilterSources) {
  const [filters, setFilters] = useIssueFilters();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const active = countActiveFilters(filters);

  // Reopening on the submenu you happened to leave last time is disorienting;
  // the menu should always start where it starts.
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setCategory(null);
    }
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={onOpenChange}
    >
      <Popover.Trigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-1.5", active > 0 && "bg-surface-active text-ink-1")}
        >
          Filter
          {active > 0 && <span className="identifier text-10 text-ink-5">{active}</span>}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="sp-scroll z-50 max-h-[420px] w-[248px] overflow-y-auto rounded-lg border border-line-overlay bg-overlay py-1.5 shadow-[0_18px_50px_rgba(0,0,0,.5)]"
        >
          {category === null ? (
            CATEGORIES.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setCategory(entry.key)}
                className={cn(ROW, "text-ink-4")}
              >
                <span className="flex-1">{entry.label}</span>
                {/* Decoration: it would otherwise land in the button's name,
                    making it "Priority ›" to a screen reader and to a test. */}
                <span
                  aria-hidden="true"
                  className="text-11 text-ink-8"
                >
                  ›
                </span>
              </button>
            ))
          ) : (
            <>
              <button
                type="button"
                onClick={() => setCategory(null)}
                className={cn(ROW, "text-ink-6")}
              >
                <span
                  aria-hidden="true"
                  className="text-11"
                >
                  ‹
                </span>
                <span className="flex-1">{CATEGORIES.find((entry) => entry.key === category)?.label}</span>
              </button>
              <div className="my-1 h-px bg-line" />
              <CategoryOptions
                category={category}
                filters={filters}
                setFilters={setFilters}
                close={() => onOpenChange(false)}
                {...sources}
              />
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * The values for one category. Multi-selects deliberately leave the menu open —
 * picking three statuses should be three clicks, not three round trips through
 * the trigger. The epic filter is single-choice, so it closes itself.
 */
function CategoryOptions({
  category,
  filters,
  setFilters,
  close,
  states,
  labels,
  epics,
}: FilterSources & {
  category: Category;
  filters: IssueFilters;
  setFilters: (next: IssueFilters) => void;
  close: () => void;
}) {
  if (category === "status") {
    return (
      <>
        {states.map((state) => {
          const on = filters.states.includes(state.id);
          return (
            <button
              key={state.id}
              type="button"
              aria-pressed={on}
              onClick={() => setFilters({ ...filters, states: toggle(filters.states, state.id) })}
              className={cn(ROW, on ? "text-ink-1" : "text-ink-4")}
            >
              <Tick on={on} />
              {/* The glyph already announces the state name, and it sits beside
                  that same word — so it is decoration here, not information. */}
              <span aria-hidden="true">
                <StateIcon
                  state={state}
                  size={13}
                />
              </span>
              <span className="flex-1 truncate">{state.name}</span>
            </button>
          );
        })}
      </>
    );
  }

  if (category === "priority") {
    return (
      <>
        {PRIORITY_NAMES.map((name, value) => {
          const on = filters.priorities.includes(value);
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              onClick={() => setFilters({ ...filters, priorities: toggle(filters.priorities, value) })}
              className={cn(ROW, on ? "text-ink-1" : "text-ink-4")}
            >
              <Tick on={on} />
              <span aria-hidden="true">
                <PriorityBars priority={value} />
              </span>
              <span className="flex-1 truncate">{name}</span>
            </button>
          );
        })}
      </>
    );
  }

  if (category === "label") {
    return (
      <>
        {labels.map((label) => {
          const mode = labelMode(filters, label.id);
          const next = mode === "off" ? "include" : mode === "include" ? "exclude" : "off";

          return (
            <button
              key={label.id}
              type="button"
              title="Click to cycle: include, exclude, off"
              aria-label={`${label.name} — ${mode === "off" ? "not filtered" : `${mode}d`}`}
              onClick={() => setFilters(setLabelMode(filters, label.id, next))}
              className={cn(ROW, mode === "off" ? "text-ink-4" : "text-ink-1")}
            >
              <Tick on={mode !== "off"} />
              <span
                className="size-1.5 flex-none rounded-full"
                style={{ background: label.color }}
              />
              <span className="flex-1 truncate">{label.name}</span>
              {mode !== "off" && (
                <span className={cn("flex-none text-10", mode === "include" ? "text-ink-6" : "text-danger")}>
                  {mode}
                </span>
              )}
            </button>
          );
        })}
        {labels.length === 0 && <p className="px-3 py-2 text-125 text-ink-7">No labels yet.</p>}
      </>
    );
  }

  return (
    <EpicOptions
      filters={filters}
      setFilters={setFilters}
      close={close}
      epics={epics}
    />
  );
}

/** The four arms. `is` and `is not` need an epic, so they share one list. */
function EpicOptions({
  filters,
  setFilters,
  close,
  epics,
}: {
  filters: IssueFilters;
  setFilters: (next: IssueFilters) => void;
  close: () => void;
  epics: IssueListItemDto[];
}) {
  const [negate, setNegate] = useState(filters.epic?.kind === "isNot");

  const choose = (epic: EpicFilter | null) => {
    close();
    setFilters({ ...filters, epic });
  };

  const cardinality = (kind: "any" | "none", label: string) => {
    const on = filters.epic?.kind === kind;
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => choose(on ? null : { kind })}
        className={cn(ROW, on ? "text-ink-1" : "text-ink-4")}
      >
        <Tick on={on} />
        <span className="flex-1 truncate">{label}</span>
      </button>
    );
  };

  return (
    <>
      {cardinality("any", "In any epic")}
      {cardinality("none", "In no epic")}

      <div className="my-1 h-px bg-line" />
      <div className="flex gap-1 px-1.5 pb-1.5">
        {[
          { value: false, label: "Is" },
          { value: true, label: "Is not" },
        ].map((entry) => (
          <button
            key={entry.label}
            type="button"
            aria-pressed={negate === entry.value}
            onClick={() => setNegate(entry.value)}
            className={cn(
              "h-6 flex-1 rounded-md text-11",
              negate === entry.value ? "bg-surface-active text-ink-1" : "text-ink-6 hover:text-ink-3",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {epics.map((epic) => {
        const on =
          (filters.epic?.kind === "is" || filters.epic?.kind === "isNot") &&
          filters.epic.identifier === epic.identifier &&
          (filters.epic.kind === "isNot") === negate;

        return (
          <button
            key={epic.id}
            type="button"
            aria-pressed={on}
            aria-label={`${negate ? "Not in" : "In"} ${epic.identifier} ${epic.title}`}
            onClick={() => choose(on ? null : { kind: negate ? "isNot" : "is", identifier: epic.identifier })}
            className={cn(ROW, on ? "text-ink-1" : "text-ink-4")}
          >
            <Tick on={on} />
            <span aria-hidden="true">
              <EpicGlyph size={11} />
            </span>
            <span className="identifier flex-none text-105 text-ink-5">{epic.identifier}</span>
            <span className="min-w-0 flex-1 truncate">{epic.title}</span>
          </button>
        );
      })}
      {epics.length === 0 && <p className="px-3 py-2 text-125 text-ink-7">This project has no epics.</p>}
    </>
  );
}

/* -------------------------------------------------------------------- bar */

/** How many values a chip names before it starts counting instead. */
const NAMED = 2;

function summarise(names: string[]): string {
  if (names.length <= NAMED) {
    return names.join(", ");
  }
  return `${names.slice(0, NAMED).join(", ")} +${names.length - NAMED}`;
}

function Chip({
  field,
  operator,
  value,
  onClear,
}: {
  field: string;
  operator: string;
  value: string;
  onClear: () => void;
}) {
  return (
    <div className="flex h-6 flex-none items-center overflow-hidden rounded-md border border-line text-115">
      <span className="flex h-full items-center px-2 text-ink-5">{field}</span>
      <span className="flex h-full items-center border-l border-line px-2 text-ink-6">{operator}</span>
      <span className="flex h-full max-w-[220px] items-center truncate border-l border-line bg-line-soft px-2 text-ink-2">
        {value}
      </span>
      <button
        type="button"
        aria-label={`Remove the ${field.toLowerCase()} filter`}
        onClick={onClear}
        className="flex h-full items-center border-l border-line px-[7px] text-ink-7 hover:text-ink-2"
      >
        ×
      </button>
    </div>
  );
}

function epicChip(epic: EpicFilter, epics: IssueListItemDto[]): { operator: string; value: string } {
  switch (epic.kind) {
    case "any":
      return { operator: "is", value: "any epic" };
    case "none":
      return { operator: "is", value: "no epic" };
    default: {
      // An epic filtered on but since renamed away, archived, or reached by a
      // pasted link still names itself — falling back to the bare identifier
      // beats a chip that reads "undefined".
      const match = epics.find((entry) => entry.identifier === epic.identifier);
      return {
        operator: epic.kind === "is" ? "is" : "is not",
        value: match ? `${match.identifier} ${match.title}` : epic.identifier,
      };
    }
  }
}

export function FilterChips({ states, labels, epics }: FilterSources) {
  const [filters, setFilters] = useIssueFilters();

  if (countActiveFilters(filters) === 0) {
    return null;
  }

  const named = (ids: string[], all: { id: string; name: string }[]) =>
    summarise(ids.map((id) => all.find((entry) => entry.id === id)?.name ?? id));

  return (
    <div className="sp-scroll flex flex-none items-center gap-2 overflow-x-auto border-b border-line-chrome px-4 py-2">
      {filters.states.length > 0 && (
        <Chip
          field="Status"
          operator={filters.states.length > 1 ? "is any of" : "is"}
          value={named(filters.states, states)}
          onClear={() => setFilters({ ...filters, states: [] })}
        />
      )}

      {filters.priorities.length > 0 && (
        <Chip
          field="Priority"
          operator={filters.priorities.length > 1 ? "is any of" : "is"}
          value={summarise(filters.priorities.map(priorityName))}
          onClear={() => setFilters({ ...filters, priorities: [] })}
        />
      )}

      {filters.labels.length > 0 && (
        <Chip
          field="Labels"
          operator="include"
          value={named(filters.labels, labels)}
          onClear={() => setFilters({ ...filters, labels: [] })}
        />
      )}

      {filters.excludeLabels.length > 0 && (
        <Chip
          field="Labels"
          operator="exclude"
          value={named(filters.excludeLabels, labels)}
          onClear={() => setFilters({ ...filters, excludeLabels: [] })}
        />
      )}

      {filters.epic && (
        <Chip
          field="Epic"
          {...epicChip(filters.epic, epics)}
          onClear={() => setFilters({ ...filters, epic: null })}
        />
      )}

      <div className="flex-1" />
      <button
        type="button"
        onClick={() => setFilters(EMPTY_FILTERS)}
        className="flex-none px-1.5 text-115 text-ink-6 hover:text-ink-2"
      >
        Clear
      </button>
      {/* Saved views need a table of their own; until then the URL is the view. */}
      <span
        title="Saved views arrive with COS-278. This filter is already shareable — copy the URL."
        className="flex-none cursor-default px-1.5 text-115 text-ink-link opacity-60"
      >
        Save view
      </span>
    </div>
  );
}
