import { parse } from "csv-parse/sync";

import { resolveColumns } from "@migration/linear-columns.util";
import { EMPTY_WORKSPACE, errorsIn, planImport, warningsIn, writeOrder } from "@migration/linear-plan.util";

import type { ExistingWorkspace, ImportPlan } from "@migration/linear-plan.util";

const HEADER = "ID,Title,Description,Status,Priority,Project,Labels,Parent issue,Created,Updated,Completed,Canceled";

/** CSV quoting, so the fixtures below can be written as the values they mean. */
const cell = (value: string): string => `"${value.replace(/"/g, '""')}"`;

interface Row {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  project?: string;
  labels?: string;
  parent?: string;
  created?: string;
  updated?: string;
  completed?: string;
  canceled?: string;
}

const line = (row: Row): string =>
  [
    row.id,
    row.title ?? "A title",
    row.description ?? "",
    row.status ?? "Backlog",
    row.priority ?? "Medium",
    row.project ?? "PFA",
    row.labels ?? "",
    row.parent ?? "",
    row.created ?? "2026-07-01T09:00:00.000Z",
    row.updated ?? "",
    row.completed ?? "",
    row.canceled ?? "",
  ]
    .map(cell)
    .join(",");

/**
 * Everything goes through the real CSV parser, with the real column resolution
 * in front of it. A test that handed the planner a tidy `string[][]` would
 * prove nothing about the file the importer is actually pointed at — and the
 * file is where the quoting, the newlines and the fenced code live.
 */
function planFrom(csv: string, existing: ExistingWorkspace = EMPTY_WORKSPACE): ImportPlan {
  const rows = parse(csv, { bom: true, relax_column_count: true, skip_empty_lines: false, trim: false });
  const [header, ...body] = rows;
  return planImport(body, resolveColumns(header).index, existing);
}

const csv = (...rows: Row[]): string => [HEADER, ...rows.map(line)].join("\n");

// --------------------------------------------------------------------------
// Parsing: the things the ticket says break naive splitting, and quietly
// --------------------------------------------------------------------------
const FENCED = [
  "## Rules",
  "",
  "- Numbering restarts at 1 per project, ordered by creation date, oldest first.",
  '- The importer must not "helpfully" reflow this.',
  "",
  "```ts",
  "const priorities = [1, 2, 3];",
  'const label = "Improvement, Bug";',
  "```",
].join("\n");

describe("descriptions the export can carry", () => {
  it("keeps a fenced block with commas, quotes and newlines exactly as written", () => {
    const plan = planFrom(csv({ id: "COS-1", description: FENCED }));

    expect(plan.issues).toHaveLength(1);
    expect(plan.issues[0].description).toBe(FENCED);
  });

  it("does not let a description's commas leak into the next column", () => {
    // The failure a split on commas produces: the description eats `Status`,
    // and the row lands in whatever state the words happen to spell.
    const plan = planFrom(csv({ id: "COS-1", description: "one, two, three", status: "Done", project: "Zeus" }));

    expect(plan.issues[0].state).toBe("Done");
    expect(plan.issues[0].projectKey).toBe("ZEU");
  });

  it("does not let a description's newlines split one issue into several", () => {
    const plan = planFrom(csv({ id: "COS-1", description: "line one\nline two\nline three" }, { id: "COS-2" }));

    expect(plan.report.rowsRead).toBe(2);
    expect(plan.issues.map((issue) => issue.legacyIdentifier)).toEqual(["COS-1", "COS-2"]);
  });

  it("gives an empty description null rather than an empty string", () => {
    expect(planFrom(csv({ id: "COS-1" })).issues[0].description).toBeNull();
    expect(planFrom(csv({ id: "COS-1", description: "   \n  " })).issues[0].description).toBeNull();
  });

  it("keeps leading whitespace, which is how markdown spells a code block", () => {
    // Trimming this would turn an indented first line into a paragraph — a
    // change to somebody's description that nothing anywhere would report.
    const indented = "    const indented = true;\n\nA paragraph after it.";

    expect(planFrom(csv({ id: "COS-1", description: indented })).issues[0].description).toBe(indented);
  });

  it("ignores the blank row a trailing newline leaves behind", () => {
    const plan = planFrom(`${csv({ id: "COS-1" })}\n`);

    expect(plan.report.rowsRead).toBe(1);
    expect(plan.report.malformed).toEqual([]);
  });
});

