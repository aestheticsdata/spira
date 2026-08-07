import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { LabelsService } from "@labels/labels.service";
import { CreateLabelDto } from "@labels/dto/create-label.dto";
import { UpdateLabelDto } from "@labels/dto/update-label.dto";
import { ApiAuthGuard } from "@auth/guards/api-auth.guard";
import { CsrfGuard } from "@auth/guards/csrf.guard";
import { GetUserId } from "@auth/decorators/get-user.decorator";

import type { LabelDto } from "@labels/dto/label-response.interface";

@Controller("labels")
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Get()
  @UseGuards(ApiAuthGuard)
  findAll(@GetUserId() ownerId: string): Promise<LabelDto[]> {
    return this.labelsService.findAll(ownerId);
  }

  @Post()
  @UseGuards(ApiAuthGuard, CsrfGuard)
  create(@GetUserId() ownerId: string, @Body() dto: CreateLabelDto): Promise<LabelDto> {
    return this.labelsService.create(ownerId, dto);
  }

  @Patch(":id")
  @UseGuards(ApiAuthGuard, CsrfGuard)
  update(
    @GetUserId() ownerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateLabelDto,
  ): Promise<LabelDto> {
    return this.labelsService.update(ownerId, id, dto);
  }

  @Delete(":id")
  @UseGuards(ApiAuthGuard, CsrfGuard)
  async remove(@GetUserId() ownerId: string, @Param("id", ParseUUIDPipe) id: string): Promise<{ ok: boolean }> {
    await this.labelsService.remove(ownerId, id);
    return { ok: true };
  }
}
