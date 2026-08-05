import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { IssuesService } from "@issues/issues.service";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

interface TestState {
  id: string;
  name: string;
  type: string;
  color: string;
  position: number;
}

interface TestProject {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  color: string | null;
}

interface TestIssue {
  id: string;
  projectId: string;
  number: number;
  identifier: string;
  legacyIdentifier: string | null;
  title: string;
  description: string | null;
  stateId: string;
  priority: number;
  isEpic: boolean;
  epicId: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  canceledAt: Date | null;
  archivedAt: Date | null;
  state: TestState;
  project: TestProject;
  labels: { labelId: string; label: { id: string; name: string; color: string } }[];
  epic: TestIssue | null;
  relationsFrom: unknown[];
  relationsTo: unknown[];
}

interface IssueWhere {
  id?: string;
  identifier?: string;
  legacyIdentifier?: string;
}

interface PrismaMock {
  issue: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    groupBy: jest.Mock;
  };
  project: { update: jest.Mock };
  label: { findMany: jest.Mock };
  workflowState: { findUnique: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
  issueLabel: { groupBy: jest.Mock };
  issueRelation: { findUnique: jest.Mock; create: jest.Mock; delete: jest.Mock };
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
}

const BACKLOG: TestState = { id: "state-backlog", name: "Backlog", type: "backlog", color: "#8a8f98", position: 0 };
const STARTED: TestState = { id: "state-started", name: "In Progress", type: "started", color: "#f2c94c", position: 2 };
const DONE: TestState = { id: "state-done", name: "Done", type: "completed", color: "#5e6ad2", position: 4 };
const CANCELED: TestState = { id: "state-canceled", name: "Canceled", type: "canceled", color: "#95a2b3", position: 5 };
const STATES = [BACKLOG, STARTED, DONE, CANCELED];

const PROJECT: TestProject = { id: "project-1", key: "PFA", name: "Portfolio", icon: null, color: null };

function issueRow(overrides: Partial<TestIssue> = {}): TestIssue {
  return {
    id: "issue-1",
    projectId: PROJECT.id,
    number: 12,
    identifier: "PFA-12",
    legacyIdentifier: null,
    title: "Ship it",
    description: null,
    stateId: STARTED.id,
    priority: 0,
    isEpic: false,
    epicId: null,
    sortOrder: 12_000,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    completedAt: null,
    canceledAt: null,
    archivedAt: null,
    state: STARTED,
    project: PROJECT,
    labels: [],
    epic: null,
    relationsFrom: [],
    relationsTo: [],
    ...overrides,
  };
}

function findIssue(rows: TestIssue[], where: IssueWhere): TestIssue | null {
  return (
    rows.find(
      (row) =>
        (where.id !== undefined && row.id === where.id) ||
        (where.identifier !== undefined && row.identifier === where.identifier) ||
        (where.legacyIdentifier !== undefined && row.legacyIdentifier === where.legacyIdentifier),
    ) ?? null
  );
}

/** The `data` payload of the last call to a Prisma write mock. */
function lastData(mock: jest.Mock): Record<string, unknown> {
  const calls = mock.mock.calls as [{ data: Record<string, unknown> }][];
  return calls[calls.length - 1][0].data;
}

