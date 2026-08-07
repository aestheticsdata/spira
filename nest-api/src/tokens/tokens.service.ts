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
  async findAll(): Promise<ApiTokenDto[]> {
    const tokens = await this.prisma.apiToken.findMany({
      select: TOKEN_SELECT,
      orderBy: { createdAt: "desc" },
    });

    return tokens.map((token) => this.toDto(token));
  }

  async create(dto: CreateTokenDto): Promise<CreatedApiTokenDto> {
    const { raw, hash, suffix } = createApiToken();

    const token = await this.prisma.apiToken.create({
      data: { id: randomUUID(), name: dto.name, tokenHash: hash, tokenSuffix: suffix },
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
  async revoke(id: string): Promise<ApiTokenDto> {
    const existing = await this.prisma.apiToken.findUnique({ where: { id }, select: { revokedAt: true } });
    if (!existing) {
      throw new NotFoundException("Token not found");
    }

    // Re-revoking must not move the timestamp: when it was revoked is the fact worth keeping.
    if (existing.revokedAt !== null) {
      const unchanged = await this.prisma.apiToken.findUniqueOrThrow({ where: { id }, select: TOKEN_SELECT });
      return this.toDto(unchanged);
    }

    const token = await this.prisma.apiToken.update({
      where: { id },
      data: { revokedAt: new Date() },
      select: TOKEN_SELECT,
    });

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
