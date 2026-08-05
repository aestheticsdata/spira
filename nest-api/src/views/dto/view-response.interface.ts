import type { ProjectSummaryDto } from "@projects/dto/project-response.interface";

export interface SavedViewDto {
  id: string;
  name: string;
  icon: string | null;
  /** Null for a workspace-wide view — the split the sidebar draws. */
  project: ProjectSummaryDto | null;
  /**
   * The canonical list query. Opening the view is pushing this into the URL;
   * null when the stored query no longer validates, so that a broken view
   * cannot be opened into a list that silently differs from the saved one.
   */
  query: string | null;
  position: number;
  /**
   * Why the stored query no longer validates, or null when it does.
   *
   * A view outlives the vocabulary it was saved against — a filter renamed, an
   * ordering dropped — and the ticket's rule is that this must be loud. It is
   * carried on the row rather than thrown, because one stale view should not
   * take the whole sidebar down with it.
   */
  invalid: string | null;
  createdAt: string;
  updatedAt: string;
}
