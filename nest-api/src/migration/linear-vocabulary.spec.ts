import {
  dateFrom,
  labelColourFor,
  labelsFrom,
  priorityFor,
  projectKeyFor,
  stateFor,
} from "@migration/linear-vocabulary";

describe("projectKeyFor", () => {
  it("maps every confirmed project", () => {
    expect(projectKeyFor("PFA")).toBe("PFA");
    expect(projectKeyFor("Zeus")).toBe("ZEU");
    expect(projectKeyFor("3D engine")).toBe("3DE");
    expect(projectKeyFor("Iknos")).toBe("IKN");
    expect(projectKeyFor("Exalus")).toBe("EXA");
    expect(projectKeyFor("Spira")).toBe("SPI");
    expect(projectKeyFor("Worldweathr")).toBe("WEA");
    expect(projectKeyFor("BKMK")).toBe("BMK");
  });

  it("knows 1991chat by both its names, since 199 is not a usable key", () => {
    expect(projectKeyFor("1991chat")).toBe("CHT");
    expect(projectKeyFor("1991chat — Chat front-end")).toBe("CHT");
  });

  it("is blind to casing and punctuation, which Linear may change under us", () => {
    expect(projectKeyFor("3d ENGINE")).toBe("3DE");
    expect(projectKeyFor("  Zeus  ")).toBe("ZEU");
  });

  it("refuses a project it has not been told about", () => {
    // The whole point of the table: an unconfirmed project stops the import
    // rather than inventing a key for three hundred issues.
    expect(projectKeyFor("Some New Thing")).toBeNull();
  });
});

describe("stateFor", () => {
  it("maps the two the ticket calls out", () => {
    expect(stateFor("Verify")).toBe("In Review");
    expect(stateFor("Duplicate")).toBe("Canceled");
  });

  it("passes the identities through", () => {
    expect(stateFor("Backlog")).toBe("Backlog");
    expect(stateFor("Todo")).toBe("Todo");
    expect(stateFor("In Progress")).toBe("In Progress");
    expect(stateFor("Done")).toBe("Done");
    expect(stateFor("Canceled")).toBe("Canceled");
  });

  it("takes either spelling of cancelled", () => {
    expect(stateFor("Cancelled")).toBe("Canceled");
  });

  it("refuses a state it does not know instead of dropping it in Backlog", () => {
    expect(stateFor("Triage")).toBeNull();
  });
});

describe("priorityFor", () => {
  it("reads Linear's words", () => {
    expect(priorityFor("Urgent")).toBe(1);
    expect(priorityFor("High")).toBe(2);
    expect(priorityFor("Medium")).toBe(3);
    expect(priorityFor("Low")).toBe(4);
    expect(priorityFor("No priority")).toBe(0);
  });

  it("reads the numbers too, because which one an export writes is not documented", () => {
    expect(priorityFor("0")).toBe(0);
    expect(priorityFor("4")).toBe(4);
  });

  it("treats an empty cell as no priority", () => {
    expect(priorityFor("")).toBe(0);
  });

  it("refuses rather than truncates", () => {
    // `parseInt("3 (Medium)")` is 3. `Number` is NaN, which is the answer that
    // gets printed in the report instead of silently becoming a real priority.
    expect(priorityFor("3 (Medium)")).toBeNull();
    expect(priorityFor("2.5")).toBeNull();
    expect(priorityFor("9")).toBeNull();
  });
});

describe("labelsFrom", () => {
  it("unpacks a multi-label cell", () => {
    expect(labelsFrom("Feature,Improvement")).toEqual(["Feature", "Improvement"]);
  });

  it("does not care whether the export pads the separator", () => {
    expect(labelsFrom("Feature, Improvement , Bug")).toEqual(["Feature", "Improvement", "Bug"]);
  });

  it("takes a semicolon too, since the separator is a property of the export", () => {
    expect(labelsFrom("Feature;Improvement")).toEqual(["Feature", "Improvement"]);
  });

  it("keeps the first spelling of a label repeated in another case", () => {
    // `Label.name` is unique — Bug and bug cannot both be written.
    expect(labelsFrom("Bug,bug,BUG")).toEqual(["Bug"]);
  });

  it("gives an empty cell no labels rather than one blank one", () => {
    expect(labelsFrom("")).toEqual([]);
    expect(labelsFrom(", ,")).toEqual([]);
  });
});

describe("labelColourFor", () => {
  it("gives one label the same colour on every run", () => {
    // Not arrival order: importing twice, or into a workspace where some labels
    // already exist, must not repaint them.
    expect(labelColourFor("de-mock")).toBe(labelColourFor("de-mock"));
    expect(labelColourFor("de-mock")).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("dateFrom", () => {
  it("reads the ISO shape Linear exports", () => {
    expect(dateFrom("2026-07-28T22:59:53.006Z")?.toISOString()).toBe("2026-07-28T22:59:53.006Z");
  });

  it("reads a space-separated timestamp as UTC, not as wherever it is run", () => {
    // The same export must not land on different timestamps on two machines.
    expect(dateFrom("2026-07-28 22:59:53")?.toISOString()).toBe("2026-07-28T22:59:53.000Z");
  });

  it("reads a date on its own", () => {
    expect(dateFrom("2026-07-28")?.toISOString()).toBe("2026-07-28T00:00:00.000Z");
  });

  it("keeps an explicit offset", () => {
    expect(dateFrom("2026-07-28T22:59:53+02:00")?.toISOString()).toBe("2026-07-28T20:59:53.000Z");
  });

  it("refuses anything that is not shaped like a date", () => {
    expect(dateFrom("")).toBeNull();
    expect(dateFrom("Done")).toBeNull();
    // The dangerous one: `new Date("2026")` is a valid January the first, so a
    // column that turned out to hold years would import a whole workspace
    // created on New Year's Day without one row failing.
    expect(dateFrom("2026")).toBeNull();
    expect(dateFrom("28/07/2026")).toBeNull();
  });
});
