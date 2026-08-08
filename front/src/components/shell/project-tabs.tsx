"use client";

import { ROUTES } from "@components/shared/config/constants";
import { cn } from "@lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProjectTabs({ projectKey, children }: { projectKey: string; children?: React.ReactNode }) {
  const pathname = usePathname().replace(/\/$/, "");

  const tabs = [
    { label: "Overview", href: ROUTES.projectOverview.path(projectKey) },
    { label: "Issues", href: ROUTES.projectIssues.path(projectKey) },
  ];

  return (
    <div className="flex h-10 flex-none items-center gap-2 border-b border-line-chrome px-4">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            // `hover:duration-0` is not a typo: Linear fills the pill the instant
            // the pointer lands and fades it back out over ~100ms on the way off,
            // which is the duration on the resting rule, not the hovered one.
            "flex h-[25px] items-center rounded-md px-[11px] text-125 transition-colors duration-100 hover:duration-0",
            // Every tab in the group is filled — an inactive one is a darker pill,
            // not bare text — and hovering one lands it on the active look rather
            // than somewhere below it, which is what it used to do.
            pathname === tab.href ? "bg-line text-ink-1" : "bg-surface-hi text-ink-6 hover:bg-line hover:text-ink-1",
          )}
        >
          {tab.label}
        </Link>
      ))}
      {children && (
        <>
          <span className="mx-1 h-[18px] w-px bg-line" />
          {children}
        </>
      )}
    </div>
  );
}
