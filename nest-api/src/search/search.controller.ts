import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { SearchService } from "@search/search.service";
import { SearchQueryDto } from "@search/dto/search-query.dto";
import { ApiAuthGuard } from "@auth/guards/api-auth.guard";
import { GetUserId } from "@auth/decorators/get-user.decorator";

import type { SearchResponseDto } from "@search/dto/search-response.interface";

@Controller("search")
@UseGuards(ApiAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@GetUserId() ownerId: string, @Query() dto: SearchQueryDto): Promise<SearchResponseDto> {
    return this.searchService.search(ownerId, dto);
  }
}
