import type { IssueDetailDto, SearchResultDto } from "@lib/api-types";

/**
 * The three directions `POST /issues/:identifier/relations` accepts.
 *
 * `blocked_by` is a reading direction rather than a stored row — the service
 * writes the mirrored `blocks` — so the two ends of a block can never disagree
 * about which way it points. `related` is symmetric and normalised on write.
 */
export type RelationKind = "blocked_by" | "blocks" | "related";

export const RELATION_KINDS: { kind: RelationKind; label: string }[] = [
  { kind: "blocked_by", label: "Blocked by" },
  { kind: "blocks", label: "Blocks" },
  { kind: "related", label: "Related" },
];

/**
 * Every identifier already on the other end of a relation, whichever direction
 * it runs. Uppercased, because that is how identifiers are stored and how
 * search hands them back.
 */
export function linkedIdentifiers(relations: IssueDetailDto["relations"]): Set<string> {
  return new Set(
    [...relations.blockedBy, ...relations.blocks, ...relations.related].map((issue) => issue.identifier.toUpperCase()),
  );
}

export interface RelationTarget {
  result: SearchResultDto;
  /** Already on the other end of some relation; offered, but not clickable. */
  linked: boolean;
}

/**
 * Search results as relation targets.
 *
 * The issue itself is dropped outright — the service refuses it, and offering a
 * row that cannot be clicked for a reason as obvious as "that is this issue" is
 * noise. Ones already linked are kept and flagged instead, because a result
 * that quietly vanishes reads as "not found" rather than "already done".
 *
 * Matching is on the live identifier only. A hit on a legacy identifier still
 * carries the live one, which is what the relation would be written against.
 */
export function relationTargets(
  results: SearchResultDto[],
  selfIdentifier: string,
  linked: Set<string>,
): RelationTarget[] {
  const self = selfIdentifier.toUpperCase();

  return results
    .filter((result) => result.identifier.toUpperCase() !== self)
    .map((result) => ({ result, linked: linked.has(result.identifier.toUpperCase()) }));
}
