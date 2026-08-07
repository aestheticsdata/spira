import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CsrfGuard } from "@auth/guards/csrf.guard";
import { ApiAuthGuard } from "@auth/guards/api-auth.guard";
import { CreateProjectDto } from "@projects/dto/create-project.dto";
import { ProjectsQueryDto, SuggestKeyQueryDto } from "@projects/dto/projects-query.dto";
import { UpdateProjectDto } from "@projects/dto/update-project.dto";
import { ProjectsService } from "@projects/projects.service";

import type { ProjectDto, ProjectListItemDto } from "@projects/dto/project-response.interface";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @UseGuards(ApiAuthGuard)
  findAll(@Query() query: ProjectsQueryDto): Promise<ProjectListItemDto[]> {
    return this.projectsService.findAll(query.includeArchived ?? false);
  }

  // Declared before ":key" so the literal path is not swallowed by the parameter.
  @Get("suggest-key")
  @UseGuards(ApiAuthGuard)
  suggestKey(@Query() query: SuggestKeyQueryDto): Promise<{ key: string }> {
    return this.projectsService.suggestKey(query.name);
  }

  @Get(":key")
  @UseGuards(ApiAuthGuard)
  findOne(@Param("key") key: string): Promise<ProjectDto> {
    return this.projectsService.findByKey(key);
  }

  @Post()
  @UseGuards(ApiAuthGuard, CsrfGuard)
  create(@Body() dto: CreateProjectDto): Promise<ProjectDto> {
    return this.projectsService.create(dto);
  }

  @Patch(":key")
  @UseGuards(ApiAuthGuard, CsrfGuard)
  update(@Param("key") key: string, @Body() dto: UpdateProjectDto): Promise<ProjectDto> {
    return this.projectsService.update(key, dto);
  }
}
