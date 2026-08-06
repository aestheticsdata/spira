import { AppHeader } from "@components/shell/app-header";
import { splitViews } from "@components/views/saved-views.util";
import { ViewList } from "@components/views/view-list";
import { serverFetch } from "@lib/server-api";

import type { SavedViewDto } from "@lib/api-types";

/**
 * Every saved view, and the one place they can be renamed, reordered and
 * deleted (COS-278).
 *
 * The sidebar lists them for reaching; this lists them for keeping. Splitting
 * that in two is what lets the sidebar stay a short column of names rather than
 * growing a row of controls beside each one.
 */
export default async function ViewsPage() {
  const views = await serverFetch<SavedViewDto[]>("/views");
  const { workspace, project } = splitViews(views);

  return (
    <>
      <AppHeader leaf="Saved views" />

      <div className="sp-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-[30px] py-9">
          <h1 className="mb-1 text-16 font-semibold tracking-[-.01em] text-ink-1">Saved views</h1>
          <p className="mb-8 text-125 leading-[1.55] text-ink-6">
            A view is the list you were looking at, kept: its filters, its grouping, its ordering and its columns.
            Opening one puts that query back in the address bar, so it behaves exactly as it would had you built it by
            hand.
          </p>

          <h2 className="mb-2.5 text-11 font-semibold tracking-section text-ink-8">WORKSPACE</h2>
          <ViewList
            views={workspace}
            heading="Workspace views"
          />

          <h2 className="mt-8 mb-2.5 text-11 font-semibold tracking-section text-ink-8">PROJECTS</h2>
          <ViewList
            views={project}
            heading="Project views"
          />

          <div className="h-[60px]" />
        </div>
      </div>
    </>
  );
}
