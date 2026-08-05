import { randomUUID } from "node:crypto";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateLabelDto } from "@labels/dto/create-label.dto";
import { UpdateLabelDto } from "@labels/dto/update-label.dto";

import type { Prisma } from "../../generated/prisma/client";
import type { LabelDto } from "@labels/dto/label-response.interface";

const LABEL_SELECT = {
  id: true,
  name: true,
  color: true,
  _count: { select: { issues: true } },
} as const satisfies Prisma.LabelSelect;

interface LabelRow {
  id: string;
  name: string;
  color: string;
  _count: { issues: number };
}

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<LabelDto[]> {
    const labels = await this.prisma.label.findMany({
      select: LABEL_SELECT,
      orderBy: { name: "asc" },
    });

    return labels.map((label) => this.toLabelDto(label));
  }

  async create(dto: CreateLabelDto): Promise<LabelDto> {
    await this.assertNameAvailable(dto.name);

    const label = await this.prisma.label.create({
      data: { id: randomUUID(), name: dto.name, color: dto.color },
      select: LABEL_SELECT,
    });

    return this.toLabelDto(label);
  }

  async update(id: string, dto: UpdateLabelDto): Promise<LabelDto> {
    const existing = await this.prisma.label.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      throw new NotFoundException("Label not found");
    }

    if (dto.name !== undefined) {
      await this.assertNameAvailable(dto.name, id);
    }

    const label = await this.prisma.label.update({
      where: { id },
      data: { name: dto.name, color: dto.color },
      select: LABEL_SELECT,
    });

    return this.toLabelDto(label);
  }

  async remove(id: string): Promise<void> {
    // deleteMany rather than delete: the count tells us whether the row existed
    // without a second round trip, and IssueLabel cascades either way.
    const { count } = await this.prisma.label.deleteMany({ where: { id } });
    if (count === 0) {
      throw new NotFoundException("Label not found");
    }
  }

  /**
   * Guards the unique index on `Label.name`. The comparison is the column's own
   * case-insensitive collation, so "Bug" and "bug" clash here exactly as they
   * would in MySQL.
   */
  private async assertNameAvailable(name: string, exceptId?: string): Promise<void> {
    const clash = await this.prisma.label.findFirst({
      where: exceptId ? { name, id: { not: exceptId } } : { name },
      select: { id: true },
    });

    if (clash) {
      throw new ConflictException(`A label named "${name}" already exists`);
    }
  }

  private toLabelDto(label: LabelRow): LabelDto {
    return {
      id: label.id,
      name: label.name,
      color: label.color,
      issueCount: label._count.issues,
    };
  }
}
