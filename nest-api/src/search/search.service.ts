import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SEARCH_LIMIT_DEFAULT, SearchQueryDto } from "@search/dto/search-query.dto";

import type { WorkflowStateDto } from "@states/dto/workflow-state-response.interface";
import type { SearchMatch, SearchResponseDto, SearchResultDto } from "@search/dto/search-response.interface";

/** InnoDB's default `innodb_ft_min_token_size`. Shorter terms can only be found by LIKE. */
const MIN_FULLTEXT_TERM = 3;

const ISSUE_SELECT = {
  id: true,
  identifier: true,
  legacyIdentifier: true,
  title: true,
  project: { select: { key: true } },
  state: { select: { id: true, name: true, type: true, color: true, position: true } },
} satisfies Prisma.IssueSelect;

type IssueRow = Prisma.IssueGetPayload<{ select: typeof ISSUE_SELECT }>;

function toSearchResult(row: IssueRow, matchedOn: SearchMatch): SearchResultDto {
  return {
    identifier: row.identifier,
    legacyIdentifier: row.legacyIdentifier,
    title: row.title,
    projectKey: row.project.key,
    state: {
      id: row.state.id,
      name: row.state.name,
      type: row.state.type as WorkflowStateDto["type"],
      color: row.state.color,
      position: row.state.position,
    },
    matchedOn,
  };
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(dto: SearchQueryDto): Promise<SearchResponseDto> {
    const term = dto.q.trim();
    const limit = dto.limit ?? SEARCH_LIMIT_DEFAULT;

    if (term.length === 0) {
      return { legacyResolved: null, results: [] };
    }

    // Identifiers are stored uppercase, so comparing the uppercased term makes the
    // match case-insensitive without depending on the column's collation.
    const identifierTerm = term.toUpperCase();

    const seen = new Set<string>();
    const results: SearchResultDto[] = [];
    const push = (row: IssueRow, matchedOn: SearchMatch): void => {
      if (results.length >= limit || seen.has(row.id)) {
        return;
      }
      seen.add(row.id);
      results.push(toSearchResult(row, matchedOn));
    };

    const [exact, legacy] = await Promise.all([
      this.prisma.issue.findFirst({
        where: { archivedAt: null, identifier: identifierTerm },
        select: ISSUE_SELECT,
      }),
      this.prisma.issue.findFirst({
        where: { archivedAt: null, legacyIdentifier: identifierTerm },
        select: ISSUE_SELECT,
      }),
    ]);

    const legacyResolved =
      legacy?.legacyIdentifier != null ? { legacy: legacy.legacyIdentifier, identifier: legacy.identifier } : null;

    if (exact) push(exact, "identifier");
    if (legacy) push(legacy, "legacy");

    if (results.length < limit) {
      for (const row of await this.prefixMatches(identifierTerm, limit)) {
        push(row, row.identifier.startsWith(identifierTerm) ? "identifier" : "legacy");
      }
    }

    if (results.length < limit) {
      for (const row of await this.textMatches(term, limit)) {
        push(row, "text");
      }
    }

    return { legacyResolved, results };
  }

  private prefixMatches(identifierTerm: string, limit: number): Promise<IssueRow[]> {
    return this.prisma.issue.findMany({
      where: {
        archivedAt: null,
        OR: [{ identifier: { startsWith: identifierTerm } }, { legacyIdentifier: { startsWith: identifierTerm } }],
      },
      select: ISSUE_SELECT,
      orderBy: { identifier: "asc" },
      take: limit,
    });
  }

  private async textMatches(term: string, limit: number): Promise<IssueRow[]> {
    if (term.length >= MIN_FULLTEXT_TERM) {
      const ids = await this.fullTextIds(term, limit);
      if (ids) {
        return this.hydrate(ids);
      }
    }
    return this.likeMatches(term, limit);
  }

  /**
   * Null means the FULLTEXT pass could not run: MySQL rejects `MATCH` outright
   * when the index is missing rather than degrading to a scan, so the caller
   * falls back to LIKE. The index is `@@fulltext` on the Issue model — it used
   * to be appended by hand, which is how an unrelated migration once dropped it.
   */
  private async fullTextIds(term: string, limit: number): Promise<string[] | null> {
    try {
      const rows = await this.prisma.$queryRaw<{ id: string; score: number }[]>`
        SELECT id, MATCH(title, description) AGAINST (${term} IN NATURAL LANGUAGE MODE) AS score
        FROM Issue
        WHERE archivedAt IS NULL
          AND MATCH(title, description) AGAINST (${term} IN NATURAL LANGUAGE MODE)
        ORDER BY score DESC
        LIMIT ${limit}
      `;
      return rows.map((row) => row.id);
    } catch {
      return null;
    }
  }

  private likeMatches(term: string, limit: number): Promise<IssueRow[]> {
    return this.prisma.issue.findMany({
      where: {
        archivedAt: null,
        OR: [{ title: { contains: term } }, { description: { contains: term } }],
      },
      select: ISSUE_SELECT,
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
  }

  /** Re-reads the raw hits through Prisma, restoring the relevance order `IN (...)` loses. */
  private async hydrate(ids: string[]): Promise<IssueRow[]> {
    if (ids.length === 0) {
      return [];
    }

    const rows = await this.prisma.issue.findMany({ where: { id: { in: ids } }, select: ISSUE_SELECT });
    const byId = new Map(rows.map((row) => [row.id, row]));

    return ids.map((id) => byId.get(id)).filter((row): row is IssueRow => row !== undefined);
  }
}
