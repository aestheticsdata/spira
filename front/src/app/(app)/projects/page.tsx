import { ROUTES } from "@components/shared/config/constants";
import { AppHeader } from "@components/shell/app-header";
import { ProgressBar } from "@components/ui/progress-pill";
import { ProjectIcon } from "@components/ui/project-icon";
import { StateIcon } from "@components/ui/state-icon";
import { serverFetch } from "@lib/server-api";
import Link from "next/link";

import type { ProjectListItemDto } from "@lib/api-types";

/**
 * Row density is a deliberate departure from the design file, at the owner's
 * request: it specifies 52px rows with a 24px icon and a 13.5px name here,
 * against 36px rows on the issues list. Two lists a click apart reading at two
 * different densities looked wrong, so this one adopts the issues rhythm —
 * 36px, 18px icon, 13px name. Everything else still follows the design.
 */
export default async function ProjectsPage() {
  const projects = await serverFetch<ProjectListItemDto[]>("/projects");

  return (
    <>
      <AppHeader leaf="All projects" />

      {projects.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2.5">
          <p className="text-135 text-ink-7">Nothing here yet — Spira starts with a project.</p>
          <Link
            href="/projects/new"
            className="text-125"
          >
            Create the first one
          </Link>
        </div>
      ) : (
        <div className="sp-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="flex h-8 items-center border-b border-line-chrome px-4 text-11 font-semibold tracking-[0.06em] text-ink-8">
            <div className="min-w-[220px] flex-1">NAME</div>
            <div className="w-[92px] flex-none">KEY</div>
            <div className="w-[200px] flex-none">SUMMARY</div>
            <div className="w-[86px] text-right">ISSUES</div>
            <div className="w-[150px] text-right">PROGRESS</div>
            <div className="w-[110px] text-right">STATUS</div>
          </div>

          {projects.map((project) => (
            <Link
              key={project.id}
              href={ROUTES.projectIssues.path(project.key)}
              className="flex h-9 items-center border-b border-line-soft px-4 hover:bg-surface-hover"
            >
              <div className="flex min-w-[220px] flex-1 items-center gap-2.5">
                <ProjectIcon
                  project={project}
                  size={18}
                  glyph={16}
                />
                <div className="truncate text-13 font-medium text-ink-2">{project.name}</div>
              </div>
              <div className="w-[92px] flex-none">
                {/* The key wears the project's own colour, so it is data, not a class. */}
                <span
                  className="identifier rounded-sm px-1.5 py-0.5 text-105 tracking-key"
                  style={{ color: project.color ?? "var(--ink-4)" }}
                >
                  {project.key}
                </span>
              </div>
              <div className="w-[200px] flex-none truncate pr-5 text-12 text-ink-6">{project.summary}</div>
              <div className="identifier w-[86px] text-right text-12 text-ink-4">{project.issueCount}</div>
              <div className="flex w-[150px] items-center justify-end gap-2.5">
                <ProgressBar
                  value={project.progress}
                  width={70}
                />
                <span className="identifier w-[34px] text-right text-11 text-ink-6">
                  {Math.round(project.progress * 100)}%
                </span>
              </div>
              <div className="flex w-[110px] items-center justify-end gap-[7px] text-125 text-ink-5">
                <StateIcon
                  state={project.status}
                  size={11}
                />
                {project.status.name}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
