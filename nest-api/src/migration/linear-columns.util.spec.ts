import { headerKey, readRow, resolveColumns } from "@migration/linear-columns.util";

describe("headerKey", () => {
  it("reads one name through Linear's punctuation and casing", () => {
    expect(headerKey("Parent issue")).toBe(headerKey("Parent Issue"));
    expect(headerKey("Parent issue")).toBe(headerKey("parent_issue"));
    expect(headerKey("Due Date")).toBe("duedate");
  });
});

describe("resolveColumns", () => {
  const header = ["ID", "Title", "Description", "Status", "Priority", "Project", "Labels", "Parent issue", "Created"];

  it("finds every field it needs", () => {
    const columns = resolveColumns(header);

    expect(columns.missingRequired).toEqual([]);
    expect(columns.index.id).toBe(0);
    expect(columns.index.parent).toBe(7);
    expect(columns.index.createdAt).toBe(8);
  });

  it("names a required column that is not there rather than reading position 0", () => {
    // The failure this prevents: with fixed indices, an export without
    // `Created` would silently read `ID` as the creation date and number every
    // project in alphabetical order.
    const columns = resolveColumns(["ID", "Title", "Status", "Project"]);

    expect(columns.missingRequired).toEqual(["createdAt"]);
  });

  it("sorts unknown headers into ignored and unrecognised", () => {
    const columns = resolveColumns([...header, "Estimate", "Assignee", "Mood Ring"]);

    expect(columns.ignored).toEqual(["Estimate", "Assignee"]);
    // Not fatal — but the only way anyone learns Linear added a column.
    expect(columns.unrecognised).toEqual(["Mood Ring"]);
  });

  it("survives a column order nobody promised", () => {
    const columns = resolveColumns(["Created", "Project", "Status", "Title", "ID"]);

    expect(columns.missingRequired).toEqual([]);
    expect(columns.index.id).toBe(4);
    expect(columns.index.createdAt).toBe(0);
  });

  it("takes the first of two columns claiming one field, and says both", () => {
    const columns = resolveColumns([...header, "State"]);

    expect(columns.index.status).toBe(3);
    expect(columns.duplicated).toEqual([{ field: "status", headers: ["Status", "State"] }]);
  });

  it("ignores the empty column a trailing comma leaves", () => {
    const columns = resolveColumns([...header, ""]);

    expect(columns.unrecognised).toEqual([]);
  });
});

describe("readRow", () => {
  const columns = resolveColumns(["ID", "Title", "Status", "Project", "Created"]);

  it("gives an absent column and a blank cell the same shape", () => {
    const row = readRow(["COS-1", "  Padded  ", "Backlog", "PFA", "2026-07-01"], columns.index);

    expect(row.title).toBe("Padded");
    // `Labels` was not in the header at all; it reads as empty, not undefined,
    // so every caller handles one shape.
    expect(row.labels).toBe("");
    expect(row.description).toBe("");
  });

  it("does not fall over on a row shorter than the header", () => {
    const row = readRow(["COS-1", "Title"], columns.index);

    expect(row.status).toBe("");
    expect(row.createdAt).toBe("");
  });
});
