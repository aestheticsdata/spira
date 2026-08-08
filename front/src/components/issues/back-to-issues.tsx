import { ROUTES } from "@components/shared/config/constants";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * The way back to the list. Opening an issue trades the project tabs for the
 * breadcrumb bar, so the `Issues` button leaves exactly when it is wanted, and
 * the project crumb goes to Overview rather than to the list (SPI-60).
 *
 * It lives in the reading pane's left margin, level with the identifier at the
 * top of the title block — but that margin is `(pane - 760) / 2`, which is some
 * 310px at 1920, 72px at 1440 and gone entirely below ~1300. So this is one
 * element in two positions rather than two elements: a container query lifts it
 * out into the gutter once the pane is wide enough to hold it, and below that it
 * stays in flow as the first thing on the identifier line. Nothing is duplicated
 * and it can never end up sitting on top of the title.
 *
 * The threshold is the width the link needs: ~103px of arrow, gap and label,
 * plus the 26px that keeps it off the column and a little air at the pane edge.
 */
export function BackToIssues({ projectKey }: { projectKey: string }) {
  return (
    <Link
      href={ROUTES.projectIssues.path(projectKey)}
      className="flex flex-none items-center gap-[5px] whitespace-nowrap text-115 text-ink-7 transition-colors hover:text-ink-4 @min-[990px]:absolute @min-[990px]:top-1/2 @min-[990px]:right-full @min-[990px]:mr-[26px] @min-[990px]:-translate-y-1/2"
    >
      <ArrowLeft
        size={14}
        strokeWidth={1.75}
        aria-hidden
      />
      Back to issues
    </Link>
  );
}
