import { randomUUID } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { createApiToken } from "@auth/api-token.util";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTokenDto } from "@tokens/dto/create-token.dto";

import type { Prisma } from "../../generated/prisma/client";
import type { ApiTokenDto, CreatedApiTokenDto } from "@tokens/dto/token-response.interface";

const TOKEN_SELECT = {
  id: true,
  name: true,
  tokenSuffix: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
} as const satisfies Prisma.ApiTokenSelect;

type TokenRow = Prisma.ApiTokenGetPayload<{ select: typeof TOKEN_SELECT }>;

@Injectable()
export class TokensService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Revoked tokens stay in the list rather than disappearing. The question this page answers is "what
   * has been able to reach my data", and a revoked token that vanishes takes its `lastUsedAt` with it
   * — which is exactly the evidence you want after revoking one in a hurry.
   */
  async findAll(ownerId: string): Promise<ApiTokenDto[]> {
    const tokens = await this.prisma.apiToken.findMany({
      where: { ownerId },
      select: TOKEN_SELECT,
      orderBy: { createdAt: "desc" },
    });

    return tokens.map((token) => this.toDto(token));
  }

  async create(ownerId: string, dto: CreateTokenDto): Promise<CreatedApiTokenDto> {
    const { raw, hash, suffix } = createApiToken();

    const token = await this.prisma.apiToken.create({
      data: { id: randomUUID(), ownerId, name: dto.name, tokenHash: hash, tokenSuffix: suffix },
      select: TOKEN_SELECT,
    });

    // The only time the raw value leaves this process. Nothing persists it.
    return { ...this.toDto(token), token: raw };
  }

  /**
   * A soft revoke, which is what the `revokedAt` column is for. Deleting the row would destroy the
   * record that the token existed and when it was last used; the guard treats revoked and unknown
   * identically, so nothing is gained by forgetting it.
   */
  async revoke(ownerId: string, id: string): Promise<ApiTokenDto> {
    // Scoped read first: another account's token must be indistinguishable from one that never existed.
    const existing = await this.prisma.apiToken.findFirst({ where: { id, ownerId }, select: { revokedAt: true } });
    if (!existing) {
      throw new NotFoundException("Token not found");
    }

    // Re-revoking must not move the timestamp: when it was revoked is the fact worth keeping.
    if (existing.revokedAt !== null) {
      const unchanged = await this.prisma.apiToken.findFirstOrThrow({ where: { id, ownerId }, select: TOKEN_SELECT });
      return this.toDto(unchanged);
    }

    const revoked = await this.prisma.apiToken.updateMany({
      where: { id, ownerId },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) {
      throw new NotFoundException("Token not found");
    }

    const token = await this.prisma.apiToken.findFirstOrThrow({ where: { id, ownerId }, select: TOKEN_SELECT });

    return this.toDto(token);
  }

  private toDto(token: TokenRow): ApiTokenDto {
    return {
      id: token.id,
      name: token.name,
      suffix: token.tokenSuffix,
      lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
      revokedAt: token.revokedAt?.toISOString() ?? null,
      createdAt: token.createdAt.toISOString(),
    };
  }
}
