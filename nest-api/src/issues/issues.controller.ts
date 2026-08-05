import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IssuesService } from "@issues/issues.service";
import { CreateIssueDto } from "@issues/dto/create-issue.dto";
import { CreateRelationDto } from "@issues/dto/create-relation.dto";
import { IssuesQueryDto } from "@issues/dto/issues-query.dto";
import { UpdateIssueDto } from "@issues/dto/update-issue.dto";
import { SessionAuthGuard } from "@auth/guards/session-auth.guard";
import { CsrfGuard } from "@auth/guards/csrf.guard";

import type { IssueDetailDto, IssueListItemDto } from "@issues/dto/issue-response.interface";

@Controller("issues")
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  list(@Query() query: IssuesQueryDto): Promise<IssueListItemDto[]> {
    return this.issuesService.list(query);
  }

  @Get(":identifier")
  @UseGuards(SessionAuthGuard)
  findOne(@Param("identifier") identifier: string): Promise<IssueDetailDto> {
    return this.issuesService.findByIdentifier(identifier);
  }

  @Post()
  @UseGuards(SessionAuthGuard, CsrfGuard)
  create(@Body() dto: CreateIssueDto): Promise<IssueDetailDto> {
    return this.issuesService.create(dto);
  }

  @Patch(":identifier")
  @UseGuards(SessionAuthGuard, CsrfGuard)
  update(@Param("identifier") identifier: string, @Body() dto: UpdateIssueDto): Promise<IssueDetailDto> {
    return this.issuesService.update(identifier, dto);
  }

  @Delete(":identifier")
  @UseGuards(SessionAuthGuard, CsrfGuard)
  @HttpCode(HttpStatus.OK)
  archive(@Param("identifier") identifier: string): Promise<{ ok: boolean }> {
    return this.issuesService.archive(identifier);
  }

  @Post(":identifier/relations")
  @UseGuards(SessionAuthGuard, CsrfGuard)
  @HttpCode(HttpStatus.OK)
  addRelation(@Param("identifier") identifier: string, @Body() dto: CreateRelationDto): Promise<IssueDetailDto> {
    return this.issuesService.addRelation(identifier, dto);
  }

  @Delete(":identifier/relations/:relationId")
  @UseGuards(SessionAuthGuard, CsrfGuard)
  @HttpCode(HttpStatus.OK)
  removeRelation(
    @Param("identifier") identifier: string,
    @Param("relationId") relationId: string,
  ): Promise<IssueDetailDto> {
    return this.issuesService.removeRelation(identifier, relationId);
  }
}
