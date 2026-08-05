"use client";

import { cn } from "@lib/utils";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A sidebar row.
 *
 * `matchPrefix` exists for project rows: the project stays highlighted across
 * its Issues and Overview tabs, and while one of its issues is open, rather
 * than only on the exact href.
 *
 * `matchParam` exists for saved views, which live in the query rather than in
 * the path: a project view is opened by pushing its query onto that project's
 * list, so the path says `/spi/issues` and only `?view=` says which view.
 */
export function SidebarLink({
  href,
  label,
  icon,
  trailing,
  matchPrefix,
  matchParam,
  className,
}: {
  href: string;
  label: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  matchPrefix?: string;
  matchParam?: { key: string; value: string };
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const active = matchParam
    ? searchParams.get(matchParam.key) === matchParam.value
    : matchPrefix
      ? pathname.startsWith(matchPrefix)
      : pathname.replace(/\/$/, "") === href;

  return (
    <Link
      href={href}
      className={cn(
        "flex h-[30px] items-center gap-[9px] rounded-md px-2 text-13 hover:bg-line-soft",
        active ? "bg-surface-active text-ink-1" : "text-ink-4",
        className,
      )}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {trailing}
    </Link>
  );
}
