import { NewIssueTrigger } from "@components/issues/new-issue-trigger";
import { ROUTES } from "@components/shared/config/constants";
import { SearchTrigger } from "@components/shell/search-trigger";
import { SidebarLink } from "@components/shell/sidebar-link";
import { ProjectIcon } from "@components/ui/project-icon";
import { splitViews } from "@components/views/saved-views.util";
import Image from "next/image";
import Link from "next/link";

import type { ProjectListItemDto, SavedViewDto } from "@lib/api-types";

export function Sidebar({ projects, views }: { projects: ProjectListItemDto[]; views: SavedViewDto[] }) {
  const { workspace, project } = splitViews(views);

  return (
    <nav className="flex w-[236px] flex-none flex-col border-r border-line-chrome bg-sidebar px-2 py-2.5">
      <div className="flex items-center gap-[9px] px-1.5 pt-[5px] pb-3">
        <Image
          src="/spira-mark.svg"
          alt="Spira"
          width={22}
          height={22}
          priority
        />
        <div className="flex-1 text-13 font-semibold tracking-row text-ink-2">Spira</div>
        {/* U+200A HAIR SPACE, as the design has it — JSX does not decode HTML
            entities, so `&hairsp;` would render literally. */}
        <div className="identifier rounded-sm border border-line px-1 py-0.5 text-9 text-ink-8">{"1 user"}</div>
      </div>

      <NewIssueTrigger projects={projects} />
      <SearchTrigger />

      {/* The two section links sit a pixel shorter than a project row. */}
      <SidebarLink
        href={ROUTES.projects.path}
        label="Projects"
        className="h-[29px]"
        icon={<span className="size-3 rounded-[3px] border-[1.5px] border-current opacity-75" />}
      />
      <SidebarLink
        href={ROUTES.views.path}
        label="Saved views"
        className="h-[29px]"
        icon={<span className="size-3 border-t-[1.5px] border-b-[1.5px] border-current opacity-75" />}
      />

      {/* Workspace views first, then the project ones, which is the split the
          ticket asks for and the order the API already returns. A project view
          carries its key the way a project row does, so the two halves are told
          apart by what is on the row rather than by a second heading. */}
      {views.length > 0 && (
        <div className="sp-scroll mt-px flex max-h-[168px] flex-col gap-px overflow-y-auto pl-[13px]">
          {[...workspace, ...project].map((view) => (
            <SidebarLink
              key={view.id}
              href={ROUTES.view.path(view.id)}
              label={view.name}
              matchParam={{ key: "view", value: view.id }}
              className="h-[26px] text-125"
              icon={
                <ProjectIcon
                  project={{ icon: view.icon ?? "filter_list", color: null, name: view.name }}
                  size={13}
                  glyph={13}
                />
              }
              trailing={
                view.project && <span className="identifier text-9 tracking-key text-ink-8">{view.project.key}</span>
              }
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between px-2 pt-[18px] pb-1.5">
        <div className="text-105 font-semibold tracking-section text-ink-8">PROJECTS</div>
        <div className="identifier text-10 text-ink-9">key</div>
      </div>

      <div className="sp-scroll flex min-h-0 flex-1 flex-col gap-px overflow-y-auto">
        {projects.map((project) => (
          <SidebarLink
            key={project.id}
            href={ROUTES.projectIssues.path(project.key)}
            label={project.name}
            matchPrefix={`/${project.key.toLowerCase()}`}
            icon={
              <ProjectIcon
                project={project}
                glyph={16}
              />
            }
            trailing={<span className="identifier text-9 tracking-key text-ink-8">{project.key}</span>}
          />
        ))}
      </div>

      <div className="mt-2 flex flex-col gap-px border-t border-line-chrome pt-2">
        <Link
          href="/settings"
          className="flex h-7 items-center gap-[9px] rounded-md px-2 text-125 text-ink-5 hover:bg-line-soft hover:text-ink-2"
        >
          Settings
        </Link>
      </div>
    </nav>
  );
}