describe("labels", () => {
  it("reads a multi-label row into every label it names", () => {
    const plan = planFrom(csv({ id: "COS-1", labels: "Feature,Improvement,Bug" }));

    expect(plan.issues[0].labels).toEqual(["Feature", "Improvement", "Bug"]);
  });

  it("counts labels across the whole export, for the report", () => {
    const plan = planFrom(
      csv({ id: "COS-1", labels: "Feature,Bug" }, { id: "COS-2", labels: "Feature" }, { id: "COS-3", labels: "" }),
    );

    expect(plan.report.labels).toEqual([
      { name: "Feature", count: 2 },
      { name: "Bug", count: 1 },
    ]);
  });
});

// --------------------------------------------------------------------------
// Mapping
// --------------------------------------------------------------------------
describe("numbering", () => {
  it("restarts at 1 per project, oldest first", () => {
    const plan = planFrom(
      csv(
        { id: "COS-40", project: "PFA", created: "2026-07-20T09:00:00.000Z" },
        { id: "COS-5", project: "PFA", created: "2026-07-02T09:00:00.000Z" },
        { id: "COS-9", project: "Zeus", created: "2026-07-03T09:00:00.000Z" },
      ),
    );

    const byLegacy = new Map(plan.issues.map((issue) => [issue.legacyIdentifier, issue.identifier]));
    expect(byLegacy.get("COS-5")).toBe("PFA-1");
    expect(byLegacy.get("COS-40")).toBe("PFA-2");
    expect(byLegacy.get("COS-9")).toBe("ZEU-1");
  });

  it("breaks a tie on the same second by number, not by string", () => {
    // Plain string order puts COS-10 before COS-9, which would hand out two
    // identifiers backwards on every export with a batch-created run in it.
    const same = "2026-07-02T09:00:00.000Z";
    const plan = planFrom(csv({ id: "COS-10", created: same }, { id: "COS-9", created: same }));

    expect(plan.issues.map((issue) => issue.legacyIdentifier)).toEqual(["COS-9", "COS-10"]);
  });

  it("keeps the Linear identifier as the legacy one", () => {
    expect(planFrom(csv({ id: "COS-177", project: "PFA" })).issues[0].legacyIdentifier).toBe("COS-177");
  });

  it("continues past what a project already holds instead of colliding", () => {
    const existing: ExistingWorkspace = {
      identifiers: new Set(["PFA-1", "PFA-2"]),
      legacyIdentifiers: new Set(),
      counters: new Map([["PFA", 2]]),
    };
    const plan = planFrom(csv({ id: "COS-1", project: "PFA" }), existing);

    expect(plan.issues[0].identifier).toBe("PFA-3");
    expect(plan.report.continuedNumbering).toEqual([{ key: "PFA", from: 2 }]);
    expect(errorsIn(plan.report)).toEqual([]);
    // Continuing is safe but not silent: PFA-1 is no longer the oldest issue.
    expect(warningsIn(plan.report).join(" ")).toContain("numbering continues at PFA-3");
  });

  it("refuses to import an issue that is already in the workspace", () => {
    const existing: ExistingWorkspace = {
      identifiers: new Set(),
      legacyIdentifiers: new Set(["COS-177"]),
      counters: new Map(),
    };

    expect(errorsIn(planFrom(csv({ id: "COS-177" }), existing).report).join(" ")).toContain("already imported");
  });
});

