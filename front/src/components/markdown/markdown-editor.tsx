"use client";

import { MarkdownPreview } from "@components/markdown/markdown-preview";
import { Button } from "@components/ui/button";
import { useEffect, useRef } from "react";

/**
 * The description editor: a textarea with the rendered result beside it.
 *
 * The trade-off is the one the spec accepts knowingly (§8). The output matches
 * Linear's; the typing does not — `## Titre` stays literal while you write it.
 * What that buys is that the stored form is plain markdown, so replacing this
 * with a WYSIWYG later is additive and needs no data migration.
 *
 * The preview is the real renderer, not a lookalike: same allow list, same
 * classes, same reference chips. A preview that merely resembles the result is
 * worse than none, because it is believed.
 */
export function MarkdownEditor({
  value,
  onChange,
  onSave,
  onCancel,
  busy = false,
  placeholder = "Markdown. Reference an issue by writing its identifier — SPI-24.",
  minRows = 12,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy?: boolean;
  placeholder?: string;
  minRows?: number;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = textarea.current;
    if (!element) {
      return;
    }
    // Caret at the end, not the start: opening an editor on existing prose is
    // almost always an intent to add to it.
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    // The submit shortcut every editor of this shape has. A bare Enter cannot
    // be it — this is prose, and Enter is a paragraph.
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSave();
    }
  };

  return (
    <div className="@container flex flex-col gap-3">
      {/* A container query, not a viewport one. Both places this opens — the
          issue page and the project overview — put it in a ~640px prose column
          inside a 1660px window, so a `lg:` breakpoint would read the window,
          see room, and split 640px into two unreadable columns.

          At 640px neither pane could hold a line of prose, so in practice the
          two stack today and §8's "beside it" is not yet true: what is true is
          that the preview is live and always visible, which is the point of
          the sentence. The rule fires at 768px so a wider host — a full-width
          editor, a collapsed properties panel — gets the side-by-side layout
          without another change here. */}
      <div className="grid gap-3 @3xl:grid-cols-2">
        <div>
          <div className="mb-1.5 flex h-4 items-center text-11 font-semibold tracking-section text-ink-8">WRITE</div>
          <textarea
            ref={textarea}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            rows={minRows}
            spellCheck={false}
            placeholder={placeholder}
            className="sp-scroll w-full resize-y rounded-xl border border-line bg-field p-3 font-mono text-115 leading-[1.7] text-ink-3 outline-none placeholder:text-ink-8 focus:border-line-focus"
          />
        </div>

        <div>
          <div className="mb-1.5 flex h-4 items-center text-11 font-semibold tracking-section text-ink-8">PREVIEW</div>
          <div className="sp-scroll min-h-[120px] overflow-y-auto rounded-xl border border-line-chrome bg-overlay p-3">
            {value.trim() === "" ? (
              <p className="text-125 text-ink-8">Nothing to preview yet.</p>
            ) : (
              <MarkdownPreview source={value} />
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <Button
          type="button"
          variant="primary"
          size="xs"
          disabled={busy}
          onClick={onSave}
        >
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="xs"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>

        <div className="flex-1" />
        <span className="text-11 text-ink-8">⌘↵ saves · Esc cancels</span>
      </div>
    </div>
  );
}
