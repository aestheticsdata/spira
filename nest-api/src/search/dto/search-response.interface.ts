import type { WorkflowStateDto } from "@states/dto/workflow-state-response.interface";

/** Which pass produced the hit. The front labels the row on it. */
export type SearchMatch = "identifier" | "legacy" | "text";

export interface SearchResultDto {
  identifier: string;
  legacyIdentifier: string | null;
  title: string;
  projectKey: string;
  state: WorkflowStateDto;
  matchedOn: SearchMatch;
}

export interface SearchResponseDto {
  /** Set only when `q` was an exact legacy identifier — the front redirects on it. */
  legacyResolved: { legacy: string; identifier: string } | null;
  results: SearchResultDto[];
}
