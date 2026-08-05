import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { FIELD_LIMITS } from "@config/field-limits";
import { ViewQueryDto } from "@views/dto/view-query.dto";

import type { ValidationError } from "class-validator";

/**
 * Reading, checking and re-writing a saved view's query string (COS-265).
 *
 * A view is a stored query, so this is the whole of its schema. It runs on
 * **write**, which refuses to store a view that could not be replayed, and on
 * **read**, which is the case the ticket is really about: a view saved against
 * a vocabulary that has since changed must say so rather than quietly render a
 * different list than the one it was saved as.
 *
 * What comes back out is canonical — keys alphabetical, lists sorted and
 * de-duplicated, defaults absent — so two views built the same way are stored
 * the same way whatever order the client happened to write them in.
 */

/**
 * Inherited from `IssuesQueryDto` but not a view's to carry.
 *
 * `project` is the view's scope, and the scope is a column: a view stored
 * against SPI whose query said `project=PFA` would be two answers to one
 * question. `orderBy` is the same choice as `order`, spelt the way the issues
 * endpoint takes it rather than the way the address bar writes it — accepting
 * both would let a view disagree with itself.
 */
const NOT_A_VIEW_KEY: Record<string, string> = {
  project: "a view's scope is its project, not a query param",
  orderBy: "a view spells its ordering `order`, as the URL does",
};

/** Alphabetical, so the same view always writes the same string. */
const LIST_KEYS = ["cols", "excludeLabel", "label", "state"] as const;
const FLAG_KEYS = ["empty", "hasEpic", "includeArchived", "isEpic", "legacy"] as const;
const TEXT_KEYS = ["epic", "excludeEpic", "group", "order"] as const;

export interface ViewQueryCheck {
  /** The canonical form, or null when the query does not validate. */
  query: string | null;
  /** Why it does not, or null when it does. */
  error: string | null;
}

/**
 * A query string as a plain object, the shape class-transformer expects.
 * Repeated keys stay arrays; the DTO's own transforms flatten them, which is
 * how `?state=a&state=b` and `?state=a,b` end up the same view.
 */
function toPlain(search: URLSearchParams): Record<string, string | string[]> {
  const plain: Record<string, string | string[]> = {};

  for (const key of new Set(search.keys())) {
    const values = search.getAll(key);
    plain[key] = values.length === 1 ? values[0] : values;
  }

  return plain;
}

/** Every constraint that failed, nested children included, as one sentence. */
function describe(errors: ValidationError[]): string {
  const messages = errors.flatMap((error) =>
    Object.values(error.constraints ?? {}).concat(error.children?.length ? [describe(error.children)] : []),
  );

  return messages.join("; ");
}

function sortedText(values: string[]): string {
  return [...new Set(values)].sort().join(",");
}

function sortedNumbers(values: number[]): string {
  return [...new Set(values)].sort((a, b) => a - b).join(",");
}

function serialise(dto: ViewQueryDto): string {
  const params = new URLSearchParams();
  const entries = dto as unknown as Record<string, unknown>;

  for (const key of LIST_KEYS) {
    const values = entries[key] as string[] | undefined;
    if (values?.length) {
      params.set(key, sortedText(values));
    }
  }
  if (dto.priority?.length) {
    // Numerically, not lexically: a scale that reached 10 would otherwise sort
    // it between 1 and 2 and store a different string for the same view.
    params.set("priority", sortedNumbers(dto.priority));
  }
  for (const key of FLAG_KEYS) {
    const value = entries[key] as boolean | undefined;
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  for (const key of TEXT_KEYS) {
    const value = entries[key] as string | undefined;
    if (value !== undefined && value !== "") {
      params.set(key, value);
    }
  }

  // Sorted last rather than by insertion: the groups above are readable, the
  // stored string has to be deterministic, and only one of those is a promise.
  params.sort();
  return params.toString();
}

export function checkViewQuery(raw: string): ViewQueryCheck {
  if (raw.length > FIELD_LIMITS.viewQuery) {
    return { query: null, error: `query must be ${FIELD_LIMITS.viewQuery} characters or fewer` };
  }

  // A client may hand over `window.location.search`, which carries the `?`.
  const search = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);

  for (const [key, reason] of Object.entries(NOT_A_VIEW_KEY)) {
    if (search.has(key)) {
      return { query: null, error: `\`${key}\` cannot be part of a view's query — ${reason}` };
    }
  }

  const dto = plainToInstance(ViewQueryDto, toPlain(search));
  // `forbidNonWhitelisted` is what makes a stale view fail loudly: a key no
  // longer in the vocabulary is not ignored, it is reported.
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });

  if (errors.length > 0) {
    return { query: null, error: describe(errors) };
  }

  return { query: serialise(dto), error: null };
}
