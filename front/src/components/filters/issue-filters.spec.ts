import {
  countActiveFilters,
  EMPTY_FILTERS,
  hasActiveFilters,
  issueFiltersToApiQuery,
  issueFiltersToParams,
  labelMode,
  parseIssueFilters,
  setLabelMode,
  toggle,
} from "@components/filters/issue-filters";
import { describe, expect, it } from "vitest";

import type { IssueFilters } from "@components/filters/issue-filters";

const url = (query: string) => new URLSearchParams(query);

describe("parseIssueFilters", () => {
  it("reads nothing out of an empty query", () => {
    expect(parseIssueFilters(url(""))).toEqual(EMPTY_FILTERS);
  });

  it("splits a comma-joined list", () => {
    expect(parseIssueFilters(url("state=a,b")).states).toEqual(["a", "b"]);
  });

  it("accepts a repeated param as well, since the API does", () => {
    expect(parseIssueFilters(url("state=a&state=b")).states).toEqual(["a", "b"]);
  });

  it("sorts and de-duplicates, so the same set is always the same link", () => {
    expect(parseIssueFilters(url("label=c,a,b,a")).labels).toEqual(["a", "b", "c"]);
  });

  it("reads a Next searchParams object as well as URLSearchParams", () => {
    const filters = parseIssueFilters({ state: ["a", "b"], priority: "1", label: undefined });

    expect(filters.states).toEqual(["a", "b"]);
    expect(filters.priorities).toEqual([1]);
    expect(filters.labels).toEqual([]);
  });

  it("drops priorities that are not real priorities", () => {
    expect(parseIssueFilters(url("priority=0,4,9,-1,x")).priorities).toEqual([0, 4]);
  });

  it("keeps include and exclude labels apart", () => {
    const filters = parseIssueFilters(url("label=a&excludeLabel=b"));

    expect(filters.labels).toEqual(["a"]);
    expect(filters.excludeLabels).toEqual(["b"]);
  });

  describe("the epic arms", () => {
    it("reads `is` from an identifier, uppercased", () => {
      expect(parseIssueFilters(url("epic=pfa-1")).epic).toEqual({ kind: "is", identifier: "PFA-1" });
    });

    it("reads `is not`", () => {
      expect(parseIssueFilters(url("excludeEpic=PFA-1")).epic).toEqual({ kind: "isNot", identifier: "PFA-1" });
    });

    it("reads `any` and `none` from hasEpic", () => {
      expect(parseIssueFilters(url("hasEpic=true")).epic).toEqual({ kind: "any" });
      expect(parseIssueFilters(url("hasEpic=false")).epic).toEqual({ kind: "none" });
    });

    it("ignores a hasEpic that is neither", () => {
      expect(parseIssueFilters(url("hasEpic=maybe")).epic).toBeNull();
    });

    it("lets a named epic win over a cardinality, since it is the narrower ask", () => {
      expect(parseIssueFilters(url("epic=PFA-1&hasEpic=true")).epic).toEqual({ kind: "is", identifier: "PFA-1" });
    });
  });
});

describe("issueFiltersToParams", () => {
  it("writes nothing at all when nothing is filtered", () => {
    expect(issueFiltersToParams(EMPTY_FILTERS).toString()).toBe("");
  });

  it("round-trips every filter", () => {
    const filters: IssueFilters = {
      states: ["s1", "s2"],
      priorities: [1, 3],
      labels: ["l1"],
      excludeLabels: ["l2"],
      epic: { kind: "isNot", identifier: "PFA-1" },
    };

    expect(parseIssueFilters(issueFiltersToParams(filters))).toEqual(filters);
  });

  it.each([
    [{ kind: "is" as const, identifier: "PFA-1" }, "epic=PFA-1"],
    [{ kind: "isNot" as const, identifier: "PFA-1" }, "excludeEpic=PFA-1"],
    [{ kind: "any" as const }, "hasEpic=true"],
    [{ kind: "none" as const }, "hasEpic=false"],
  ])("writes the %s arm as %s", (epic, expected) => {
    expect(issueFiltersToParams({ ...EMPTY_FILTERS, epic }).toString()).toBe(expected);
  });
});

describe("issueFiltersToApiQuery", () => {
  it("is the URL query plus the project", () => {
    const filters: IssueFilters = { ...EMPTY_FILTERS, states: ["s1"], labels: ["l1"] };
    const query = issueFiltersToApiQuery(filters, "PFA");

    expect(query.get("project")).toBe("PFA");
    expect(query.get("state")).toBe("s1");
    expect(query.get("label")).toBe("l1");
  });

  it("asks for the whole project when nothing is filtered", () => {
    expect(issueFiltersToApiQuery(EMPTY_FILTERS, "PFA").toString()).toBe("project=PFA");
  });
});

describe("countActiveFilters", () => {
  it("counts a list once however many entries it holds", () => {
    expect(countActiveFilters({ ...EMPTY_FILTERS, states: ["a", "b", "c"] })).toBe(1);
  });

  it("counts each kind separately", () => {
    const filters: IssueFilters = {
      states: ["a"],
      priorities: [1],
      labels: ["l1"],
      excludeLabels: ["l2"],
      epic: { kind: "any" },
    };

    expect(countActiveFilters(filters)).toBe(5);
    expect(hasActiveFilters(filters)).toBe(true);
  });

  it("is zero on an empty set", () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });
});

describe("toggle", () => {
  it("adds what is missing and drops what is there", () => {
    expect(toggle(["a"], "b")).toEqual(["a", "b"]);
    expect(toggle(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("setLabelMode", () => {
  it("moves a label from include to exclude rather than holding both", () => {
    const included = setLabelMode(EMPTY_FILTERS, "l1", "include");
    const excluded = setLabelMode(included, "l1", "exclude");

    expect(excluded.labels).toEqual([]);
    expect(excluded.excludeLabels).toEqual(["l1"]);
  });

  it("clears a label entirely", () => {
    const included = setLabelMode(EMPTY_FILTERS, "l1", "include");
    const off = setLabelMode(included, "l1", "off");

    expect(off).toEqual(EMPTY_FILTERS);
  });

  it("leaves the other labels alone", () => {
    const filters = setLabelMode(setLabelMode(EMPTY_FILTERS, "l1", "include"), "l2", "exclude");

    expect(filters.labels).toEqual(["l1"]);
    expect(filters.excludeLabels).toEqual(["l2"]);
  });

  it("reports the mode it set", () => {
    const filters = setLabelMode(EMPTY_FILTERS, "l1", "exclude");

    expect(labelMode(filters, "l1")).toBe("exclude");
    expect(labelMode(filters, "l2")).toBe("off");
  });
});
