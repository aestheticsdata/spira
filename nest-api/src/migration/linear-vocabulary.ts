/**
 * What Linear's words mean in Spira (COS-283).
 *
 * Three closed tables and one open one. The closed tables — projects, statuses,
 * priorities — refuse anything they do not recognise rather than guessing, and
 * the dry run prints what they refused. A guess here is a whole project
 * imported under the wrong key, or three hundred issues silently landing in
 * Backlog; both are discovered weeks later, if at all.
 *
 * Labels are the open one, because the ticket asks for them to be created on
 * the fly from the export, preserving names.
 */

import { suggestProjectKey } from "@projects/project-key.util";

/** Names are matched with case, spaces and punctuation removed. */
export function vocabularyKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Linear project name to Spira project key — each confirmed by hand, as the
 * ticket requires.
 *
 * The list is longer than the ticket's seven: `Worldweathr` and `BKMK` were
 * created in Linear after it was written, which is precisely the growth the
 * ticket warns about. Both keys match the seeded workspace, so an import lands
 * on the projects that already exist rather than beside them.
 *
 * `1991chat` carries its full Linear name and the short one. Its first three
 * letters are `199`, which is not a usable key — hence `CHT`, from the
 * consonants, the same rule `suggestProjectKey` applies.
 */
const PROJECT_TABLE: { key: string; names: string[] }[] = [
  { key: "SPI", names: ["Spira"] },
  { key: "PFA", names: ["PFA"] },
  { key: "3DE", names: ["3D engine"] },
  { key: "IKN", names: ["Iknos"] },
  { key: "ZEU", names: ["Zeus"] },
  { key: "EXA", names: ["Exalus"] },
  { key: "CHT", names: ["1991chat — Chat front-end", "1991chat"] },
  { key: "WEA", names: ["Worldweathr"] },
  { key: "BMK", names: ["BKMK"] },
];

const PROJECTS = new Map<string, string>();
for (const { key, names } of PROJECT_TABLE) {
  for (const name of names) {
    PROJECTS.set(vocabularyKey(name), key);
  }
}

/** The confirmed key for a Linear project name, or null if it is a new one. */
export function projectKeyFor(name: string): string | null {
  return PROJECTS.get(vocabularyKey(name)) ?? null;
}

/**
 * What an unconfirmed project would be called, for the dry run to propose.
 * Only ever printed — an import refuses to invent a key on its own, because
 * "manually confirmed" is the whole point of the table above.
 */
export function suggestKeyFor(name: string, taken: string[]): string {
  return suggestProjectKey(name, taken);
}

/** The six seeded states, by name. `seed.ts` owns their colours and order. */
export const SPIRA_STATES = ["Backlog", "Todo", "In Progress", "In Review", "Done", "Canceled"] as const;
export type SpiraState = (typeof SPIRA_STATES)[number];

/**
 * Linear's states onto the seeded six.
 *
 * Two are not identities and both are in the ticket. `Verify` is Linear's
 * second started state, which Spira calls `In Review`. `Duplicate` is a state
 * type of its own in Linear and has no equivalent here, so it lands on
 * `Canceled` — a duplicate is closed without being done, which is what
 * `Canceled` means.
 *
 * `Cancelled` is listed beside `Canceled` only because the two spellings cost
 * nothing to accept and an export that used the British one would otherwise
 * fail every row.
 */
const STATUS_TABLE: { state: SpiraState; from: string[] }[] = [
  { state: "Backlog", from: ["Backlog"] },
  { state: "Todo", from: ["Todo"] },
  { state: "In Progress", from: ["In Progress"] },
  { state: "In Review", from: ["Verify", "In Review"] },
  { state: "Done", from: ["Done"] },
  { state: "Canceled", from: ["Canceled", "Cancelled", "Duplicate"] },
];

const STATUSES = new Map<string, SpiraState>();
for (const { state, from } of STATUS_TABLE) {
  for (const name of from) {
    STATUSES.set(vocabularyKey(name), state);
  }
}

export function stateFor(status: string): SpiraState | null {
  return STATUSES.get(vocabularyKey(status)) ?? null;
}

