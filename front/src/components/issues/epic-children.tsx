import { DEFAULT_DISPLAY } from "@components/filters/display-options";
import { countedIssues } from "@components/issues/epic-children.util";
import { AddToEpic, RemoveFromEpic } from "@components/issues/epic-controls";
import { groupIssues } from "@components/issues/group-issues";
import { IssueGroup } from "@components/issues/issue-group";
import { IssueRow } from "@components/issues/issue-row";
import { QuickAddIssue } from "@components/issues/quick-add-issue";
import { ProgressPill } from "@components/ui/progress-pill";

import type { DisplayOptions } from "@components/filters/display-options";
import type { IssueDetailDto, IssueListItemDto, WorkflowStateDto } from "@lib/api-types";

/**
 * The columns a contained row carries. Not a display setting, unlike the list's
 * (COS-274): this section is 700px wide where the list is full-bleed, and the
 * dates are the first thing that has to go — inside an epic what matters is
 * what each piece is and where it stands, not when it was last touched.
 */
const CHILD_DISPLAY: DisplayOptions = {
  ...DEFAULT_DISPLAY,
  columns: ["identifier", "status", "priority", "labels"],
};

/**
 * What an epic contains, on the epic's own page (COS-279).
 *
 * Grouped by status and drawn with the list's own row, group header and
 * quick-add, so an epic reads as the slice of the issues list that it is rather
 * than as a second, slightly different table of the same rows.
 *
 * A server component: only the picker and the per-row remove are interactive,
 * and both are small client leaves. The rows themselves never ship.
 */
export function EpicChildren({
  epic,
  contained,
  states,
  candidates,
}: {
  epic: IssueDetailDto;
  contained: IssueListItemDto[];
  states: WorkflowStateDto[];
  /** The project's issues that sit in no epic — what the picker offers. */
  candidates: IssueListItemDto[];
}) {
  // The API's tally, not the rows': both count the same non-archived children,
  // but the epic's own figure is the one the ring is a picture of.
  const progress = epic.epicProgress ?? { done: 0, total: 0 };
  const groups = groupIssues(contained, states, "status");

  return (
    <section className="mt-11">
      <div className="mb-3 flex items-center gap-2.5">
        <h2 className="text-11 font-semibold tracking-section text-ink-8">CONTAINED ISSUES</h2>
        <ProgressPill
          done={progress.done}
          total={progress.total}
        />
        <span className="flex-1" />
        <AddToEpic
          epic={epic}
          candidates={candidates}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        {groups.map((group) => (
          <IssueGroup
            key={group.key}
            kind={group.kind}
            label={group.label}
            identifier={group.identifier}
            legacy={group.legacy}
            count={group.count}
            accent={group.accent}
            state={group.state}
            priority={group.priority}
            iconRadius={group.iconRadius}
            progress={group.progress}
            quickAdd={
              <QuickAddIssue
                projectKey={epic.project.key}
                stateId={group.quickAdd.stateId}
                // The group decides the status, the page decides the epic — so
                // filing from here is one field, the title, exactly as it is on
                // the list.
                epicId={epic.id}
                target={`${group.label} in ${epic.identifier}`}
                indent={group.indent}
              />
            }
          >
            {group.rows.map((child) => (
              <div
                key={child.id}
                className="group/child relative"
              >
                <IssueRow
                  issue={child}
                  indent={group.indent}
                  display={CHILD_DISPLAY}
                  withinEpic
                />
                <RemoveFromEpic child={child} />
              </div>
            ))}
          </IssueGroup>
        ))}

        {/* An epic with nothing in it still has to be fillable, and the picker
            above only offers issues that already exist — so the creator is
            here too, open, because this is the one state where it is the point
            of the section rather than a footnote to it. */}
        {contained.length === 0 && (
          <>
            <p className="px-4 pt-7 pb-3 text-center text-125 text-ink-7">
              {countedIssues(0)} in {epic.identifier} yet.
            </p>
            <div className="border-t border-line-soft">
              <QuickAddIssue
                projectKey={epic.project.key}
                stateId={null}
                epicId={epic.id}
                target={epic.identifier}
                indent={16}
                defaultOpen
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
