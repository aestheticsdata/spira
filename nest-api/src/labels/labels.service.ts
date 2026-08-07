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

  async findAll(ownerId: string): Promise<LabelDto[]> {
    const labels = await this.prisma.label.findMany({
      where: { ownerId },
      select: LABEL_SELECT,
      orderBy: { name: "asc" },
    });

    return labels.map((label) => this.toLabelDto(label));
  }

  async create(ownerId: string, dto: CreateLabelDto): Promise<LabelDto> {
    await this.assertNameAvailable(ownerId, dto.name);

    const label = await this.prisma.label.create({
      data: { id: randomUUID(), ownerId, name: dto.name, color: dto.color },
      select: LABEL_SELECT,
    });

    return this.toLabelDto(label);
  }

  async update(ownerId: string, id: string, dto: UpdateLabelDto): Promise<LabelDto> {
    // Another account's label must read as absent, not as forbidden.
    const existing = await this.prisma.label.findFirst({ where: { id, ownerId }, select: { id: true } });
    if (!existing) {
      throw new NotFoundException("Label not found");
    }

    if (dto.name !== undefined) {
      await this.assertNameAvailable(ownerId, dto.name, id);
    }

    const label = await this.prisma.label.update({
      where: { id, ownerId },
      data: { name: dto.name, color: dto.color },
      select: LABEL_SELECT,
    });

    return this.toLabelDto(label);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    // deleteMany rather than delete: the count tells us whether the row existed
    // without a second round trip, and IssueLabel cascades either way.
    const { count } = await this.prisma.label.deleteMany({ where: { id, ownerId } });
    if (count === 0) {
      throw new NotFoundException("Label not found");
    }
  }

  /**
   * Guards the unique index on `(Label.ownerId, Label.name)`. The comparison is
   * the column's own case-insensitive collation, so "Bug" and "bug" clash here
   * exactly as they would in MySQL.
   */
  private async assertNameAvailable(ownerId: string, name: string, exceptId?: string): Promise<void> {
    const clash = await this.prisma.label.findFirst({
      where: exceptId ? { ownerId, name, id: { not: exceptId } } : { ownerId, name },
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
