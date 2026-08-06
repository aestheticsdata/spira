/**
 * Reading query params the same way twice.
 *
 * The filters (COS-277) and the display options (COS-274) are separate concepts
 * with separate keys, but they are read off the same URL and have to agree on
 * what a repeated key, a comma-joined list and an absent value mean. Two copies
 * of that would drift, and the first symptom would be a saved view that loads
 * back slightly different from how it was saved.
 *
 * Every rule here takes an already-extracted string, because that is what the
 * nuqs parsers in `list-params` are handed. nuqs supplies the plumbing — one
 * definition read by both the Server Components and the client hook, and
 * correct handling of a repeated key — while this file goes on owning what the
 * values actually mean. That division is the whole of the arrangement.
 *
 * `raw` survives it: two callers still need to pull one key off a `RawParams`
 * without a parser in front of it.
 */

/** Either a real `URLSearchParams` or the object Next hands a page. */
export type RawParams = URLSearchParams | Record<string, string | string[] | undefined>;

export function raw(params: RawParams, key: string): string | null {
  if (params instanceof URLSearchParams) {
    // Repeated params are accepted as well as comma-joined ones, because the
    // API accepts both and a hand-edited URL should not be the odd one out.
    const all = params.getAll(key);
    return all.length > 0 ? all.join(",") : null;
  }

  const value = params[key];
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(",") : null;
  }

  return value ?? null;
}

/**
 * A comma-joined value as a sorted, de-duplicated list.
 *
 * Sorted so that choosing the same three values in a different order gives the
 * same link — which is what lets COS-265 tell two saved views apart by their
 * query alone. Lexically, not numerically: these are ids.
 */
export function listFrom(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  ].sort();
}

/** `true`/`false` only, trimmed and lowercased. Anything else is not an answer. */
export function booleanFrom(value: string): boolean | null {
  const normalised = value.trim().toLowerCase();
  if (normalised === "true") {
    return true;
  }
  if (normalised === "false") {
    return false;
  }
  return null;
}

/** A value constrained to a known set. Trimmed; null when it is not one of them. */
export function literalFrom<T extends string>(value: string, allowed: readonly T[]): T | null {
  const trimmed = value.trim() as T;
  return allowed.includes(trimmed) ? trimmed : null;
}

/** Two sets equal regardless of order — how a non-default set is detected. */
export function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");
}
