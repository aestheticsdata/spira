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
import { ApiAuthGuard } from "@auth/guards/api-auth.guard";
import { CsrfGuard } from "@auth/guards/csrf.guard";
import { GetUserId } from "@auth/decorators/get-user.decorator";

import type { IssueDetailDto, IssueListItemDto } from "@issues/dto/issue-response.interface";

@Controller("issues")
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Get()
  @UseGuards(ApiAuthGuard)
  list(@GetUserId() ownerId: string, @Query() query: IssuesQueryDto): Promise<IssueListItemDto[]> {
    return this.issuesService.list(ownerId, query);
  }

  @Get(":identifier")
  @UseGuards(ApiAuthGuard)
  findOne(@GetUserId() ownerId: string, @Param("identifier") identifier: string): Promise<IssueDetailDto> {
    return this.issuesService.findByIdentifier(ownerId, identifier);
  }

  @Post()
  @UseGuards(ApiAuthGuard, CsrfGuard)
  create(@GetUserId() ownerId: string, @Body() dto: CreateIssueDto): Promise<IssueDetailDto> {
    return this.issuesService.create(ownerId, dto);
  }

  @Patch(":identifier")
  @UseGuards(ApiAuthGuard, CsrfGuard)
  update(
    @GetUserId() ownerId: string,
    @Param("identifier") identifier: string,
    @Body() dto: UpdateIssueDto,
  ): Promise<IssueDetailDto> {
    return this.issuesService.update(ownerId, identifier, dto);
  }

  @Delete(":identifier")
  @UseGuards(ApiAuthGuard, CsrfGuard)
  @HttpCode(HttpStatus.OK)
  archive(@GetUserId() ownerId: string, @Param("identifier") identifier: string): Promise<{ ok: boolean }> {
    return this.issuesService.archive(ownerId, identifier);
  }

  @Post(":identifier/relations")
  @UseGuards(ApiAuthGuard, CsrfGuard)
  @HttpCode(HttpStatus.OK)
  addRelation(
    @GetUserId() ownerId: string,
    @Param("identifier") identifier: string,
    @Body() dto: CreateRelationDto,
  ): Promise<IssueDetailDto> {
    return this.issuesService.addRelation(ownerId, identifier, dto);
  }

  @Delete(":identifier/relations/:relationId")
  @UseGuards(ApiAuthGuard, CsrfGuard)
  @HttpCode(HttpStatus.OK)
  removeRelation(
    @GetUserId() ownerId: string,
    @Param("identifier") identifier: string,
    @Param("relationId") relationId: string,
  ): Promise<IssueDetailDto> {
    return this.issuesService.removeRelation(ownerId, identifier, relationId);
  }
}
