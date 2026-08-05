import { ROUTES } from "@components/shared/config/constants";
import { EpicGlyph } from "@components/ui/epic-glyph";
import { ProjectIcon } from "@components/ui/project-icon";
import Link from "next/link";

import type { IssueRefDto, ProjectSummaryDto } from "@lib/api-types";

/**
 * The 48px breadcrumb bar. Always `Projects / …`; the project crumb carries its
 * icon so the colour that identifies it in the sidebar follows it up here.
 *
 * An epic slots in as its own crumb because that is what it is — a container an
 * issue sits inside, one level deep, which is exactly the depth a breadcrumb
 * can show without becoming a puzzle (COS-279).
 */
export function AppHeader({
  project,
  epic,
  leaf,
  actions,
}: {
  project?: ProjectSummaryDto | null;
  /** The epic the leaf belongs to, between the project and the issue. */
  epic?: IssueRefDto | null;
  leaf: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex h-12 flex-none items-center gap-2.5 border-b border-line-chrome px-4">
      <div className="flex items-center gap-[7px] text-13 text-ink-6">
        <Link href={ROUTES.projects.path}>Projects</Link>
        {project && (
          <>
            <span className="text-ink-9">/</span>
            <Link
              href={ROUTES.projectOverview.path(project.key)}
              className="flex items-center gap-1.5"
            >
              <ProjectIcon
                project={project}
                size={17}
                glyph={15}
              />
              <span className="font-medium text-ink-2">{project.name}</span>
            </Link>
          </>
        )}
        {epic && (
          <>
            <span className="text-ink-9">/</span>
            <Link
              href={ROUTES.issue.path(epic.identifier)}
              title={epic.title}
              className="flex min-w-0 items-center gap-1.5"
            >
              <EpicGlyph size={11} />
              <span className="identifier flex-none text-11 text-ink-5">{epic.identifier}</span>
              {/* Capped rather than truncated by the flex parent: an epic titled
                  "Migrate the reporting pipeline off the legacy warehouse"
                  would otherwise push the issue's own crumb off the bar. */}
              <span className="max-w-[190px] truncate text-ink-4">{epic.title}</span>
            </Link>
          </>
        )}
        <span className="text-ink-9">/</span>
        <span className="flex-none text-ink-2">{leaf}</span>
      </div>
      <div className="flex-1" />
      {actions}
    </header>
  );
}
