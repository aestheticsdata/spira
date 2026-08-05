/** What the API accepts. `blocked_by` is a reading direction, not a stored row. */
export const RELATION_DIRECTIONS = ["blocks", "blocked_by", "related"] as const;
export type RelationDirection = (typeof RELATION_DIRECTIONS)[number];

/** What the table holds. */
export const STORED_RELATION_TYPES = ["blocks", "related"] as const;
export type StoredRelationType = (typeof STORED_RELATION_TYPES)[number];

export interface RelationRow {
  fromIssueId: string;
  toIssueId: string;
  type: StoredRelationType;
}

/**
 * `blocks` is directional and stored as given — "from blocks to". `related` has
 * no direction, so the pair is ordered lower-id-first: otherwise A→B and B→A
 * would both pass the unique index and the same relation would exist twice.
 */
export function normaliseRelation({
  fromId,
  toId,
  type,
}: {
  fromId: string;
  toId: string;
  type: StoredRelationType;
}): RelationRow {
  if (type === "related" && toId < fromId) {
    return { fromIssueId: toId, toIssueId: fromId, type };
  }

  return { fromIssueId: fromId, toIssueId: toId, type };
}
