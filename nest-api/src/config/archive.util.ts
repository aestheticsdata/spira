/**
 * Nothing in Spira is deleted; things are archived, and archiving is a
 * timestamp. Both services that own an archivable row compute it the same way,
 * so the rule lives here rather than twice.
 */
export function archivedAtFor(archived: boolean | undefined, current: Date | null): Date | null | undefined {
  // `undefined` means the caller did not mention it — leave the column alone.
  if (archived === undefined) {
    return undefined;
  }
  // Re-archiving something already archived must not move the timestamp: it
  // records when the row left, and a second PATCH is not a second departure.
  return archived ? (current ?? new Date()) : null;
}
