import type { SavedViewDto } from "@lib/api-types";

/**
 * The rules the saved-views UI needs, kept out of the components that draw it
 * (COS-278).
 */

export interface ViewGroups {
  /** Views that apply everywhere. */
  workspace: SavedViewDto[];
  /** Views belonging to a project — narrowed to one when a key is given. */
  project: SavedViewDto[];
}

/**
 * The split the sidebar and the manage page both draw.
 *
 * `projectKey` narrows the project half to the project being looked at, which
 * is what the sidebar wants: a view saved on PFA is noise while you are inside
 * SPI. Without a key every project view comes back, which is what the manage
 * page wants — that page is the one place they can all be reached.
 */
export function splitViews(views: SavedViewDto[], projectKey?: string | null): ViewGroups {
  const wanted = projectKey?.toUpperCase();

  return {
    workspace: views.filter((view) => view.project === null),
    project: views.filter((view) => view.project !== null && (!wanted || view.project.key === wanted)),
  };
}

export interface ViewPosition {
  id: string;
  position: number;
}

/**
 * The writes that move a view one step, or none when it cannot go that way.
 *
 * A view only ever moves within its own scope: a project view has no meaning
 * above the workspace ones, and a swap across the boundary would reorder two
 * lists at once.
 *
 * The whole scope is renumbered from zero rather than two positions being
 * swapped. Positions are not unique — the API allows ties on purpose, so that
 * a multi-row reorder cannot fail halfway — and swapping two equal numbers
 * would be a move that changes nothing. Only rows whose position actually
 * changes are returned, so the common case is still two requests.
 */
export function reorderViews(views: SavedViewDto[], id: string, direction: -1 | 1): ViewPosition[] {
  const target = views.find((view) => view.id === id);
  if (!target) {
    return [];
  }

  const scopeId = target.project?.id ?? null;
  // Same tie-break as the API's own ordering, so the indices here are the ones
  // the sidebar is showing rather than a second opinion on them.
  const scope = views
    .filter((view) => (view.project?.id ?? null) === scopeId)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

  const from = scope.findIndex((view) => view.id === id);
  const to = from + direction;

  if (to < 0 || to >= scope.length) {
    return [];
  }

  const moved = [...scope];
  moved.splice(to, 0, ...moved.splice(from, 1));

  const before = new Map(scope.map((view) => [view.id, view.position]));

  return moved
    .map((view, position) => ({ id: view.id, position }))
    .filter((write) => before.get(write.id) !== write.position);
}
