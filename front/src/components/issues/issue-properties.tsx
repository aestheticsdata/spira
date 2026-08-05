import { EpicGlyph } from "@components/ui/epic-glyph";
import { LabelChip } from "@components/ui/label-chip";
import { PriorityBars } from "@components/ui/priority-bars";
import { ProjectIcon } from "@components/ui/project-icon";
import { StateIcon } from "@components/ui/state-icon";
import { priorityName } from "@lib/status";

import type { IssueDetailDto } from "@lib/api-types";

/** One `[74px label][value]` line of the rail. */
function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 py-[7px]">
      <div className="w-[74px] flex-none text-12 text-ink-7">{label}</div>
      <div className="flex flex-1 flex-wrap items-center gap-[7px] text-125 text-ink-3">{children}</div>
    </div>
  );
}

export function IssueProperties({ issue }: { issue: IssueDetailDto }) {
  return (
    <div>
      <div className="mb-3.5 text-11 font-semibold tracking-section text-ink-8">PROPERTIES</div>

      <Property label="Status">
        <StateIcon
          state={issue.state}
          size={11}
        />
        {issue.state.name}
      </Property>

      <Property label="Priority">
        <PriorityBars priority={issue.priority} />
        {priorityName(issue.priority)}
      </Property>

      <Property label="Labels">
        {issue.labels.length > 0
          ? issue.labels.map((label) => (
              <LabelChip
                key={label.id}
                label={label}
              />
            ))
          : "None"}
      </Property>

      <Property label="Project">
        <ProjectIcon
          project={issue.project}
          size={13}
        />
        {issue.project.name}
      </Property>

      <Property label="Type">
        {issue.isEpic ? (
          <EpicGlyph size={11} />
        ) : (
          <span className="size-[11px] flex-none rounded-[3px] border-[1.5px] border-glyph" />
        )}
        {issue.isEpic ? `Epic · ${issue.epicProgress?.total ?? 0} issues` : "Issue"}
      </Property>
    </div>
  );
}
