"use client";

import { matchCandidates } from "@components/issues/epic-children.util";
import { StateIcon } from "@components/ui/state-icon";
import useRequestHelper from "@helpers/useRequestHelper";
import * as Popover from "@radix-ui/react-popover";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { IssueDetailDto, IssueListItemDto } from "@lib/api-types";

/**
 * Putting an issue into an epic and taking it out again, from the epic's own
 * page (COS-279).
 *
 * Both write the same field on the *child*, never on the epic:
 * `PATCH /issues/:identifier { epicId }`. An epic has no membership list to
 * edit — the membership is one column on each contained issue — and giving it
 * one would be a second place for the same fact to live.
 */
function useEpicWrite() {
  const router = useRouter();
  const { privateRequest } = useRequestHelper();
  const [busy, setBusy] = useState(false);

  const write = async (identifier: string, epicId: string | null, failure: string) => {
    setBusy(true);
    try {
      await privateRequest<IssueDetailDto>(`/issues/${identifier}`, {
        method: "PATCH",
        body: JSON.stringify({ epicId }),
      });
      // The ring, the groups and the count are all re-derived by the server from
      // the children, which is why one write moves the ratio: there is no second
      // request, and no client-side arithmetic that could disagree with it.
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : failure);
    } finally {
      setBusy(false);
    }
  };

  return { busy, write };
}

/**
 * The picker.
 *
 * `candidates` is the project's issues that sit in no epic at all — the page
 * asks the API for exactly that set, so nothing here re-checks it. An issue
 * that already belongs to another epic is deliberately not offered: moving it
 * is done from its own panel, where the epic it would be leaving is on screen.
 * Taking it from here would quietly empty a list nobody looking at this page
 * can see.
 */
export function AddToEpic({ epic, candidates }: { epic: IssueDetailDto; candidates: IssueListItemDto[] }) {
  const { busy, write } = useEpicWrite();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const shown = matchCandidates(candidates, query);

  const choose = async (candidate: IssueListItemDto) => {
    setOpen(false);
    await write(candidate.identifier, epic.id, "The issue could not be added to the epic.");
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={setOpen}
    >
      <Popover.Trigger
        disabled={busy}
        aria-label="Add an existing issue to this epic"
        className="rounded-md border border-line px-[9px] py-0.5 text-115 text-ink-5 hover:border-line-hover hover:text-ink-2 disabled:opacity-50"
      >
        Add issue
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[320px] overflow-hidden rounded-lg border border-line-overlay bg-overlay shadow-[0_18px_50px_rgba(0,0,0,.5)]"
        >
          {/* Radix moves focus into the content on open and lands here, this
              being the first focusable element — no autoFocus needed. */}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Find an issue to add to this epic"
            placeholder="Identifier or title"
            className="h-9 w-full border-b border-line bg-transparent px-3 text-125 text-ink-1 outline-none placeholder:text-ink-7"
          />

          <div className="sp-scroll max-h-[260px] overflow-y-auto py-1">
            {shown.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                // Named outright: the state ring inside carries its own name, so
                // the computed one would open with "Todo" rather than with the
                // issue this row is.
                aria-label={`${candidate.identifier} ${candidate.title}`}
                onClick={() => void choose(candidate)}
                className="flex h-8 w-full items-center gap-2 px-3 text-left hover:bg-surface-hover"
              >
                <StateIcon
                  state={candidate.state}
                  size={11}
                />
                <span className="identifier flex-none text-105 text-ink-5">{candidate.identifier}</span>
                <span className="min-w-0 flex-1 truncate text-125 text-ink-3">{candidate.title}</span>
              </button>
            ))}

            {shown.length === 0 && (
              <p className="px-3 py-3 text-center text-115 text-ink-7">
                {candidates.length === 0
                  ? "Every other issue in this project already belongs to an epic."
                  : "Nothing here matches that."}
              </p>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * The remove control on a contained row.
 *
 * It overlays the row's trailing metadata on hover rather than reserving a
 * column for itself: the row is a link to the issue, that is what it is for,
 * and a permanent × beside every title invites the wrong click.
 */
export function RemoveFromEpic({ child }: { child: IssueListItemDto }) {
  const { busy, write } = useEpicWrite();

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void write(child.identifier, null, "The issue could not be taken out of the epic.")}
      aria-label={`Take ${child.identifier} out of this epic`}
      title="Take out of this epic"
      className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md border border-line bg-overlay text-12 text-ink-6 opacity-0 hover:border-line-hover hover:text-ink-2 focus-visible:opacity-100 group-hover/child:opacity-100"
    >
      ×
    </button>
  );
}