/** States that close an issue, and which timestamp column records the closing. */
export const COMPLETED_STATES: readonly SpiraState[] = ["Done"];
export const CANCELED_STATES: readonly SpiraState[] = ["Canceled"];

/**
 * Linear's priority, by label or by number.
 *
 * Spira stores the same scale — `Issue.priority` is documented as Linear's
 * order — so the numbers pass through untouched and only the words need a
 * table. An export can carry either; which one depends on the export, and
 * accepting both costs one branch.
 */
const PRIORITIES = new Map<string, number>([
  ["nopriority", 0],
  ["none", 0],
  ["no", 0],
  ["urgent", 1],
  ["high", 2],
  ["medium", 3],
  ["low", 4],
]);

export const MAX_PRIORITY = 4;

/** The priority for a cell, or null when the cell says something unexpected. */
export function priorityFor(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return 0;
  }

  const word = PRIORITIES.get(vocabularyKey(trimmed));
  if (word !== undefined) {
    return word;
  }

  // `Number`, not `parseInt`: "3 (Medium)" must be refused and reported, not
  // truncated to a priority nobody chose.
  const numeric = Number(trimmed);
  return Number.isInteger(numeric) && numeric >= 0 && numeric <= MAX_PRIORITY ? numeric : null;
}

/**
 * Colours for labels the export brings that the workspace does not have.
 *
 * Picked by name rather than by arrival order, so two runs of the importer —
 * or an import against a workspace where some labels already exist — give the
 * same label the same colour. Taken from the seeded palette, so a created label
 * cannot look like a different species from a seeded one.
 */
const LABEL_PALETTE = ["#9db1c4", "#c48a83", "#c9a05a", "#8fae97", "#a99fc0", "#7fa8c9"];

export function labelColourFor(name: string): string {
  let hash = 0;
  for (const character of vocabularyKey(name)) {
    hash = (hash * 31 + character.charCodeAt(0)) % 0xffffff;
  }
  return LABEL_PALETTE[hash % LABEL_PALETTE.length];
}

/**
 * The `Labels` cell unpacked.
 *
 * Linear packs several labels into one cell; which separator it uses is a
 * property of the export rather than something documented, so comma and
 * semicolon are both accepted. A label containing a comma in its own name would
 * be split wrongly by this, and there is no way to tell the two cases apart
 * from inside the cell — the dry run prints the full label set for exactly that
 * reason.
 *
 * De-duplicated case-insensitively, keeping the first spelling seen, because
 * `Label.name` is unique and `Bug`/`bug` would otherwise collide on write.
 */
export function labelsFrom(cell: string): string[] {
  const seen = new Map<string, string>();

  for (const part of cell.split(/[,;]/)) {
    const name = part.trim();
    if (name === "") {
      continue;
    }
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, name);
    }
  }

  return [...seen.values()];
}

/**
 * A timestamp cell as a Date, or null.
 *
 * Deliberately strict about what counts as a date. `new Date("Done")` is
 * `Invalid Date`, which is caught — but `new Date("2026")` is a valid January
 * the first, and a column that turned out to hold years would import a
 * workspace all created on New Year's Day without one row failing. So the shape
 * has to look like a date before it is parsed at all.
 */
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/;

export function dateFrom(cell: string): Date | null {
  const trimmed = cell.trim();
  if (trimmed === "" || !DATE_SHAPE.test(trimmed)) {
    return null;
  }

  // A date-only cell is left alone: JavaScript already reads `YYYY-MM-DD` as
  // UTC midnight. It is the ones carrying a time that need help — a bare
  // `YYYY-MM-DD HH:MM` with no zone is read as *local* time, which would land
  // the same export on different timestamps depending on where it was run.
  const hasTime = /[T ]\d{2}:/.test(trimmed);
  const normalised = hasTime
    ? (() => {
        const spaced = trimmed.replace(" ", "T");
        return /(Z|[+-]\d{2}:?\d{2})$/.test(spaced) ? spaced : `${spaced}Z`;
      })()
    : trimmed;

  const date = new Date(normalised);
  return Number.isNaN(date.getTime()) ? null : date;
}
