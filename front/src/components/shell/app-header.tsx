import { ROUTES } from "@components/shared/config/constants";
import { ProjectIcon } from "@components/ui/project-icon";
import Link from "next/link";

import type { ProjectSummaryDto } from "@lib/api-types";

/**
 * The 48px breadcrumb bar. Always `Projects / …`; the project crumb carries its
 * icon so the colour that identifies it in the sidebar follows it up here.
 */
export function AppHeader({
  project,
  leaf,
  actions,
}: {
  project?: ProjectSummaryDto | null;
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
        <span className="text-ink-9">/</span>
        <span className="text-ink-2">{leaf}</span>
      </div>
      <div className="flex-1" />
      {actions}
    </header>
  );
}
