import {
  DEFAULT_PROJECT_COLOR,
  EMPTY_PROJECT,
  hasChanges,
  projectFormError,
  projectKeyError,
  toCreatePayload,
  toFormValues,
  toUpdatePayload,
} from "@components/projects/project-form.util";
import { describe, expect, it } from "vitest";

import type { ProjectFormValues } from "@components/projects/project-form.util";
import type { ProjectDto } from "@lib/api-types";

const BACKLOG = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Backlog",
  type: "backlog" as const,
  color: "#a6a8ae",
  position: 0,
};

const PROJECT: ProjectDto = {
  id: "22222222-2222-2222-2222-222222222222",
  key: "SPI",
  name: "Spira",
  icon: "graph_3",
  color: "#7b8fd8",
  summary: "Self-hosted Linear replacement",
  status: BACKLOG,
  priority: 2,
  issueCount: 39,
  completedCount: 3,
  progress: 3 / 39,
  legacyCount: 39,
  archivedAt: null,
  description: "# Spira",
  startDate: "2026-07-29T00:00:00.000Z",
  targetDate: null,
  issueCounter: 39,
  createdAt: "2026-07-29T10:00:00.000Z",
  updatedAt: "2026-08-05T10:00:00.000Z",
};

const filled: ProjectFormValues = {
  name: "Spira",
  key: "SPI",
  icon: "graph_3",
  color: "#7b8fd8",
  summary: "Self-hosted Linear replacement",
  statusId: BACKLOG.id,
  priority: 2,
  startDate: "2026-07-29",
  targetDate: "",
};

describe("projectKeyError", () => {
  it("accepts two to five uppercase alphanumerics", () => {
    expect(projectKeyError("GO")).toBeNull();
    expect(projectKeyError("3DE")).toBeNull();
    expect(projectKeyError("ALPHA")).toBeNull();
  });

  it("normalises before judging, so lowercase and padding are fine", () => {
    expect(projectKeyError("  spi ")).toBeNull();
  });

  it("asks for a key when there is none", () => {
    expect(projectKeyError("")).toMatch(/needs a key/);
    expect(projectKeyError("   ")).toMatch(/needs a key/);
  });

  it("rejects the wrong length or the wrong characters", () => {
    expect(projectKeyError("A")).toMatch(/2 to 5/);
    expect(projectKeyError("ALPHAS")).toMatch(/2 to 5/);
    expect(projectKeyError("PF-A")).toMatch(/2 to 5/);
  });

  it("rejects an all-digit key, which would read as an issue number", () => {
    expect(projectKeyError("199")).toMatch(/issue number/);
  });

  it("rejects the keys the app's own routes have taken", () => {
    // A project keyed ISSUE lives at /issue/issues, which the issue detail
    // route answers first — the project would be permanently unreachable.
    expect(projectKeyError("ISSUE")).toMatch(/reserved/);
    expect(projectKeyError("login")).toMatch(/reserved/);
    expect(projectKeyError("api")).toMatch(/reserved/);
    expect(projectKeyError("New")).toMatch(/reserved/);
  });

  it("does not over-reach into keys that merely start the same way", () => {
    expect(projectKeyError("APIS")).toBeNull();
    expect(projectKeyError("ISS")).toBeNull();
  });
});

describe("projectFormError", () => {
  it("passes a filled form", () => {
    expect(projectFormError(filled)).toBeNull();
  });

  it("reports the name before the key, in reading order", () => {
    expect(projectFormError({ ...filled, name: "  ", key: "!!" })).toMatch(/needs a name/);
  });

  it("rejects a colour that is not a six-digit hex", () => {
    expect(projectFormError({ ...filled, color: "7b8fd8" })).toMatch(/hex/);
    expect(projectFormError({ ...filled, color: "#7b8fd" })).toMatch(/hex/);
  });

  it("rejects a target date that falls before the start date", () => {
    const values = { ...filled, startDate: "2026-08-01", targetDate: "2026-07-31" };

    expect(projectFormError(values)).toMatch(/before the start date/);
  });

  it("lets either date stand alone", () => {
    expect(projectFormError({ ...filled, startDate: "2026-08-01", targetDate: "" })).toBeNull();
    expect(projectFormError({ ...filled, startDate: "", targetDate: "2026-08-01" })).toBeNull();
  });

  it("accepts a start and target on the same day", () => {
    expect(projectFormError({ ...filled, startDate: "2026-08-01", targetDate: "2026-08-01" })).toBeNull();
  });
});

