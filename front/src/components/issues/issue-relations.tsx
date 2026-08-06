"use client";

import { linkedIdentifiers, RELATION_KINDS, relationTargets } from "@components/issues/relations.util";
import { ROUTES } from "@components/shared/config/constants";
import { BlockedGlyph, BlocksGlyph } from "@components/ui/relation-glyphs";
import { StateIcon } from "@components/ui/state-icon";
import useRequestHelper from "@helpers/useRequestHelper";
import { cn } from "@lib/utils";
import * as Popover from "@radix-ui/react-popover";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { RelationKind } from "@components/issues/relations.util";
import type { IssueDetailDto, RelationRefDto, SearchResponseDto } from "@lib/api-types";

/** Long enough that a two-key burst does not fire three requests, as in search. */
const DEBOUNCE_MS = 180;

/**
 * The relation graph, readable and now writable (COS-280).
 *
 * All three directions are here, including `related` — the rail used to draw
 * only the blocking pair, which was defensible while nothing could create the
 * third kind. The API always could, and the MCP connector will, so a section
 * that exists in the data and not on the page would be state you cannot see.
 *
 * A target is chosen through `/search`, not typed: an identifier typed by hand
 * is a guess, and the one thing worse than no relation is one pointing at the
 * wrong issue.
 */
export function IssueRelations({ issue }: { issue: IssueDetailDto }) {
  const router = useRouter();
  const { privateRequest } = useRequestHelper();
  const [busy, setBusy] = useState(false);

  const write = async (run: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    try {
      await run();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : failure);
    } finally {
      setBusy(false);
    }
  };

  const remove = (relation: RelationRefDto) =>
    write(
      () =>
        privateRequest<IssueDetailDto>(`/issues/${issue.identifier}/relations/${relation.relationId}`, {
          method: "DELETE",
        }),
      "The relation could not be removed.",
    );

  const add = (kind: RelationKind, targetIdentifier: string) =>
    write(
      () =>
        privateRequest<IssueDetailDto>(`/issues/${issue.identifier}/relations`, {
          method: "POST",
          body: JSON.stringify({ type: kind, targetIdentifier }),
        }),
      "The relation could not be added.",
    );

  // Same icon language as the list row's badge: both directions read as coral
  // in the real app, not one red and one neutral. Related carries no
  // direction, so it gets neither.
  const sections = [
    {
      kind: "blocked_by" as const,
      label: "Blocked by",
      issues: issue.relations.blockedBy,
      icon: <BlockedGlyph size={12} />,
    },
    {
      kind: "blocks" as const,
      label: "Blocks",
      issues: issue.relations.blocks,
      icon: <BlocksGlyph size={12} />,
    },
    { kind: "related" as const, label: "Related", issues: issue.relations.related, icon: null },
  ];

  const empty = sections.every((section) => section.issues.length === 0);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex-1 text-11 font-semibold tracking-section text-ink-8">RELATIONS</span>
        <AddRelation
          issue={issue}
          busy={busy}
          onAdd={add}
        />
      </div>

      {sections.map((section) =>
        section.issues.length === 0 ? null : (
          <div
            key={section.kind}
            className="mb-3"
          >
            <div className="mb-1.5 flex items-center gap-1.5 text-11 text-ink-7">
              {section.icon}
              {section.label}
            </div>
            <div className="flex flex-col gap-1.5">
              {section.issues.map((related) => (
                <div
                  key={related.relationId}
                  className="group/relation flex items-center gap-2 rounded-lg border border-line bg-surface px-[9px] py-[7px] hover:border-line-hover"
                >
                  <Link
                    href={ROUTES.issue.path(related.identifier)}
                    className="flex min-w-0 flex-1 items-center gap-2"
                  >
                    <StateIcon
                      state={related.state}
                      size={11}
                    />
                    <span className="identifier flex-none text-105 text-ink-5">{related.identifier}</span>
                    <span className="min-w-0 truncate text-12 text-ink-3">{related.title}</span>
                  </Link>
                  {/* Out of the way until the row is hovered or tabbed to: the
                      link is what this row is for, and a remove control sitting
                      permanently beside it invites the wrong click. */}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(related)}
                    aria-label={`Remove the relation to ${related.identifier}`}
                    className="flex-none px-0.5 text-12 text-ink-8 opacity-0 hover:text-ink-2 focus-visible:opacity-100 group-hover/relation:opacity-100 disabled:opacity-50"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        ),
      )}

      {empty && <p className="text-115 text-ink-8">Nothing blocks this, and it blocks nothing.</p>}
    </div>
  );
}

