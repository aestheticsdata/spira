import { IssueProperties } from "@components/issues/issue-properties";
import { IssueRelations } from "@components/issues/issue-relations";
import { Markdown } from "@components/markdown/markdown";
import { ROUTES } from "@components/shared/config/constants";
import { AppHeader } from "@components/shell/app-header";
import { EpicGlyph } from "@components/ui/epic-glyph";
import { serverFetchOptional } from "@lib/server-api";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import type { IssueDetailDto } from "@lib/api-types";

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

  const hasRelations = issue.relations.blockedBy.length > 0 || issue.relations.blocks.length > 0;

  return (
    <>
      <AppHeader
        project={issue.project}
        leaf={issue.identifier}
      />
      <div className="flex min-h-0 flex-1">
        <div className="sp-scroll min-w-0 flex-1 overflow-y-auto border-r border-line-chrome pt-10 pb-[90px]">
          <div className="mx-auto max-w-[700px] px-[30px]">
            <div className="mb-[18px] flex items-center gap-[9px]">
              <span className="identifier text-125 font-medium tracking-[0.02em] text-ink-2">{issue.identifier}</span>
              {issue.legacyIdentifier && (
                <>
                  <span className="identifier rounded-sm border border-dashed border-line-legacy px-[5px] py-px text-105 text-ink-6">
                    {issue.legacyIdentifier}
                  </span>
                  <span className="text-115 text-ink-8">was {issue.legacyIdentifier} in Linear</span>
                </>
              )}
            </div>

            <h1 className="text-25 leading-[1.25] font-semibold tracking-title text-ink-1 text-pretty">
              {issue.title}
            </h1>

            {issue.epic && (
              <Link
                href={ROUTES.issue.path(issue.epic.identifier)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface-hi py-[5px] pr-[11px] pl-2 hover:border-line-focus"
              >
                <EpicGlyph size={13} />
                <span className="identifier text-105 text-ink-link">{issue.epic.identifier}</span>
                <span className="text-125 text-ink-4">{issue.epic.title}</span>
              </Link>
            )}

            <div className="mt-[30px]">
              {issue.description ? (
                <Markdown source={issue.description} />
              ) : (
                <p className="text-14 leading-[1.65] text-ink-7">No description yet.</p>
              )}
            </div>
          </div>
        </div>

        <aside className="sp-scroll w-[300px] flex-none overflow-y-auto px-5 py-6">
          <IssueProperties issue={issue} />

          {hasRelations && (
            <>
              <div className="my-4 h-px bg-line-chrome" />
              <IssueRelations relations={issue.relations} />
            </>
          )}

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
