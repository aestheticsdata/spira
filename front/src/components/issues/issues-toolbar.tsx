"use client";

import { DisplayButton } from "@components/filters/display-controls";
import { FilterButton } from "@components/filters/filter-controls";

import type { IssueListItemDto, LabelDto, WorkflowStateDto } from "@lib/api-types";

/**
 * Two buttons, matching Linear's: which rows (COS-277) and how they are drawn
 * (COS-274).
 *
 * The standalone Group and Legacy toggles that used to sit here are inside
 * Display now. They were always display settings, and keeping them in the
 * header meant two of them were one click away while the other four did not
 * exist at all.
 */
export function IssuesToolbar({
  states,
  labels,
  epics,
}: {
  states: WorkflowStateDto[];
  labels: LabelDto[];
  epics: IssueListItemDto[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <FilterButton
        states={states}
        labels={labels}
        epics={epics}
      />
      <DisplayButton />
    </div>
  );
}
