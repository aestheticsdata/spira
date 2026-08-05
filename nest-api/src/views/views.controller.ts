import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ViewsService } from "@views/views.service";
import { CreateViewDto } from "@views/dto/create-view.dto";
import { UpdateViewDto } from "@views/dto/update-view.dto";
import { ViewsQueryDto } from "@views/dto/views-query.dto";
import { SessionAuthGuard } from "@auth/guards/session-auth.guard";
import { CsrfGuard } from "@auth/guards/csrf.guard";

import type { SavedViewDto } from "@views/dto/view-response.interface";

@Controller("views")
export class ViewsController {
  constructor(private readonly viewsService: ViewsService) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  findAll(@Query() query: ViewsQueryDto): Promise<SavedViewDto[]> {
    return this.viewsService.findAll(query.project);
  }

  @Post()
  @UseGuards(SessionAuthGuard, CsrfGuard)
  create(@Body() dto: CreateViewDto): Promise<SavedViewDto> {
    return this.viewsService.create(dto);
  }

  @Patch(":id")
  @UseGuards(SessionAuthGuard, CsrfGuard)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateViewDto): Promise<SavedViewDto> {
    return this.viewsService.update(id, dto);
  }

  @Delete(":id")
  @UseGuards(SessionAuthGuard, CsrfGuard)
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<{ ok: boolean }> {
    await this.viewsService.remove(id);
    return { ok: true };
  }
}
