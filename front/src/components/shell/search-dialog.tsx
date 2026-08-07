"use client";

import { ROUTES } from "@components/shared/config/constants";
import { Identifier } from "@components/ui/identifier";
import { StateIcon } from "@components/ui/state-icon";
import useRequestHelper from "@helpers/useRequestHelper";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { SearchResponseDto } from "@lib/api-types";

/** Long enough that a two-key burst does not fire three requests. */
const DEBOUNCE_MS = 180;

export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { privateRequest } = useRequestHelper();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const { data } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => privateRequest<SearchResponseDto>(`/search?q=${encodeURIComponent(debounced)}`),
    enabled: open && debounced.trim().length > 0,
    // A failed search should quietly show nothing, not blow up the page.
    throwOnError: false,
  });

  const results = data?.results ?? [];
  const legacy = data?.legacyResolved ?? null;

  const openIssue = (identifier: string) => {
    onOpenChange(false);
    router.push(ROUTES.issue.path(identifier));
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={onOpenChange}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgba(8,9,11,.66)] backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[140px] left-1/2 z-50 flex max-h-[520px] w-[620px] -translate-x-1/2 flex-col overflow-hidden rounded-3xl border border-line-overlay bg-overlay shadow-[0_24px_70px_rgba(0,0,0,.6)]"
        >
          <Dialog.Title className="sr-only">Search issues</Dialog.Title>

          <div className="flex h-12 flex-none items-center gap-[11px] border-b border-line px-4">
            <span className="size-[11px] rounded-full border-[1.5px] border-ink-7" />
            {/* Radix moves focus into the dialog on open and lands here, since
                this is the first focusable element — no autoFocus needed. */}
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search identifiers and text"
              className="flex-1 bg-transparent text-14 text-ink-1 outline-none placeholder:text-ink-7"
            />
            <span className="identifier rounded-sm border border-line px-[5px] py-0.5 text-10 text-ink-8">esc</span>
          </div>

          {legacy && (
            <button
              type="button"
              onClick={() => openIssue(legacy.identifier)}
              className="flex items-center gap-2.5 border-b border-line bg-surface-hi px-4 py-2.5 text-left"
            >
              <span className="identifier rounded-[3px] border border-dashed border-line-focus px-1 py-px text-105 text-ink-6">
                {legacy.legacy}
              </span>
              <span className="text-12 text-ink-9">→</span>
              <span className="identifier text-115 font-medium text-primary-ink">{legacy.identifier}</span>
              <span className="text-115 text-ink-6">legacy identifier resolved · /issue/{legacy.legacy} redirects</span>
            </button>
          )}

          <div className="sp-scroll min-h-0 flex-1 overflow-y-auto py-1.5">
            {results.map((result) => (
              <button
                key={result.identifier}
                type="button"
                onClick={() => openIssue(result.identifier)}
                className="flex h-9 w-full items-center gap-2.5 px-4 text-left hover:bg-line-chrome"
              >
                <StateIcon
                  state={result.state}
                  size={11}
                />
                <Identifier
                  identifier={result.identifier}
                  legacy={result.legacyIdentifier}
                  variant="compact"
                  emphasised
                  className="w-[136px] flex-none"
                />
                <span className="min-w-0 flex-1 truncate text-125 text-ink-3">{result.title}</span>
                {/* Only an exact identifier hit can be archived, and it is worth saying: the row
                    otherwise reads as live, and the issue is on no list the user opens next. */}
                {result.archived && (
                  <span className="flex-none rounded-[3px] border border-line px-1 py-px text-10 text-ink-7">
                    archived
                  </span>
                )}
                <span className="flex-none text-11 text-ink-7">{result.projectKey}</span>
              </button>
            ))}

            {debounced.trim().length > 0 && results.length === 0 && !legacy && (
              <p className="px-4 py-[26px] text-center text-125 text-ink-7">Nothing matches that identifier or text.</p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
