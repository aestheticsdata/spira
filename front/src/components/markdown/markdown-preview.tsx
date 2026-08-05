"use client";

import { ClientReferenceChip } from "@components/markdown/client-reference-chip";
import { MarkdownBody } from "@components/markdown/render";

/** `Markdown` for the browser. Same body, chips resolved through React Query. */
export function MarkdownPreview({ source, className }: { source: string; className?: string }) {
  return (
    <MarkdownBody
      source={source}
      className={className}
      chip={(identifier, key) => (
        <ClientReferenceChip
          key={key}
          identifier={identifier}
        />
      )}
    />
  );
}
