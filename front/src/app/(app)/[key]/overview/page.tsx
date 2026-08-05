import { Markdown } from "@components/markdown/markdown";
import { ROUTES } from "@components/shared/config/constants";
import { AppHeader } from "@components/shell/app-header";
import { ProjectTabs } from "@components/shell/project-tabs";
import { Button } from "@components/ui/button";
import { ProgressBar } from "@components/ui/progress-pill";
import { ProjectIcon } from "@components/ui/project-icon";
import { StateIcon } from "@components/ui/state-icon";
import { serverFetchOptional } from "@lib/server-api";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { ProjectDto } from "@lib/api-types";

export default async function ProjectOverviewPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const project = await serverFetchOptional<ProjectDto>(`/projects/${key.toUpperCase()}`);

  if (!project) {
    notFound();
  }

  const progress = `${Math.round(project.progress * 100)}%`;
  const legacyNote =
    project.legacyCount === 0
      ? "Native project — no legacy identifiers"
      : `${project.legacyCount} issues renumbered from COS-, legacy identifiers preserved`;

  return (
    <>
      <AppHeader
        project={project}
        leaf="Overview"
        actions={
          <Button
            asChild
            variant="outline"
            size="xs"
          >
            <Link href={ROUTES.projectEdit.path(project.key)}>Edit</Link>
          </Button>
        }
      />
      <ProjectTabs projectKey={project.key} />

      <div className="sp-scroll min-h-0 flex-1 overflow-y-auto pt-11 pb-20">
        <div className="mx-auto max-w-[720px] px-6">
          <ProjectIcon
            project={project}
            size={36}
            glyph={28}
            className="mb-[18px] rounded-xl"
          />

          <div className="flex items-baseline gap-3">
            <h1 className="text-27 font-semibold tracking-title text-ink-1">{project.name}</h1>
            <span className="identifier rounded-[5px] border border-line px-1.5 py-0.5 text-12 text-ink-6">
              {project.key}-
            </span>
          </div>

          {project.summary && <p className="mt-3 text-pretty text-15 leading-[1.55] text-ink-4">{project.summary}</p>}

          <dl className="mt-[30px] grid grid-cols-[96px_1fr] items-center gap-x-5 gap-y-3.5 border-y border-line-chrome py-[18px]">
            <dt className="text-125 text-ink-7">Status</dt>
            <dd className="flex items-center gap-2 text-13 text-ink-3">
              <StateIcon
                state={project.status}
                size={12}
              />
              {project.status.name}
            </dd>

            <dt className="text-125 text-ink-7">Issue key</dt>
            <dd className="flex items-center gap-2 text-13 text-ink-3">
              <span className="identifier text-ink-2">{project.key}-1</span>
              <span className="text-12 text-ink-7">· unique, editable, drives every identifier in this project</span>
            </dd>

            <dt className="text-125 text-ink-7">Issues</dt>
            <dd className="flex items-center gap-2.5 text-13 text-ink-3">
              <span>{project.issueCount} issues</span>
              <ProgressBar
                value={project.progress}
                width={90}
              />
              <span className="identifier text-11 text-ink-6">{progress}</span>
            </dd>

            <dt className="text-125 text-ink-7">Migrated</dt>
            <dd className="text-13 text-ink-3">{legacyNote}</dd>
          </dl>

          <section className="mt-[34px]">
            <h2 className="mb-[18px] text-11 font-semibold tracking-section text-ink-8">DESCRIPTION</h2>
            {project.description ? (
              <Markdown source={project.description} />
            ) : (
              <p className="text-14 leading-[1.65] text-ink-7">No description yet.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
