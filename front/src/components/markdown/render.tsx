import { parseMarkdown, REFERENCE, VOID_TAGS } from "@components/markdown/parse";
import { cn } from "@lib/utils";
import { createElement, Fragment } from "react";

import type { MarkdownNode } from "@components/markdown/parse";
import type { ReactNode } from "react";

/**
 * The React half of the renderer, shared by the server view and the editor's
 * live preview.
 *
 * The two differ in exactly one thing: how a ticket reference is drawn. On the
 * server that is an async component that reads the issue directly; in the
 * browser it is a React Query lookup. Injecting it is what keeps this file —
 * the styling, the allow list, the escaping — from existing twice and drifting.
 *
 * This module imports neither `server-only` nor `"use client"`, which is what
 * lets both sides pull it in.
 */

/** Sizes, weights and spacing come from `BLOCK_STYLE` in the design file. */
const HEADING = "mt-[26px] mb-2.5 text-15 font-semibold leading-[1.4] text-ink-1";

const NODE_CLASS: Record<string, string> = {
  h1: HEADING,
  h2: HEADING,
  h3: HEADING,
  h4: HEADING,
  p: "mb-3 text-14 leading-[1.65] text-ink-4",
  ul: "mb-3 list-none [&>li]:before:mr-1.5 [&>li]:before:text-ink-7 [&>li]:before:content-['—']",
  ol: "mb-3 list-decimal pl-5 marker:text-ink-7",
  li: "mb-2 pl-4 text-135 leading-[1.6] text-ink-4",
  strong: "font-semibold text-ink-3",
  em: "italic",
  a: "text-ink-link underline underline-offset-2 hover:text-ink-link-hover",
  code: "font-mono text-115 text-ink-5",
  pre: "my-3.5 overflow-x-auto whitespace-pre-wrap pl-3 font-mono text-115 leading-[1.7] text-ink-5",
  blockquote: "mb-3 border-l-2 border-line pl-3",
  hr: "my-[26px] border-line",
};

/** Draws one `SPI-24` found in prose. */
export type ChipRenderer = (identifier: string, key: string) => ReactNode;

function linkify(text: string, key: number, chip: ChipRenderer): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(REFERENCE)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      parts.push(text.slice(cursor, start));
    }
    parts.push(chip(match[0], `${key}-${start}`));
    cursor = start + match[0].length;
  }

  if (parts.length === 0) {
    return [text];
  }
  parts.push(text.slice(cursor));

  return parts;
}

/**
 * @param verbatim inside `<pre>` or `<code>`, where a reference is source, not prose
 * @param linked inside an `<a>`, where a chip would nest one anchor in another
 */
function renderNodes(nodes: MarkdownNode[], verbatim: boolean, linked: boolean, chip: ChipRenderer): ReactNode[] {
  return nodes.map((node, index) => {
    if (typeof node === "string") {
      return verbatim || linked ? node : linkify(node, index, chip);
    }

    if (VOID_TAGS.has(node.tag)) {
      return createElement(node.tag, {
        key: index,
        className: NODE_CLASS[node.tag],
      });
    }

    const children = renderNodes(
      node.children,
      verbatim || node.tag === "pre" || node.tag === "code",
      linked || node.tag === "a",
      chip,
    );

    if (node.tag === "a" && !node.href) {
      // biome-ignore lint/suspicious/noArrayIndexKey: a parsed document, not a list — nodes are never reordered, inserted or removed, so the index is the stable identity.
      return <Fragment key={index}>{children}</Fragment>;
    }

    return createElement(
      node.tag,
      {
        key: index,
        className: NODE_CLASS[node.tag],
        ...(node.href
          ? {
              href: node.href,
              ...(/^https?:/i.test(node.href) ? { target: "_blank", rel: "noreferrer noopener" } : {}),
            }
          : {}),
      },
      children,
    );
  });
}

export function MarkdownBody({ source, chip, className }: { source: string; chip: ChipRenderer; className?: string }) {
  return <div className={cn("text-pretty", className)}>{renderNodes(parseMarkdown(source), false, false, chip)}</div>;
}
