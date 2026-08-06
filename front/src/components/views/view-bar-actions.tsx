"use client";

import { sameListQuery, toListQuery } from "@components/filters/list-query";
import { useListView } from "@components/filters/use-list-view";
import { SaveViewDialog } from "@components/views/save-view-dialog";
import useRequestHelper from "@helpers/useRequestHelper";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import type { SavedViewDto } from "@lib/api-types";

const ACTION = "flex-none px-1.5 text-115 text-ink-link hover:underline disabled:opacity-50";

/**
 * Saving the list you are looking at, and reconciling it with the view you
 * opened it from (COS-278).
 *
 * The comparison is the interesting part. The API stores a canonical query with
 * the keys alphabetical; these serialisers write their own order. Comparing the
 * two as text would call every opened view "edited" the moment it was opened,
 * so `sameListQuery` asks the question of the meaning instead — parse both,
 * re-write both, compare that.
 */
export function ViewBarActions({
  views,
  projectKey,
}: {
  views: SavedViewDto[];
  /** Scopes a new view; null saves it workspace-wide. */
  projectKey?: string | null;
}) {
  const router = useRouter();
  const { privateRequest } = useRequestHelper();
  const { filters, display, viewId, setViewId } = useListView();

  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const current = toListQuery(filters, display);
  const active = views.find((view) => view.id === viewId) ?? null;
  // A view whose stored query no longer validates has nothing to compare
  // against, so it counts as changed — which is the honest answer, and offers
  // the one action that would fix it.
  const edited = active !== null && (active.query === null || !sameListQuery(active.query, current));

  const update = async () => {
    if (!active) {
      return;
    }

    setBusy(true);
    try {
      await privateRequest<SavedViewDto>(`/views/${active.id}`, {
        method: "PATCH",
        body: JSON.stringify({ query: current }),
      });
      toast.success(`${active.name} updated.`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The view could not be updated.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {edited ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => void update()}
            className={ACTION}
          >
            Update view
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setSaving(true)}
            className={ACTION}
          >
            Save as new
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setSaving(true)}
          className={ACTION}
        >
          Save view
        </button>
      )}

      <SaveViewDialog
        open={saving}
        onOpenChange={setSaving}
        query={current}
        projectKey={projectKey}
        // Straight into the new view rather than leaving the old one's marker
        // on the URL, which would offer to update a view nobody is looking at.
        // Only the marker moves: the list on screen is already the one saved.
        onSaved={(view) => setViewId(view.id)}
      />
    </>
  );
}

/**
 * The active view, named in the bar with a way out of it.
 *
 * Leaving keeps the list exactly as it is and drops only the marker: what is on
 * screen is what you were looking at, and the difference is that the bar stops
 * offering to write it back.
 */
export function ActiveViewChip({ views }: { views: SavedViewDto[] }) {
  const { viewId, setViewId } = useListView();

  const active = views.find((view) => view.id === viewId);
  if (!active) {
    return null;
  }

  return (
    <div className="flex h-6 flex-none items-center overflow-hidden rounded-md border border-line-focus text-115">
      <span className="flex h-full items-center bg-surface-active px-2 text-ink-2">{active.name}</span>
      <button
        type="button"
        aria-label={`Leave the view ${active.name}`}
        // Drops the marker and nothing else. The list stays exactly as it is —
        // what changes is that the bar stops offering to write it back.
        onClick={() => setViewId(null)}
        className="flex h-full items-center border-l border-line px-[7px] text-ink-7 hover:text-ink-2"
      >
        ×
      </button>
    </div>
  );
}
