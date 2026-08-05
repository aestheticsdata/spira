import { linkedIdentifiers, RELATION_KINDS, relationTargets } from "@components/issues/relations.util";
import { describe, expect, it } from "vitest";

import type { IssueDetailDto, RelationRefDto, SearchResultDto, WorkflowStateDto } from "@lib/api-types";

const STATE: WorkflowStateDto = {
  id: "s-backlog",
  name: "Backlog",
  type: "backlog",
  color: "#a6a8ae",
  position: 1,
};

function ref(identifier: string): RelationRefDto {
  return {
    id: identifier,
    relationId: `rel-${identifier}`,
    identifier,
    legacyIdentifier: null,
    title: `Issue ${identifier}`,
    state: STATE,
  };
}

function result(identifier: string, legacy: string | null = null): SearchResultDto {
  return {
    identifier,
    legacyIdentifier: legacy,
    title: `Issue ${identifier}`,
    projectKey: identifier.split("-")[0],
    state: STATE,
    matchedOn: legacy === null ? "identifier" : "legacy",
  };
}

const EMPTY: IssueDetailDto["relations"] = { blocks: [], blockedBy: [], related: [] };

describe("RELATION_KINDS", () => {
  it("offers exactly the three directions the API accepts", () => {
    expect(RELATION_KINDS.map((entry) => entry.kind)).toEqual(["blocked_by", "blocks", "related"]);
  });
});

describe("linkedIdentifiers", () => {
  it("collects every direction into one set", () => {
    const linked = linkedIdentifiers({
      blockedBy: [ref("SPI-1")],
      blocks: [ref("SPI-2")],
      related: [ref("SPI-3")],
    });

    expect([...linked].sort()).toEqual(["SPI-1", "SPI-2", "SPI-3"]);
  });

  it("is empty when nothing is linked", () => {
    expect(linkedIdentifiers(EMPTY).size).toBe(0);
  });

  it("uppercases, so a lowercased identifier still matches", () => {
    expect(linkedIdentifiers({ ...EMPTY, blocks: [ref("spi-9")] }).has("SPI-9")).toBe(true);
  });
});

describe("relationTargets", () => {
  it("drops the issue itself, whatever the casing", () => {
    const targets = relationTargets([result("SPI-24"), result("SPI-25")], "spi-24", new Set());

    expect(targets.map((target) => target.result.identifier)).toEqual(["SPI-25"]);
  });

  it("keeps an already-linked result and flags it rather than hiding it", () => {
    const targets = relationTargets([result("SPI-25"), result("SPI-26")], "SPI-24", new Set(["SPI-25"]));

    expect(targets).toEqual([
      { result: result("SPI-25"), linked: true },
      { result: result("SPI-26"), linked: false },
    ]);
  });

  it("matches on the live identifier even when the hit came from the legacy one", () => {
    // `matchedOn: "legacy"` still carries the live identifier, which is what a
    // relation would be written against.
    const targets = relationTargets([result("PFA-41", "COS-177")], "SPI-24", new Set(["PFA-41"]));

    expect(targets[0].linked).toBe(true);
  });

  it("returns nothing for an empty result set", () => {
    expect(relationTargets([], "SPI-24", new Set())).toEqual([]);
  });
});
