"use client";

import { NewIssueDialog } from "@components/issues/new-issue-dialog";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { ProjectSummaryDto } from "@lib/api-types";

/**
 * The workspace-wide way in, sitting at the top of the sidebar where Linear
 * puts it. One dialog for the whole shell, so `c` works on any screen.
 */
export function NewIssueTrigger({ projects }: { projects: ProjectSummaryDto[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Which project the owner is looking at, read off the URL rather than
  // threaded down through every page. Matched against the real project list, so
  // `/views` and `/issue/SPI-24` are misses rather than a project named VIEWS.
  const segment = (pathname.split("/")[1] ?? "").toUpperCase();
  const current = projects.find((project) => project.key === segment);

  // `c` creates, as it does in Linear — unless the key already means something
  // where the focus is. A `<select>` counts: a letter there jumps to the option
  // starting with it, which the project form's four selects rely on.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "c" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      event.preventDefault();
      setOpen(true);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-2 flex h-[30px] items-center gap-2 rounded-md border border-primary-border bg-primary-bg px-2 text-left hover:bg-primary-bg-hover"
      >
        <span className="grid size-[13px] flex-none place-items-center text-13 leading-none text-primary-ink">+</span>
        <span className="flex-1 text-125 font-medium text-primary-ink">New issue</span>
        <span className="identifier rounded-[3px] bg-surface-active px-1 py-px text-10 text-ink-8">c</span>
      </button>

      <NewIssueDialog
        open={open}
        onOpenChange={setOpen}
        projects={projects}
        defaultProjectKey={current?.key}
      />
    </>
  );
}