describe("timestamps", () => {
  it("preserves what was exported rather than stamping the import", () => {
    const plan = planFrom(
      csv({
        id: "COS-1",
        status: "Done",
        created: "2026-07-01T09:00:00.000Z",
        updated: "2026-07-05T10:00:00.000Z",
        completed: "2026-07-04T11:00:00.000Z",
      }),
    );

    expect(plan.issues[0].createdAt.toISOString()).toBe("2026-07-01T09:00:00.000Z");
    expect(plan.issues[0].updatedAt.toISOString()).toBe("2026-07-05T10:00:00.000Z");
    expect(plan.issues[0].completedAt?.toISOString()).toBe("2026-07-04T11:00:00.000Z");
  });

  it("falls back to another exported timestamp, never to now, when a closing one is missing", () => {
    const plan = planFrom(csv({ id: "COS-1", status: "Done", updated: "2026-07-05T10:00:00.000Z" }));

    expect(plan.issues[0].completedAt?.toISOString()).toBe("2026-07-05T10:00:00.000Z");
    expect(plan.report.timestampFallbacks.completed).toBe(1);
  });

  it("leaves an open issue with no closing timestamps", () => {
    const plan = planFrom(csv({ id: "COS-1", status: "In Progress" }));

    expect(plan.issues[0].completedAt).toBeNull();
    expect(plan.issues[0].canceledAt).toBeNull();
  });

  it("stops a row whose Created cannot be read, because Created decides the order", () => {
    const plan = planFrom(csv({ id: "COS-1", created: "not a date" }));

    expect(plan.issues).toEqual([]);
    expect(plan.report.malformed[0].reasons.join(" ")).toContain("unreadable Created");
  });

  it("reports an unreadable optional date and imports the issue anyway", () => {
    const plan = planFrom(csv({ id: "COS-1", updated: "sometime" }));

    expect(plan.issues).toHaveLength(1);
    expect(plan.report.unreadableDates).toEqual([{ line: 2, field: "updatedAt", value: "sometime" }]);
  });
});

