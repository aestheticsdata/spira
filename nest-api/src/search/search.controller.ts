import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { SearchService } from "@search/search.service";
import { SearchQueryDto } from "@search/dto/search-query.dto";
import { SessionAuthGuard } from "@auth/guards/session-auth.guard";

import type { SearchResponseDto } from "@search/dto/search-response.interface";

@Controller("search")
@UseGuards(SessionAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@Query() dto: SearchQueryDto): Promise<SearchResponseDto> {
    return this.searchService.search(dto);
  }
}