describe("toFormValues", () => {
  it("round-trips a project into the shape the inputs hold", () => {
    expect(toFormValues(PROJECT)).toEqual(filled);
  });

  it("turns every null into the empty string the DOM uses", () => {
    const bare = toFormValues({ ...PROJECT, icon: null, summary: null, startDate: null, targetDate: null });

    expect(bare.icon).toBe("");
    expect(bare.summary).toBe("");
    expect(bare.startDate).toBe("");
    expect(bare.targetDate).toBe("");
  });

  it("falls back to the default colour rather than leaving the picker empty", () => {
    expect(toFormValues({ ...PROJECT, color: null }).color).toBe(DEFAULT_PROJECT_COLOR);
  });

  it("keeps the date the API sent, without a timezone shifting it a day", () => {
    // The API serialises a DATE column as UTC midnight; slicing the instant is
    // what keeps 2026-07-29 from becoming the 28th west of Greenwich.
    expect(toFormValues({ ...PROJECT, startDate: "2026-07-29T00:00:00.000Z" }).startDate).toBe("2026-07-29");
  });
});

describe("toCreatePayload", () => {
  it("normalises the key and trims the text", () => {
    const payload = toCreatePayload({ ...filled, key: " spi ", name: "  Spira  " });

    expect(payload.key).toBe("SPI");
    expect(payload.name).toBe("Spira");
  });

  it("sends null for the fields left empty", () => {
    const payload = toCreatePayload({ ...EMPTY_PROJECT, name: "Spira", key: "SPI", color: "" });

    expect(payload).toMatchObject({ icon: null, color: null, summary: null, startDate: null, targetDate: null });
  });

  it("omits the status entirely when none was picked, leaving the default to the API", () => {
    expect("statusId" in toCreatePayload({ ...filled, statusId: "" })).toBe(false);
  });

  it("sends the status when one was picked", () => {
    expect(toCreatePayload(filled).statusId).toBe(BACKLOG.id);
  });
});

describe("toUpdatePayload", () => {
  it("sends nothing when nothing changed", () => {
    expect(toUpdatePayload(filled, filled)).toEqual({});
    expect(hasChanges(filled, filled)).toBe(false);
  });

  it("does not resend the unchanged key, which would collide with the project itself", () => {
    const payload = toUpdatePayload({ ...filled, name: "Spira v2" }, filled);

    expect(payload).toEqual({ name: "Spira v2" });
    expect("key" in payload).toBe(false);
  });

  it("sends the key when it really changed", () => {
    expect(toUpdatePayload({ ...filled, key: "spr" }, filled)).toEqual({ key: "SPR" });
  });

  it("ignores a key edit that normalises back to the same thing", () => {
    expect(toUpdatePayload({ ...filled, key: " spi " }, filled)).toEqual({});
  });

  it("sends an explicit null to clear a field", () => {
    const payload = toUpdatePayload({ ...filled, summary: "", startDate: "" }, filled);

    expect(payload).toEqual({ summary: null, startDate: null });
  });

  it("sends priority 0, which a truthiness check would have dropped", () => {
    expect(toUpdatePayload({ ...filled, priority: 0 }, filled)).toEqual({ priority: 0 });
  });

  it("reports a change through hasChanges", () => {
    expect(hasChanges({ ...filled, icon: "rocket_launch" }, filled)).toBe(true);
  });
});
