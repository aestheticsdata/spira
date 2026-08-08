"use client";

import { Button } from "@components/ui/button";
import { IconPicker } from "@components/ui/icon-picker";
import useRequestHelper from "@helpers/useRequestHelper";
import * as Dialog from "@radix-ui/react-dialog";
import { FIELD_LIMITS } from "@schemas/field-limits";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { SavedViewDto } from "@lib/api-types";

const FIELD =
  "h-8 w-full rounded-lg border border-line bg-field px-2.5 text-125 text-ink-1 outline-none placeholder:text-ink-8 focus:border-line-focus";

/**
 * Naming a view (COS-278).
 *
 * The query is not shown and not editable here: it is whatever list is on
 * screen behind the dialog, which is the whole point of saving from the bar
 * rather than from a form. What is asked for is what the ticket asks for — a
 * name and an icon.
 *
 * The same dialog renames an existing view, because renaming is this form with
 * one field pre-filled and a different verb.
 */
export function SaveViewDialog({
  open,
  onOpenChange,
  query,
  projectKey,
  view,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** The list to store. Ignored when renaming — that keeps the stored one. */
  query?: string;
  /** Scopes a new view to a project; absent makes it workspace-wide. */
  projectKey?: string | null;
  /** Renaming this one, rather than creating. */
  view?: SavedViewDto;
  onSaved?: (view: SavedViewDto) => void;
}) {
  const router = useRouter();
  const { privateRequest } = useRequestHelper();

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [busy, setBusy] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);

  // Reset on every open rather than on close: a dialog that reopens holding
  // what was abandoned last time is a dialog that saves the wrong thing.
  useEffect(() => {
    if (open) {
      setName(view?.name ?? "");
      setIcon(view?.icon ?? "");
    }
  }, [open, view]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (name.trim() === "") {
      toast.error("A view needs a name.");
      return;
    }

    setBusy(true);
    try {
      const saved = view
        ? await privateRequest<SavedViewDto>(`/views/${view.id}`, {
            method: "PATCH",
            body: JSON.stringify({ name: name.trim(), icon: icon.trim() || null }),
          })
        : await privateRequest<SavedViewDto>("/views", {
            method: "POST",
            body: JSON.stringify({
              name: name.trim(),
              icon: icon.trim() || null,
              projectKey: projectKey ?? null,
              query: query ?? "",
            }),
          });

      toast.success(view ? `${saved.name} renamed.` : `${saved.name} saved.`);
      onOpenChange(false);
      onSaved?.(saved);
      // The sidebar is rendered by the layout, so the new view only appears
      // once the server has re-rendered around it.
      router.refresh();
    } catch (error) {
      // The API's refusals are written to be read — an unreplayable query says
      // which key it choked on. Passing it through beats replacing it.
      toast.error(error instanceof Error ? error.message : "The view could not be saved.");
    } finally {
      setBusy(false);
    }
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
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nameInput.current?.focus();
          }}
          className="fixed top-[120px] left-1/2 z-50 w-[420px] max-w-[calc(100vw-40px)] -translate-x-1/2 overflow-hidden rounded-2xl border border-line-overlay bg-overlay shadow-[0_24px_70px_rgba(0,0,0,.6)]"
        >
          <form onSubmit={submit}>
            <div className="flex h-12 items-center border-b border-line px-4">
              <Dialog.Title className="text-13 font-semibold text-ink-2">
                {view ? "Rename view" : "Save view"}
              </Dialog.Title>
              {!view && (
                <>
                  <span className="mx-2 text-ink-9">·</span>
                  <span className="text-115 text-ink-7">
                    {projectKey ? `in ${projectKey}` : "everywhere in the workspace"}
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-col gap-3.5 p-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="view-name"
                  className="text-12 text-ink-6"
                >
                  Name
                </label>
                <input
                  id="view-name"
                  ref={nameInput}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={FIELD_LIMITS.viewName}
                  placeholder="Improvements, grouped by status"
                  className={FIELD}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="view-icon"
                  className="text-12 text-ink-6"
                >
                  Icon
                </label>
                <div className="flex items-center gap-2.5">
                  {/* The picker a project uses, drawn by the same component, so
                      a view and a project cannot look like different species. */}
                  <IconPicker
                    id="view-icon"
                    value={icon}
                    onChange={setIcon}
                    fallback="filter_list"
                    label="Choose the view icon"
                  />
                  <span className={icon === "" ? "text-125 text-ink-8" : "identifier truncate text-125 text-ink-5"}>
                    {icon === "" ? "None — a funnel is drawn instead" : icon}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                >
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                type="submit"
                variant="primary"
                size="xs"
                disabled={busy}
              >
                {busy ? "Saving…" : view ? "Rename" : "Save view"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
