import { ReferenceChip } from "@components/markdown/reference-chip";
import { MarkdownBody } from "@components/markdown/render";

/**
 * The server renderer for every stored description. References resolve against
 * the database as the page is built, so a chip arrives already carrying the
 * issue's state and title with no client request at all.
 *
 * The browser's counterpart is `MarkdownPreview`; both draw through
 * `MarkdownBody`, so the styling and the allow list live in one place.
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <MarkdownBody
      source={source}
      className={className}
      chip={(identifier, key) => (
        <ReferenceChip
          key={key}
          identifier={identifier}
        />
      )}
    />
  );
}