// --------------------------------------------------------------------------
// Epics and the nesting guard
// --------------------------------------------------------------------------
describe("epics", () => {
  it("makes a parent an epic and points its children at it", () => {
    const plan = planFrom(
      csv({ id: "COS-251" }, { id: "COS-252", parent: "COS-251" }, { id: "COS-253", parent: "COS-251" }),
    );

    const byLegacy = new Map(plan.issues.map((issue) => [issue.legacyIdentifier, issue]));
    expect(byLegacy.get("COS-251")?.isEpic).toBe(true);
    expect(byLegacy.get("COS-252")?.isEpic).toBe(false);
    expect(byLegacy.get("COS-252")?.epicOf).toBe("COS-251");
    expect(plan.report.epics).toBe(1);
    expect(plan.report.epicChildren).toBe(2);
  });

  it("resolves a parent named by UUID when the export carries one", () => {
    const uuid = "11111111-2222-4333-8444-555555555555";
    const withUuid = `${HEADER},UUID\n${line({ id: "COS-251" })},${cell(uuid)}\n${line({ id: "COS-252", parent: uuid })},${cell("")}`;
    const plan = planFrom(withUuid);

    expect(plan.issues.find((issue) => issue.legacyIdentifier === "COS-252")?.epicOf).toBe("COS-251");
    expect(errorsIn(plan.report)).toEqual([]);
  });

  it("flattens deeper nesting to the topmost ancestor and logs every issue it moved", () => {
    // The ticket: the data was one level deep at planning time, so anything
    // here means the shape changed and wants looking at.
    const plan = planFrom(csv({ id: "COS-1" }, { id: "COS-2", parent: "COS-1" }, { id: "COS-3", parent: "COS-2" }));

    const byLegacy = new Map(plan.issues.map((issue) => [issue.legacyIdentifier, issue]));
    expect(byLegacy.get("COS-3")?.epicOf).toBe("COS-1");
    expect(plan.report.flattened).toEqual([{ id: "COS-3", from: "COS-2", to: "COS-1", depth: 2 }]);
  });

  it("does not make an epic of an issue that is itself inside one", () => {
    // Spira's hierarchy is exactly one level, so the middle of a three-deep
    // chain cannot be both. It stays a child and loses the flag.
    const plan = planFrom(csv({ id: "COS-1" }, { id: "COS-2", parent: "COS-1" }, { id: "COS-3", parent: "COS-2" }));

    const byLegacy = new Map(plan.issues.map((issue) => [issue.legacyIdentifier, issue]));
    expect(byLegacy.get("COS-2")?.isEpic).toBe(false);
    expect(byLegacy.get("COS-2")?.epicOf).toBe("COS-1");
    expect(plan.report.demoted).toEqual(["COS-2"]);
  });

  it("reports a parent that is not in the export instead of dropping it in silence", () => {
    const plan = planFrom(csv({ id: "COS-2", parent: "COS-999" }));

    expect(plan.report.danglingParents).toEqual([{ id: "COS-2", parent: "COS-999" }]);
    expect(errorsIn(plan.report).join(" ")).toContain("name a parent that is not in the export");
  });

  it("says so plainly when parents are UUIDs and no UUID column came with them", () => {
    const plan = planFrom(csv({ id: "COS-2", parent: "11111111-2222-4333-8444-555555555555" }));

    expect(plan.report.unmatchableUuidParents).toBe(1);
    expect(errorsIn(plan.report).join(" ")).toContain("no UUID column to match");
  });

  it("does not loop forever on a parent chain that loops", () => {
    const plan = planFrom(csv({ id: "COS-1", parent: "COS-2" }, { id: "COS-2", parent: "COS-1" }));

    expect(plan.report.cycles.length).toBeGreaterThan(0);
    expect(errorsIn(plan.report).join(" ")).toContain("loops");
  });

  it("treats an issue that is its own parent as a dangling one", () => {
    const plan = planFrom(csv({ id: "COS-1", parent: "COS-1" }));

    expect(plan.issues[0].epicOf).toBeNull();
    expect(plan.report.danglingParents[0].parent).toContain("itself");
  });

  it("warns when an epic reaches across projects", () => {
    const plan = planFrom(csv({ id: "COS-1", project: "Zeus" }, { id: "COS-2", project: "PFA", parent: "COS-1" }));

    expect(plan.report.crossProjectEpics).toEqual([{ id: "COS-2", project: "PFA", epic: "COS-1", epicProject: "ZEU" }]);
    // A warning, not an error: the schema allows it and the import is still right.
    expect(errorsIn(plan.report)).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// What stops an import
// --------------------------------------------------------------------------
describe("errors", () => {
  it("refuses a project with no confirmed key, and proposes one", () => {
    const plan = planFrom(csv({ id: "COS-1", project: "Some New Thing" }, { id: "COS-2", project: "Some New Thing" }));

    expect(plan.issues).toEqual([]);
    // "SOM", not "SNT": the suggestion comes from the app's own
    // `suggestProjectKey`, which takes the first three characters rather than
    // initials. Reusing it is the point — the dry run should propose the key
    // the project form would have proposed.
    expect(plan.report.unknownProjects).toEqual([{ name: "Some New Thing", count: 2, suggestedKey: "SOM" }]);
    expect(errorsIn(plan.report).join(" ")).toContain("no confirmed key");
  });

  it("refuses a status that maps to nothing rather than dropping it in Backlog", () => {
    const plan = planFrom(csv({ id: "COS-1", status: "Triage" }));

    expect(plan.report.unmappedStatuses).toEqual([{ name: "Triage", count: 1 }]);
    expect(plan.issues).toEqual([]);
  });

  it("refuses an issue with no project, which Spira has no room for", () => {
    expect(planFrom(csv({ id: "COS-1", project: "" })).report.malformed[0].reasons.join(" ")).toContain("no project");
  });

  it("keeps the first of two rows claiming one identifier and names both lines", () => {
    const plan = planFrom(csv({ id: "COS-1", title: "First" }, { id: "COS-1", title: "Second" }));

    expect(plan.issues).toHaveLength(1);
    expect(plan.issues[0].title).toBe("First");
    expect(plan.report.duplicateIds).toEqual([{ id: "COS-1", lines: [2, 3] }]);
  });

  it("counts a row's problems together instead of one per run", () => {
    const plan = planFrom(csv({ id: "", title: "", status: "Nope", project: "Nowhere" }));

    expect(plan.report.malformed[0].reasons).toHaveLength(4);
    expect(plan.report.malformed[0].line).toBe(2);
  });

  it("is clean on an export with nothing wrong with it", () => {
    const plan = planFrom(
      csv(
        { id: "COS-251", project: "Spira", status: "In Progress", labels: "Feature" },
        { id: "COS-252", project: "Spira", parent: "COS-251", status: "Verify" },
        { id: "COS-29", project: "PFA", status: "Done", completed: "2026-07-02T09:00:00.000Z" },
      ),
    );

    expect(errorsIn(plan.report)).toEqual([]);
    expect(warningsIn(plan.report)).toEqual([]);
    expect(plan.report.rowsPlanned).toBe(3);
    expect(plan.report.byState).toContainEqual({ state: "In Review", count: 1 });
  });
});

describe("columns too small for what is going into them", () => {
  it("warns that a long title loses its tail rather than cutting it in silence", () => {
    const plan = planFrom(csv({ id: "COS-1", title: "T".repeat(300) }));

    expect(plan.report.truncatedTitles).toEqual([{ id: "COS-1", length: 300 }]);
    expect(errorsIn(plan.report)).toEqual([]);
  });

  it("refuses a legacy identifier that will not fit, since every COS- reference resolves through it", () => {
    const plan = planFrom(csv({ id: "COS-1234567890123456789" }));

    expect(errorsIn(plan.report).join(" ")).toContain("the column holds 20");
  });

  it("refuses a label name that would be cut, because cutting merges two labels into one", () => {
    const plan = planFrom(csv({ id: "COS-1", labels: "L".repeat(70) }));

    expect(errorsIn(plan.report).join(" ")).toContain("label name");
  });
});

describe("writeOrder", () => {
  it("puts every epic before anything that points at one", () => {
    // Two reasons, and the second is the one that bites. `Issue.epicId` is a
    // foreign key, so MySQL rejects a child inserted first — that failure at
    // least announces itself. The quiet one: writing `epicId` in a second pass
    // instead would restamp `updatedAt`, which is `@updatedAt`, and the import
    // would look perfect until somebody read the column back.
    const plan = planFrom(csv({ id: "COS-2", parent: "COS-1" }, { id: "COS-1", created: "2026-07-09T09:00:00.000Z" }));

    const ordered = writeOrder(plan.issues);
    const epicAt = ordered.findIndex((issue) => issue.legacyIdentifier === "COS-1");
    const childAt = ordered.findIndex((issue) => issue.legacyIdentifier === "COS-2");

    expect(epicAt).toBeLessThan(childAt);
    expect(ordered).toHaveLength(plan.issues.length);
  });

  it("keeps every issue, epics or not", () => {
    const plan = planFrom(csv({ id: "COS-1" }, { id: "COS-2" }, { id: "COS-3" }));

    expect(
      writeOrder(plan.issues)
        .map((issue) => issue.legacyIdentifier)
        .sort(),
    ).toEqual(["COS-1", "COS-2", "COS-3"]);
  });
});

describe("warnings", () => {
  it("imports an unreadable priority as none and says which value it was", () => {
    const plan = planFrom(csv({ id: "COS-1", priority: "3 (Medium)" }));

    expect(plan.issues[0].priority).toBe(0);
    expect(errorsIn(plan.report)).toEqual([]);
    expect(warningsIn(plan.report).join(" ")).toContain('"3 (Medium)"');
  });

  it("calls two Linear names on one key a merge, not a collision", () => {
    // `1991chat` and its full Linear name are the same project. The table is
    // confirmed by hand, so this is somebody's decision — printed, not refused.
    const plan = planFrom(
      csv({ id: "COS-1", project: "1991chat" }, { id: "COS-2", project: "1991chat — Chat front-end" }),
    );

    expect(errorsIn(plan.report)).toEqual([]);
    expect(warningsIn(plan.report).join(" ")).toContain("merge into CHT");
    expect(plan.issues.every((issue) => issue.projectKey === "CHT")).toBe(true);
  });

  it("names a merged project after one of them, not after both joined together", () => {
    // `names` is for the report; `name` is what a created project is called.
    // At cutover the projects do not exist yet, so the create branch is the
    // path that runs — and "1991chat / 1991chat — Chat front-end" would be
    // the project's actual name forever.
    const plan = planFrom(
      csv({ id: "COS-1", project: "1991chat" }, { id: "COS-2", project: "1991chat — Chat front-end" }),
    );
    const chat = plan.report.byProject.find((project) => project.key === "CHT");

    expect(chat?.name).toBe("1991chat");
    expect(chat?.names).toEqual(["1991chat", "1991chat — Chat front-end"]);
  });
});
