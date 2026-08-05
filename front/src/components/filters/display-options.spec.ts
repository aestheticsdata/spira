import {
  applyDisplayToApiQuery,
  countChangedDisplay,
  DEFAULT_COLUMNS,
  DEFAULT_DISPLAY,
  displayOptionsToParams,
  parseDisplayOptions,
  showsColumn,
  toggleColumn,
} from "@components/filters/display-options";
import { describe, expect, it } from "vitest";

import type { DisplayOptions } from "@components/filters/display-options";

const url = (query: string) => new URLSearchParams(query);

describe("parseDisplayOptions", () => {
  it("reads the defaults out of an empty query", () => {
    expect(parseDisplayOptions(url(""))).toEqual(DEFAULT_DISPLAY);
  });

  it("reads each grouping mode", () => {
    for (const group of ["status", "epic", "priority", "project", "none"] as const) {
      expect(parseDisplayOptions(url(`group=${group}`)).group).toBe(group);
    }
  });

  it("falls back to the default on a grouping it does not know", () => {
    expect(parseDisplayOptions(url("group=sideways")).group).toBe("status");
  });

  it("reads the ordering, and refuses one the display does not offer", () => {
    expect(parseDisplayOptions(url("order=priority")).order).toBe("priority");
    // The API accepts `title`; this menu does not, so it is not a valid URL.
    expect(parseDisplayOptions(url("order=title")).order).toBe("manual");
  });

  it("reads a column set, sorted", () => {
    expect(parseDisplayOptions(url("cols=updated,identifier")).columns).toEqual(["identifier", "updated"]);
  });

  it("drops column names it does not recognise", () => {
    expect(parseDisplayOptions(url("cols=identifier,assignee")).columns).toEqual(["identifier"]);
  });

  it("treats an empty column set as the default rather than as a blank row", () => {
    // A URL truncated in a chat window should still render a usable list.
    expect(parseDisplayOptions(url("cols=")).columns).toEqual(DEFAULT_COLUMNS);
    expect(parseDisplayOptions(url("cols=nonsense")).columns).toEqual(DEFAULT_COLUMNS);
  });

  it("reads the booleans, and ignores a value that is not one", () => {
    expect(parseDisplayOptions(url("empty=true&legacy=false")).emptyGroups).toBe(true);
    expect(parseDisplayOptions(url("empty=true&legacy=false")).legacy).toBe(false);
    expect(parseDisplayOptions(url("legacy=perhaps")).legacy).toBe(true);
  });

  it("reads a Next searchParams object as well as URLSearchParams", () => {
    expect(parseDisplayOptions({ group: "epic", cols: ["identifier", "status"] }).group).toBe("epic");
  });
});

describe("displayOptionsToParams", () => {
  it("writes nothing when nothing differs from the default", () => {
    expect(displayOptionsToParams(DEFAULT_DISPLAY).toString()).toBe("");
  });

  it("writes only what changed", () => {
    expect(displayOptionsToParams({ ...DEFAULT_DISPLAY, group: "epic" }).toString()).toBe("group=epic");
  });

  it("omits the column set while it matches the default, whatever the order", () => {
    const shuffled = { ...DEFAULT_DISPLAY, columns: [...DEFAULT_COLUMNS].reverse() };
    expect(displayOptionsToParams(shuffled).toString()).toBe("");
  });

  it("round-trips a fully non-default set", () => {
    const display: DisplayOptions = {
      group: "priority",
      order: "updated",
      columns: ["created", "identifier"],
      emptyGroups: true,
      legacy: false,
    };

    expect(parseDisplayOptions(displayOptionsToParams(display))).toEqual(display);
  });
});

describe("applyDisplayToApiQuery", () => {
  it("leaves the query alone on the default ordering", () => {
    const params = new URLSearchParams("project=PFA");
    expect(applyDisplayToApiQuery(params, DEFAULT_DISPLAY).toString()).toBe("project=PFA");
  });

  it("sends the ordering to the server, since the browser only holds a page", () => {
    const params = new URLSearchParams("project=PFA");
    expect(applyDisplayToApiQuery(params, { ...DEFAULT_DISPLAY, order: "created" }).get("orderBy")).toBe("created");
  });
});

describe("toggleColumn", () => {
  it("turns a column off and back on", () => {
    const without = toggleColumn(DEFAULT_DISPLAY, "labels");
    expect(showsColumn(without, "labels")).toBe(false);

    expect(showsColumn(toggleColumn(without, "labels"), "labels")).toBe(true);
  });

  it("keeps the result sorted, so the URL stays canonical", () => {
    const display = toggleColumn({ ...DEFAULT_DISPLAY, columns: ["updated"] }, "created");
    expect(display.columns).toEqual(["created", "updated"]);
  });

  it("refuses to turn off the last column", () => {
    const one: DisplayOptions = { ...DEFAULT_DISPLAY, columns: ["identifier"] };
    // Otherwise the list becomes bare titles with no control left to undo it.
    expect(toggleColumn(one, "identifier")).toEqual(one);
  });
});

describe("countChangedDisplay", () => {
  it("is zero on the default", () => {
    expect(countChangedDisplay(DEFAULT_DISPLAY)).toBe(0);
  });

  it("counts the column set once however many columns moved", () => {
    expect(countChangedDisplay({ ...DEFAULT_DISPLAY, columns: ["identifier"] })).toBe(1);
  });

  it("counts each setting separately", () => {
    const display: DisplayOptions = {
      group: "none",
      order: "created",
      columns: ["identifier"],
      emptyGroups: true,
      legacy: false,
    };

    expect(countChangedDisplay(display)).toBe(5);
  });
});
