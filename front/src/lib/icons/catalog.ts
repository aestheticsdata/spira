/**
 * The searchable icon and emoji catalogues behind the picker (COS-458).
 *
 * Both are generated — `pnpm icons:generate` — and both are big: the icon
 * index is 1.1 MB of text, 343 KB over the wire. That is why nothing here is
 * imported statically. `load*` reaches for its module with a dynamic
 * `import()`, so webpack emits it as its own chunk that is fetched the first
 * time somebody opens the picker and cached from then on. A page that never
 * shows the picker never pays for it.
 */

export interface CatalogEntry {
  /** A Material Symbols ligature name, or the emoji character itself. */
  key: string;
  /** What it is called out loud: `rocket launch`, `grinning face`. */
  label: string;
  /**
   * Lowercase `key`, `label` and every search term, in one string. Search is
   * an `includes` against this — no per-entry tag array to allocate, and the
   * generated file is already in this shape, so loading is one `split`.
   */
  haystack: string;
}

function parse(payload: string): CatalogEntry[] {
  return payload.split("\n").map((line) => {
    const key = line.indexOf("\t");
    const label = line.indexOf("\t", key + 1);
    return { key: line.slice(0, key), label: line.slice(key + 1, label), haystack: line };
  });
}

/**
 * Loaded at most once per page. The promise itself is the cache, so two
 * pickers opening in the same tick share one fetch rather than racing.
 */
let iconCatalog: Promise<CatalogEntry[]> | null = null;
let emojiCatalog: Promise<CatalogEntry[]> | null = null;

export function loadIconCatalog(): Promise<CatalogEntry[]> {
  iconCatalog ??= import("./material-symbols.generated").then((module) => parse(module.ICON_INDEX));
  return iconCatalog;
}

export function loadEmojiCatalog(): Promise<CatalogEntry[]> {
  emojiCatalog ??= import("./emoji.generated").then((module) => parse(module.EMOJI_INDEX));
  return emojiCatalog;
}

/**
 * Every entry matching `query`, best first; the whole catalogue when the query
 * is empty, which is what makes the default view browsable.
 *
 * Ranking is the position of the match. An icon's haystack opens with its own
 * name, and an emoji's opens with the words of its name, so a match near the
 * front is a match on the thing itself rather than on its fortieth synonym —
 * "book" puts `book` above `auto_stories`, which merely lists it as a tag.
 * Within a rank the generated order survives, and that order is Google's
 * popularity for icons and Unicode's grouping for emoji.
 *
 * Multi-word queries are an AND: every word must appear somewhere. "space
 * rocket" finds `rocket_launch` through one word in the name and one in the
 * tags.
 */
const KEY_MATCH_CEILING = 1000;

export function searchCatalog(entries: CatalogEntry[], query: string): CatalogEntry[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") {
    return entries;
  }

  const words = trimmed.split(/\s+/);
  // Ligature names join their words with underscores, so a typed space has to
  // match one: "arrow back" should find `arrow_back`.
  const ligature = words.join("_");

  const matched: { entry: CatalogEntry; rank: number }[] = [];

  for (const entry of entries) {
    if (!words.every((word) => entry.haystack.includes(word))) {
      continue;
    }

    // Naming the thing outright wins: "fire" is 🔥 before it is 🚒, and
    // "search" is `search` before `search_off`.
    if (entry.label === trimmed) {
      matched.push({ entry, rank: -1 });
      continue;
    }

    // Then a key match, however deep into the key it is — hence the offset,
    // comfortably past the longest key the column can hold. Then whatever was
    // found among the tags.
    const inKey = entry.key.indexOf(ligature);
    matched.push({
      entry,
      rank: inKey === -1 ? KEY_MATCH_CEILING + entry.haystack.indexOf(words[0]) : inKey,
    });
  }

  return matched.sort((a, b) => a.rank - b.rank).map((match) => match.entry);
}
