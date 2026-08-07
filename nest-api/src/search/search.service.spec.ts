import { Test } from "@nestjs/testing";
import { SEARCH_LIMIT_DEFAULT, SearchQueryDto } from "@search/dto/search-query.dto";
import { SearchService } from "@search/search.service";
import { PrismaService } from "../prisma/prisma.service";

interface TestState {
  id: string;
  name: string;
  type: string;
  color: string;
  position: number;
}

interface TestIssue {
  id: string;
  identifier: string;
  legacyIdentifier: string | null;
  archivedAt: Date | null;
  title: string;
  project: { key: string };
  state: TestState;
}

interface FindFirstWhere {
  ownerId?: string;
  archivedAt?: null;
  identifier?: string;
  legacyIdentifier?: string;
}

interface PrismaMock {
  issue: { findFirst: jest.Mock; findMany: jest.Mock };
  $queryRaw: jest.Mock;
}

const OWNER_ID = "owner-1";

const STATE: TestState = { id: "state-1", name: "In Progress", type: "started", color: "#f2c94c", position: 2 };

function issueRow(overrides: Partial<TestIssue> = {}): TestIssue {
  return {
    id: "issue-1",
    identifier: "PFA-12",
    legacyIdentifier: null,
    archivedAt: null,
    title: "Ship it",
    project: { key: "PFA" },
    state: STATE,
    ...overrides,
  };
}

function dto(q: string, limit?: number): SearchQueryDto {
  return { q, limit };
}

/** The `where`/`orderBy`/`take` payload of one recorded call to a Prisma mock. */
function callArgs(mock: jest.Mock, callIndex: number): Record<string, unknown> {
  const calls = mock.mock.calls as [Record<string, unknown>][];
  return calls[callIndex][0];
}

