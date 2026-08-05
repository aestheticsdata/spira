import { DEFAULT_DISPLAY } from "@components/filters/display-options";
import { EMPTY_FILTERS } from "@components/filters/issue-filters";
import { normaliseListQuery, sameListQuery, toListQuery } from "@components/filters/list-query";
import { describe, expect, it } from "vitest";

const STATE_A = "11111111-1111-4111-8111-111111111111";
const STATE_B = "22222222-2222-4222-8222-222222222222";

describe("toListQuery", () => {
  it("writes nothing at all for the plain list", () => {
    expect(toListQuery(EMPTY_FILTERS, DEFAULT_DISPLAY)).toBe("");
  });

  it("carries the filters and the display in one string", () => {
    const query = toListQuery({ ...EMPTY_FILTERS, priorities: [1] }, { ...DEFAULT_DISPLAY, group: "epic" });

    expect(new URLSearchParams(query).get("priority")).toBe("1");
    expect(new URLSearchParams(query).get("group")).toBe("epic");
  });
});

describe("normaliseListQuery", () => {
  it("takes a leading ?, as window.location.search carries one", () => {
    expect(normaliseListQuery("?group=epic")).toBe("group=epic");
  });

  it("reads a repeated key and a comma-joined one as the same list", () => {
    expect(normaliseListQuery(`state=${STATE_A}&state=${STATE_B}`)).toBe(
      normaliseListQuery(`state=${STATE_A},${STATE_B}`),
    );
  });

  it("is blind to the order the keys were written in", () => {
    expect(normaliseListQuery("group=epic&priority=1")).toBe(normaliseListQuery("priority=1&group=epic"));
  });

  it("drops a key neither parser knows, `view` included", () => {
    // This is what lets the address bar — which carries the active view's id —
    // be compared against a stored query without stripping it by hand.
    expect(normaliseListQuery("group=epic&view=abc")).toBe(normaliseListQuery("group=epic"));
  });

  it("drops a default written out in full", () => {
    // The API stores what it was given; a client that spelt out the default
    // still means the plain list.
    expect(normaliseListQuery("group=status&order=manual&legacy=true")).toBe("");
  });

  it("is idempotent", () => {
    const once = normaliseListQuery(`state=${STATE_B},${STATE_A}&group=priority`);

    expect(normaliseListQuery(once)).toBe(once);
  });
});

describe("sameListQuery", () => {
  it("sees through the API's alphabetical spelling", () => {
    // The API stores `group` before `priority`; these serialisers write the
    // filters first. Same view, different string — the case this exists for.
    expect(sameListQuery("group=priority&priority=1", "priority=1&group=priority")).toBe(true);
  });

  it("treats the empty query and an all-defaults query as one view", () => {
    expect(sameListQuery("", "group=status&order=manual")).toBe(true);
  });

  it("tells a real change apart", () => {
    expect(sameListQuery("priority=1", "priority=2")).toBe(false);
    expect(sameListQuery("group=epic", "group=priority")).toBe(false);
  });

  it("notices a filter dropped", () => {
    expect(sameListQuery("priority=1&group=epic", "group=epic")).toBe(false);
  });

  it("ignores the active view marker on one side only", () => {
    expect(sameListQuery("priority=1&view=abc", "priority=1")).toBe(true);
  });
});
