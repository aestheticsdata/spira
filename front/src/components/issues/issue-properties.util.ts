import type { IssueDetailDto, IssueListItemDto } from "@lib/api-types";

/**
 * The rules the properties panel needs in order to explain itself.
 *
 * Every one of them is enforced by the service, which sends back a good
 * sentence when it refuses. This copy exists so the control can be disabled
 * with that sentence attached, rather than accepting a click and answering with
 * a toast — the difference between a form that says why and one that says no.
 */

/**
 * The epics offerable as this issue's parent.
 *
 * An epic cannot have a parent at all, and nothing can be its own. Same-project
 * is not checked here because the caller fetches with `?project=&isEpic=true`,
 * which is the API's own filter rather than a second opinion on it.
 */
export function parentEpicOptions(
  issue: Pick<IssueDetailDto, "id" | "isEpic">,
  epics: IssueListItemDto[],
): IssueListItemDto[] {
  if (issue.isEpic) {
    return [];
  }
  return epics.filter((epic) => epic.id !== issue.id);
}

/**
 * Why the Issue/Epic toggle cannot be flipped, or `null` when it can. The
 * messages deliberately echo the service's, down to the pluralisation, so the
 * owner reads the same explanation whichever side catches it.
 */
export function typeChangeBlocker(
  issue: Pick<IssueDetailDto, "identifier" | "isEpic" | "epicId" | "epic" | "epicProgress">,
): string | null {
  if (issue.isEpic) {
    const children = issue.epicProgress?.total ?? 0;
    if (children > 0) {
      return (
        `${issue.identifier} still has ${children} child ${children === 1 ? "issue" : "issues"} — ` +
        `move them out before it stops being an epic`
      );
    }
    return null;
  }

  if (issue.epicId !== null) {
    return (
      `${issue.identifier} belongs to epic ${issue.epic?.identifier ?? issue.epicId} — ` +
      `take it out of that epic before making it an epic itself`
    );
  }

  return null;
}
