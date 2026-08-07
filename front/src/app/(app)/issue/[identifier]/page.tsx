import { EditableIssueTitle } from "@components/issues/editable-issue-title";
import { EpicChildren } from "@components/issues/epic-children";
import { IssueArchiveControl } from "@components/issues/issue-archive";
import { IssueProperties } from "@components/issues/issue-properties";
import { IssueRelations } from "@components/issues/issue-relations";
import { EditableDescription } from "@components/markdown/editable-description";
import { Markdown } from "@components/markdown/markdown";
import { ROUTES } from "@components/shared/config/constants";
import { AppHeader } from "@components/shell/app-header";
import { Identifier } from "@components/ui/identifier";
import { serverFetch, serverFetchOptional } from "@lib/server-api";
import { notFound, permanentRedirect } from "next/navigation";

import type { IssueDetailDto, IssueListItemDto, LabelDto, WorkflowStateDto } from "@lib/api-types";

export default async function IssuePage({ params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const issue = await serverFetchOptional<IssueDetailDto>(`/issues/${identifier.toUpperCase()}`);

  if (!issue) {
    notFound();
  }

  // The API resolves a legacy identifier and tells us what it really is; the
  // front turns that into a 308 so `COS-177` pasted out of a five-year-old
  // commit message lands on `PFA-41` — permanently, and cacheably.
  if (issue.canonicalIdentifier !== issue.requestedIdentifier.toUpperCase()) {
    permanentRedirect(ROUTES.issue.path(issue.canonicalIdentifier));
  }

  // What the properties panel offers — and, for an epic, what it contains and
  // what could go into it. Fetched here rather than by the components: the page
  // is already awaiting the API, and a rail that has to load before it can be
  // used is a rail you wait for on every issue you open.
  const [states, labels, epics, contained, candidates] = await Promise.all([
    serverFetch<WorkflowStateDto[]>("/states"),
    serverFetch<LabelDto[]>("/labels"),
    serverFetch<IssueListItemDto[]>(`/issues?project=${issue.project.key}&isEpic=true`),
    issue.isEpic ? serverFetch<IssueListItemDto[]>(`/issues?epic=${issue.identifier}`) : [],
    // Issues in no epic at all, rather than every issue in the project: an epic
    // cannot hold another epic, and one already inside a different epic is
    // moved from its own panel, where the epic it is leaving is on screen.
    issue.isEpic
      ? serverFetch<IssueListItemDto[]>(`/issues?project=${issue.project.key}&isEpic=false&hasEpic=false`)
      : [],
  ]);

  return (
    <>
      <AppHeader
        project={issue.project}
        epic={issue.epic}
        leaf={issue.identifier}
      />
      <div className="flex min-h-0 flex-1">
        <div className="sp-scroll min-w-0 flex-1 overflow-y-auto border-r border-line-chrome pt-10 pb-[90px]">
          <div className="mx-auto max-w-[700px] px-[30px]">
            <div className="mb-[18px] flex items-center gap-[9px]">
              {/* Was hand-rolled here at list-row sizes (12.5px/ink-2) while the design specifies
                  16px/ink-1 for the detail header — the shared component's `header` variant, which
                  until now had no caller at all. */}
              <Identifier
                identifier={issue.identifier}
                legacy={issue.legacyIdentifier}
                variant="header"
              />
              {issue.legacyIdentifier && (
                <span className="text-115 text-ink-8">was {issue.legacyIdentifier} in Linear</span>
              )}
            </div>

            {issue.archivedAt && (
              <div className="mb-4 rounded-lg border border-dashed border-line-strong bg-surface-hi px-3 py-2.5 text-125 text-ink-5">
                Archived. It is off every list and every filter; restoring it from the panel puts it back where it was.
              </div>
            )}

            <EditableIssueTitle
              identifier={issue.identifier}
              title={issue.title}
            />

            {/* The epic used to be repeated here as a card. It is now a crumb
                in the header, which is where a container belongs and leaves the
                properties rail as the only other place it appears — two, rather
                than three, copies of the same one-word fact. */}

            <div className="mt-[30px]">
              <EditableDescription
                endpoint={`/issues/${issue.identifier}`}
                source={issue.description}
              >
                <Markdown source={issue.description ?? ""} />
              </EditableDescription>
            </div>

            {issue.isEpic && (
              <EpicChildren
                epic={issue}
                contained={contained}
                states={states}
                candidates={candidates}
              />
            )}
          </div>
        </div>

        <aside className="sp-scroll w-[300px] flex-none overflow-y-auto px-5 py-6">
          <IssueProperties
            issue={issue}
            states={states}
            labels={labels}
            epics={epics}
          />

          <div className="my-4 h-px bg-line-chrome" />
          <IssueArchiveControl issue={issue} />

          {/* Always drawn, unlike before: the section used to appear only once
              a relation existed, which meant the only way to make the first one
              was to already have one. */}
          <div className="my-4 h-px bg-line-chrome" />
          <IssueRelations issue={issue} />

          {issue.legacyIdentifier && (
            <>
              <div className="my-4 h-px bg-line-chrome" />
              <div className="mb-2.5 text-11 font-semibold tracking-section text-ink-8">LEGACY</div>
              <div className="rounded-lg border border-dashed border-line-legacy bg-overlay px-[11px] py-2.5">
                <div className="identifier text-11 text-ink-4">{issue.legacyIdentifier}</div>
                <div className="mt-[5px] text-115 leading-[1.5] text-ink-7">
                  Indexed and searchable. <span className="identifier text-105">/issue/{issue.legacyIdentifier}</span>{" "}
                  redirects here.
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
