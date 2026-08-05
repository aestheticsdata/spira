/**
 * Reading query params the same way twice.
 *
 * The filters (COS-277) and the display options (COS-274) are separate concepts
 * with separate keys, but they are read off the same URL and have to agree on
 * what a repeated key, a comma-joined list and an absent value mean. Two copies
 * of that would drift, and the first symptom would be a saved view that loads
 * back slightly different from how it was saved.
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
 * A comma-joined param as a sorted, de-duplicated list.
 *
 * Sorted so that choosing the same three values in a different order gives the
 * same link — which is what lets COS-265 tell two saved views apart by their
 * query alone.
 */
export function list(params: RawParams, key: string): string[] {
  const value = raw(params, key);
  if (value === null) {
    return [];
  }

  return [
    ...new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  ].sort();
}

/** `true`/`false` only. Anything else is not an answer, so it means "default". */
export function boolean(params: RawParams, key: string): boolean | null {
  const value = raw(params, key)?.trim().toLowerCase();
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

/** A param constrained to a known set; anything else falls back to the default. */
export function literal<T extends string>(params: RawParams, key: string, allowed: readonly T[], fallback: T): T {
  const value = raw(params, key)?.trim() as T | undefined;
  return value !== undefined && allowed.includes(value) ? value : fallback;
}

/** Two sets equal regardless of order — how a non-default set is detected. */
export function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");
}
