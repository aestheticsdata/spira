import { reorderViews, splitViews } from "@components/views/saved-views.util";
import { describe, expect, it } from "vitest";

import type { SavedViewDto } from "@lib/api-types";

function project(key: string) {
  return { id: `p-${key}`, key, name: key, icon: null, color: null };
}

function view(id: string, position: number, projectKey: string | null = null): SavedViewDto {
  return {
    id,
    name: `View ${id}`,
    icon: null,
    project: projectKey === null ? null : project(projectKey),
    query: "",
    position,
    invalid: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

describe("splitViews", () => {
  const views = [view("w1", 0), view("s1", 0, "SPI"), view("p1", 0, "PFA"), view("w2", 1)];

  it("puts the unscoped ones on the workspace side", () => {
    expect(splitViews(views).workspace.map((entry) => entry.id)).toEqual(["w1", "w2"]);
  });

  it("returns every project's views when no project is named", () => {
    expect(splitViews(views).project.map((entry) => entry.id)).toEqual(["s1", "p1"]);
  });

  it("narrows to one project when a key is given", () => {
    expect(splitViews(views, "SPI").project.map((entry) => entry.id)).toEqual(["s1"]);
  });

  it("matches the key whatever case it arrives in", () => {
    expect(splitViews(views, "spi").project.map((entry) => entry.id)).toEqual(["s1"]);
  });

  it("leaves the workspace half alone when narrowing", () => {
    // A workspace view applies inside a project too — narrowing must not hide it.
    expect(splitViews(views, "SPI").workspace).toHaveLength(2);
  });

  it("copes with nothing saved yet", () => {
    expect(splitViews([])).toEqual({ workspace: [], project: [] });
  });
});

describe("reorderViews", () => {
  const scope = [view("a", 0), view("b", 1), view("c", 2)];

  it("swaps a view with the one above it", () => {
    expect(reorderViews(scope, "b", -1)).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 1 },
    ]);
  });

  it("swaps a view with the one below it", () => {
    expect(reorderViews(scope, "b", 1)).toEqual([
      { id: "c", position: 1 },
      { id: "b", position: 2 },
    ]);
  });

  it("writes nothing at the top", () => {
    expect(reorderViews(scope, "a", -1)).toEqual([]);
  });

  it("writes nothing at the bottom", () => {
    expect(reorderViews(scope, "c", 1)).toEqual([]);
  });

  it("writes nothing for a view it does not hold", () => {
    expect(reorderViews(scope, "nope", 1)).toEqual([]);
  });

  it("moves within its own scope, leaving the other one untouched", () => {
    const mixed = [view("w1", 0), view("w2", 1), view("s1", 0, "SPI"), view("s2", 1, "SPI")];

    // The workspace views sit at 0 and 1, and so do SPI's; a move must not
    // reach across and renumber the other list.
    expect(reorderViews(mixed, "s2", -1)).toEqual([
      { id: "s2", position: 0 },
      { id: "s1", position: 1 },
    ]);
  });

  it("renumbers rather than swapping, so tied positions still move", () => {
    // The API allows ties on purpose — a reorder writes several rows and a
    // unique index would fail halfway. Swapping two 0s would do nothing.
    const tied = [view("a", 0), view("b", 0), view("c", 0)];

    expect(reorderViews(tied, "c", -1)).toEqual([
      { id: "c", position: 1 },
      { id: "b", position: 2 },
    ]);
  });

  it("orders by position then id, as the API does", () => {
    const unsorted = [view("c", 2), view("a", 0), view("b", 1)];

    expect(reorderViews(unsorted, "a", 1)).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 1 },
    ]);
  });
});
