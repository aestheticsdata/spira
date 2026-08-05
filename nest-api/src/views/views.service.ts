import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateViewDto } from "@views/dto/create-view.dto";
import { UpdateViewDto } from "@views/dto/update-view.dto";
import { checkViewQuery } from "@views/view-query.util";

import type { Prisma } from "../../generated/prisma/client";
import type { SavedViewDto } from "@views/dto/view-response.interface";

const VIEW_SELECT = {
  id: true,
  name: true,
  icon: true,
  query: true,
  position: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { id: true, key: true, name: true, icon: true, color: true } },
} as const satisfies Prisma.SavedViewSelect;

type ViewRow = Prisma.SavedViewGetPayload<{ select: typeof VIEW_SELECT }>;

/**
 * Workspace views first, then each project's, and within a scope by the
 * position the owner dragged them into. The id closes it: `position` is only
 * ever unique by accident, and MySQL is free to break a tie differently on
 * every request, which reads as a sidebar that reshuffles itself.
 */
const VIEW_ORDER = [
  { projectId: "asc" },
  { position: "asc" },
  { id: "asc" },
] satisfies Prisma.SavedViewOrderByWithRelationInput[];

@Injectable()
export class ViewsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(projectKey?: string): Promise<SavedViewDto[]> {
    const where: Prisma.SavedViewWhereInput = {};

    if (projectKey) {
      // A project's views *and* the workspace's: on a project list, both apply,
      // and a sidebar that hid the workspace ones while inside a project would
      // make them reachable only from outside every project.
      where.OR = [{ project: { key: projectKey } }, { projectId: null }];
    }

    const rows = await this.prisma.savedView.findMany({ where, select: VIEW_SELECT, orderBy: VIEW_ORDER });

    return rows.map((row) => this.toDto(row));
  }

  async create(dto: CreateViewDto): Promise<SavedViewDto> {
    // Checked before anything is written: a view that could not be replayed is
    // not a view, and storing one would move the failure to whoever opens it.
    const { query, error } = checkViewQuery(dto.query);
    if (error !== null || query === null) {
      throw new BadRequestException(error ?? "The view's query is not valid");
    }

    const projectId = await this.resolveProjectId(dto.projectKey);

    const row = await this.prisma.savedView.create({
      data: {
        id: randomUUID(),
        name: dto.name,
        icon: dto.icon ?? null,
        projectId,
        query,
        position: await this.nextPosition(projectId),
      },
      select: VIEW_SELECT,
    });

    return this.toDto(row);
  }

  async update(id: string, dto: UpdateViewDto): Promise<SavedViewDto> {
    const existing = await this.prisma.savedView.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      throw new NotFoundException("View not found");
    }

    const data: Prisma.SavedViewUncheckedUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.icon !== undefined) {
      data.icon = dto.icon;
    }
    if (dto.position !== undefined) {
      data.position = dto.position;
    }
    if (dto.query !== undefined) {
      const { query, error } = checkViewQuery(dto.query);
      if (error !== null || query === null) {
        throw new BadRequestException(error ?? "The view's query is not valid");
      }
      data.query = query;
    }

    const row = await this.prisma.savedView.update({ where: { id }, data, select: VIEW_SELECT });

    return this.toDto(row);
  }

  async remove(id: string): Promise<void> {
    // deleteMany rather than delete: the count says whether the row existed
    // without a second round trip, as the labels service does.
    const { count } = await this.prisma.savedView.deleteMany({ where: { id } });
    if (count === 0) {
      throw new NotFoundException("View not found");
    }
  }

  /**
   * Appended to its own scope's end. Two views can share a position — nothing
   * here enforces otherwise — because a reorder writes several rows and a
   * unique index would make an ordinary drag fail halfway through it.
   */
  private async nextPosition(projectId: string | null): Promise<number> {
    const last = await this.prisma.savedView.findFirst({
      where: { projectId },
      select: { position: true },
      orderBy: { position: "desc" },
    });

    return (last?.position ?? -1) + 1;
  }

  private async resolveProjectId(projectKey?: string | null): Promise<string | null> {
    if (!projectKey) {
      return null;
    }

    const project = await this.prisma.project.findUnique({ where: { key: projectKey }, select: { id: true } });
    if (!project) {
      throw new NotFoundException(`Project ${projectKey} not found`);
    }

    return project.id;
  }

  /**
   * Re-checked on the way out, not only on the way in. The stored string was
   * valid when it was written; the vocabulary it was written against is what
   * moves, and a view that no longer parses has to say so rather than open into
   * a list quietly different from the one that was saved.
   */
  private toDto(row: ViewRow): SavedViewDto {
    const { query, error } = checkViewQuery(row.query);

    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      project: row.project,
      query,
      position: row.position,
      invalid: error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
