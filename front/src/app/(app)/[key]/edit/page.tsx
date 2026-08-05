import { ProjectForm } from "@components/projects/project-form";
import { toFormValues } from "@components/projects/project-form.util";
import { AppHeader } from "@components/shell/app-header";
import { ProjectTabs } from "@components/shell/project-tabs";
import { serverFetch, serverFetchOptional } from "@lib/server-api";
import { notFound } from "next/navigation";

import type { ProjectDto, WorkflowStateDto } from "@lib/api-types";

export default async function EditProjectPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const [project, states] = await Promise.all([
    serverFetchOptional<ProjectDto>(`/projects/${key.toUpperCase()}`),
    serverFetch<WorkflowStateDto[]>("/states"),
  ]);

  if (!project) {
    notFound();
  }

  return (
    <>
      <AppHeader
        project={project}
        leaf="Edit"
      />
      <ProjectTabs projectKey={project.key} />

      <div className="sp-scroll min-h-0 flex-1 overflow-y-auto pt-10 pb-20">
        <div className="mx-auto flex max-w-[720px] flex-col gap-[30px] px-6">
          <div>
            <h1 className="text-22 font-semibold tracking-title text-ink-1">Edit {project.name}</h1>
            <p className="mt-[9px] text-135 text-ink-5">
              {project.issueCount === 0
                ? "No issues yet, so the key is still free to change without consequence."
                : `${project.issueCount} issues carry the ${project.key}- prefix already.`}
            </p>
          </div>

          <ProjectForm
            project={project}
            states={states}
            initial={toFormValues(project)}
          />
        </div>
      </div>
    </>
  );
}