describe("SearchService", () => {
  let service: SearchService;
  let prisma: PrismaMock;
  let issues: TestIssue[];

  beforeEach(async () => {
    issues = [];

    prisma = {
      issue: {
        findFirst: jest.fn(({ where }: { where: FindFirstWhere }) => {
          const row =
            where.identifier !== undefined
              ? issues.find((candidate) => candidate.identifier === where.identifier)
              : issues.find((candidate) => candidate.legacyIdentifier === where.legacyIdentifier);
          return Promise.resolve(row ?? null);
        }),
        findMany: jest.fn(() => Promise.resolve([])),
      },
      $queryRaw: jest.fn(() => Promise.resolve([])),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [SearchService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(SearchService);
  });

  describe("empty query", () => {
    it("returns nothing without touching Prisma", async () => {
      const result = await service.search(OWNER_ID, dto("   "));

      expect(result).toEqual({ legacyResolved: null, results: [] });
      expect(prisma.issue.findFirst).not.toHaveBeenCalled();
      expect(prisma.issue.findMany).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe("exact matches", () => {
    it("matches the live identifier case-insensitively", async () => {
      issues = [issueRow({ identifier: "PFA-12" })];

      const result = await service.search(OWNER_ID, dto("pfa-12"));

      expect(result.results).toEqual([expect.objectContaining({ identifier: "PFA-12", matchedOn: "identifier" })]);
      expect(result.legacyResolved).toBeNull();
    });

    it("matches a legacy identifier and reports the resolution", async () => {
      issues = [issueRow({ identifier: "PFA-12", legacyIdentifier: "COS-177" })];

      const result = await service.search(OWNER_ID, dto("cos-177"));

      expect(result.results).toEqual([expect.objectContaining({ identifier: "PFA-12", matchedOn: "legacy" })]);
      expect(result.legacyResolved).toEqual({ legacy: "COS-177", identifier: "PFA-12" });
    });

    it("does not double count a row that is both the exact match and a prefix match", async () => {
      const exact = issueRow({ id: "issue-1", identifier: "PFA-1" });
      const prefixOnly = issueRow({ id: "issue-2", identifier: "PFA-10" });
      issues = [exact];
      prisma.issue.findMany.mockResolvedValueOnce([exact, prefixOnly]);

      const result = await service.search(OWNER_ID, dto("PFA-1", 5));

      expect(result.results.map((row) => row.identifier)).toEqual(["PFA-1", "PFA-10"]);
      expect(result.results[0].matchedOn).toBe("identifier");
    });

    it("skips the prefix and text passes once the limit is already met", async () => {
      issues = [issueRow({ identifier: "PFA-1" })];

      await service.search(OWNER_ID, dto("PFA-1", 1));

      expect(prisma.issue.findMany).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it("finds archived issues by exact identifier, and says they are archived", async () => {
      issues = [issueRow({ identifier: "PFA-1", archivedAt: new Date("2026-01-01") })];

      const result = await service.search(OWNER_ID, dto("PFA-1"));

      expect(result.results).toEqual([expect.objectContaining({ identifier: "PFA-1", archived: true })]);
    });

    it("does not filter the identifier and legacy lookups by archivedAt", async () => {
      await service.search(OWNER_ID, dto("PFA-1"));

      const [identifierWhere, legacyWhere] = prisma.issue.findFirst.mock.calls.map(
        (call) => (call as [{ where: FindFirstWhere }])[0].where,
      );
      // Asking by name is not browsing. The prefix and text passes below still exclude archived —
      // covered separately — so this is the one lookup that reaches them.
      expect(identifierWhere).not.toHaveProperty("archivedAt");
      expect(legacyWhere).not.toHaveProperty("archivedAt");
    });
  });

  describe("prefix matches", () => {
    it("prefix-matches the live identifier column, ordered by identifier", async () => {
      const row = issueRow({ identifier: "PFA-41" });
      prisma.issue.findMany.mockResolvedValueOnce([row]);

      const result = await service.search(OWNER_ID, dto("PFA-4", 10));

      expect(result.results).toEqual([expect.objectContaining({ identifier: "PFA-41", matchedOn: "identifier" })]);

      const args = callArgs(prisma.issue.findMany, 0);
      expect(args.where).toEqual({
        ownerId: OWNER_ID,
        archivedAt: null,
        OR: [{ identifier: { startsWith: "PFA-4" } }, { legacyIdentifier: { startsWith: "PFA-4" } }],
      });
      expect(args.orderBy).toEqual({ identifier: "asc" });
      expect(args.take).toBe(10);
    });

    it("prefix-matches the legacy identifier column", async () => {
      const row = issueRow({ id: "issue-3", identifier: "3DE-7", legacyIdentifier: "COS-19" });
      prisma.issue.findMany.mockResolvedValueOnce([row]);

      const result = await service.search(OWNER_ID, dto("COS-1", 10));

      expect(result.results).toEqual([expect.objectContaining({ identifier: "3DE-7", matchedOn: "legacy" })]);
    });

    it("excludes archived issues from the prefix pass", async () => {
      await service.search(OWNER_ID, dto("PFA-1"));

      expect(callArgs(prisma.issue.findMany, 0).where).toMatchObject({ archivedAt: null });
    });
  });

  describe("text matches", () => {
    it("skips the FULLTEXT pass for a term shorter than the minimum token size and goes straight to LIKE", async () => {
      await service.search(OWNER_ID, dto("ab", 10));

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      // one call for the prefix pass, one for the LIKE fallback
      expect(prisma.issue.findMany).toHaveBeenCalledTimes(2);
    });

    it("falls back to LIKE matching on title or description when the FULLTEXT query throws", async () => {
      const row = issueRow({ id: "issue-9", identifier: "PFA-9", title: "Widget catalogue" });
      prisma.issue.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([row]);
      prisma.$queryRaw.mockRejectedValueOnce(new Error("MATCH requires a FULLTEXT index"));

      const result = await service.search(OWNER_ID, dto("catalogue", 10));

      expect(result.results).toEqual([expect.objectContaining({ identifier: "PFA-9", matchedOn: "text" })]);

      const likeArgs = callArgs(prisma.issue.findMany, 1);
      expect(likeArgs.where).toEqual({
        ownerId: OWNER_ID,
        archivedAt: null,
        OR: [{ title: { contains: "catalogue" } }, { description: { contains: "catalogue" } }],
      });
      expect(likeArgs.orderBy).toEqual({ updatedAt: "desc" });
    });

    it("restores the FULLTEXT relevance order after re-hydrating through Prisma", async () => {
      const row1 = issueRow({ id: "issue-1", identifier: "PFA-1", title: "Ship it" });
      const row2 = issueRow({ id: "issue-2", identifier: "PFA-2", title: "Ship it too" });
      const row3 = issueRow({ id: "issue-3", identifier: "PFA-3", title: "Ship it first" });

      // Prefix pass finds nothing; the hydrate call comes back in Prisma's own
      // order, which is deliberately not the relevance order.
      prisma.issue.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([row1, row2, row3]);
      prisma.$queryRaw.mockResolvedValueOnce([
        { id: "issue-3", score: 0.9 },
        { id: "issue-1", score: 0.7 },
        { id: "issue-2", score: 0.5 },
      ]);

      const result = await service.search(OWNER_ID, dto("ship", 10));

      expect(result.results.map((row) => row.identifier)).toEqual(["PFA-3", "PFA-1", "PFA-2"]);
      expect(result.results.every((row) => row.matchedOn === "text")).toBe(true);
    });
  });

  describe("owner scoping", () => {
    it("scopes the identifier and legacy lookups to the owner", async () => {
      await service.search(OWNER_ID, dto("PFA-1"));

      const [identifierWhere, legacyWhere] = prisma.issue.findFirst.mock.calls.map(
        (call) => (call as [{ where: FindFirstWhere }])[0].where,
      );
      expect(identifierWhere).toEqual({ ownerId: OWNER_ID, identifier: "PFA-1" });
      expect(legacyWhere).toEqual({ ownerId: OWNER_ID, legacyIdentifier: "PFA-1" });
    });

    it("scopes the FULLTEXT query to the owner, as a bound parameter rather than inlined SQL", async () => {
      await service.search(OWNER_ID, dto("ship", 10));

      const [fragments, ...values] = prisma.$queryRaw.mock.calls[0] as [string[], ...unknown[]];
      expect(fragments.join("?")).toContain("ownerId = ");
      expect(values).toContain(OWNER_ID);
      // Interpolating the id into the SQL text instead of binding it would be an injection hole.
      expect(fragments.join("?")).not.toContain(OWNER_ID);
    });

    it("scopes the hydrate re-read to the owner", async () => {
      const row = issueRow({ id: "issue-1", identifier: "PFA-1" });
      prisma.issue.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([row]);
      prisma.$queryRaw.mockResolvedValueOnce([{ id: "issue-1", score: 0.9 }]);

      await service.search(OWNER_ID, dto("ship", 10));

      expect(callArgs(prisma.issue.findMany, 1).where).toEqual({ ownerId: OWNER_ID, id: { in: ["issue-1"] } });
    });
  });

  describe("limits", () => {
    it("falls back to SEARCH_LIMIT_DEFAULT when the request has no limit", async () => {
      await service.search(OWNER_ID, dto("PFA-1"));

      expect(callArgs(prisma.issue.findMany, 0).take).toBe(SEARCH_LIMIT_DEFAULT);
    });
  });
});
