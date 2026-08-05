import { applyDisplayToApiQuery, DEFAULT_DISPLAY, parseDisplayOptions } from "@components/filters/display-options";
import { FilterChips } from "@components/filters/filter-controls";
import { issueFiltersToApiQuery, parseIssueFilters } from "@components/filters/issue-filters";
import { raw } from "@components/filters/query-params";
import { groupIssues } from "@components/issues/group-issues";
import { IssueGroup } from "@components/issues/issue-group";
import { IssueRow } from "@components/issues/issue-row";
import { IssuesToolbar } from "@components/issues/issues-toolbar";
import { ROUTES } from "@components/shared/config/constants";
import { AppHeader } from "@components/shell/app-header";
import { serverFetch } from "@lib/server-api";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import type { IssueListItemDto, LabelDto, SavedViewDto, WorkflowStateDto } from "@lib/api-types";

type SearchParams = Record<string, string | string[] | undefined>;

/** The stored query with the view's own marker on the end. */
function opened(id: string, query: string): string {
  return `${query}${query ? "&" : ""}view=${id}`;
}

/**
 * Opening a saved view (COS-278).
 *
 * Every view is linked from one place, and what happens next depends on what it
 * is. A **project** view belongs on its project's list, with everything that
 * page carries — tabs, breadcrumb, quick-add — so this redirects there with the
 * stored query pushed into the URL. Opening a view really is nothing more than
 * that: from the list's point of view it is a filter someone typed.
 *
 * A **workspace** view has no project to go to, so this page is its list: the
 * same rows, groups and controls, asked of every project at once. That is also
 * the first cross-project issue list in Spira, which is what makes the project
 * filter and project grouping worth anything.
 */
export default async function SavedViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  const views = await serverFetch<SavedViewDto[]>("/views");
  const view = views.find((entry) => entry.id === id);

  if (!view) {
    notFound();
  }

  // A view older than the vocabulary it was saved against. The API refuses to
  // hand back a query it cannot vouch for, so there is nothing to open — and
  // showing the reason beats a list that is quietly not the saved one.
  if (view.invalid !== null || view.query === null) {
    return (
      <>
        <AppHeader leaf={view.name} />
        <div className="mx-auto max-w-[560px] px-[30px] py-20 text-center">
          <h1 className="mb-2 text-15 font-semibold text-ink-1">{view.name} cannot be opened</h1>
          <p className="mb-1 text-125 leading-[1.55] text-ink-6">
            It was saved against a filter this version of Spira no longer understands, so opening it would show a list
            that is not the one it stands for.
          </p>
          <p className="mb-6 text-115 text-ink-7">{view.invalid}</p>
          <Link
            href={ROUTES.views.path}
            className="text-125 text-ink-link hover:underline"
          >
            Back to saved views
          </Link>
        </div>
      </>
    );
  }

  if (view.project) {
    redirect(`${ROUTES.projectIssues.path(view.project.key)}?${opened(id, view.query)}`);
  }

  // The marker travels in the query even here, where the path already names the
  // view, so that one hook reads it the same way on both kinds of page.
  if (raw(query, "view") !== id) {
    redirect(`${ROUTES.view.path(id)}?${opened(id, view.query)}`);
  }

  const filters = parseIssueFilters(query);
  const display = parseDisplayOptions(query);

  const [issues, states, labels, epics] = await Promise.all([
    // No `project`: every project at once, which is what workspace-wide means.
    serverFetch<IssueListItemDto[]>(`/issues?${applyDisplayToApiQuery(issueFiltersToApiQuery(filters), display)}`),
    serverFetch<WorkflowStateDto[]>("/states"),
    serverFetch<LabelDto[]>("/labels"),
    serverFetch<IssueListItemDto[]>("/issues?isEpic=true"),
  ]);

  const groups = groupIssues(issues, states, display.group, {
    showEmpty: display.emptyGroups,
    preserveOrder: display.order !== DEFAULT_DISPLAY.order,
  });

  return (
    <>
      <AppHeader
        leaf={view.name}
        actions={
          <IssuesToolbar
            states={states}
            labels={labels}
            epics={epics}
          />
        }
      />
      <FilterChips
        states={states}
        labels={labels}
        epics={epics}
        views={views}
      />

      <div className="sp-scroll min-h-0 flex-1 overflow-y-auto">
        {groups.map((group) => (
          <IssueGroup
            key={group.key}
            kind={group.kind}
            label={group.label}
            identifier={group.identifier}
            legacy={display.legacy ? group.legacy : null}
            count={group.count}
            accent={group.accent}
            state={group.state}
            priority={group.priority}
            iconRadius={group.iconRadius}
            progress={group.progress}
          >
            {/* No quick-add: an issue filed from a list that spans every
                project has no project to be filed into, and picking one for
                the owner would be a guess with an identifier attached. */}
            {group.rows.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                indent={group.indent}
                display={display}
              />
            ))}
          </IssueGroup>
        ))}

        {groups.length === 0 && (
          <p className="px-4 py-20 text-center text-125 text-ink-7">Nothing in the workspace matches this view.</p>
        )}

        <div className="h-[60px]" />
      </div>
    </>
  );
}
