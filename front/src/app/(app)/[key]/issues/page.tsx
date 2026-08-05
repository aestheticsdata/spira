import { FilterChips } from "@components/filters/filter-controls";
import { hasActiveFilters, issueFiltersToApiQuery, parseIssueFilters } from "@components/filters/issue-filters";
import { groupIssues } from "@components/issues/group-issues";
import { IssueGroup } from "@components/issues/issue-group";
import { IssueRow } from "@components/issues/issue-row";
import { IssuesToolbar } from "@components/issues/issues-toolbar";
import { QuickAddIssue } from "@components/issues/quick-add-issue";
import { AppHeader } from "@components/shell/app-header";
import { ProjectTabs } from "@components/shell/project-tabs";
import { serverFetch, serverFetchOptional } from "@lib/server-api";
import { notFound } from "next/navigation";

import type { GroupMode } from "@components/issues/group-issues";
import type { IssueListItemDto, LabelDto, ProjectDto, WorkflowStateDto } from "@lib/api-types";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

export default async function ProjectIssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ key }, query] = await Promise.all([params, searchParams]);
  const projectKey = key.toUpperCase();

  // The mirror image of the toolbar's nuqs parsers. `clearOnDefault` keeps a
  // default out of the URL, so an absent key means the default, not "unset".
  const mode: GroupMode = first(query.group) === "epic" ? "epic" : "status";
  const showLegacy = first(query.legacy) !== "false";

  // The same parser the bar writes with, so the list the server builds and the
  // chips the client draws can never describe different filters.
  const filters = parseIssueFilters(query);
  const filtered = hasActiveFilters(filters);

  const [project, issues, states, labels, epics] = await Promise.all([
    serverFetchOptional<ProjectDto>(`/projects/${projectKey}`),
    serverFetch<IssueListItemDto[]>(`/issues?${issueFiltersToApiQuery(filters, projectKey)}`),
    serverFetch<WorkflowStateDto[]>("/states"),
    // The chips and the menu need every label's name and colour, and a list
    // filtered down to nothing cannot supply either — so these three come
    // unfiltered, alongside the filtered one rather than out of it.
    serverFetch<LabelDto[]>("/labels"),
    serverFetch<IssueListItemDto[]>(`/issues?project=${projectKey}&isEpic=true`),
  ]);

  if (!project) {
    notFound();
  }

  const groups = groupIssues(issues, states, mode);

  return (
    <>
      <AppHeader
        project={project}
        leaf="Issues"
        actions={
          <IssuesToolbar
            states={states}
            labels={labels}
            epics={epics}
          />
        }
      />
      <ProjectTabs projectKey={project.key} />
      <FilterChips
        states={states}
        labels={labels}
        epics={epics}
      />

      <div className="sp-scroll min-h-0 flex-1 overflow-y-auto">
        {groups.map((group) => (
          <IssueGroup
            key={group.key}
            kind={group.kind}
            label={group.label}
            identifier={group.identifier}
            legacy={showLegacy ? group.legacy : null}
            count={group.count}
            accent={group.accent}
            state={group.state}
            iconRadius={group.iconRadius}
            progress={group.progress}
            quickAdd={
              <QuickAddIssue
                projectKey={project.key}
                stateId={group.quickAdd.stateId}
                epicId={group.quickAdd.epicId}
                target={group.label}
                indent={group.indent}
              />
            }
          >
            {group.rows.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                indent={group.indent}
                showLegacy={showLegacy}
                mode={mode}
              />
            ))}
          </IssueGroup>
        ))}

        {/* An empty project has no groups, so it would have no quick-add
            either — and no way in from the list at all. A filtered list that
            came back empty gets no creator: an issue filed here would not match
            the filters, so it would vanish the moment it appeared. */}
        {groups.length === 0 &&
          (filtered ? (
            <p className="px-4 py-20 text-center text-125 text-ink-7">
              No issue in {project.name} matches these filters.
            </p>
          ) : (
            <>
              <p className="px-4 pt-20 pb-3 text-center text-125 text-ink-7">{project.name} has no issues yet.</p>
              <div className="border-t border-line-soft">
                <QuickAddIssue
                  projectKey={project.key}
                  stateId={null}
                  epicId={null}
                  target={project.name}
                  indent={16}
                  defaultOpen
                />
              </div>
            </>
          ))}

        <div className="h-[60px]" />
      </div>
    </>
  );
}
