"use client";

import { Button } from "@components/ui/button";
import useRequestHelper from "@helpers/useRequestHelper";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { LabelDto } from "@lib/api-types";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** The design's first label colour — a sane starting point for a new one. */
const DEFAULT_COLOR = "#9db1c4";

export function LabelList({ labels }: { labels: LabelDto[] }) {
  const router = useRouter();
  const { privateRequest } = useRequestHelper();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);

  // Clicking "New label" is a request to type one, so put the caret there.
  useEffect(() => {
    if (creating) nameInput.current?.focus();
  }, [creating]);

  const closeCreate = () => {
    setCreating(false);
    setName("");
    setColor(DEFAULT_COLOR);
    setError(null);
  };

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();

    if (!trimmed) {
      setError("A label needs a name.");
      return;
    }
    if (!HEX.test(color)) {
      setError("The colour must be a six-digit hex, like #9db1c4.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await privateRequest<LabelDto>("/labels", {
        method: "POST",
        body: JSON.stringify({ name: trimmed, color }),
      });
      closeCreate();
      router.refresh();
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : "The label could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (label: LabelDto) => {
    setBusy(true);

    try {
      await privateRequest<{ ok: true }>(`/labels/${label.id}`, {
        method: "DELETE",
      });
      setConfirmId(null);
      router.refresh();
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : "The label could not be deleted.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-line">
      <div className="flex items-center border-b border-line bg-surface px-4 py-[13px]">
        <div className="flex-1 text-125 font-semibold text-ink-3">Labels</div>
        <button
          type="button"
          onClick={() => (creating ? closeCreate() : setCreating(true))}
          className="text-115 text-ink-link hover:text-ink-link-hover"
        >
          {creating ? "Cancel" : "New label"}
        </button>
      </div>

      {labels.map((label) => (
        <div
          key={label.id}
          className="group flex items-center gap-2.5 border-b border-line-soft px-4 py-[11px]"
        >
          <span
            className="size-2 flex-none rounded-full"
            style={{ background: label.color }}
          />
          <span className="min-w-0 flex-1 truncate text-125 text-ink-3">{label.name}</span>

          {confirmId === label.id ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDelete(label)}
                className="text-11 text-danger disabled:opacity-50"
              >
                Delete for good
              </button>
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                className="text-11 text-ink-7 hover:text-ink-4"
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmId(label.id)}
              className="text-11 text-ink-7 opacity-0 hover:text-ink-4 focus-visible:opacity-100 group-hover:opacity-100"
            >
              Delete
            </button>
          )}

          <span className="identifier w-9 flex-none text-right text-11 text-ink-7">{label.issueCount}</span>
        </div>
      ))}

      {labels.length === 0 && !creating && (
        <p className="border-b border-line-soft px-4 py-[11px] text-125 text-ink-7">
          No labels yet. Issues can live without them.
        </p>
      )}

      {creating && (
        <form
          onSubmit={onCreate}
          className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-4 py-[11px]"
        >
          <input
            ref={nameInput}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Label name"
            className="h-7 min-w-0 flex-1 rounded-md border border-line bg-field px-2.5 text-125 text-ink-2 outline-none placeholder:text-ink-8 focus:border-line-focus"
          />
          <input
            type="color"
            aria-label="Label colour"
            value={HEX.test(color) ? color : DEFAULT_COLOR}
            onChange={(event) => setColor(event.target.value)}
            className="size-7 flex-none cursor-pointer rounded-md border border-line bg-field p-1"
          />
          <input
            aria-label="Label colour, hexadecimal"
            spellCheck={false}
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="identifier h-7 w-[88px] flex-none rounded-md border border-line bg-field px-2 text-11 text-ink-3 outline-none focus:border-line-focus"
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={busy}
          >
            Add
          </Button>
          {error && <p className="w-full text-11 text-danger">{error}</p>}
        </form>
      )}
    </section>
  );
}
