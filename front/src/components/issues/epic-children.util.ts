import type { IssueListItemDto } from "@lib/api-types";

/**
 * The epic's vocabulary: how a count of contained issues is said, and which of
 * them a picker offers (COS-279).
 *
 * `ProgressPill` reaches into this module from `ui/`, against the usual
 * direction. That is deliberate rather than accidental — the pill only ever
 * draws an epic's ratio, so the sentence explaining it belongs with the rest of
 * the epic's words instead of being written twice at the two call sites.
 */

/** "No issues", "1 issue", "10 issues" — the plural every count here needs. */
export function countedIssues(count: number): string {
  if (count === 0) {
    return "No issues";
  }
  return `${count} ${count === 1 ? "issue" : "issues"}`;
}

/**
 * What a screen reader gets from the progress ring.
 *
 * The ring is a conic gradient and the fraction beside it is bare digits, so
 * without this the pill reads as "7/10" — a number with nothing saying what it
 * counts, on the one control that is the whole point of an epic's page.
 */
export function epicProgressLabel(done: number, total: number): string {
  if (total === 0) {
    return "Empty epic";
  }
  return `${done} of ${countedIssues(total)} completed`;
}

/**
 * The picker draws every candidate the page fetched, so a project with three
 * hundred loose issues would open as three hundred buttons. Typing narrows
 * them; this is what keeps the first paint honest until someone does.
 */
export const CANDIDATE_LIMIT = 40;

/**
 * Candidates matching what has been typed, over the identifier, the Linear
 * identifier and the title.
 *
 * Legacy identifiers match because they are what an old commit message or a
 * five-year-old memory holds, and keeping that column is only worth anything if
 * those still find the issue.
 */
export function matchCandidates(candidates: IssueListItemDto[], query: string): IssueListItemDto[] {
  const needle = query.trim().toLowerCase();

  const matched =
    needle === ""
      ? candidates
      : candidates.filter((issue) =>
          [issue.identifier, issue.legacyIdentifier, issue.title].some((field) =>
            field?.toLowerCase().includes(needle),
          ),
        );

  return matched.slice(0, CANDIDATE_LIMIT);
}
