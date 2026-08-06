import { booleanFrom, listFrom, literalFrom, sameSet } from "@components/filters/query-params";
import { PRIORITY_NAMES } from "@lib/status";
import { createMultiParser, createParser } from "nuqs/server";

import type { EpicFilter } from "@components/filters/issue-filters";

/**
 * The list's URL vocabulary as nuqs parsers — one map, read by both the Server
 * Components and the client hook.
 *
 * Every parser is hand-written on top of `query-params`, and that is not
 * stubbornness: none of the stock parsers matches what this app already
 * promises. `parseAsArrayOf` reads only the first occurrence of a repeated key,
 * so `state=a&state=b` becomes `["a"]`. `parseAsBoolean` never returns null, so
 * `legacy=perhaps` becomes `false` where it has to mean "unreadable, use the
 * default". `parseAsInteger` uses `parseInt`, so `priority=2.5` would become a
 * real priority 2. Each of those is pinned by a test that predates this file.
 *
 * So nuqs supplies the plumbing — one definition for both read paths, correct
 * repeated-key handling, and a hook that batches a multi-key write into one
 * navigation — while `query-params` keeps supplying the rules.
 *
 * The parser key is the URL key throughout, so no `urlKeys` map is needed and
 * this object's keys *are* the vocabulary the API whitelists for a saved view.
 *
 * The closed vocabularies live here rather than in `display-options`, and the
 * dependency runs one way: a parser needs to know what values it may accept,
 * and the display module's `DEFAULT_DISPLAY` is then *derived* from these
 * parsers' own defaults. That leaves each default written down exactly once,
 * where before a parser and an object could have disagreed about it.
 */

/** Derived rather than restated: `@lib/status` owns the priority scale. */
export const MAX_PRIORITY = PRIORITY_NAMES.length - 1;

export const GROUP_MODES = ["status", "epic", "priority", "project", "none"] as const;
export type GroupMode = (typeof GROUP_MODES)[number];

/**
 * The API's `orderBy` values, minus `title`. The ticket asks for four and the
 * server happens to accept a fifth; offering one the spec did not ask for is
 * how a display menu turns into a list of everything the backend can do.
 */
export const ORDERS = ["manual", "priority", "created", "updated"] as const;
export type OrderBy = (typeof ORDERS)[number];

export const COLUMNS = ["identifier", "status", "priority", "labels", "created", "updated"] as const;
export type ColumnKey = (typeof COLUMNS)[number];

/** The row as it has always looked: everything but the created date. */
export const DEFAULT_COLUMNS: ColumnKey[] = ["identifier", "labels", "priority", "status", "updated"];

/**
 * A *multi* parser is handed `searchParams.getAll(key)` rather than `.get(key)`.
 * That is the whole reason this is not `parseAsArrayOf`: it is what makes a
 * repeated key, a comma-joined one and Next's `{ state: ["a","b"] }` all read
 * as the same list.
 */
const idList = createMultiParser<string[]>({
  parse: (values) => listFrom(values.join(",")),
  // One entry, not one per value: a multi parser writes an occurrence per array
  // element, so returning the values raw would turn `?state=a,b` into
  // `?state=a&state=b`. Both read identically, but the address bar is something
  // people copy, and it has always been comma-joined.
  serialize: (values) => (values.length > 0 ? [values.join(",")] : []),
  eq: sameSet,
}).withDefault([]);

/** The one list sorted numerically — a scale, not a set of ids. */
const priorityList = createMultiParser<number[]>({
  parse: (values) =>
    [
      ...new Set(
        listFrom(values.join(","))
          // `Number`, never `parseInt`: 2.5 has to be refused outright rather
          // than truncated into a priority nobody chose.
          .map(Number)
          .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= MAX_PRIORITY),
      ),
    ].sort((a, b) => a - b),
  serialize: (values) => (values.length > 0 ? [values.join(",")] : []),
  eq: (a, b) => a.length === b.length && a.every((entry, index) => entry === b[index]),
}).withDefault([]);