describe("IssuesService", () => {
  let service: IssuesService;
  let prisma: PrismaMock;
  let issues: TestIssue[];

  beforeEach(async () => {
    issues = [];

    prisma = {
      issue: {
        findUnique: jest.fn(({ where }: { where: IssueWhere }) => Promise.resolve(findIssue(issues, where))),
        findMany: jest.fn(() => Promise.resolve([])),
        count: jest.fn(() => Promise.resolve(0)),
        create: jest.fn(({ data }: { data: { id: string; identifier: string } }) =>
          Promise.resolve({ id: data.id, identifier: data.identifier }),
        ),
        update: jest.fn(() => Promise.resolve(null)),
        updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
        groupBy: jest.fn(() => Promise.resolve([])),
      },
      project: { update: jest.fn(() => Promise.resolve(null)) },
      label: { findMany: jest.fn(() => Promise.resolve([])) },
      workflowState: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(STATES.find((state) => state.id === where.id) ?? null),
        ),
        findFirst: jest.fn(() => Promise.resolve(BACKLOG)),
        findMany: jest.fn(() => Promise.resolve([{ id: DONE.id }])),
      },
      issueLabel: { groupBy: jest.fn(() => Promise.resolve([])) },
      issueRelation: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
      $queryRaw: jest.fn(() => Promise.resolve([{ id: PROJECT.id, key: PROJECT.key, issueCounter: 41 }])),
      $transaction: jest.fn((run: (tx: unknown) => Promise<unknown>) => run(prisma)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [IssuesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(IssuesService);
  });

  describe("create", () => {
    it("allocates the identifier from the counter it locked", async () => {
      issues = [issueRow({ id: "issue-new", identifier: "PFA-42", number: 42, sortOrder: 42_000 })];
      prisma.issue.create.mockResolvedValue({ id: "issue-new", identifier: "PFA-42" });

      const result = await service.create({ projectKey: "pfa", title: "Ship it" });

      const [fragments] = prisma.$queryRaw.mock.calls[0] as [string[]];
      expect(fragments.join("?")).toContain("FOR UPDATE");
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: PROJECT.id },
        data: { issueCounter: 42 },
      });
      expect(prisma.issue.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ identifier: "PFA-42", number: 42, sortOrder: 42_000 }),
        }),
      );
      expect(result.identifier).toBe("PFA-42");
      expect(result.canonicalIdentifier).toBe("PFA-42");
    });

    it("takes the counter, the update and the insert in one transaction", async () => {
      issues = [issueRow({ id: "issue-new", identifier: "PFA-42", number: 42 })];
      prisma.issue.create.mockResolvedValue({ id: "issue-new", identifier: "PFA-42" });

      await service.create({ projectKey: "PFA", title: "Ship it" });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("rejects an unknown project", async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(service.create({ projectKey: "NOPE", title: "Ship it" })).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects an epicId that points at an ordinary issue", async () => {
      issues = [issueRow({ id: "issue-3", identifier: "PFA-3", isEpic: false })];

      await expect(service.create({ projectKey: "PFA", title: "Ship it", epicId: "issue-3" })).rejects.toThrow(
        /PFA-3 is not an epic/,
      );
    });

    it("rejects an epic from another project", async () => {
      issues = [issueRow({ id: "epic-9", identifier: "OTH-9", isEpic: true, projectId: "project-2" })];

      await expect(service.create({ projectKey: "PFA", title: "Ship it", epicId: "epic-9" })).rejects.toThrow(
        /belongs to another project/,
      );
    });

    it("rejects an epicId that does not exist", async () => {
      await expect(service.create({ projectKey: "PFA", title: "Ship it", epicId: "ghost" })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("refuses to create an epic that already belongs to an epic", async () => {
      await expect(
        service.create({ projectKey: "PFA", title: "Ship it", isEpic: true, epicId: "epic-1" }),
      ).rejects.toThrow(/An epic cannot belong to another epic/);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("update — epic invariants", () => {
    const epic = () => issueRow({ id: "epic-1", identifier: "PFA-1", number: 1, isEpic: true, title: "Migration" });

    it("refuses to convert an issue that belongs to an epic", async () => {
      const parent = epic();
      issues = [parent, issueRow({ id: "issue-2", identifier: "PFA-2", epicId: parent.id, epic: parent })];

      const failure = service.update("pfa-2", { isEpic: true });

      await expect(failure).rejects.toBeInstanceOf(BadRequestException);
      await expect(failure).rejects.toThrow(/PFA-2 belongs to epic PFA-1/);
      expect(prisma.issue.update).not.toHaveBeenCalled();
    });

    it("refuses to put an epic inside another epic", async () => {
      const parent = epic();
      issues = [parent, issueRow({ id: "epic-2", identifier: "PFA-5", isEpic: true })];

      await expect(service.update("PFA-5", { epicId: parent.id })).rejects.toThrow(
        /An epic cannot belong to another epic/,
      );
    });

    it("refuses to convert an epic back while it has children, and says how many", async () => {
      issues = [epic()];
      prisma.issue.count.mockResolvedValue(3);

      await expect(service.update("PFA-1", { isEpic: false })).rejects.toThrow(/still has 3 child issues/);
      expect(prisma.issue.count).toHaveBeenCalledWith({ where: { epicId: "epic-1", archivedAt: null } });
      expect(prisma.issue.update).not.toHaveBeenCalled();
    });

    it("counts a single child in the singular", async () => {
      issues = [epic()];
      prisma.issue.count.mockResolvedValue(1);

      await expect(service.update("PFA-1", { isEpic: false })).rejects.toThrow(/still has 1 child issue —/);
    });

    it("converts an epic back once it has no children", async () => {
      issues = [epic()];
      prisma.issue.count.mockResolvedValue(0);

      await service.update("PFA-1", { isEpic: false });

      expect(lastData(prisma.issue.update)).toEqual({ isEpic: false });
    });

    it("refuses to make an issue its own epic", async () => {
      issues = [issueRow({ id: "issue-1", identifier: "PFA-12" })];

      await expect(service.update("PFA-12", { epicId: "issue-1" })).rejects.toThrow(/An issue cannot be its own epic/);
    });

    it("refuses an epic in another project", async () => {
      issues = [
        issueRow({ id: "issue-1", identifier: "PFA-12" }),
        issueRow({ id: "epic-9", identifier: "OTH-9", isEpic: true, projectId: "project-2" }),
      ];

      await expect(service.update("PFA-12", { epicId: "epic-9" })).rejects.toThrow(/belongs to another project/);
    });

    it("refuses an epicId that points at an ordinary issue", async () => {
      issues = [issueRow({ id: "issue-1", identifier: "PFA-12" }), issueRow({ id: "issue-3", identifier: "PFA-3" })];

      await expect(service.update("PFA-12", { epicId: "issue-3" })).rejects.toThrow(/PFA-3 is not an epic/);
    });

    it("accepts an epic in the same project", async () => {
      issues = [issueRow({ id: "issue-1", identifier: "PFA-12" }), epic()];

      await service.update("PFA-12", { epicId: "epic-1" });

      expect(lastData(prisma.issue.update)).toEqual({ epicId: "epic-1" });
    });

    it("detaches an issue from its epic on an explicit null", async () => {
      const parent = epic();
      issues = [issueRow({ id: "issue-1", identifier: "PFA-12", epicId: parent.id, epic: parent }), parent];

      await service.update("PFA-12", { epicId: null });

      expect(lastData(prisma.issue.update)).toEqual({ epicId: null });
    });
  });

  describe("update — state side effects", () => {
    it("stamps completedAt and clears canceledAt on a completed state", async () => {
      issues = [issueRow({ canceledAt: new Date("2025-12-01T00:00:00.000Z") })];

      await service.update("PFA-12", { stateId: DONE.id });

      const data = lastData(prisma.issue.update);
      expect(data.stateId).toBe(DONE.id);
      expect(data.completedAt).toBeInstanceOf(Date);
      expect(data.canceledAt).toBeNull();
    });

    it("stamps canceledAt and clears completedAt on a canceled state", async () => {
      issues = [issueRow({ completedAt: new Date("2025-12-01T00:00:00.000Z") })];

      await service.update("PFA-12", { stateId: CANCELED.id });

      const data = lastData(prisma.issue.update);
      expect(data.canceledAt).toBeInstanceOf(Date);
      expect(data.completedAt).toBeNull();
    });

    it("clears both when the issue moves back to an open state", async () => {
      issues = [issueRow({ stateId: DONE.id, state: DONE, completedAt: new Date("2025-12-01T00:00:00.000Z") })];

      await service.update("PFA-12", { stateId: BACKLOG.id });

      const data = lastData(prisma.issue.update);
      expect(data.completedAt).toBeNull();
      expect(data.canceledAt).toBeNull();
    });

    it("leaves the timestamps alone when the state does not move", async () => {
      issues = [issueRow({ stateId: DONE.id, state: DONE })];

      await service.update("PFA-12", { stateId: DONE.id, title: "Ship it later" });

      const data = lastData(prisma.issue.update);
      expect(data).toEqual({ title: "Ship it later" });
    });

    it("rejects an unknown state", async () => {
      issues = [issueRow()];

      await expect(service.update("PFA-12", { stateId: "state-ghost" })).rejects.toThrow(/Unknown state/);
    });
  });

  describe("findByIdentifier", () => {
    it("resolves a legacy identifier and reports both identifiers", async () => {
      issues = [issueRow({ identifier: "PFA-12", legacyIdentifier: "COS-177" })];

      const result = await service.findByIdentifier("cos-177");

      expect(result.canonicalIdentifier).toBe("PFA-12");
      expect(result.requestedIdentifier).toBe("COS-177");
    });

    it("reports the live identifier as both when it was asked for directly", async () => {
      issues = [issueRow({ identifier: "PFA-12", legacyIdentifier: "COS-177" })];

      const result = await service.findByIdentifier(" pfa-12 ");

      expect(result.canonicalIdentifier).toBe("PFA-12");
      expect(result.requestedIdentifier).toBe("PFA-12");
    });

    it("404s when neither column matches", async () => {
      await expect(service.findByIdentifier("PFA-999")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("relations", () => {
    const target = () => issueRow({ id: "issue-9", identifier: "PFA-9", number: 9 });

    beforeEach(() => {
      prisma.issueRelation.findUnique.mockResolvedValue(null);
      prisma.issueRelation.create.mockResolvedValue(null);
    });

    it("stores blocked_by as the mirrored blocks row, not a second type", async () => {
      issues = [issueRow(), target()];

      await service.addRelation("PFA-12", { type: "blocked_by", targetIdentifier: "PFA-9" });

      expect(lastData(prisma.issueRelation.create)).toEqual(
        expect.objectContaining({ fromIssueId: "issue-9", toIssueId: "issue-1", type: "blocks" }),
      );
    });

    it("stores blocks in the direction it was asked for", async () => {
      issues = [issueRow(), target()];

      await service.addRelation("PFA-12", { type: "blocks", targetIdentifier: "PFA-9" });

      expect(lastData(prisma.issueRelation.create)).toEqual(
        expect.objectContaining({ fromIssueId: "issue-1", toIssueId: "issue-9", type: "blocks" }),
      );
    });

    it("normalises a related pair lower-id-first whichever end asks", async () => {
      issues = [issueRow(), target()];

      await service.addRelation("PFA-9", { type: "related", targetIdentifier: "PFA-12" });

      expect(lastData(prisma.issueRelation.create)).toEqual(
        expect.objectContaining({ fromIssueId: "issue-1", toIssueId: "issue-9", type: "related" }),
      );
    });

    it("treats a double submit that loses the unique index as a success", async () => {
      issues = [issueRow(), target()];
      prisma.issueRelation.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" }),
      );

      const result = await service.addRelation("PFA-12", { type: "blocks", targetIdentifier: "PFA-9" });

      expect(result.canonicalIdentifier).toBe("PFA-12");
    });

    it("still surfaces a write failure that is not a duplicate", async () => {
      issues = [issueRow(), target()];
      prisma.issueRelation.create.mockRejectedValue(new Error("connection lost"));

      await expect(service.addRelation("PFA-12", { type: "blocks", targetIdentifier: "PFA-9" })).rejects.toThrow(
        /connection lost/,
      );
    });
  });

  describe("archive", () => {
    it("stamps archivedAt only while it is still null", async () => {
      issues = [issueRow()];

      await service.archive("PFA-12");

      const [call] = prisma.issue.updateMany.mock.calls as [{ where: Record<string, unknown> }][];
      expect(call[0].where).toEqual({ id: "issue-1", archivedAt: null });
    });
  });

  describe("update — archive and restore", () => {
    it("stamps archivedAt when asked to archive", async () => {
      issues = [issueRow()];

      await service.update("PFA-12", { archived: true });

      expect(lastData(prisma.issue.update).archivedAt).toBeInstanceOf(Date);
    });

    it("keeps the original timestamp when an archived issue is archived again", async () => {
      // The column records when the issue left, and a second PATCH is not a
      // second departure.
      const original = new Date("2026-01-02T03:04:05.000Z");
      issues = [issueRow({ archivedAt: original })];

      await service.update("PFA-12", { archived: true });

      expect(lastData(prisma.issue.update).archivedAt).toBe(original);
    });

    it("clears archivedAt on a restore", async () => {
      issues = [issueRow({ archivedAt: new Date("2026-01-02T03:04:05.000Z") })];

      await service.update("PFA-12", { archived: false });

      expect(lastData(prisma.issue.update).archivedAt).toBeNull();
    });

    it("leaves the column alone when the field is absent", async () => {
      issues = [issueRow({ archivedAt: new Date("2026-01-02T03:04:05.000Z") })];

      await service.update("PFA-12", { title: "Ship it later" });

      expect(lastData(prisma.issue.update)).toEqual({ title: "Ship it later" });
    });
  });

  describe("epicProgress", () => {
    it("counts children whose state is completed", async () => {
      issues = [issueRow({ id: "epic-1", identifier: "PFA-1", isEpic: true })];
      prisma.issue.groupBy.mockResolvedValue([
        { epicId: "epic-1", stateId: DONE.id, _count: { _all: 2 } },
        { epicId: "epic-1", stateId: STARTED.id, _count: { _all: 3 } },
      ]);

      const result = await service.findByIdentifier("PFA-1");

      expect(result.epicProgress).toEqual({ done: 2, total: 5 });
      expect(prisma.issue.groupBy).toHaveBeenCalledTimes(1);
    });

    it("reports zeroes for an epic with no children", async () => {
      issues = [issueRow({ id: "epic-1", identifier: "PFA-1", isEpic: true })];

      const result = await service.findByIdentifier("PFA-1");

      expect(result.epicProgress).toEqual({ done: 0, total: 0 });
    });

    it("stays null for an ordinary issue, without querying for children", async () => {
      issues = [issueRow()];

      const result = await service.findByIdentifier("PFA-12");

      expect(result.epicProgress).toBeNull();
      expect(prisma.issue.groupBy).not.toHaveBeenCalled();
    });
  });
});
