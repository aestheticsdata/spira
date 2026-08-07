import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import { ViewsService } from "@views/views.service";

const STATE_A = "11111111-1111-4111-8111-111111111111";
const STATE_B = "22222222-2222-4222-8222-222222222222";
const VIEW_ID = "44444444-4444-4444-8444-444444444444";
const OWNER = "55555555-5555-4555-8555-555555555555";

interface ViewRow {
  id: string;
  name: string;
  icon: string | null;
  query: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  project: { id: string; key: string; name: string; icon: string | null; color: string | null } | null;
}

interface PrismaMock {
  savedView: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
  };
  project: { findUnique: jest.Mock };
}

const PROJECT = { id: "p-1", key: "SPI", name: "Spira", icon: null, color: null };

/** The `data` payload of the last call to a Prisma write mock. */
function lastData(mock: jest.Mock): Record<string, unknown> {
  const calls = mock.mock.calls as [{ data: Record<string, unknown> }][];
  return calls[calls.length - 1][0].data;
}

/** The `where` clause of the last call to a Prisma read mock. */
function lastWhere(mock: jest.Mock): Record<string, unknown> {
  const calls = mock.mock.calls as [{ where: Record<string, unknown> }][];
  return calls[calls.length - 1][0].where;
}

function row(overrides: Partial<ViewRow> = {}): ViewRow {
  return {
    id: VIEW_ID,
    name: "Improvements",
    icon: null,
    query: "group=status",
    position: 0,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-02T00:00:00.000Z"),
    project: null,
    ...overrides,
  };
}

