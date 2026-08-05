import { ReferenceChip } from "@components/markdown/reference-chip";
import { cn } from "@lib/utils";
import { marked } from "marked";
import { createElement, Fragment } from "react";

import type { ReactNode } from "react";

/**
 * The renderer for every description in the app. `marked` produces HTML, which
 * is then parsed into a tree of allowed elements and rendered as React: the
 * stored markdown never reaches `dangerouslySetInnerHTML`, so an issue body is
 * text and can never become behaviour. Whatever falls outside the allow list
 * survives as its text content only.
 */

const ALLOWED_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "code",
  "pre",
  "blockquote",
  "a",
  "hr",
  "br",
]);

const VOID_TAGS = new Set(["hr", "br"]);

/** Tags dropped together with their content — text inside a `<script>` is not prose. */
const OPAQUE_TAGS = new Set(["script", "style", "iframe", "template", "svg", "math"]);

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

const TAG = /<\/?([a-z][a-z0-9-]*)((?:"[^"]*"|'[^']*'|[^>])*)>/gi;
const HREF = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** A bare ticket reference: `SPI-24`, and the legacy `COS-177` just the same. */
const REFERENCE = /\b[A-Z0-9]{2,5}-\d+\b/g;

interface MarkdownElement {
  tag: string;
  href?: string;
  children: MarkdownNode[];
}

type MarkdownNode = string | MarkdownElement;

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (raw, entity: string) => {
    if (!entity.startsWith("#")) {
      return NAMED_ENTITIES[entity.toLowerCase()] ?? raw;
    }
    const code =
      entity[1] === "x" || entity[1] === "X" ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : raw;
  });
}

function safeHref(raw: string): string | undefined {
  const href = decodeEntities(raw).trim();

  if (/^https?:\/\//i.test(href)) {
    return href;
  }
  // Anything else has to be a same-document or same-origin path: no scheme at
  // all — which is what rejects `javascript:` — and no protocol-relative host.
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href) ? undefined : href;
}

function parseHtml(html: string): MarkdownNode[] {
  const root: MarkdownElement = { tag: "root", children: [] };
  const stack: MarkdownElement[] = [root];
  let opaqueDepth = 0;
  let cursor = 0;

  const push = (node: MarkdownNode) => stack[stack.length - 1].children.push(node);

  for (const match of html.matchAll(TAG)) {
    const raw = match[0];
    const tag = match[1].toLowerCase();
    const start = match.index ?? 0;
    const closing = raw.startsWith("</");

    if (opaqueDepth === 0 && start > cursor) {
      push(decodeEntities(html.slice(cursor, start)));
    }
    cursor = start + raw.length;

    if (OPAQUE_TAGS.has(tag)) {
      opaqueDepth = closing ? Math.max(0, opaqueDepth - 1) : opaqueDepth + 1;
      continue;
    }
    if (opaqueDepth > 0 || !ALLOWED_TAGS.has(tag)) {
      continue;
    }
    if (VOID_TAGS.has(tag)) {
      if (!closing) {
        push({ tag, children: [] });
      }
      continue;
    }
    if (closing) {
      const open = stack.findLastIndex((element) => element.tag === tag);
      if (open > 0) {
        stack.length = open;
      }
      continue;
    }

    const element: MarkdownElement = { tag, children: [] };
    if (tag === "a") {
      const href = match[2].match(HREF);
      element.href = href ? safeHref(href[1] ?? href[2] ?? href[3] ?? "") : undefined;
    }
    push(element);
    stack.push(element);
  }

  if (opaqueDepth === 0 && cursor < html.length) {
    push(decodeEntities(html.slice(cursor)));
  }

  return root.children;
}

function linkify(text: string, key: number): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(REFERENCE)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      parts.push(text.slice(cursor, start));
    }
    parts.push(
      <ReferenceChip
        key={`${key}-${start}`}
        identifier={match[0]}
      />,
    );
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
function renderNodes(nodes: MarkdownNode[], verbatim: boolean, linked: boolean): ReactNode[] {
  return nodes.map((node, index) => {
    if (typeof node === "string") {
      return verbatim || linked ? node : linkify(node, index);
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

export function Markdown({ source, className }: { source: string; className?: string }) {
  const html = marked.parse(source, { async: false, gfm: true }).replace(/<!--[\s\S]*?-->/g, "");

  return <div className={cn("text-pretty", className)}>{renderNodes(parseHtml(html), false, false)}</div>;
}
