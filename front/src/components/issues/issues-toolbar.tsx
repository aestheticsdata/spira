"use client";

import { FilterButton } from "@components/filters/filter-controls";
import { Button } from "@components/ui/button";
import { parseAsBoolean, parseAsStringLiteral, useQueryStates } from "nuqs";

import type { IssueListItemDto, LabelDto, WorkflowStateDto } from "@lib/api-types";

const GROUP_MODES = ["status", "epic"] as const;

/**
 * How the same rows are drawn, as opposed to which rows they are. The filter
 * set lives in `@components/filters/issue-filters` and owns its own keys; these
 * two are display options, and `useIssueFilters` carries them across a filter
 * change rather than either side clearing the other.
 */
const ISSUES_VIEW = {
  group: parseAsStringLiteral(GROUP_MODES).withDefault("status"),
  legacy: parseAsBoolean.withDefault(true),
};

// The list is a Server Component, so a change has to reach the server rather
// than only the client router.
const VIEW_OPTIONS = { shallow: false, clearOnDefault: true };

export function IssuesToolbar({
  states,
  labels,
  epics,
}: {
  states: WorkflowStateDto[];
  labels: LabelDto[];
  epics: IssueListItemDto[];
}) {
  const [{ group, legacy }, setView] = useQueryStates(ISSUES_VIEW, VIEW_OPTIONS);

  return (
    <div className="flex items-center gap-1.5">
      <FilterButton
        states={states}
        labels={labels}
        epics={epics}
      />

      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setView({ group: group === "status" ? "epic" : "status" })}
      >
        Group:
        <span className="font-medium text-ink-2">{group === "status" ? "Status" : "Epic"}</span>
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setView({ legacy: !legacy })}
      >
        Legacy IDs:
        <span className="font-medium text-ink-2">{legacy ? "Shown" : "Hidden"}</span>
      </Button>
    </div>
  );
}
