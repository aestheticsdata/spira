import { decodeEntities, parseHtml, parseMarkdown, REFERENCE, safeHref } from "@components/markdown/parse";
import { describe, expect, it } from "vitest";

import type { MarkdownNode } from "@components/markdown/parse";

/** The visible text of a tree, which is what survives when a tag is dropped. */
function text(nodes: MarkdownNode[]): string {
  return nodes.map((node) => (typeof node === "string" ? node : text(node.children))).join("");
}

function tags(nodes: MarkdownNode[]): string[] {
  return nodes.flatMap((node) => (typeof node === "string" ? [] : [node.tag, ...tags(node.children)]));
}

describe("safeHref", () => {
  it("keeps http and https", () => {
    expect(safeHref("https://example.com/x")).toBe("https://example.com/x");
    expect(safeHref("http://example.com")).toBe("http://example.com");
  });

  it("keeps same-origin paths and fragments", () => {
    expect(safeHref("/issue/SPI-1")).toBe("/issue/SPI-1");
    expect(safeHref("#anchor")).toBe("#anchor");
    expect(safeHref("relative/path")).toBe("relative/path");
  });

  it("drops javascript: however it is dressed up", () => {
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref("  JavaScript:alert(1)")).toBeUndefined();
    // The entity decode happens before the scheme test, so this cannot sneak past.
    expect(safeHref("&#106;avascript:alert(1)")).toBeUndefined();
  });

  it("drops data: and other schemes", () => {
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    expect(safeHref("vbscript:msgbox(1)")).toBeUndefined();
    expect(safeHref("file:///etc/passwd")).toBeUndefined();
  });

  it("drops a protocol-relative host, which would leave the origin", () => {
    expect(safeHref("//evil.example.com/x")).toBeUndefined();
  });
});

describe("decodeEntities", () => {
  it("decodes the named entities markdown output actually uses", () => {
    expect(decodeEntities("a &amp; b &lt;c&gt; &quot;d&quot;")).toBe('a & b <c> "d"');
  });

  it("decodes decimal and hex references", () => {
    expect(decodeEntities("&#65;&#x42;")).toBe("AB");
  });

  it("leaves an unknown entity alone rather than guessing", () => {
    expect(decodeEntities("&nope;")).toBe("&nope;");
  });
});

describe("parseHtml", () => {
  it("keeps the allowed tags", () => {
    expect(tags(parseHtml("<p>a <strong>b</strong> <em>c</em></p>"))).toEqual(["p", "strong", "em"]);
  });

  it("drops a disallowed tag but keeps its text", () => {
    const tree = parseHtml("<p>before <marquee>middle</marquee> after</p>");

    expect(tags(tree)).toEqual(["p"]);
    expect(text(tree)).toBe("before middle after");
  });

  it("drops a script together with its contents", () => {
    const tree = parseHtml("<p>before</p><script>alert(1)</script><p>after</p>");

    expect(tags(tree)).toEqual(["p", "p"]);
    expect(text(tree)).toBe("beforeafter");
    expect(text(tree)).not.toContain("alert");
  });

  it("drops style, iframe, svg and math the same way", () => {
    for (const tag of ["style", "iframe", "svg", "math"]) {
      const tree = parseHtml(`<p>keep</p><${tag}>drop</${tag}>`);

      expect(text(tree)).toBe("keep");
    }
  });

  it("never carries an event handler through — attributes are not read at all", () => {
    const tree = parseHtml('<p onclick="alert(1)">text</p>');
    const paragraph = tree[0];

    expect(typeof paragraph).toBe("object");
    expect(Object.keys(paragraph as object)).toEqual(["tag", "children"]);
  });

  it("keeps a safe href and refuses an unsafe one", () => {
    const safe = parseHtml('<a href="https://example.com">x</a>')[0];
    const unsafe = parseHtml('<a href="javascript:alert(1)">x</a>')[0];

    expect(safe).toMatchObject({ tag: "a", href: "https://example.com" });
    expect(unsafe).toMatchObject({ tag: "a", href: undefined });
  });

  it("does not let a stray close tag unwind past the root", () => {
    expect(() => parseHtml("</p></div>text")).not.toThrow();
    expect(text(parseHtml("</p>text"))).toBe("text");
  });

  it("closes a void tag without swallowing what follows", () => {
    expect(tags(parseHtml("<p>a<br>b<hr></p>"))).toEqual(["p", "br", "hr"]);
  });
});

describe("parseMarkdown", () => {
  it("renders ordinary markdown to the allowed tags", () => {
    expect(tags(parseMarkdown("# Title\n\nSome **bold** text."))).toEqual(["h1", "p", "strong"]);
  });

  it("strips HTML comments, which marked passes straight through", () => {
    expect(text(parseMarkdown("visible<!-- hidden -->"))).not.toContain("hidden");
  });

  it("keeps raw HTML in a fenced block as text, not as markup", () => {
    const tree = parseMarkdown("```\n<script>alert(1)</script>\n```");

    expect(text(tree)).toContain("<script>alert(1)</script>");
    expect(tags(tree)).not.toContain("script");
  });
});

describe("REFERENCE", () => {
  const matches = (text: string) => text.match(new RegExp(REFERENCE.source, "g")) ?? [];

  it("matches new and legacy identifiers", () => {
    expect(matches("see SPI-24 and COS-177")).toEqual(["SPI-24", "COS-177"]);
  });

  it("accepts the two to five character keys the API allows", () => {
    expect(matches("GO-1 3DE-12 ALPHA-999")).toEqual(["GO-1", "3DE-12", "ALPHA-999"]);
  });

  it("ignores lowercase and over-long prefixes", () => {
    expect(matches("spi-24 ALPHAS-1")).toEqual([]);
  });
});
