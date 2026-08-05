import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CsrfGuard } from "@auth/guards/csrf.guard";
import { SessionAuthGuard } from "@auth/guards/session-auth.guard";
import { CreateProjectDto } from "@projects/dto/create-project.dto";
import { ProjectsQueryDto, SuggestKeyQueryDto } from "@projects/dto/projects-query.dto";
import { UpdateProjectDto } from "@projects/dto/update-project.dto";
import { ProjectsService } from "@projects/projects.service";

import type { ProjectDto, ProjectListItemDto } from "@projects/dto/project-response.interface";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  findAll(@Query() query: ProjectsQueryDto): Promise<ProjectListItemDto[]> {
    return this.projectsService.findAll(query.includeArchived ?? false);
  }

  // Declared before ":key" so the literal path is not swallowed by the parameter.
  @Get("suggest-key")
  @UseGuards(SessionAuthGuard)
  suggestKey(@Query() query: SuggestKeyQueryDto): Promise<{ key: string }> {
    return this.projectsService.suggestKey(query.name);
  }

  @Get(":key")
  @UseGuards(SessionAuthGuard)
  findOne(@Param("key") key: string): Promise<ProjectDto> {
    return this.projectsService.findByKey(key);
  }

  @Post()
  @UseGuards(SessionAuthGuard, CsrfGuard)
  create(@Body() dto: CreateProjectDto): Promise<ProjectDto> {
    return this.projectsService.create(dto);
  }

  @Patch(":key")
  @UseGuards(SessionAuthGuard, CsrfGuard)
  update(@Param("key") key: string, @Body() dto: UpdateProjectDto): Promise<ProjectDto> {
    return this.projectsService.update(key, dto);
  }
}
