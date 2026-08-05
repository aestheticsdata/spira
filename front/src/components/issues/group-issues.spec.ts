import { groupIssues } from "@components/issues/group-issues";
import { describe, expect, it } from "vitest";

import type { IssueListItemDto, ProjectSummaryDto, WorkflowStateDto } from "@lib/api-types";

const PROJECT: ProjectSummaryDto = {
  id: "p1",
  key: "SPI",
  name: "Spira",
  icon: null,
  color: null,
};

/**
 * Positions deliberately disagree with `GROUP_ORDER`: the list groups by
 * `compareStatesForGrouping`, not by the state table's own order.
 */
const BACKLOG: WorkflowStateDto = {
  id: "s-backlog",
  name: "Backlog",
  type: "backlog",
  color: "#a6a8ae",
  position: 1,
};
const TODO: WorkflowStateDto = {
  id: "s-todo",
  name: "Todo",
  type: "unstarted",
  color: "#a6a8ae",
  position: 2,
};
const PROGRESS: WorkflowStateDto = {
  id: "s-progress",
  name: "In Progress",
  type: "started",
  color: "#c9a05a",
  position: 3,
};
const DONE: WorkflowStateDto = {
  id: "s-done",
  name: "Done",
  type: "completed",
  color: "#9aa3b2",
  position: 4,
};
const STATES = [BACKLOG, TODO, PROGRESS, DONE];

function makeIssue(id: string, state: WorkflowStateDto, overrides: Partial<IssueListItemDto> = {}): IssueListItemDto {
  return {
    id,
    identifier: `SPI-${id}`,
    legacyIdentifier: null,
    title: `Issue ${id}`,
    priority: 0,
    isEpic: false,
    epicId: null,
    epic: null,
    state,
    labels: [],
    project: PROJECT,
    epicProgress: null,
    sortOrder: 0,
    createdAt: "2026-07-28T09:00:00.000Z",
    updatedAt: "2026-07-28T09:00:00.000Z",
    ...overrides,
  };
}

describe("groupIssues — status mode", () => {
  it("orders groups by the grouping order, not by state position", () => {
    const issues = [makeIssue("1", DONE), makeIssue("2", BACKLOG), makeIssue("3", PROGRESS), makeIssue("4", TODO)];

    expect(groupIssues(issues, STATES, "status").map((group) => group.label)).toEqual([
      "In Progress",
      "Todo",
      "Backlog",
      "Done",
    ]);
  });

  it("drops states that hold no issue", () => {
    const groups = groupIssues([makeIssue("1", TODO)], STATES, "status");

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Todo");
    expect(groups[0].count).toBe(1);
  });

  it("returns no group at all for an empty list", () => {
    expect(groupIssues([], STATES, "status")).toEqual([]);
  });

  it("sorts epics first inside a group and keeps the incoming order otherwise", () => {
    const issues = [
      makeIssue("1", TODO),
      makeIssue("2", TODO, { isEpic: true }),
      makeIssue("3", TODO),
      makeIssue("4", TODO, { isEpic: true }),
    ];

    expect(groupIssues(issues, STATES, "status")[0].rows.map((row) => row.id)).toEqual(["2", "4", "1", "3"]);
  });

  it("gives every group the plain treatment and a 16px indent", () => {
    const [group] = groupIssues([makeIssue("1", TODO, { isEpic: true })], STATES, "status");

    expect(group).toMatchObject({
      kind: "status",
      identifier: null,
      legacy: null,
      progress: null,
      indent: 16,
    });
    expect(group.state).toBe(TODO);
  });

  it("does not mutate its inputs", () => {
    const issues = [makeIssue("1", DONE), makeIssue("2", PROGRESS)];
    const states = [...STATES];

    groupIssues(issues, states, "status");

    expect(issues.map((issue) => issue.id)).toEqual(["1", "2"]);
    expect(states).toEqual(STATES);
  });
});

describe("groupIssues — epic mode", () => {
  it("gives each epic a group carrying its identifier pair, its children and a 40px indent", () => {
    const epic = makeIssue("e1", PROGRESS, {
      isEpic: true,
      identifier: "SPI-1",
      legacyIdentifier: "COS-251",
      title: "Spira",
      epicProgress: { done: 1, total: 2 },
    });
    const groups = groupIssues(
      [epic, makeIssue("1", TODO, { epicId: "e1" }), makeIssue("2", DONE, { epicId: "e1" })],
      STATES,
      "epic",
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: "e1",
      kind: "epic",
      label: "Spira",
      identifier: "SPI-1",
      legacy: "COS-251",
      count: 2,
      progress: { done: 1, total: 2 },
      indent: 40,
    });
    expect(groups[0].rows.map((row) => row.id)).toEqual(["1", "2"]);
  });

  it("sorts children by their state's grouping order", () => {
    const epic = makeIssue("e1", PROGRESS, { isEpic: true });
    const children = [
      makeIssue("done", DONE, { epicId: "e1" }),
      makeIssue("backlog", BACKLOG, { epicId: "e1" }),
      makeIssue("progress", PROGRESS, { epicId: "e1" }),
    ];

    expect(groupIssues([epic, ...children], STATES, "epic")[0].rows.map((row) => row.id)).toEqual([
      "progress",
      "backlog",
      "done",
    ]);
  });

  it("keeps an epic with no children, and counts its progress from the rows when the API sent none", () => {
    const groups = groupIssues([makeIssue("e1", TODO, { isEpic: true })], STATES, "epic");

    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(0);
    expect(groups[0].rows).toEqual([]);
    expect(groups[0].progress).toEqual({ done: 0, total: 0 });
  });

  it("falls back to counting completed rows when the epic carries no progress", () => {
    const epic = makeIssue("e1", PROGRESS, { isEpic: true });
    const groups = groupIssues(
      [epic, makeIssue("1", DONE, { epicId: "e1" }), makeIssue("2", TODO, { epicId: "e1" })],
      STATES,
      "epic",
    );

    expect(groups[0].progress).toEqual({ done: 1, total: 2 });
  });

  it("collects issues with neither isEpic nor epicId into a trailing plain group", () => {
    const epic = makeIssue("e1", PROGRESS, { isEpic: true });
    const groups = groupIssues(
      [epic, makeIssue("1", TODO, { epicId: "e1" }), makeIssue("2", BACKLOG), makeIssue("3", DONE)],
      STATES,
      "epic",
    );

    expect(groups.map((group) => group.key)).toEqual(["e1", "no-epic"]);

    const [, noEpic] = groups;
    expect(noEpic).toMatchObject({
      kind: "status",
      label: "No epic",
      identifier: null,
      count: 2,
      indent: 16,
    });
    expect(noEpic.rows.map((row) => row.id)).toEqual(["2", "3"]);
  });

  it("omits the trailing group when every issue belongs to an epic", () => {
    const epic = makeIssue("e1", PROGRESS, { isEpic: true });

    expect(groupIssues([epic, makeIssue("1", TODO, { epicId: "e1" })], STATES, "epic").map((g) => g.key)).toEqual([
      "e1",
    ]);
  });

  it("returns no group at all for an empty list", () => {
    expect(groupIssues([], STATES, "epic")).toEqual([]);
  });
});
