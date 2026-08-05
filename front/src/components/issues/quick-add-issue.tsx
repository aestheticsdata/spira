"use client";

import { EMPTY_ISSUE, issueFormError, toCreateIssuePayload } from "@components/issues/issue-form.util";
import useRequestHelper from "@helpers/useRequestHelper";
import { FIELD_LIMITS } from "@schemas/field-limits";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { IssueDetailDto } from "@lib/api-types";

/**
 * The per-group quick-add the spec asks for at the foot of every group (§7,
 * list layout).
 *
 * The group is the form: filing under "In Progress" means the state, filing
 * under an epic means the parent, and neither is a field anyone has to fill.
 * What is left is a title, so what this shows is a title.
 *
 * It stays put after a create — `router.refresh()` re-renders the list around
 * it and the caret stays in the field, because the reason to use this rather
 * than the dialog is that you have four of them to file.
 */
export function QuickAddIssue({
  projectKey,
  stateId,
  epicId,
  target,
  indent,
  defaultOpen = false,
}: {
  projectKey: string;
  /** The group's state, when grouping by status. */
  stateId: string | null;
  /** The group's epic, when grouping by epic. */
  epicId: string | null;
  /** What this files into, for the labels a mouse never reads. */
  target: string;
  /** Matches the group's rows, so the field lines up with the titles above it. */
  indent: number;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const { privateRequest } = useRequestHelper();

  const [open, setOpen] = useState(defaultOpen);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const close = () => {
    setTitle("");
    setOpen(false);
  };

  const submit = async () => {
    // Enter on an empty field means "I am done adding", not "reject me".
    if (title.trim() === "") {
      close();
      return;
    }

    const values = {
      ...EMPTY_ISSUE,
      projectKey,
      title,
      stateId: stateId ?? "",
      epicId: epicId ?? "",
    };

    const message = issueFormError(values);
    if (message) {
      toast.error(message);
      return;
    }

    setBusy(true);
    try {
      const created = await privateRequest<IssueDetailDto>("/issues", {
        method: "POST",
        body: JSON.stringify(toCreateIssuePayload(values)),
      });
      toast.success(`${created.identifier} created.`);
      setTitle("");
      router.refresh();
      input.current?.focus();
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : "The issue could not be created.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        aria-label={`Add an issue to ${target}`}
        onClick={() => {
          setOpen(true);
          // The input mounts on this render; focus it once it exists.
          requestAnimationFrame(() => input.current?.focus());
        }}
        className="flex h-8 w-full items-center gap-2.5 border-b border-line-soft pr-4 text-left text-125 text-ink-8 hover:bg-surface-hover hover:text-ink-5"
        style={{ paddingLeft: indent }}
      >
        <span className="w-3 text-center">+</span>
        Add issue
      </button>
    );
  }

  return (
    <div
      className="flex h-9 items-center gap-2.5 border-b border-line-soft bg-surface-hover pr-4"
      style={{ paddingLeft: indent }}
    >
      <span className="w-3 text-center text-125 text-ink-8">+</span>
      <input
        ref={input}
        value={title}
        aria-label={`New issue title in ${target}`}
        maxLength={FIELD_LIMITS.issueTitle}
        placeholder="Issue title, then Enter"
        disabled={busy}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
        // Leaving an empty field means leaving; leaving a written one does not,
        // so a stray click cannot throw away a half-typed title.
        onBlur={() => {
          if (title.trim() === "") {
            setOpen(false);
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-13 tracking-[-.005em] text-ink-2 outline-none placeholder:text-ink-8 disabled:opacity-60"
      />
      <span className="flex-none text-11 text-ink-8">{busy ? "Creating…" : "Esc to close"}</span>
    </div>
  );
}
