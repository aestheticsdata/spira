import { DEFAULT_COLUMNS } from "@components/filters/display-options";
import { deriveEpic, epicToParams, FILTER_PARSERS, LIST_PARSERS } from "@components/filters/list-params";
import { createLoader, createSerializer } from "nuqs/server";
import { describe, expect, it } from "vitest";

/**
 * The parsers on their own, against nuqs' real loader and serializer.
 *
 * The modules above them have their own specs, and those are the contract. This
 * one exists a layer lower, where a wrong parser is one line rather than a
 * puzzle — and it pins the three nuqs behaviours that would otherwise have to
 * be rediscovered: which parser sees a repeated key, when a default is written
 * out, and when a key is cleared.
 */
const load = createLoader(LIST_PARSERS);
const serialize = createSerializer(LIST_PARSERS);

const A = "aaaaaaaa-1111-4111-8111-111111111111";
const B = "bbbbbbbb-2222-4222-8222-222222222222";

describe("reading a list", () => {
  it("reads a repeated key, a comma-joined one and a Next array as the same list", () => {
    // The reason these are multi parsers: a single parser is handed `.get(key)`
    // and would see only the first occurrence.
    expect(load(`state=${A}&state=${B}`).state).toEqual([A, B]);
    expect(load(`state=${A},${B}`).state).toEqual([A, B]);
    expect(load({ state: [A, B] }).state).toEqual([A, B]);
  });

  it("sorts and de-duplicates", () => {
    expect(load(`label=${B},${A},${B}`).label).toEqual([A, B]);
  });

  it("sorts ids lexically and priorities numerically", () => {
    expect(load("state=10,9,2").state).toEqual(["10", "2", "9"]);
    expect(load("priority=4,1,2").priority).toEqual([1, 2, 4]);
  });

  it("reads an absent, empty or empty-array key as no filter", () => {
    expect(load("").state).toEqual([]);
    expect(load("state=").state).toEqual([]);
    expect(load({ state: [] }).state).toEqual([]);
    expect(load({ state: undefined }).state).toEqual([]);
  });
});

describe("reading a priority", () => {
  it("keeps only whole numbers on the scale", () => {
    expect(load("priority=0,4,9,-1,x").priority).toEqual([0, 4]);
  });

  it("refuses a fraction rather than truncating it", () => {
    // `parseAsInteger` would give 2 here, which is a priority nobody chose.
    expect(load("priority=2.5").priority).toEqual([]);
    expect(load("priority=4abc").priority).toEqual([]);
  });
});

describe("reading the columns", () => {
  it("keeps only real columns", () => {
    expect(load("cols=identifier,assignee").cols).toEqual(["identifier"]);
  });

  it("falls back to the default when nothing readable is left", () => {
    // The parser returns null, not [], so nuqs' default fires — otherwise a
    // truncated URL would render rows with no columns at all.
    expect(load("cols=").cols).toEqual(DEFAULT_COLUMNS);
    expect(load("cols=nonsense").cols).toEqual(DEFAULT_COLUMNS);
    expect(load("cols=Status").cols).toEqual(DEFAULT_COLUMNS);
    expect(load("").cols).toEqual(DEFAULT_COLUMNS);
  });
});

describe("reading a boolean", () => {
  it("accepts only true and false, and falls back otherwise", () => {
    expect(load("legacy=false").legacy).toBe(false);
    expect(load("empty=true").empty).toBe(true);
    // `parseAsBoolean` never returns null, so all four of these would be false.
    expect(load("legacy=perhaps").legacy).toBe(true);
    expect(load("legacy=").legacy).toBe(true);
    expect(load("legacy=1").legacy).toBe(true);
  });

  it("trims and lowercases, unlike hasEpic", () => {
    expect(load("empty=%20TRUE").empty).toBe(true);
  });
});

describe("the epic arms", () => {
  const epicOf = (query: string) => deriveEpic(load(query));

  it("reads a named epic, uppercased", () => {
    expect(epicOf("epic=pfa-1")).toEqual({ kind: "is", identifier: "PFA-1" });
    expect(epicOf("excludeEpic=pfa-1")).toEqual({ kind: "isNot", identifier: "PFA-1" });
  });

  it("reads the two cardinalities", () => {
    expect(epicOf("hasEpic=true")).toEqual({ kind: "any" });
    expect(epicOf("hasEpic=false")).toEqual({ kind: "none" });
  });

  it("reads hasEpic exactly — untrimmed and case-sensitive", () => {
    expect(epicOf("hasEpic=TRUE")).toBeNull();
    expect(epicOf("hasEpic=%20true")).toBeNull();
    expect(epicOf("hasEpic=maybe")).toBeNull();
  });

  it("lets a named epic win, and skips a blank one", () => {
    expect(epicOf("epic=PFA-1&hasEpic=true")).toEqual({ kind: "is", identifier: "PFA-1" });
    expect(epicOf("epic=&hasEpic=true")).toEqual({ kind: "any" });
  });

  it("writes every arm, so switching one clears the others", () => {
    expect(serialize("?epic=PFA-1", epicToParams({ kind: "none" }))).toBe("?hasEpic=false");
    expect(serialize("?hasEpic=false", epicToParams({ kind: "is", identifier: "PFA-1" }))).toBe("?epic=PFA-1");
    expect(serialize("?epic=PFA-1", epicToParams(null))).toBe("");
  });

  it("round-trips every arm", () => {
    for (const epic of [
      { kind: "is", identifier: "PFA-1" },
      { kind: "isNot", identifier: "PFA-1" },
      { kind: "any" },
      { kind: "none" },
      null,
    ] as const) {
      expect(epicOf(serialize(epicToParams(epic)))).toEqual(epic);
    }
  });
});

describe("writing", () => {
  it("keeps hasEpic=false, which is a filter and not an absence", () => {
    // `hasEpic` has no default, and nuqs only clears a key whose parser has
    // one. Given `parseAsBoolean.withDefault(false)` this would be "" and the
    // "in no epic" filter would vanish from every saved view silently.
    expect(FILTER_PARSERS.hasEpic).not.toHaveProperty("defaultValue");
    expect(serialize({ hasEpic: "false" })).toBe("?hasEpic=false");
  });

  it("leaves a value that equals the default out of the URL", () => {
    expect(serialize({ group: "status" })).toBe("");
    expect(serialize({ legacy: true })).toBe("");
    expect(serialize({ group: "epic" })).toBe("?group=epic");
  });

  it("leaves a reordered but identical column set out, via its own eq", () => {
    expect(serialize({ cols: [...DEFAULT_COLUMNS].reverse() })).toBe("");
  });

  it("writes one comma-joined occurrence rather than a repeated key", () => {
    // A multi parser writes an occurrence per array element, so serialising the
    // values raw would give `?state=a&state=b`. One joined entry keeps the
    // address bar the shape it has always been.
    //
    // The comma is raw here where `URLSearchParams.toString()` percent-encodes
    // it. That difference reaches the address bar only: a saved view's body is
    // built by `toListQuery`, which still goes through URLSearchParams. Both
    // forms read back identically, which the next test is the proof of.
    expect(serialize({ state: [A, B] })).toBe(`?state=${A},${B}`);
  });

  it("round-trips whichever way the comma was encoded", () => {
    expect(load(serialize({ state: [A, B] })).state).toEqual([A, B]);
    expect(load(`state=${A}%2C${B}`).state).toEqual([A, B]);
  });
});