const columnList = createMultiParser<ColumnKey[]>({
  // Returning null rather than an empty array is load-bearing: nuqs falls back
  // to the default only on a nullish parse, so `[]` here would render a list of
  // blank rows for `cols=` or a truncated URL.
  parse: (values) => {
    const columns = listFrom(values.join(",")).filter((entry): entry is ColumnKey =>
      COLUMNS.includes(entry as ColumnKey),
    );
    return columns.length > 0 ? columns : null;
  },
  serialize: (values) => (values.length > 0 ? [[...values].sort().join(",")] : []),
  // Order-insensitive, so a reordered but identical set still counts as the
  // default and stays out of the URL.
  eq: sameSet,
}).withDefault(DEFAULT_COLUMNS);

/** Only `true`/`false`, trimmed and lowercased; anything else means "default". */
const strictBoolean = createParser<boolean>({ parse: booleanFrom, serialize: String });

const literalOf = <T extends string>(allowed: readonly T[]) =>
  createParser<T>({ parse: (value) => literalFrom(value, allowed), serialize: (value) => value });

/**
 * Deliberately not trimmed and case-sensitive, unlike every other literal here.
 * `hasEpic` has always been read raw and compared exactly; a parser that
 * trimmed would make `hasEpic=%20true` — inert today — start filtering.
 */
const exactLiteral = <T extends string>(allowed: readonly T[]) =>
  createParser<T>({
    parse: (value) => (allowed.includes(value as T) ? (value as T) : null),
    serialize: (value) => value,
  });

const epicIdentifier = createParser<string>({
  // Null for a blank value, so `epic=&hasEpic=true` falls through to the
  // cardinality arm instead of stopping at an epic that is not named.
  parse: (value) => value.trim().toUpperCase() || null,
  serialize: (value) => value,
});

export const FILTER_PARSERS = {
  state: idList,
  priority: priorityList,
  label: idList,
  excludeLabel: idList,
  epic: epicIdentifier,
  excludeEpic: epicIdentifier,
  /**
   * No `.withDefault()`, and that is the most important line in this file.
   *
   * nuqs clears a key whose value equals the parser's default, guarding on
   * `defaultValue !== undefined` — so a parser without one can never be
   * cleared. Modelled as `parseAsBoolean.withDefault(false)` instead, saving a
   * view filtered to "in no epic" would drop `hasEpic=false` from the query and
   * silently reopen as "in any epic", with nothing failing anywhere.
   */
  hasEpic: exactLiteral(["true", "false"] as const),
} as const;

export const DISPLAY_PARSERS = {
  group: literalOf(GROUP_MODES).withDefault("status"),
  order: literalOf(ORDERS).withDefault("manual"),
  cols: columnList,
  empty: strictBoolean.withDefault(false),
  /** Show the Linear identifier beside the Spira one — on by default. */
  legacy: strictBoolean.withDefault(true),
} as const;

/** What the client hook drives. `view` is not here — see `use-list-view`. */
export const LIST_PARSERS = { ...FILTER_PARSERS, ...DISPLAY_PARSERS } as const;

type EpicKeys = {
  epic: string | null;
  excludeEpic: string | null;
  hasEpic: "true" | "false" | null;
};

/**
 * The epic filter is one value spread across three keys, which no parser can
 * express — nuqs has no notion of a value that spans keys. So the three are
 * read separately and the union is derived here, in the same precedence the
 * hand-rolled parser used: a named epic is a narrower ask than a count, so it
 * wins.
 */
export function deriveEpic(values: EpicKeys): EpicFilter | null {
  if (values.epic) {
    return { kind: "is", identifier: values.epic };
  }
  if (values.excludeEpic) {
    return { kind: "isNot", identifier: values.excludeEpic };
  }
  if (values.hasEpic === "true") {
    return { kind: "any" };
  }
  if (values.hasEpic === "false") {
    return { kind: "none" };
  }
  return null;
}

/**
 * All three keys on every change, two of them null. Writing only the arm being
 * selected would leave the previous one behind, and the precedence above would
 * then answer with the filter that was just replaced.
 */
export function epicToParams(epic: EpicFilter | null): EpicKeys {
  return {
    epic: epic?.kind === "is" ? epic.identifier : null,
    excludeEpic: epic?.kind === "isNot" ? epic.identifier : null,
    hasEpic: epic?.kind === "any" ? "true" : epic?.kind === "none" ? "false" : null,
  };
}
