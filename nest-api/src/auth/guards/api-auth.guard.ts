import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { hashApiToken, readBearerToken } from "@auth/api-token.util";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "@redis/redis.service";

import type { Request } from "express";
import type { SessionUser } from "@auth/guards/session-auth.guard";

/**
 * How stale `lastUsedAt` is allowed to be. The column answers "is this token still in use", which a
 * five-minute resolution answers just as well as a per-request write would — and the connector makes
 * bursts of calls, so writing on each one turns every read into a write.
 */
const LAST_USED_THROTTLE_SECONDS = 300;

/** Set on the request so the CSRF guard can see how the caller authenticated. */
export type AuthMethod = "session" | "token";

export type AuthenticatedRequest = Request & { user: SessionUser; authMethod: AuthMethod };

/**
 * Session cookie **or** `Authorization: Bearer`, for the routes the MCP connector needs (C1/C2).
 *
 * Deliberately not applied everywhere. `users` and `views` stay cookie-only, and so do the token
 * routes themselves: a leaked token can then read and write issues — which is its job — but cannot
 * mint another token, list the existing ones, or change the password. That containment is worth more
 * than the uniformity.
 */
@Injectable()
export class ApiAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const sessionUserId = (request.session as { userId?: string } | undefined)?.userId;
    if (sessionUserId) {
      this.authenticate(request, sessionUserId, "session");
      return true;
    }

    const raw = readBearerToken(request);
    if (!raw) {
      throw new UnauthorizedException("Session or API token required");
    }

    const token = await this.prisma.apiToken.findUnique({
      where: { tokenHash: hashApiToken(raw) },
      select: { id: true, revokedAt: true, ownerId: true },
    });

    // Same answer for "no such token" and "revoked token": which of the two it was is not something
    // the caller is entitled to learn.
    if (!token || token.revokedAt !== null) {
      throw new UnauthorizedException("Invalid API token");
    }

    await this.touch(token.id);
    // The token's own `ownerId`, never "the account that happens to exist" — that older shortcut
    // would hand a token from one workspace the keys to another's the moment a second account exists.
    this.authenticate(request, token.ownerId, "token");
    return true;
  }

  private authenticate(request: Request, userId: string, method: AuthMethod): void {
    const authenticated = request as AuthenticatedRequest;
    authenticated.user = { id: userId };
    authenticated.authMethod = method;
  }

  /**
   * Writes `lastUsedAt` at most once per throttle window. The Redis key is the throttle: `NX` means
   * only the request that creates it does the write, and `EX` reopens the window when it expires.
   * A Redis failure costs an accurate timestamp, never the request.
   */
  private async touch(tokenId: string): Promise<void> {
    try {
      const claimed = await this.redis
        .getClient()
        .set(`spira:token-used:${tokenId}`, "1", { NX: true, EX: LAST_USED_THROTTLE_SECONDS });

      if (claimed) {
        await this.prisma.apiToken.update({ where: { id: tokenId }, data: { lastUsedAt: new Date() } });
      }
    } catch {
      // A backup of the timestamp is not worth failing an authenticated call over.
    }
  }
}
