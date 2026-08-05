import { ProjectForm } from "@components/projects/project-form";
import { EMPTY_PROJECT } from "@components/projects/project-form.util";
import { AppHeader } from "@components/shell/app-header";
import { serverFetch } from "@lib/server-api";

import type { WorkflowStateDto } from "@lib/api-types";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "New project · Spira" };

/**
 * `/projects/new` sits above the dynamic `/[key]/…` routes, which is why NEW is
 * one of the reserved project keys: a project claiming it would be shadowed by
 * this page.
 */
export default async function NewProjectPage() {
  const states = await serverFetch<WorkflowStateDto[]>("/states");

  // The first backlog state, matching what the API would have defaulted to had
  // the form sent nothing — so the select opens on the truth.
  const backlog = states.find((state) => state.type === "backlog") ?? states[0];

  return (
    <>
      <AppHeader leaf="New project" />

      <div className="sp-scroll min-h-0 flex-1 overflow-y-auto pt-10 pb-20">
        <div className="mx-auto flex max-w-[720px] flex-col gap-[30px] px-6">
          <div>
            <h1 className="text-22 font-semibold tracking-title text-ink-1">New project</h1>
            <p className="mt-[9px] text-135 text-ink-5">
              The key is the part that sticks: every issue in this project is named after it.
            </p>
          </div>

          <ProjectForm
            states={states}
            initial={{ ...EMPTY_PROJECT, statusId: backlog?.id ?? "" }}
          />
        </div>
      </div>
    </>
  );
}
