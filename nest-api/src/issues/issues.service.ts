import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "../../generated/prisma/client";
import { archivedAtFor } from "@config/archive.util";
import { formatIdentifier } from "@issues/identifier.util";
import { normaliseRelation } from "@issues/relations.util";
import { CreateIssueDto } from "@issues/dto/create-issue.dto";
import { CreateRelationDto } from "@issues/dto/create-relation.dto";
import { IssuesQueryDto } from "@issues/dto/issues-query.dto";
import { UpdateIssueDto } from "@issues/dto/update-issue.dto";

import type { IssueOrderBy } from "@issues/dto/issues-query.dto";
import type {
  EpicProgressDto,
  IssueDetailDto,
  IssueListItemDto,
  IssueRefDto,
  RelatedIssueDto,
  StateType,
  WorkflowStateDto,
} from "@issues/dto/issue-response.interface";

const STATE_COMPLETED = "completed";
const STATE_CANCELED = "canceled";

/** Leaves room to drop an issue between two neighbours without renumbering. */
const SORT_ORDER_STEP = 1000;

const issueListInclude = {
  state: true,
  project: true,
  labels: { include: { label: true }, orderBy: { label: { name: "asc" } } },
  epic: { include: { state: true } },
} satisfies Prisma.IssueInclude;

const issueDetailInclude = {
  ...issueListInclude,
  relationsFrom: { include: { toIssue: { include: { state: true } } } },
  relationsTo: { include: { fromIssue: { include: { state: true } } } },
} satisfies Prisma.IssueInclude;

/**
 * What the write paths actually read before they write. They all finish by
 * re-reading the issue through `detail()`, so loading the whole relation graph
 * up front would fetch every row of it twice per request.
 */
const issueWriteSelect = {
  id: true,
  identifier: true,
  projectId: true,
  stateId: true,
  isEpic: true,
  epicId: true,
  archivedAt: true,
  epic: { select: { identifier: true } },
} satisfies Prisma.IssueSelect;

type IssueListRow = Prisma.IssueGetPayload<{ include: typeof issueListInclude }>;
type IssueDetailRow = Prisma.IssueGetPayload<{ include: typeof issueDetailInclude }>;
type IssueWriteRow = Prisma.IssueGetPayload<{ select: typeof issueWriteSelect }>;
type StateRow = IssueListRow["state"];

interface IssueRefRow {
  id: string;
  identifier: string;
  legacyIdentifier: string | null;
  title: string;
  state: StateRow;
}

interface ProjectLockRow {
  id: string;
  key: string;
  issueCounter: number;
}

/** The slice of the client the checks need, so they run in or out of a transaction. */
type IssueClient = Pick<PrismaService, "issue" | "workflowState" | "label">;

function normaliseIdentifier(raw: string): string {
  return raw.trim().toUpperCase();
}

function uniqueIds(ids: string[] | null | undefined): string[] {
  return ids ? [...new Set(ids)] : [];
}

function toStateDto(state: StateRow): WorkflowStateDto {
  return {
    id: state.id,
    name: state.name,
    type: state.type as StateType,
    color: state.color,
    position: state.position,
  };
}

/** A state type owns both timestamps: moving out of "completed" has to clear it. */
function stateTimestamps(type: string): { completedAt: Date | null; canceledAt: Date | null } {
  const now = new Date();

  if (type === STATE_COMPLETED) {
    return { completedAt: now, canceledAt: null };
  }
  if (type === STATE_CANCELED) {
    return { completedAt: null, canceledAt: now };
  }

  return { completedAt: null, canceledAt: null };
}

/**
 * The primary key closes every branch. `sortOrder` is only unique within a
 * project (a create seeds it from the issue number), so a workspace-wide list
 * has ties, and MySQL is free to break a tie differently on every request —
 * which reads as rows silently swapping places between two identical loads.
 */
function orderByFor(order: IssueOrderBy): Prisma.IssueOrderByWithRelationInput[] {
  switch (order) {
    case "created":
      return [{ createdAt: "desc" }, { sortOrder: "asc" }, { id: "asc" }];
    case "updated":
      return [{ updatedAt: "desc" }, { sortOrder: "asc" }, { id: "asc" }];
    case "priority":
      return [{ priority: "asc" }, { sortOrder: "asc" }, { id: "asc" }];
    case "title":
      return [{ title: "asc" }, { id: "asc" }];
    default:
      return [{ sortOrder: "asc" }, { id: "asc" }];
  }
}