/** The picker: a direction, then an issue found through search. */
function AddRelation({
  issue,
  busy,
  onAdd,
}: {
  issue: IssueDetailDto;
  busy: boolean;
  onAdd: (kind: RelationKind, targetIdentifier: string) => Promise<void>;
}) {
  const { privateRequest } = useRequestHelper();

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<RelationKind>("blocked_by");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebounced("");
      setKind("blocked_by");
    }
  }, [open]);

  const { data } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => privateRequest<SearchResponseDto>(`/search?q=${encodeURIComponent(debounced)}`),
    enabled: open && debounced.trim().length > 0,
    // A search that fails should show nothing, not take the page down.
    throwOnError: false,
  });

  const targets = relationTargets(data?.results ?? [], issue.identifier, linkedIdentifiers(issue.relations));

  const choose = async (identifier: string) => {
    setOpen(false);
    await onAdd(kind, identifier);
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={setOpen}
    >
      <Popover.Trigger
        disabled={busy}
        aria-label="Add a relation"
        className="rounded-md px-1 text-13 text-ink-7 hover:bg-surface-hover hover:text-ink-2 disabled:opacity-50"
      >
        +
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[300px] overflow-hidden rounded-lg border border-line-overlay bg-overlay shadow-[0_18px_50px_rgba(0,0,0,.5)]"
        >
          <div className="flex gap-1 border-b border-line p-1.5">
            {RELATION_KINDS.map((entry) => (
              <button
                key={entry.kind}
                type="button"
                aria-pressed={kind === entry.kind}
                onClick={() => setKind(entry.kind)}
                className={cn(
                  "h-6 flex-1 rounded-md text-11",
                  kind === entry.kind ? "bg-surface-active text-ink-1" : "text-ink-6 hover:text-ink-3",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {/* Radix moves focus into the content on open and lands here, this
              being the first focusable element — no autoFocus needed. */}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Find an issue to relate"
            placeholder="Identifier or text"
            className="h-9 w-full border-b border-line bg-transparent px-3 text-125 text-ink-1 outline-none placeholder:text-ink-7"
          />

          <div className="sp-scroll max-h-[240px] overflow-y-auto py-1">
            {targets.map(({ result, linked }) => (
              <button
                key={result.identifier}
                type="button"
                disabled={linked}
                title={linked ? "Already related to this issue." : undefined}
                onClick={() => void choose(result.identifier)}
                className={cn(
                  "flex h-8 w-full items-center gap-2 px-3 text-left",
                  linked ? "cursor-default opacity-45" : "hover:bg-surface-hover",
                )}
              >
                <StateIcon
                  state={result.state}
                  size={11}
                />
                <span className="identifier flex-none text-105 text-ink-5">{result.identifier}</span>
                <span className="min-w-0 flex-1 truncate text-125 text-ink-3">{result.title}</span>
                {linked && <span className="flex-none text-10 text-ink-8">linked</span>}
              </button>
            ))}

            {debounced.trim().length > 0 && targets.length === 0 && (
              <p className="px-3 py-3 text-center text-115 text-ink-7">Nothing else matches that.</p>
            )}
            {debounced.trim() === "" && (
              <p className="px-3 py-3 text-center text-115 text-ink-8">
                Search by identifier or title. Legacy identifiers work too.
              </p>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
