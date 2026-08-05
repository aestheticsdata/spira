import {
  CANDIDATE_LIMIT,
  countedIssues,
  epicProgressLabel,
  matchCandidates,
} from "@components/issues/epic-children.util";
import { describe, expect, it } from "vitest";

import type { IssueListItemDto, WorkflowStateDto } from "@lib/api-types";

const STATE: WorkflowStateDto = {
  id: "s-todo",
  name: "Todo",
  type: "unstarted",
  color: "#a6a8ae",
  position: 2,
};

function issue(identifier: string, title: string, legacy: string | null = null): IssueListItemDto {
  return {
    id: `id-${identifier}`,
    identifier,
    legacyIdentifier: legacy,
    title,
    priority: 0,
    isEpic: false,
    epicId: null,
    epic: null,
    state: STATE,
    labels: [],
    project: { id: "p", key: identifier.split("-")[0], name: "Project", icon: null, color: null },
    epicProgress: null,
    sortOrder: 1000,
    archivedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

describe("countedIssues", () => {
  it("says none rather than zero", () => {
    expect(countedIssues(0)).toBe("No issues");
  });

  it("keeps the singular for one", () => {
    expect(countedIssues(1)).toBe("1 issue");
  });

  it("pluralises everything above one", () => {
    expect(countedIssues(2)).toBe("2 issues");
    expect(countedIssues(10)).toBe("10 issues");
  });
});

describe("epicProgressLabel", () => {
  it("names an epic with nothing in it, rather than reading as 0 of 0", () => {
    expect(epicProgressLabel(0, 0)).toBe("Empty epic");
  });

  it("says what the fraction counts", () => {
    expect(epicProgressLabel(7, 10)).toBe("7 of 10 issues completed");
  });

  it("agrees with the singular", () => {
    expect(epicProgressLabel(0, 1)).toBe("0 of 1 issue completed");
    expect(epicProgressLabel(1, 1)).toBe("1 of 1 issue completed");
  });
});

describe("matchCandidates", () => {
  const candidates = [
    issue("IKN-4", "Rework the header"),
    issue("IKN-9", "Ship the importer", "COS-177"),
    issue("IKN-12", "Header contrast pass"),
  ];

  it("offers everything before anything is typed", () => {
    expect(matchCandidates(candidates, "")).toEqual(candidates);
  });

  it("treats blank as untyped rather than as a search for a space", () => {
    expect(matchCandidates(candidates, "   ")).toEqual(candidates);
  });

  it("matches the identifier", () => {
    expect(matchCandidates(candidates, "IKN-9").map((entry) => entry.identifier)).toEqual(["IKN-9"]);
  });

  it("matches the title anywhere in it, not only at the start", () => {
    expect(matchCandidates(candidates, "header").map((entry) => entry.identifier)).toEqual(["IKN-4", "IKN-12"]);
  });

  it("matches the Linear identifier, which is the one an old commit message holds", () => {
    expect(matchCandidates(candidates, "cos-177").map((entry) => entry.identifier)).toEqual(["IKN-9"]);
  });

  it("ignores casing on both sides", () => {
    expect(matchCandidates(candidates, "SHIP")).toHaveLength(1);
    expect(matchCandidates(candidates, "ikn-4")).toHaveLength(1);
  });

  it("returns nothing when nothing matches", () => {
    expect(matchCandidates(candidates, "nowhere")).toEqual([]);
  });

  it("caps an untyped list so a big project does not open as a wall of buttons", () => {
    const many = Array.from({ length: CANDIDATE_LIMIT + 5 }, (_, index) => issue(`IKN-${index}`, `Issue ${index}`));

    expect(matchCandidates(many, "")).toHaveLength(CANDIDATE_LIMIT);
  });

  it("caps a matched list too", () => {
    const many = Array.from({ length: CANDIDATE_LIMIT + 5 }, (_, index) => issue(`IKN-${index}`, `Issue ${index}`));

    expect(matchCandidates(many, "issue")).toHaveLength(CANDIDATE_LIMIT);
  });

  it("has nothing to offer from an empty set", () => {
    expect(matchCandidates([], "anything")).toEqual([]);
  });
});
