"use client";

import { MarkdownEditor } from "@components/markdown/markdown-editor";
import useRequestHelper from "@helpers/useRequestHelper";
import { cn } from "@lib/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

/**
 * A stored description, read until you click Edit.
 *
 * The read view arrives as `children` — already rendered on the server, chips
 * resolved against the database, no client request. Only the editor is client
 * work, and only while it is open. Saving calls `router.refresh()`, so the
 * server re-renders the description and the page goes back to the cheap path.
 */
export function EditableDescription({
  endpoint,
  source,
  children,
  emptyLabel = "No description yet.",
}: {
  /** The PATCH target: `/issues/SPI-24`, `/projects/SPI`. Both take `description`. */
  endpoint: string;
  /** The raw markdown behind `children` — what the editor opens on. */
  source: string | null;
  /** The server-rendered read view. */
  children: React.ReactNode;
  emptyLabel?: string;
}) {
  const router = useRouter();
  const { privateRequest } = useRequestHelper();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(source ?? "");
  const [busy, setBusy] = useState(false);

  const open = () => {
    setDraft(source ?? "");
    setEditing(true);
  };

  const onSave = async () => {
    setBusy(true);
    try {
      await privateRequest(endpoint, {
        method: "PATCH",
        // An emptied editor clears the column rather than storing "", so the
        // read view falls back to its empty label instead of rendering nothing.
        body: JSON.stringify({ description: draft.trim() === "" ? null : draft }),
      });
      setEditing(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The description could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <MarkdownEditor
        value={draft}
        onChange={setDraft}
        onSave={onSave}
        onCancel={() => setEditing(false)}
        busy={busy}
      />
    );
  }

  return (
    <div className="group/description relative">
      {source ? children : <p className="text-14 leading-[1.65] text-ink-7">{emptyLabel}</p>}

      {/* On an existing description the affordance stays out of the way until
          the block is hovered or tabbed to. On an empty one it is the only
          thing there, so hiding it would hide the feature. */}
      <button
        type="button"
        onClick={open}
        className={cn(
          "mt-2.5 text-115 text-ink-7 transition-opacity hover:text-ink-4",
          source && "opacity-0 focus-visible:opacity-100 group-hover/description:opacity-100",
        )}
      >
        {source ? "Edit description" : "Write one"}
      </button>
    </div>
  );
}
