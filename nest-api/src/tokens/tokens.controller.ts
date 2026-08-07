import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { CsrfGuard } from "@auth/guards/csrf.guard";
import { SessionAuthGuard } from "@auth/guards/session-auth.guard";
import { CreateTokenDto } from "@tokens/dto/create-token.dto";
import { TokensService } from "@tokens/tokens.service";

import type { ApiTokenDto, CreatedApiTokenDto } from "@tokens/dto/token-response.interface";

/**
 * `SessionAuthGuard`, not `ApiAuthGuard` — deliberately the one place that stays cookie-only along
 * with `users` and `views`. A token that could mint or list tokens would make revoking one
 * meaningless, since whoever held it could simply issue another.
 */
@Controller("tokens")
export class TokensController {
  constructor(private readonly tokensService: TokensService) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  findAll(): Promise<ApiTokenDto[]> {
    return this.tokensService.findAll();
  }

  @Post()
  @UseGuards(SessionAuthGuard, CsrfGuard)
  create(@Body() dto: CreateTokenDto): Promise<CreatedApiTokenDto> {
    return this.tokensService.create(dto);
  }

  /** DELETE revokes rather than deletes; the row and its `lastUsedAt` are the audit trail. */
  @Delete(":id")
  @UseGuards(SessionAuthGuard, CsrfGuard)
  revoke(@Param("id", ParseUUIDPipe) id: string): Promise<ApiTokenDto> {
    return this.tokensService.revoke(id);
  }
}
