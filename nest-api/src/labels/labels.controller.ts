import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { LabelsService } from "@labels/labels.service";
import { CreateLabelDto } from "@labels/dto/create-label.dto";
import { UpdateLabelDto } from "@labels/dto/update-label.dto";
import { SessionAuthGuard } from "@auth/guards/session-auth.guard";
import { CsrfGuard } from "@auth/guards/csrf.guard";

import type { LabelDto } from "@labels/dto/label-response.interface";

@Controller("labels")
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  findAll(): Promise<LabelDto[]> {
    return this.labelsService.findAll();
  }

  @Post()
  @UseGuards(SessionAuthGuard, CsrfGuard)
  create(@Body() dto: CreateLabelDto): Promise<LabelDto> {
    return this.labelsService.create(dto);
  }

  @Patch(":id")
  @UseGuards(SessionAuthGuard, CsrfGuard)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateLabelDto): Promise<LabelDto> {
    return this.labelsService.update(id, dto);
  }

  @Delete(":id")
  @UseGuards(SessionAuthGuard, CsrfGuard)
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<{ ok: boolean }> {
    await this.labelsService.remove(id);
    return { ok: true };
  }
}
