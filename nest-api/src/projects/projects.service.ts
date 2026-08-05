import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { CreateProjectDto } from "@projects/dto/create-project.dto";
import { UpdateProjectDto } from "@projects/dto/update-project.dto";
import {
  RESERVED_PROJECT_KEYS,
  isReservedProjectKey,
  normaliseProjectKey,
  suggestProjectKey,
} from "@projects/project-key.util";
import { PrismaService } from "../prisma/prisma.service";

import type { Project, WorkflowState } from "../../generated/prisma/client";
import type {
  ProjectDto,
  ProjectListItemDto,
  StateType,
  WorkflowStateDto,
} from "@projects/dto/project-response.interface";

type ProjectRow = Project & { status: WorkflowState };

interface IssueCounts {
  issueCount: number;
  completedCount: number;
  legacyCount: number;
}

const NO_ISSUES: IssueCounts = { issueCount: 0, completedCount: 0, legacyCount: 0 };
const ALL_DIGITS = /^\d+$/;

function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

/** `undefined` leaves the column alone, `null` clears it. */
function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }
  return new Date(value);
}

function archivedAtFor(archived: boolean | undefined, current: Date | null): Date | null | undefined {
  if (archived === undefined) {
    return undefined;
  }
  // Re-archiving an archived project must not move the timestamp.
  return archived ? (current ?? new Date()) : null;
}

function countsByProject(rows: readonly { projectId: string; _count: { _all: number } }[]): Map<string, number> {
  return new Map(rows.map((row) => [row.projectId, row._count._all]));
}

function toWorkflowStateDto(state: WorkflowState): WorkflowStateDto {
  return {
    id: state.id,
    name: state.name,
    type: state.type as StateType,
    color: state.color,
    position: state.position,
  };
}

function toProjectListItemDto(project: ProjectRow, counts: IssueCounts): ProjectListItemDto {
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    icon: project.icon,
    color: project.color,
    summary: project.summary,
    status: toWorkflowStateDto(project.status),
    priority: project.priority,
    issueCount: counts.issueCount,
    completedCount: counts.completedCount,
    progress: counts.issueCount === 0 ? 0 : counts.completedCount / counts.issueCount,
    legacyCount: counts.legacyCount,
    archivedAt: toIso(project.archivedAt),
  };
}