/** A racing insert that lost to the unique index, rather than a real failure. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class IssuesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: IssuesQueryDto): Promise<IssueListItemDto[]> {
    const where: Prisma.IssueWhereInput = {};

    if (query.includeArchived !== true) {
      where.archivedAt = null;
    }
    if (query.project) {
      where.project = { key: query.project };
    }
    if (query.state?.length) {
      where.stateId = { in: query.state };
    }
    if (query.priority?.length) {
      where.priority = { in: query.priority };
    }
    if (query.isEpic !== undefined) {
      where.isEpic = query.isEpic;
    }
    if (query.label?.length || query.excludeLabel?.length) {
      where.labels = {
        ...(query.label?.length ? { some: { labelId: { in: query.label } } } : {}),
        ...(query.excludeLabel?.length ? { none: { labelId: { in: query.excludeLabel } } } : {}),
      };
    }
    // Clauses that must AND together rather than overwrite one another. The epic filter's four arms
    // compose here — so "in no epic" and "not in FOO" can be asked together without one silently
    // replacing the other — and the free-text filter joins them for the same reason.
    const andClauses: Prisma.IssueWhereInput[] = [];

    if (query.hasEpic !== undefined) {
      andClauses.push({ epicId: query.hasEpic ? { not: null } : null });
    }
    if (query.epic) {
      const epicId = await this.resolveIssueId(query.epic);
      if (!epicId) {
        return [];
      }
      andClauses.push({ epicId });
    }
    if (query.excludeEpic) {
      const epicId = await this.resolveIssueId(query.excludeEpic);
      // An identifier that resolves to nothing excludes nothing — unlike `epic`
      // above, where an unresolvable epic has no children by definition.
      if (epicId) {
        // Spelt out rather than left to `{ not: epicId }`: in SQL a comparison
        // against NULL is NULL, not true, so the terse form would quietly drop
        // every issue that belongs to no epic at all — which is exactly the set
        // a user asking "not in FOO" expects to keep.
        andClauses.push({ OR: [{ epicId: null }, { epicId: { not: epicId } }] });
      }
    }
    if (query.q) {
      // LIKE rather than the FULLTEXT index `GET /search` uses. This has to compose with every other
      // clause above, and MySQL's MATCH cannot appear inside a Prisma `where` — and unlike search,
      // which ranks the whole workspace, this is scoped by those clauses first. Identifiers are
      // included so `list_issues({ q: "COS-177" })` finds the issue by either of its names.
      andClauses.push({
        OR: [
          { title: { contains: query.q } },
          { description: { contains: query.q } },
          { identifier: { contains: query.q.toUpperCase() } },
          { legacyIdentifier: { contains: query.q.toUpperCase() } },
        ],
      });
    }
    if (andClauses.length > 0) {
      where.AND = andClauses;
    }

    const rows = await this.prisma.issue.findMany({
      where,
      include: issueListInclude,
      orderBy: orderByFor(query.orderBy ?? "manual"),
    });

    return this.toListItems(rows);
  }

  async findByIdentifier(rawIdentifier: string): Promise<IssueDetailDto> {
    const { issue, requestedIdentifier } = await this.requireIssue(rawIdentifier);
    return this.toDetail(issue, requestedIdentifier);
  }

  async create(dto: CreateIssueDto): Promise<IssueDetailDto> {
    const projectKey = dto.projectKey.toUpperCase();
    const isEpic = dto.isEpic ?? false;
    const epicId = dto.epicId ?? null;

    if (isEpic && epicId) {
      throw new BadRequestException("An epic cannot belong to another epic");
    }

    const labelIds = uniqueIds(dto.labelIds);

    const created = await this.prisma.$transaction(async (tx) => {
      // The row lock is what makes concurrent creates safe: the second
      // transaction waits here and reads the counter the first one wrote.
      const locked = await tx.$queryRaw<ProjectLockRow[]>`
        SELECT id, \`key\`, issueCounter FROM Project WHERE \`key\` = ${projectKey} FOR UPDATE
      `;
      const project = locked[0];
      if (!project) {
        throw new NotFoundException(`Project ${projectKey} not found`);
      }

      const state = await this.resolveState(tx, dto.stateId);
      if (epicId) {
        await this.assertEpicUsable(tx, epicId, project.id, null);
      }
      await this.assertLabelsExist(tx, labelIds);

      const number = Number(project.issueCounter) + 1;
      const identifier = formatIdentifier(project.key, number);

      await tx.project.update({ where: { id: project.id }, data: { issueCounter: number } });

      return tx.issue.create({
        data: {
          id: randomUUID(),
          projectId: project.id,
          number,
          identifier,
          title: dto.title,
          description: dto.description ?? null,
          stateId: state.id,
          priority: dto.priority ?? 0,
          isEpic,
          epicId,
          sortOrder: number * SORT_ORDER_STEP,
          ...stateTimestamps(state.type),
          labels: { create: labelIds.map((labelId) => ({ labelId })) },
        },
        select: { id: true, identifier: true },
      });
    });

    return this.detail(created.id, created.identifier);
  }

  async update(rawIdentifier: string, dto: UpdateIssueDto): Promise<IssueDetailDto> {
    const { issue, requestedIdentifier } = await this.requireIssueForWrite(rawIdentifier);

    const nextIsEpic = dto.isEpic ?? issue.isEpic;
    const nextEpicId = dto.epicId !== undefined ? dto.epicId : issue.epicId;

    if (nextEpicId === issue.id) {
      throw new BadRequestException("An issue cannot be its own epic");
    }

    if (nextIsEpic && nextEpicId !== null) {
      throw new BadRequestException(
        dto.epicId === undefined
          ? `${issue.identifier} belongs to epic ${issue.epic?.identifier ?? nextEpicId} — take it out of that epic ` +
              `before making it an epic itself`
          : "An epic cannot belong to another epic",
      );
    }

    if (dto.isEpic === false && issue.isEpic) {
      const children = await this.prisma.issue.count({ where: { epicId: issue.id, archivedAt: null } });
      if (children > 0) {
        throw new BadRequestException(
          `${issue.identifier} still has ${children} child ${children === 1 ? "issue" : "issues"} — move them out ` +
            `before it stops being an epic`,
        );
      }
    }

    if (nextEpicId !== null && nextEpicId !== issue.epicId) {
      await this.assertEpicUsable(this.prisma, nextEpicId, issue.projectId, issue.id);
    }

    const labelIds = dto.labelIds === undefined ? null : uniqueIds(dto.labelIds);
    if (labelIds) {
      await this.assertLabelsExist(this.prisma, labelIds);
    }

    const data: Prisma.IssueUncheckedUpdateInput = {};

    if (dto.title !== undefined) {
      data.title = dto.title;
    }
    if (dto.description !== undefined) {
      data.description = dto.description;
    }
    if (dto.priority !== undefined) {
      data.priority = dto.priority;
    }
    if (dto.isEpic !== undefined) {
      data.isEpic = dto.isEpic;
    }
    if (dto.epicId !== undefined) {
      data.epicId = dto.epicId;
    }
    if (labelIds) {
      data.labels = { deleteMany: {}, create: labelIds.map((labelId) => ({ labelId })) };
    }
    if (dto.stateId !== undefined && dto.stateId !== issue.stateId) {
      const state = await this.resolveState(this.prisma, dto.stateId);
      const timestamps = stateTimestamps(state.type);
      data.stateId = state.id;
      data.completedAt = timestamps.completedAt;
      data.canceledAt = timestamps.canceledAt;
    }

    const archivedAt = archivedAtFor(dto.archived, issue.archivedAt);
    if (archivedAt !== undefined) {
      data.archivedAt = archivedAt;
    }

    await this.prisma.issue.update({ where: { id: issue.id }, data });

    return this.detail(issue.id, requestedIdentifier);
  }

  async archive(rawIdentifier: string): Promise<{ ok: boolean }> {
    const id = await this.requireIssueId(rawIdentifier);
    // The guard rides in the WHERE clause: a repeated DELETE must not move the
    // timestamp the first one wrote, the same rule the projects service keeps.
    await this.prisma.issue.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: new Date() } });
    return { ok: true };
  }

  async addRelation(rawIdentifier: string, dto: CreateRelationDto): Promise<IssueDetailDto> {
    const { issue, requestedIdentifier } = await this.requireIssueForWrite(rawIdentifier);
    const targetId = await this.requireIssueId(dto.targetIdentifier);

    if (targetId === issue.id) {
      throw new BadRequestException("An issue cannot be related to itself");
    }

    // "blocked_by" is not a stored type: it is the same row as "blocks", read
    // from the other end, so the two views can never disagree.
    const row = normaliseRelation(
      dto.type === "blocked_by"
        ? { fromId: targetId, toId: issue.id, type: "blocks" }
        : { fromId: issue.id, toId: targetId, type: dto.type },
    );

    const existing = await this.prisma.issueRelation.findUnique({
      where: {
        fromIssueId_toIssueId_type: { fromIssueId: row.fromIssueId, toIssueId: row.toIssueId, type: row.type },
      },
      select: { id: true },
    });

    if (!existing) {
      try {
        await this.prisma.issueRelation.create({ data: { id: randomUUID(), ...row } });
      } catch (error) {
        // A double submit races the read above. The unique index settles it, and
        // the relation the caller asked for exists either way — so a lost race is
        // the success case, not a 500.
        if (!isUniqueViolation(error)) {
          throw error;
        }
      }
    }

    return this.detail(issue.id, requestedIdentifier);
  }

  async removeRelation(rawIdentifier: string, relationId: string): Promise<IssueDetailDto> {
    const { issue, requestedIdentifier } = await this.requireIssueForWrite(rawIdentifier);

    const relation = await this.prisma.issueRelation.findUnique({
      where: { id: relationId },
      select: { id: true, fromIssueId: true, toIssueId: true },
    });

    if (!relation || (relation.fromIssueId !== issue.id && relation.toIssueId !== issue.id)) {
      throw new NotFoundException(`Relation ${relationId} not found on ${issue.identifier}`);
    }

    await this.prisma.issueRelation.delete({ where: { id: relation.id } });

    return this.detail(issue.id, requestedIdentifier);
  }

  /**
   * `identifier` first, `legacyIdentifier` only as a fallback: a live id must
   * never be shadowed by another issue's Linear id. The lookup is
   * case-insensitive because the requested value is uppercased first, which is
   * the shape both columns are written in.
   */
  private async findByEither<T>(
    identifier: string,
    read: (where: { identifier: string } | { legacyIdentifier: string }) => Promise<T | null>,
  ): Promise<T | null> {
    return (await read({ identifier })) ?? (await read({ legacyIdentifier: identifier }));
  }

  private async requireIssue(rawIdentifier: string): Promise<{ issue: IssueDetailRow; requestedIdentifier: string }> {
    const requestedIdentifier = normaliseIdentifier(rawIdentifier);

    const issue = await this.findByEither(requestedIdentifier, (where) =>
      this.prisma.issue.findUnique({ where, include: issueDetailInclude }),
    );

    if (!issue) {
      throw new NotFoundException(`Issue ${requestedIdentifier} not found`);
    }

    return { issue, requestedIdentifier };
  }

  /** The same resolution, reading only the columns a write path branches on. */
  private async requireIssueForWrite(
    rawIdentifier: string,
  ): Promise<{ issue: IssueWriteRow; requestedIdentifier: string }> {
    const requestedIdentifier = normaliseIdentifier(rawIdentifier);

    const issue = await this.findByEither(requestedIdentifier, (where) =>
      this.prisma.issue.findUnique({ where, select: issueWriteSelect }),
    );

    if (!issue) {
      throw new NotFoundException(`Issue ${requestedIdentifier} not found`);
    }

    return { issue, requestedIdentifier };
  }

  private async resolveIssueId(rawIdentifier: string): Promise<string | null> {
    const identifier = normaliseIdentifier(rawIdentifier);

    const issue = await this.findByEither(identifier, (where) =>
      this.prisma.issue.findUnique({ where, select: { id: true } }),
    );

    return issue?.id ?? null;
  }

  private async requireIssueId(rawIdentifier: string): Promise<string> {
    const id = await this.resolveIssueId(rawIdentifier);
    if (!id) {
      throw new NotFoundException(`Issue ${normaliseIdentifier(rawIdentifier)} not found`);
    }
    return id;
  }

  private async resolveState(client: IssueClient, stateId?: string): Promise<{ id: string; type: string }> {
    if (stateId) {
      const state = await client.workflowState.findUnique({
        where: { id: stateId },
        select: { id: true, type: true },
      });
      if (!state) {
        throw new BadRequestException(`Unknown state ${stateId}`);
      }
      return state;
    }

    const fallback = await client.workflowState.findFirst({
      orderBy: { position: "asc" },
      select: { id: true, type: true },
    });
    if (!fallback) {
      throw new BadRequestException("No workflow states are configured");
    }

    return fallback;
  }

  private async assertEpicUsable(
    client: IssueClient,
    epicId: string,
    projectId: string,
    issueId: string | null,
  ): Promise<void> {
    if (issueId !== null && epicId === issueId) {
      throw new BadRequestException("An issue cannot be its own epic");
    }

    const epic = await client.issue.findUnique({
      where: { id: epicId },
      select: { id: true, identifier: true, isEpic: true, projectId: true },
    });

    if (!epic) {
      throw new BadRequestException(`Epic ${epicId} does not exist`);
    }
    if (!epic.isEpic) {
      throw new BadRequestException(`${epic.identifier} is not an epic`);
    }
    if (epic.projectId !== projectId) {
      throw new BadRequestException(`Epic ${epic.identifier} belongs to another project`);
    }
  }

  private async assertLabelsExist(client: IssueClient, labelIds: string[]): Promise<void> {
    if (labelIds.length === 0) {
      return;
    }

    const found = await client.label.findMany({ where: { id: { in: labelIds } }, select: { id: true } });
    if (found.length !== labelIds.length) {
      const known = new Set(found.map((label) => label.id));
      throw new BadRequestException(`Unknown labels: ${labelIds.filter((id) => !known.has(id)).join(", ")}`);
    }
  }

  private async detail(id: string, requestedIdentifier: string): Promise<IssueDetailDto> {
    const issue = await this.prisma.issue.findUnique({ where: { id }, include: issueDetailInclude });
    if (!issue) {
      throw new NotFoundException(`Issue ${requestedIdentifier} not found`);
    }

    return this.toDetail(issue, requestedIdentifier);
  }

  private async toDetail(issue: IssueDetailRow, requestedIdentifier: string): Promise<IssueDetailDto> {
    const [progress, labelCounts] = await Promise.all([
      this.epicProgress(issue.isEpic ? [issue.id] : []),
      this.labelCounts(issue.labels.map((entry) => entry.labelId)),
    ]);

    const blocks: RelatedIssueDto[] = [];
    const blockedBy: RelatedIssueDto[] = [];
    const related: RelatedIssueDto[] = [];

    for (const relation of issue.relationsFrom) {
      const ref = { relationId: relation.id, ...this.toIssueRef(relation.toIssue) };
      (relation.type === "blocks" ? blocks : related).push(ref);
    }
    for (const relation of issue.relationsTo) {
      const ref = { relationId: relation.id, ...this.toIssueRef(relation.fromIssue) };
      (relation.type === "blocks" ? blockedBy : related).push(ref);
    }

    // The relation graph is already in hand from `relationsFrom`/`relationsTo`
    // above — a single-issue fetch has no reason to re-run `relationCounts`'s
    // groupBy just to recompute the same two numbers.
    const relationCounts = {
      blocks: new Map([[issue.id, blocks.length]]),
      blockedBy: new Map([[issue.id, blockedBy.length]]),
    };

    return {
      ...this.toListItem(issue, progress, labelCounts, relationCounts),
      description: issue.description,
      relations: { blocks, blockedBy, related },
      canonicalIdentifier: issue.identifier,
      requestedIdentifier,
    };
  }

  private async toListItems(rows: IssueListRow[]): Promise<IssueListItemDto[]> {
    const epicIds = rows.filter((row) => row.isEpic).map((row) => row.id);
    const labelIds = uniqueIds(rows.flatMap((row) => row.labels.map((entry) => entry.labelId)));

    const [progress, labelCounts, relationCounts] = await Promise.all([
      this.epicProgress(epicIds),
      this.labelCounts(labelIds),
      this.relationCounts(rows.map((row) => row.id)),
    ]);

    return rows.map((row) => this.toListItem(row, progress, labelCounts, relationCounts));
  }

  private toListItem(
    issue: IssueListRow,
    progress: Map<string, EpicProgressDto>,
    labelCounts: Map<string, number>,
    relationCounts: { blocks: Map<string, number>; blockedBy: Map<string, number> },
  ): IssueListItemDto {
    return {
      id: issue.id,
      identifier: issue.identifier,
      legacyIdentifier: issue.legacyIdentifier,
      title: issue.title,
      priority: issue.priority,
      isEpic: issue.isEpic,
      epicId: issue.epicId,
      epic: issue.epic ? this.toIssueRef(issue.epic) : null,
      state: toStateDto(issue.state),
      labels: issue.labels.map(({ label }) => ({
        id: label.id,
        name: label.name,
        color: label.color,
        issueCount: labelCounts.get(label.id) ?? 0,
      })),
      project: {
        id: issue.project.id,
        key: issue.project.key,
        name: issue.project.name,
        icon: issue.project.icon,
        color: issue.project.color,
      },
      epicProgress: issue.isEpic ? (progress.get(issue.id) ?? { done: 0, total: 0 }) : null,
      blockedByCount: relationCounts.blockedBy.get(issue.id) ?? 0,
      blocksCount: relationCounts.blocks.get(issue.id) ?? 0,
      sortOrder: issue.sortOrder,
      archivedAt: issue.archivedAt?.toISOString() ?? null,
      createdAt: issue.createdAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
    };
  }

  private toIssueRef(issue: IssueRefRow): IssueRefDto {
    return {
      id: issue.id,
      identifier: issue.identifier,
      legacyIdentifier: issue.legacyIdentifier,
      title: issue.title,
      state: toStateDto(issue.state),
    };
  }

  /**
   * One groupBy for every epic on the page — the alternative is a count query
   * per epic row. Archived children count for neither side of the fraction.
   */
  private async epicProgress(epicIds: string[]): Promise<Map<string, EpicProgressDto>> {
    const progress = new Map<string, EpicProgressDto>(epicIds.map((id) => [id, { done: 0, total: 0 }]));
    if (epicIds.length === 0) {
      return progress;
    }

    const [rows, completedStates] = await Promise.all([
      this.prisma.issue.groupBy({
        by: ["epicId", "stateId"],
        where: { epicId: { in: epicIds }, archivedAt: null },
        _count: { _all: true },
      }),
      this.prisma.workflowState.findMany({ where: { type: STATE_COMPLETED }, select: { id: true } }),
    ]);

    const completed = new Set(completedStates.map((state) => state.id));

    for (const row of rows) {
      const entry = row.epicId === null ? undefined : progress.get(row.epicId);
      if (!entry) {
        continue;
      }

      const count = row._count._all;
      entry.total += count;
      if (completed.has(row.stateId)) {
        entry.done += count;
      }
    }

    return progress;
  }

  private async labelCounts(labelIds: string[]): Promise<Map<string, number>> {
    const unique = uniqueIds(labelIds);
    if (unique.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.issueLabel.groupBy({
      by: ["labelId"],
      where: { labelId: { in: unique }, issue: { archivedAt: null } },
      _count: { _all: true },
    });

    return new Map(rows.map((row) => [row.labelId, row._count._all] as const));
  }

  /**
   * Two groupBys for every issue on the page, not one per row. `related` never
   * counts here — it carries no direction, so it is not "stuck" information.
   */
  private async relationCounts(
    issueIds: string[],
  ): Promise<{ blocks: Map<string, number>; blockedBy: Map<string, number> }> {
    if (issueIds.length === 0) {
      return { blocks: new Map(), blockedBy: new Map() };
    }

    const [fromRows, toRows] = await Promise.all([
      this.prisma.issueRelation.groupBy({
        by: ["fromIssueId"],
        where: { fromIssueId: { in: issueIds }, type: "blocks" },
        _count: { _all: true },
      }),
      this.prisma.issueRelation.groupBy({
        by: ["toIssueId"],
        where: { toIssueId: { in: issueIds }, type: "blocks" },
        _count: { _all: true },
      }),
    ]);

    return {
      blocks: new Map(fromRows.map((row) => [row.fromIssueId, row._count._all] as const)),
      blockedBy: new Map(toRows.map((row) => [row.toIssueId, row._count._all] as const)),
    };
  }
}
