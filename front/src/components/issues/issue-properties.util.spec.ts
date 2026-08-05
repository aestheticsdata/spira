import { parentEpicOptions, typeChangeBlocker } from "@components/issues/issue-properties.util";
import { describe, expect, it } from "vitest";

import type { IssueListItemDto, IssueRefDto, WorkflowStateDto } from "@lib/api-types";

const STATE: WorkflowStateDto = {
  id: "s-backlog",
  name: "Backlog",
  type: "backlog",
  color: "#a6a8ae",
  position: 1,
};

function epicRow(id: string, identifier: string): IssueListItemDto {
  return {
    id,
    identifier,
    legacyIdentifier: null,
    title: `Epic ${identifier}`,
    priority: 0,
    isEpic: true,
    epicId: null,
    epic: null,
    state: STATE,
    labels: [],
    project: { id: "p1", key: "SPI", name: "Spira", icon: null, color: null },
    epicProgress: { done: 0, total: 0 },
    sortOrder: 0,
    archivedAt: null,
    createdAt: "2026-08-05T09:00:00.000Z",
    updatedAt: "2026-08-05T09:00:00.000Z",
  };
}

const EPICS = [epicRow("e1", "SPI-1"), epicRow("e2", "SPI-2")];

describe("parentEpicOptions", () => {
  it("offers every epic to an ordinary issue", () => {
    expect(parentEpicOptions({ id: "i1", isEpic: false }, EPICS).map((epic) => epic.id)).toEqual(["e1", "e2"]);
  });

  it("never offers an issue itself", () => {
    expect(parentEpicOptions({ id: "e1", isEpic: false }, EPICS).map((epic) => epic.id)).toEqual(["e2"]);
  });

  it("offers nothing to an epic, which cannot have a parent", () => {
    expect(parentEpicOptions({ id: "e9", isEpic: true }, EPICS)).toEqual([]);
  });
});

describe("typeChangeBlocker", () => {
  const base = { identifier: "SPI-24", isEpic: false, epicId: null, epic: null, epicProgress: null };
  const parent: IssueRefDto = {
    id: "e1",
    identifier: "SPI-1",
    legacyIdentifier: null,
    title: "Spira",
    state: STATE,
  };

  it("lets a loose issue become an epic", () => {
    expect(typeChangeBlocker(base)).toBeNull();
  });

  it("refuses to promote an issue that already belongs to an epic, and names it", () => {
    expect(typeChangeBlocker({ ...base, epicId: "e1", epic: parent })).toBe(
      "SPI-24 belongs to epic SPI-1 — take it out of that epic before making it an epic itself",
    );
  });

  it("falls back to the id when the parent chip is missing", () => {
    expect(typeChangeBlocker({ ...base, epicId: "e1", epic: null })).toMatch(/belongs to epic e1/);
  });

  it("lets a childless epic become an ordinary issue", () => {
    expect(typeChangeBlocker({ ...base, isEpic: true, epicProgress: { done: 0, total: 0 } })).toBeNull();
  });

  it("refuses to demote an epic with children, and counts them", () => {
    expect(typeChangeBlocker({ ...base, isEpic: true, epicProgress: { done: 1, total: 3 } })).toBe(
      "SPI-24 still has 3 child issues — move them out before it stops being an epic",
    );
  });

  it("says child issue in the singular, as the service does", () => {
    expect(typeChangeBlocker({ ...base, isEpic: true, epicProgress: { done: 0, total: 1 } })).toMatch(
      /still has 1 child issue —/,
    );
  });
});
