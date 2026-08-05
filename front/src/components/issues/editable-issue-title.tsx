"use client";

import { issueTitleError } from "@components/issues/issue-form.util";
import useRequestHelper from "@helpers/useRequestHelper";
import { FIELD_LIMITS } from "@schemas/field-limits";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { IssueDetailDto } from "@lib/api-types";

/** Shared by the heading and the field, so nothing shifts when it opens. */
const TYPE = "text-25 leading-[1.25] font-semibold tracking-title text-ink-1";

/**
 * The issue title, editable in place.
 *
 * A textarea rather than an input, because a title runs to 255 characters and
 * the heading it replaces wraps: an input would make a four-line title scroll
 * sideways through a one-line box. It grows to its content on every keystroke,
 * so the field is exactly the shape of the heading it stands in for.
 */
export function EditableIssueTitle({ identifier, title }: { identifier: string; title: string }) {
  const router = useRouter();
  const { privateRequest } = useRequestHelper();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  // Before paint, so the field never renders at one row and then jumps.
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) {
      return;
    }
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [draft]);

  // Focused here rather than through `autoFocus`, which is banned for stealing
  // focus on page load; this one only fires when the owner opened the field.
  // Caret at the end, since opening a title is almost always an intent to
  // amend it rather than replace it.
  useEffect(() => {
    const element = field.current;
    if (!editing || !element) {
      return;
    }
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, [editing]);

  const open = () => {
    setDraft(title);
    setEditing(true);
  };

  const save = async () => {
    const next = draft.trim();
    if (next === title) {
      setEditing(false);
      return;
    }

    const message = issueTitleError(draft);
    if (message) {
      toast.error(message);
      return;
    }

    setBusy(true);
    try {
      await privateRequest<IssueDetailDto>(`/issues/${identifier}`, {
        method: "PATCH",
        body: JSON.stringify({ title: next }),
      });
      setEditing(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The title could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      // The button sits inside the heading rather than replacing it. Making the
      // title editable must not cost the page its h1 — that is the one element
      // saying what this page is about.
      //
      // And no `aria-label` on the button: a label replaces the subtree it
      // covers, so "Edit the title" would become the heading's name too and the
      // page would announce itself as a verb. The button's name is the title,
      // which is what a control that edits the title should be called; the
      // tooltip is where "click to edit" belongs.
      <h1 className={TYPE}>
        <button
          type="button"
          onClick={open}
          title="Click to edit"
          className="-mx-2 block w-[calc(100%+16px)] rounded-lg px-2 text-left text-pretty hover:bg-surface-hover"
        >
          {title}
        </button>
      </h1>
    );
  }

  return (
    <textarea
      ref={field}
      value={draft}
      rows={1}
      disabled={busy}
      maxLength={FIELD_LIMITS.issueTitle}
      aria-label="Title"
      onChange={(event) => setDraft(event.target.value)}
      // Blur saves rather than discards: the field looks like the heading it
      // replaces, so clicking away reads as "done", not "cancel". Escape is the
      // way out, and it is the only way out that loses anything.
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void save();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setDraft(title);
          setEditing(false);
        }
      }}
      className={`${TYPE} -mx-2 block w-[calc(100%+16px)] resize-none overflow-hidden rounded-lg border border-line-focus bg-field px-2 outline-none disabled:opacity-60`}
    />
  );
}
