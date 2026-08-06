/**
 * Which CSV column is which (COS-283).
 *
 * The importer never reads a column by position. Linear's export has changed
 * shape before and will again — a new column inserted in the middle would, with
 * fixed indices, silently shift `Description` into `Status` and import a
 * workspace of garbage that still looks plausible in the report.
 *
 * So the header row is resolved by name, through a table of aliases, and every
 * column falls into exactly one of three buckets:
 *
 * - **used** — a field below, read into the plan
 * - **ignored** — a Linear column this app has no home for (estimates, cycles,
 *   assignees). Named explicitly, so that "ignored" is a decision on record
 *   rather than an accident
 * - **unrecognised** — anything else. Not fatal: Linear adding a column is not
 *   a reason to refuse an import. But it is printed, because the only way to
 *   find out that the export gained something worth keeping is to be told
 *
 * Only a *missing required* column stops the run.
 */

/** The fields the importer reads off a row. */
export type LinearField =
  | "id"
  | "uuid"
  | "title"
  | "description"
  | "status"
  | "priority"
  | "project"
  | "labels"
  | "parent"
  | "createdAt"
  | "updatedAt"
  | "completedAt"
  | "canceledAt"
  | "archivedAt";

/**
 * Header names are compared with case, spaces and punctuation removed, so
 * `Parent issue`, `Parent Issue` and `parent_issue` are one name. Linear's own
 * capitalisation is not a contract.
 */
export function headerKey(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * A field's accepted spellings, most likely first. Several are guesses at what
 * a future export might call the same thing — an alias that never matches costs
 * nothing, whereas a missing one costs a required-column failure at cutover.
 */
const ALIASES: Record<LinearField, string[]> = {
  id: ["ID", "Identifier", "Issue ID", "Issue key", "Key"],
  uuid: ["UUID", "Issue UUID", "Linear ID", "Internal ID"],
  title: ["Title", "Name", "Issue title"],
  description: ["Description", "Body", "Content"],
  status: ["Status", "State", "Workflow state"],
  priority: ["Priority", "Priority label"],
  project: ["Project", "Project name"],
  labels: ["Labels", "Label", "Tags"],
  parent: ["Parent issue", "Parent", "Parent ID"],
  createdAt: ["Created", "Created At"],
  updatedAt: ["Updated", "Updated At"],
  completedAt: ["Completed", "Completed At"],
  canceledAt: ["Canceled", "Cancelled", "Canceled At", "Cancelled At"],
  archivedAt: ["Archived", "Archived At"],
};

/** Without these the export cannot be turned into issues at all. */
const REQUIRED: LinearField[] = ["id", "title", "status", "project", "createdAt"];

/**
 * Linear columns this app deliberately drops. Spira has no assignees, no
 * estimates, no cycles and no milestones, so importing them would mean
 * inventing columns to put them in.
 *
 * `Team` is here rather than in the mapping because the workspace has one team
 * — the split that matters to Spira is the project, and that is its own column.
 */
const IGNORED = [
  "Team",
  "Team ID",
  "Team Key",
  "Project ID",
  "Estimate",
  "Creator",
  "Created By",
  "Assignee",
  "Delegate",
  "Cycle",
  "Cycle Number",
  "Cycle Name",
  "Cycle Start",
  "Cycle End",
  "Started",
  "Triaged",
  "Due Date",
  "Initiative",
  "Milestone",
  "Project Milestone",
  "Project Milestone ID",
  "SLA Status",
  "SLA Breaches At",
  "Roadmaps",
  "URL",
  "Subscribers",
  "Attachments",
].map(headerKey);

export interface ColumnResolution {
  /** Where each recognised field sits in a row. */
  index: Partial<Record<LinearField, number>>;
  /** Required fields no column matched. Any entry here stops the run. */
  missingRequired: LinearField[];
  /** Known Linear columns with no home in Spira. */
  ignored: string[];
  /** Columns no rule knows about. Reported, never fatal. */
  unrecognised: string[];
  /** A field two columns both claimed; the first wins and both are named. */
  duplicated: { field: LinearField; headers: string[] }[];
}

const BY_KEY = new Map<string, LinearField>();
for (const [field, spellings] of Object.entries(ALIASES) as [LinearField, string[]][]) {
  for (const spelling of spellings) {
    BY_KEY.set(headerKey(spelling), field);
  }
}

export function resolveColumns(header: string[]): ColumnResolution {
  const index: Partial<Record<LinearField, number>> = {};
  const claimedBy = new Map<LinearField, string[]>();
  const ignored: string[] = [];
  const unrecognised: string[] = [];

  header.forEach((raw, position) => {
    const key = headerKey(raw);
    // A trailing empty column is what a line ending in a comma produces. It
    // carries nothing and saying so would only add noise to every report.
    if (key === "") {
      return;
    }

    const field = BY_KEY.get(key);
    if (field) {
      claimedBy.set(field, [...(claimedBy.get(field) ?? []), raw]);
      // First column wins. Two columns for one field is already a broken
      // export; picking the later one would additionally make it order-
      // dependent, which is worse than picking wrong consistently.
      if (index[field] === undefined) {
        index[field] = position;
      }
      return;
    }

    (IGNORED.includes(key) ? ignored : unrecognised).push(raw);
  });

  return {
    index,
    missingRequired: REQUIRED.filter((field) => index[field] === undefined),
    ignored,
    unrecognised,
    duplicated: [...claimedBy.entries()]
      .filter(([, headers]) => headers.length > 1)
      .map(([field, headers]) => ({ field, headers })),
  };
}

/**
 * `description` is the one field handed back exactly as the export wrote it.
 *
 * Everything else is trimmed, because a padded identifier or status is padding
 * and nothing else. A description is markdown, where leading whitespace is
 * content: four spaces at the very start make the first line a code block, and
 * trimming would silently render it as a paragraph. The planner still treats a
 * whitespace-only description as empty — it just does not rewrite a real one.
 */
const UNTRIMMED: readonly LinearField[] = ["description"];

/**
 * One row as named fields. Absent columns and blank cells both come back as
 * `""` rather than undefined, so every caller reads one shape and a missing
 * optional column behaves exactly like an empty cell — which is what it means.
 */
export function readRow(row: string[], index: Partial<Record<LinearField, number>>): Record<LinearField, string> {
  const out = {} as Record<LinearField, string>;

  for (const field of Object.keys(ALIASES) as LinearField[]) {
    const position = index[field];
    const raw = position === undefined ? "" : (row[position] ?? "");
    out[field] = UNTRIMMED.includes(field) ? raw : raw.trim();
  }

  return out;
}
