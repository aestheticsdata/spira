"use client";

import useRequestHelper from "@helpers/useRequestHelper";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Everything that decides where a line breaks, worn by the field and by the
 * sizer behind it. The two must break in the same places — the sizer is what
 * gives the field its height — so this is applied to both, and so is whatever
 * the caller passes as `className`.
 */
const TYPE = "font-semibold tracking-title text-ink-1 whitespace-pre-wrap wrap-break-word";

/**
 * A heading is one line of text however many lines it takes to draw, so a
 * newline never belongs in one. Enter already refuses to insert one; this
 * catches the other way in, which is pasting.
 *
 * It also keeps the sizer honest. Under `pre-wrap` a trailing newline draws an
 * empty line in the textarea but not in the span behind it, and the field would
 * be a line short of its own content — the one shape of text that defeats the
 * sizer.
 */
const oneLine = (text: string) => text.replace(/\r?\n/g, " ");

/**
 * A page's heading, which is also the field you edit it in.
 *
 * There is no read mode and no edit mode: the heading you look at is the same
 * textarea you type in. That is the whole design. A mode would need a way in,
 * a way in needs an affordance, and the affordance this replaced — a hover tint
 * and a tooltip on a `<button>` — was invisible enough that the feature read as
 * missing. A text field needs none: the pointer becomes an I-beam over it, and
 * clicking puts the caret where you clicked rather than at some end the
 * component chose. Spellcheck is left on, squiggles and all, because Linear
 * leaves it on.
 *
 * Shared the way `EditableDescription` is shared, through an endpoint rather
 * than through a wrapper per entity: an issue's `title` and a project's `name`
 * are the same control over different columns.
 */
export function EditableTitle({
  endpoint,
  field,
  value,
  limit,
  validate,
  label,
  className,
}: {
  /** The PATCH target: `/issues/SPI-24`, `/projects/SPI`. */
  endpoint: string;
  /** The key it is stored under: `title` for an issue, `name` for a project. */
  field: string;
  /** The stored heading, as the server last rendered it. */
  value: string;
  /** The `FIELD_LIMITS` entry for the column behind `field`. */
  limit: number;
  /** The page's own rule, so the wording is the one its forms already use. */
  validate: (next: string) => string | null;
  /** The field's accessible name. The heading keeps its own, which is the text. */
  label: string;
  /** Size and leading. Lands on the field and the sizer alike, so the two cannot disagree. */
  className: string;
}) {
  const router = useRouter();
  const { privateRequest } = useRequestHelper();

  const [text, setText] = useState(oneLine(value));
  /** What the field held when it took focus; `null` whenever it is not focused. */
  const focusedWith = useRef<string | null>(null);
  /** Set by Escape and read by the blur it causes, so that blur discards. */
  const reverting = useRef(false);

  // A heading that changed elsewhere — by the save below, or in another session
  // — arrives as a new prop. It is adopted only while the field is idle:
  // overwriting someone mid-sentence is worse than letting them finish against
  // a value that is a few seconds stale.
  useEffect(() => {
    if (focusedWith.current !== null) {
      return;
    }
    setText(oneLine(value));
  }, [value]);

  const save = async (next: string) => {
    const trimmed = next.trim();
    if (trimmed === value) {
      setText(oneLine(value));
      return;
    }

    const message = validate(trimmed);
    if (message) {
      // Putting the stored value back loses nothing: `maxLength` rules out the
      // long case, so the only rule a typed heading can break is being empty.
      toast.error(message);
      setText(oneLine(value));
      return;
    }

    setText(trimmed);
    try {
      await privateRequest(endpoint, {
        method: "PATCH",
        body: JSON.stringify({ [field]: trimmed }),
      });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "It could not be saved.");
      // Under the same rule as the prop sync above, and for the same reason:
      // this lands whenever the request gives up, which may be long after the
      // owner has clicked back into the field and started typing again. Their
      // own blur will save or revert; putting the old value back under their
      // caret would lose both the edit that failed and the one in progress.
      if (focusedWith.current === null) {
        setText(oneLine(value));
      }
    }
  };

  const type = `${TYPE} ${className}`;

  return (
    // `grid-cols-1` is `minmax(0, 1fr)`, so the column is the container's width
    // rather than the sizer's max-content, which for a heading is one very long
    // unwrapped line. `min-w-0` lets it shrink where it is a flex item.
    <h1 className="grid min-w-0 grid-cols-1">
      {/* The field's height, in an element that can have one. A textarea cannot
          size itself to its content, so the same text is laid out underneath it
          and the grid cell takes the taller of the two — which is always this,
          since the field is one row tall. Correct on the server's first paint,
          and it re-wraps on a resize or a late web font without being told,
          which is the failure the measure-it-in-an-effect version shipped with.

          The text is mirrored exactly, with nothing appended. A trailing space
          would be one space of width the heading does not have, which on the
          project overview pushes the key chip off the end of the name. Nothing
          needs appending: an emptied heading is still a line tall because the
          field is `rows={1}`, and `oneLine` has already ruled out the trailing
          newline that would otherwise leave the span a line short. */}
      <span
        aria-hidden="true"
        className={`${type} invisible col-start-1 row-start-1`}
      >
        {text}
      </span>

      {/* Inside the h1 rather than instead of it: a textarea is phrasing
          content, so the page keeps its heading, and the heading's accessible
          name resolves to the field's value.

          `cols={1}` keeps the textarea's intrinsic width — some twenty
          characters — out of the grid's sizing, so the column is the sizer's
          width. Where the heading shares a row with something else, as the
          project name does with its key chip, that is what stops a short name
          from reserving a box and pushing its neighbour away. */}
      <textarea
        value={text}
        rows={1}
        cols={1}
        maxLength={limit}
        aria-label={label}
        className={`${type} col-start-1 row-start-1 w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none`}
        onChange={(event) => setText(oneLine(event.target.value))}
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
            setText(oneLine(value));
            return;
          }

          // Focused and left alone. Saving here would write back whatever the
          // field was holding, which may predate someone else's rename.
          if (opened === event.target.value) {
            setText(oneLine(value));
            return;
          }

          void save(event.target.value);
        }}
        onKeyDown={(event) => {
          // An IME's commit and cancel keys arrive here as Enter and Escape.
          // They belong to the candidate window rather than to this field:
          // acting on them ejects the typist mid-word and saves — or throws
          // away — a half-composed heading, which makes one in Japanese,
          // Chinese, Korean or Vietnamese impossible to type. React's synthetic
          // event does not carry the flag, so ask the native one.
          if (event.nativeEvent.isComposing) {
            return;
          }

          // A heading is one line of text however many lines it takes to draw,
          // so Enter leaves the field instead of adding a newline to it.
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
