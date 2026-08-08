"use client";

import { issueTitleError } from "@components/issues/issue-form.util";
import useRequestHelper from "@helpers/useRequestHelper";
import { FIELD_LIMITS } from "@schemas/field-limits";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { IssueDetailDto } from "@lib/api-types";

/**
 * Worn by the field and by the sizer behind it. Every property that decides
 * where a line breaks belongs here, because the two must break in the same
 * places — the sizer is what gives the field its height.
 */
const TYPE = "text-25 leading-[1.25] font-semibold tracking-title text-ink-1 whitespace-pre-wrap wrap-break-word";

/**
 * The issue title — a field, always, with nothing drawn around it.
 *
 * There is no read mode and no edit mode: the heading you look at is the same
 * textarea you type in. That is the whole design. A mode would need a way in,
 * a way in needs an affordance, and the affordance this replaces — a hover
 * tint and a tooltip on a `<button>` — was invisible enough that the feature
 * read as missing. A text field needs none: the pointer becomes an I-beam over
 * it, and clicking puts the caret where you clicked rather than at some end the
 * component chose.
 *
 * Spellcheck is left on, squiggles and all, because Linear leaves it on.
 */
export function EditableIssueTitle({ identifier, title }: { identifier: string; title: string }) {
  const router = useRouter();
  const { privateRequest } = useRequestHelper();

  const [value, setValue] = useState(title);
  /** What the field held when it took focus; `null` whenever it is not focused. */
  const focusedWith = useRef<string | null>(null);
  /** Set by Escape and read by the blur it causes, so that blur discards. */
  const reverting = useRef(false);

  // A title that changed elsewhere — by the save below, or in another session —
  // arrives as a new prop. It is adopted only while the field is idle:
  // overwriting someone mid-sentence is worse than letting them finish against
  // a title that is a few seconds stale.
  useEffect(() => {
    if (focusedWith.current !== null) {
      return;
    }
    setValue(title);
  }, [title]);

  const save = async (next: string) => {
    const trimmed = next.trim();
    if (trimmed === title) {
      setValue(title);
      return;
    }

    const message = issueTitleError(trimmed);
    if (message) {
      // Putting the stored title back loses nothing: `maxLength` rules out the
      // long case, so the only rule a typed title can break is being empty.
      toast.error(message);
      setValue(title);
      return;
    }

    setValue(trimmed);
    try {
      await privateRequest<IssueDetailDto>(`/issues/${identifier}`, {
        method: "PATCH",
        body: JSON.stringify({ title: trimmed }),
      });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The title could not be saved.");
      // Under the same rule as the prop sync above, and for the same reason:
      // this lands whenever the request gives up, which may be long after the
      // owner has clicked back into the field and started typing again. Their
      // own blur will save or revert; putting the old title back under their
      // caret would lose both the edit that failed and the one in progress.
      if (focusedWith.current === null) {
        setValue(title);
      }
    }
  };

  return (
    // `grid-cols-1` is `minmax(0, 1fr)`: the column is the container's width
    // rather than the sizer's max-content, which for a title is one very long
    // unwrapped line.
    <h1 className="grid grid-cols-1">
      {/* The field's height, in an element that can have one. A textarea cannot
          size itself to its content, so the same text is laid out underneath it
          and the grid cell takes the taller of the two — which is always this,
          since the field is one row tall. Correct on the server's first paint,
          and it re-wraps on a resize or a late web font without being told,
          which is the failure the measure-it-in-an-effect version shipped with.

          The trailing space keeps an emptied title one line tall. */}
      <span
        aria-hidden="true"
        className={`${TYPE} invisible col-start-1 row-start-1`}
      >
        {`${value} `}
      </span>

      {/* Inside the h1 rather than instead of it: a textarea is phrasing
          content, so the page keeps its heading, and the heading's accessible
          name resolves to the field's value. */}
      <textarea
        value={value}
        rows={1}
        maxLength={FIELD_LIMITS.issueTitle}
        aria-label="Issue title"
        className={`${TYPE} col-start-1 row-start-1 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none`}
        onChange={(event) => setValue(event.target.value)}
        onFocus={(event) => {
          focusedWith.current = event.target.value;
        }}
        // Clicking away is how you finish, so clicking away is what saves.
        // Every exit lands here, including Escape's, so there is one place that
        // writes and no path that writes twice.
        onBlur={(event) => {
          const opened = focusedWith.current;
          focusedWith.current = null;

          if (reverting.current) {
            reverting.current = false;
            setValue(title);
            return;
          }

          // Focused and left alone. Saving here would write back whatever the
          // field was holding, which may predate someone else's rename.
          if (opened === event.target.value) {
            setValue(title);
            return;
          }

          void save(event.target.value);
        }}
        onKeyDown={(event) => {
          // An IME's commit and cancel keys arrive here as Enter and Escape.
          // They belong to the candidate window rather than to this field:
          // acting on them ejects the typist mid-word and saves — or throws
          // away — a half-composed title, which makes a title in Japanese,
          // Chinese, Korean or Vietnamese impossible to type at all. React's
          // synthetic event does not carry the flag, so ask the native one.
          if (event.nativeEvent.isComposing) {
            return;
          }

          // A title is one line of text however many lines it takes to draw, so
          // Enter leaves the field instead of adding a newline to it.
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            reverting.current = true;
            event.currentTarget.blur();
          }
        }}
      />
    </h1>
  );
}