function toProjectDto(project: ProjectRow, counts: IssueCounts): ProjectDto {
  return {
    ...toProjectListItemDto(project, counts),
    description: project.description,
    startDate: toIso(project.startDate),
    targetDate: toIso(project.targetDate),
    issueCounter: project.issueCounter,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(includeArchived: boolean): Promise<ProjectListItemDto[]> {
    const projects = await this.prisma.project.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      include: { status: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });

    const counts = await this.loadCounts(projects.map((project) => project.id));
    return projects.map((project) => toProjectListItemDto(project, counts.get(project.id) ?? NO_ISSUES));
  }

  async findByKey(key: string): Promise<ProjectDto> {
    const project = await this.loadByKey(key);
    const counts = await this.loadCounts([project.id]);
    return toProjectDto(project, counts.get(project.id) ?? NO_ISSUES);
  }

  async suggestKey(name: string): Promise<{ key: string }> {
    const projects = await this.prisma.project.findMany({ select: { key: true } });
    return {
      key: suggestProjectKey(
        name,
        projects.map((project) => project.key),
      ),
    };
  }

  async create(dto: CreateProjectDto): Promise<ProjectDto> {
    const key = normaliseProjectKey(dto.key);
    this.assertKeyIsUsable(key);
    await this.assertKeyIsFree(key);

    const statusId = await this.resolveStatusId(dto.statusId);

    const project = await this.prisma.project.create({
      data: {
        id: randomUUID(),
        key,
        name: dto.name,
        icon: dto.icon ?? null,
        color: dto.color ?? null,
        summary: dto.summary ?? null,
        description: dto.description ?? null,
        statusId,
        priority: dto.priority ?? 0,
        startDate: toDate(dto.startDate) ?? null,
        targetDate: toDate(dto.targetDate) ?? null,
      },
      include: { status: true },
    });

    return toProjectDto(project, NO_ISSUES);
  }

  async update(key: string, dto: UpdateProjectDto): Promise<ProjectDto> {
    const existing = await this.loadByKey(key);

    let nextKey = existing.key;
    if (dto.key) {
      const requested = normaliseProjectKey(dto.key);
      if (requested !== existing.key) {
        this.assertKeyIsUsable(requested);
        await this.assertKeyIsFree(requested);
        nextKey = requested;
      }
    }

    const statusId = dto.statusId === undefined ? undefined : await this.resolveStatusId(dto.statusId);

    // Re-keying deliberately leaves existing identifiers behind: they are stored,
    // not derived, so a link to PFA-12 keeps working after the project becomes SPI.
    // A null on a nullable column clears it; on a NOT NULL one it means "unchanged".
    const project = await this.prisma.project.update({
      where: { id: existing.id },
      data: {
        key: nextKey,
        name: dto.name ?? undefined,
        icon: dto.icon,
        color: dto.color,
        summary: dto.summary,
        description: dto.description,
        statusId,
        priority: dto.priority ?? undefined,
        startDate: toDate(dto.startDate),
        targetDate: toDate(dto.targetDate),
        archivedAt: archivedAtFor(dto.archived, existing.archivedAt),
      },
      include: { status: true },
    });

    const counts = await this.loadCounts([project.id]);
    return toProjectDto(project, counts.get(project.id) ?? NO_ISSUES);
  }

  private async loadByKey(key: string): Promise<ProjectRow> {
    const normalised = normaliseProjectKey(key);
    const project = await this.prisma.project.findUnique({
      where: { key: normalised },
      include: { status: true },
    });

    if (!project) {
      throw new NotFoundException(`Project ${normalised} not found`);
    }
    return project;
  }

  /** Three aggregates rather than a read of every issue — the list page is O(projects). */
  private async loadCounts(projectIds: string[]): Promise<Map<string, IssueCounts>> {
    const byProject = new Map<string, IssueCounts>();
    if (projectIds.length === 0) {
      return byProject;
    }

    const live = { projectId: { in: projectIds }, archivedAt: null };
    const [totals, completed, legacy] = await Promise.all([
      this.prisma.issue.groupBy({ by: ["projectId"], where: live, _count: { _all: true } }),
      this.prisma.issue.groupBy({
        by: ["projectId"],
        where: { ...live, state: { type: "completed" } },
        _count: { _all: true },
      }),
      this.prisma.issue.groupBy({
        by: ["projectId"],
        where: { ...live, legacyIdentifier: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const totalById = countsByProject(totals);
    const completedById = countsByProject(completed);
    const legacyById = countsByProject(legacy);

    for (const projectId of projectIds) {
      byProject.set(projectId, {
        issueCount: totalById.get(projectId) ?? 0,
        completedCount: completedById.get(projectId) ?? 0,
        legacyCount: legacyById.get(projectId) ?? 0,
      });
    }

    return byProject;
  }

  private async resolveStatusId(statusId: string | undefined): Promise<string> {
    if (statusId) {
      const state = await this.prisma.workflowState.findUnique({ where: { id: statusId }, select: { id: true } });
      if (!state) {
        throw new BadRequestException(`Unknown workflow state ${statusId}`);
      }
      return state.id;
    }

    const backlog = await this.prisma.workflowState.findFirst({
      where: { type: "backlog" },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    if (!backlog) {
      throw new InternalServerErrorException("No backlog workflow state exists — seed the workspace first");
    }
    return backlog.id;
  }

  private assertKeyIsUsable(key: string): void {
    if (ALL_DIGITS.test(key)) {
      throw new BadRequestException(
        `"${key}" is all digits, so "${key}-1" would read as an issue number. Choose another key: 1991chat uses CHT.`,
      );
    }

    // A project is reached at /<key>/issues, so a key that matches a static
    // route segment makes the project unreachable — a 404 that no amount of
    // looking at the project would explain.
    if (isReservedProjectKey(key)) {
      throw new BadRequestException(
        `"${key}" is reserved by the app's own routes. Reserved keys: ${RESERVED_PROJECT_KEYS.join(", ")}.`,
      );
    }
  }

  private async assertKeyIsFree(key: string): Promise<void> {
    const clash = await this.prisma.project.findUnique({ where: { key }, select: { id: true } });
    if (clash) {
      throw new ConflictException(`Project key ${key} is already taken`);
    }
  }
}
