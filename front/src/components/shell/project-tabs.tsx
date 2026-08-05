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
            "flex h-[25px] items-center rounded-md px-[11px] text-125 hover:bg-surface-active",
            pathname === tab.href ? "bg-line text-ink-1" : "text-ink-5",
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
