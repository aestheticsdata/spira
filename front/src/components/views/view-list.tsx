"use client";

import { ROUTES } from "@components/shared/config/constants";
import { ProjectIcon } from "@components/ui/project-icon";
import { SaveViewDialog } from "@components/views/save-view-dialog";
import { reorderViews } from "@components/views/saved-views.util";
import useRequestHelper from "@helpers/useRequestHelper";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import type { SavedViewDto } from "@lib/api-types";

const ACTION =
  "rounded-md px-1.5 py-0.5 text-115 text-ink-7 hover:bg-surface-hover hover:text-ink-2 disabled:opacity-40";

/**
 * Rename, reorder and delete, on the one page where every view can be reached
 * (COS-278).
 *
 * Reordering is two buttons rather than a drag. A drag is nicer with a mouse
 * and unusable without one, and the list is short enough that a step at a time
 * is not a hardship — the sidebar is a handful of rows, not a backlog.
 */
export function ViewList({ views, heading }: { views: SavedViewDto[]; heading: string }) {
  const router = useRouter();
  const { privateRequest } = useRequestHelper();

  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<SavedViewDto | null>(null);

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

  const move = (id: string, direction: -1 | 1) => {
    const writes = reorderViews(views, id, direction);
    if (writes.length === 0) {
      return;
    }

    return write(
      // Sequential, not parallel: the rows are being renumbered against each
      // other, and two of them landing out of order is the one thing a reorder
      // must not do.
      async () => {
        for (const entry of writes) {
          await privateRequest<SavedViewDto>(`/views/${entry.id}`, {
            method: "PATCH",
            body: JSON.stringify({ position: entry.position }),
          });
        }
      },
      "The views could not be reordered.",
    );
  };

  const remove = (view: SavedViewDto) =>
    write(async () => {
      await privateRequest<{ ok: boolean }>(`/views/${view.id}`, { method: "DELETE" });
      toast.success(`${view.name} deleted.`);
    }, "The view could not be deleted.");

  if (views.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-125 text-ink-7">
        No {heading.toLowerCase()} yet. Filter a list, then use <span className="text-ink-4">Save view</span>.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-line">
        {views.map((view, index) => (
          <div
            key={view.id}
            className="flex h-11 items-center gap-2.5 border-b border-line-soft px-3 last:border-b-0 hover:bg-surface-hover"
          >
            <ProjectIcon
              project={{ icon: view.icon ?? "filter_list", color: null, name: view.name }}
              size={15}
              glyph={15}
            />
            <Link
              href={ROUTES.view.path(view.id)}
              className="min-w-0 flex-1 truncate text-13 text-ink-2 hover:text-ink-1"
            >
              {view.name}
            </Link>

            {view.project && (
              <span className="identifier flex-none text-10 tracking-key text-ink-7">{view.project.key}</span>
            )}

            {/* A view older than the vocabulary it was saved against. The API
                says why; repeating it here is the only way the owner learns
                what to fix, since the view cannot be opened to find out. */}
            {view.invalid !== null && (
              <span
                title={view.invalid}
                className="flex-none rounded-sm border border-dashed border-line-strong px-1.5 py-px text-10 text-danger"
              >
                cannot be opened
              </span>
            )}

            <div className="flex flex-none items-center gap-0.5">
              <button
                type="button"
                disabled={busy || index === 0}
                aria-label={`Move ${view.name} up`}
                onClick={() => void move(view.id, -1)}
                className={ACTION}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={busy || index === views.length - 1}
                aria-label={`Move ${view.name} down`}
                onClick={() => void move(view.id, 1)}
                className={ACTION}
              >
                ↓
              </button>
              <button
                type="button"
                disabled={busy}
                aria-label={`Rename ${view.name}`}
                onClick={() => setRenaming(view)}
                className={ACTION}
              >
                Rename
              </button>
              <button
                type="button"
                disabled={busy}
                aria-label={`Delete ${view.name}`}
                onClick={() => void remove(view)}
                className={ACTION}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {renaming && (
        <SaveViewDialog
          open
          onOpenChange={(next) => !next && setRenaming(null)}
          view={renaming}
          onSaved={() => setRenaming(null)}
        />
      )}
    </>
  );
}
