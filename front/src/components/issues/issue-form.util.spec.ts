import {
  EMPTY_ISSUE,
  issueFormError,
  issueTitleError,
  toCreateIssuePayload,
  toggleLabel,
} from "@components/issues/issue-form.util";
import { FIELD_LIMITS } from "@schemas/field-limits";
import { describe, expect, it } from "vitest";

import type { IssueFormValues } from "@components/issues/issue-form.util";

const filled: IssueFormValues = {
  ...EMPTY_ISSUE,
  projectKey: "SPI",
  title: "Issue creation",
};

describe("issueTitleError", () => {
  it("refuses a blank title, and whitespace is blank", () => {
    expect(issueTitleError("")).toMatch(/needs a title/);
    expect(issueTitleError("   \n ")).toMatch(/needs a title/);
  });

  it("measures the trimmed title against the column width", () => {
    const exact = "x".repeat(FIELD_LIMITS.issueTitle);

    expect(issueTitleError(exact)).toBeNull();
    expect(issueTitleError(`  ${exact}  `)).toBeNull();
    expect(issueTitleError(`${exact}x`)).toMatch(/at most 255 characters/);
  });
});

describe("issueFormError", () => {
  it("asks for a project first, then a title", () => {
    expect(issueFormError(EMPTY_ISSUE)).toMatch(/Pick the project/);
    expect(issueFormError({ ...EMPTY_ISSUE, projectKey: "SPI" })).toMatch(/needs a title/);
  });

  it("passes a project and a title on their own", () => {
    expect(issueFormError(filled)).toBeNull();
  });

  it("refuses an epic that also names a parent epic", () => {
    expect(issueFormError({ ...filled, isEpic: true, epicId: "e1" })).toMatch(/cannot belong to another epic/);
    expect(issueFormError({ ...filled, isEpic: true })).toBeNull();
    expect(issueFormError({ ...filled, epicId: "e1" })).toBeNull();
  });
});

describe("toCreateIssuePayload", () => {
  it("sends only the project, title, priority and type when nothing else is set", () => {
    expect(toCreateIssuePayload(filled)).toEqual({
      projectKey: "SPI",
      title: "Issue creation",
      priority: 0,
      isEpic: false,
    });
  });

  it("omits the state so the API picks its own default rather than being handed an empty one", () => {
    expect(toCreateIssuePayload(filled)).not.toHaveProperty("stateId");
    expect(toCreateIssuePayload({ ...filled, stateId: "s-todo" }).stateId).toBe("s-todo");
  });

  it("uppercases the project key and trims the title, but keeps the description verbatim", () => {
    const payload = toCreateIssuePayload({
      ...filled,
      projectKey: " spi ",
      title: "  Issue creation  ",
      description: "## Heading\n\nBody.\n",
    });

    expect(payload.projectKey).toBe("SPI");
    expect(payload.title).toBe("Issue creation");
    // Trimming markdown would eat a trailing blank line that separates blocks.
    expect(payload.description).toBe("## Heading\n\nBody.\n");
  });

  it("treats a whitespace-only description as no description", () => {
    expect(toCreateIssuePayload({ ...filled, description: "  \n\n " })).not.toHaveProperty("description");
  });

  it("drops the parent epic when the issue is itself an epic", () => {
    expect(toCreateIssuePayload({ ...filled, isEpic: true, epicId: "e1" })).not.toHaveProperty("epicId");
    expect(toCreateIssuePayload({ ...filled, epicId: "e1" }).epicId).toBe("e1");
  });

  it("sends a zero priority and a false type, because both are real answers", () => {
    const payload = toCreateIssuePayload(filled);

    expect(payload.priority).toBe(0);
    expect(payload.isEpic).toBe(false);
  });

  it("omits an empty label set and passes a filled one through", () => {
    expect(toCreateIssuePayload(filled)).not.toHaveProperty("labelIds");
    expect(toCreateIssuePayload({ ...filled, labelIds: ["l1", "l2"] }).labelIds).toEqual(["l1", "l2"]);
  });
});

describe("toggleLabel", () => {
  it("adds at the end, removes in place, and never mutates", () => {
    const selected = ["l1", "l2"];

    expect(toggleLabel(selected, "l3")).toEqual(["l1", "l2", "l3"]);
    expect(toggleLabel(selected, "l1")).toEqual(["l2"]);
    expect(selected).toEqual(["l1", "l2"]);
  });
});
