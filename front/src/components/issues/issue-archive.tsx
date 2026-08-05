"use client";

import { ROUTES } from "@components/shared/config/constants";
import useRequestHelper from "@helpers/useRequestHelper";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import type { IssueDetailDto } from "@lib/api-types";

/**
 * Archive and restore, the only way an issue leaves a list.
 *
 * Nothing is deleted in Spira, so the pair has to be symmetrical: `DELETE`
 * archives and `PATCH { archived: false }` brings it back. Archiving navigates
 * away — the issue is gone from every list, and leaving the owner on a page
 * that is no longer reachable from anywhere would be a dead end. Restoring
 * stays put, because the page has just become real again.
 */
export function IssueArchiveControl({ issue }: { issue: IssueDetailDto }) {
  const router = useRouter();
  const { privateRequest } = useRequestHelper();
  const [busy, setBusy] = useState(false);

  const archived = issue.archivedAt !== null;

  const run = async () => {
    setBusy(true);
    try {
      if (archived) {
        await privateRequest<IssueDetailDto>(`/issues/${issue.identifier}`, {
          method: "PATCH",
          body: JSON.stringify({ archived: false }),
        });
        toast.success(`${issue.identifier} restored.`);
        router.refresh();
      } else {
        await privateRequest<{ ok: boolean }>(`/issues/${issue.identifier}`, { method: "DELETE" });
        toast.success(`${issue.identifier} archived.`);
        router.push(ROUTES.projectIssues.path(issue.project.key));
        router.refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The issue could not be archived.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={run}
      className="text-115 text-ink-7 hover:text-ink-4 disabled:opacity-50"
    >
      {archived ? "Restore issue" : "Archive issue"}
    </button>
  );
}