describe("ViewsService", () => {
  let service: ViewsService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = {
      savedView: {
        findMany: jest.fn().mockResolvedValue([]),
        // findFirst serves both the owner-scoped existence check and nextPosition;
        // no `position` on the default row is an empty scope.
        findFirst: jest.fn().mockResolvedValue({ id: VIEW_ID }),
        create: jest.fn().mockImplementation(({ data }: { data: ViewRow }) => Promise.resolve(row(data))),
        update: jest.fn().mockImplementation(({ data }: { data: Partial<ViewRow> }) => Promise.resolve(row(data))),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      project: { findUnique: jest.fn().mockResolvedValue({ id: PROJECT.id }) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ViewsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(ViewsService);
  });

  describe("create", () => {
    it("stores the canonical query rather than the one it was handed", async () => {
      await service.create(OWNER, { name: "Mine", query: `?state=${STATE_B},${STATE_A}&group=epic` });

      expect(lastData(prisma.savedView.create).query).toBe(`group=epic&state=${STATE_A}%2C${STATE_B}`);
    });

    it("refuses a query that could not be replayed, before writing anything", async () => {
      await expect(service.create(OWNER, { name: "Mine", query: "group=milestone" })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.savedView.create).not.toHaveBeenCalled();
    });

    it("stamps the view with its owner", async () => {
      await service.create(OWNER, { name: "Mine", query: "" });

      expect(lastData(prisma.savedView.create).ownerId).toBe(OWNER);
    });

    it("resolves a project key to its id", async () => {
      await service.create(OWNER, { name: "Mine", projectKey: "SPI", query: "" });

      expect(lastData(prisma.savedView.create).projectId).toBe(PROJECT.id);
      // The key is only unique per owner, so it is looked up as a pair.
      expect(lastWhere(prisma.project.findUnique)).toEqual({ ownerId_key: { ownerId: OWNER, key: "SPI" } });
    });

    it("is workspace-wide without a project key", async () => {
      await service.create(OWNER, { name: "Mine", query: "" });

      expect(lastData(prisma.savedView.create).projectId).toBeNull();
    });

    it("404s on a project key nothing answers to", async () => {
      prisma.project.findUnique.mockResolvedValue(null);

      await expect(service.create(OWNER, { name: "Mine", projectKey: "NOPE", query: "" })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("appends to the end of its own scope", async () => {
      prisma.savedView.findFirst.mockResolvedValue({ position: 4 });

      await service.create(OWNER, { name: "Mine", query: "" });

      expect(lastData(prisma.savedView.create).position).toBe(5);
      // Scoped: a project's views are numbered independently of the workspace's,
      // and one account's numbering never counts another's rows.
      expect(lastWhere(prisma.savedView.findFirst)).toEqual({ ownerId: OWNER, projectId: null });
    });

    it("starts at zero in an empty scope", async () => {
      prisma.savedView.findFirst.mockResolvedValue(null);

      await service.create(OWNER, { name: "Mine", query: "" });

      expect(lastData(prisma.savedView.create).position).toBe(0);
    });
  });

  describe("findAll", () => {
    it("returns a project's views alongside the workspace's, not instead of them", async () => {
      await service.findAll(OWNER, "SPI");

      // ownerId sits beside the OR, not in a branch: the `projectId: null` branch
      // would otherwise match every account's workspace views.
      expect(lastWhere(prisma.savedView.findMany)).toEqual({
        ownerId: OWNER,
        OR: [{ project: { key: "SPI" } }, { projectId: null }],
      });
    });

    it("returns every view when no project is named", async () => {
      await service.findAll(OWNER);

      expect(lastWhere(prisma.savedView.findMany)).toEqual({ ownerId: OWNER });
    });

    it("carries the project on a scoped view and null on a workspace one", async () => {
      prisma.savedView.findMany.mockResolvedValue([row({ project: PROJECT }), row({ id: "other" })]);

      const views = await service.findAll(OWNER);

      expect(views[0].project).toEqual(PROJECT);
      expect(views[1].project).toBeNull();
    });
  });

  describe("findAll — a view older than the vocabulary", () => {
    it("flags a stored query that no longer validates instead of serving it", async () => {
      prisma.savedView.findMany.mockResolvedValue([row({ query: "order=title" })]);

      const [view] = await service.findAll(OWNER);

      expect(view.query).toBeNull();
      expect(view.invalid).toContain("order");
    });

    it("does not take the rest of the sidebar down with it", async () => {
      prisma.savedView.findMany.mockResolvedValue([row({ query: "sortBy=title" }), row({ id: "ok" })]);

      const views = await service.findAll(OWNER);

      expect(views).toHaveLength(2);
      expect(views[1].invalid).toBeNull();
      expect(views[1].query).toBe("group=status");
    });

    it("says nothing about a view that still reads", async () => {
      prisma.savedView.findMany.mockResolvedValue([row()]);

      expect((await service.findAll(OWNER))[0].invalid).toBeNull();
    });
  });

  describe("update", () => {
    it("canonicalises a replacement query", async () => {
      await service.update(OWNER, VIEW_ID, { query: "legacy=false&group=epic" });

      expect(lastData(prisma.savedView.update).query).toBe("group=epic&legacy=false");
    });

    it("refuses an invalid replacement and leaves the row alone", async () => {
      await expect(service.update(OWNER, VIEW_ID, { query: "group=nonsense" })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.savedView.update).not.toHaveBeenCalled();
    });

    it("writes only what was sent", async () => {
      await service.update(OWNER, VIEW_ID, { name: "Renamed" });

      expect(lastData(prisma.savedView.update)).toEqual({ name: "Renamed" });
    });

    it("clears the icon when handed null, rather than treating it as absent", async () => {
      await service.update(OWNER, VIEW_ID, { icon: null });

      expect(lastData(prisma.savedView.update)).toEqual({ icon: null });
    });

    it("404s on a view that does not exist", async () => {
      prisma.savedView.findFirst.mockResolvedValue(null);

      await expect(service.update(OWNER, VIEW_ID, { name: "Renamed" })).rejects.toBeInstanceOf(NotFoundException);
    });

    it("looks the row up as the owner's before writing to it", async () => {
      await service.update(OWNER, VIEW_ID, { name: "Renamed" });

      expect(lastWhere(prisma.savedView.findFirst)).toEqual({ id: VIEW_ID, ownerId: OWNER });
    });
  });

  describe("remove", () => {
    it("404s rather than reporting success for a row that was not there", async () => {
      prisma.savedView.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove(OWNER, VIEW_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("deletes by id, and only within the owner's own views", async () => {
      await service.remove(OWNER, VIEW_ID);

      expect(prisma.savedView.deleteMany).toHaveBeenCalledWith({ where: { id: VIEW_ID, ownerId: OWNER } });
    });
  });
});
