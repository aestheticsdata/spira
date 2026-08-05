import Providers from "@app/providers";
import { Sidebar } from "@components/shell/sidebar";
import { isApiError, serverFetch } from "@lib/server-api";
import { redirect } from "next/navigation";

import type { AuthenticatedUserDto, ProjectListItemDto, SavedViewDto } from "@lib/api-types";

/**
 * The authenticated shell. `/users/me` is the real authorisation check for the
 * page load — middleware only saw that a cookie existed. Its CSRF token seeds
 * the client context, so the first mutation after a reload does not need an
 * extra round-trip to find one.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let user: AuthenticatedUserDto;
  let projects: ProjectListItemDto[];
  let views: SavedViewDto[];

  try {
    [user, projects, views] = await Promise.all([
      serverFetch<AuthenticatedUserDto>("/users/me"),
      serverFetch<ProjectListItemDto[]>("/projects"),
      serverFetch<SavedViewDto[]>("/views"),
    ]);
  } catch (error) {
    // Only a refused session is a reason to show the login screen. An API that
    // is down or throwing 500s is a real fault and has to reach error.tsx —
    // sending it here instead would blame the user for an outage.
    if (!isApiError(error) || (error.status !== 401 && error.status !== 403)) {
      throw error;
    }
    redirect("/login");
  }

  return (
    <Providers initialUser={user}>
      <div className="flex h-screen min-h-0">
        <Sidebar
          projects={projects}
          views={views}
        />
        <main className="flex min-w-0 flex-1 flex-col bg-canvas">{children}</main>
      </div>
    </Providers>
  );
}
