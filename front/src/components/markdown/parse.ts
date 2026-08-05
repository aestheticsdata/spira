import { marked } from "marked";

/**
 * Markdown to a tree of allowed elements — the sanitising half of the renderer,
 * kept free of React so it can be tested for what it actually guarantees:
 * nothing outside the allow list survives as anything but text.
 *
 * `marked` produces HTML, which is parsed here rather than handed to
 * `dangerouslySetInnerHTML`. A description is text and can never become
 * behaviour.
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

export const VOID_TAGS = new Set(["hr", "br"]);

/** Tags dropped together with their content — text inside a `<script>` is not prose. */
const OPAQUE_TAGS = new Set(["script", "style", "iframe", "template", "svg", "math"]);

const TAG = /<\/?([a-z][a-z0-9-]*)((?:"[^"]*"|'[^']*'|[^>])*)>/gi;
const HREF = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** A bare ticket reference: `SPI-24`, and the legacy `COS-177` just the same. */
export const REFERENCE = /\b[A-Z0-9]{2,5}-\d+\b/g;

export interface MarkdownElement {
  tag: string;
  href?: string;
  children: MarkdownNode[];
}

export type MarkdownNode = string | MarkdownElement;

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (raw, entity: string) => {
    if (!entity.startsWith("#")) {
      return NAMED_ENTITIES[entity.toLowerCase()] ?? raw;
    }
    const code =
      entity[1] === "x" || entity[1] === "X" ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : raw;
  });
}

export function safeHref(raw: string): string | undefined {
  const href = decodeEntities(raw).trim();

  if (/^https?:\/\//i.test(href)) {
    return href;
  }
  // Anything else has to be a same-document or same-origin path: no scheme at
  // all — which is what rejects `javascript:` — and no protocol-relative host.
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href) ? undefined : href;
}

export function parseHtml(html: string): MarkdownNode[] {
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

/** The whole markdown → safe tree pipeline, HTML comments stripped. */
export function parseMarkdown(source: string): MarkdownNode[] {
  const html = marked.parse(source, { async: false, gfm: true }).replace(/<!--[\s\S]*?-->/g, "");
  return parseHtml(html);
}
