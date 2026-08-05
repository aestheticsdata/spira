import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { UsersService } from "@users/users.service";
import { SignInDto } from "@users/dto/sign-in.dto";
import { ChangePasswordDto } from "@users/dto/change-password.dto";
import { RedisService } from "@redis/redis.service";
import { SessionAuthGuard } from "@auth/guards/session-auth.guard";
import { CsrfGuard } from "@auth/guards/csrf.guard";
import { GetUserId } from "@auth/decorators/get-user.decorator";
import { clearCsrfToken, getOrCreateCsrfToken, rotateCsrfToken } from "@auth/csrf-token.util";

import type { AuthenticatedUser } from "@users/users.service";

/**
 * Login rate limiting: a Redis counter keyed by IP, with an exponential
 * lockout. The window is refreshed on every failure, so the lockout only
 * expires once the client stops trying for a full window.
 */
const MAX_LOGIN_ATTEMPTS = 5;
const BASE_LOCKOUT_SECONDS = 60;
const MAX_LOCKOUT_SECONDS = 60 * 60;

function lockoutWindow(attempts: number): number {
  const overage = Math.max(0, attempts - MAX_LOGIN_ATTEMPTS);
  return Math.min(BASE_LOCKOUT_SECONDS * 2 ** overage, MAX_LOCKOUT_SECONDS);
}

function clientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
}

@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
  ) {}

  @Get("me")
  @UseGuards(SessionAuthGuard)
  async me(@GetUserId() userId: string, @Req() req: Request): Promise<AuthenticatedUser & { csrfToken: string }> {
    const user = await this.usersService.findById(userId);
    return { ...user, csrfToken: getOrCreateCsrfToken(req) };
  }

  @Get("csrf")
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  csrf(@Req() req: Request): { csrfToken: string } {
    return { csrfToken: getOrCreateCsrfToken(req) };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async signIn(@Body() dto: SignInDto, @Req() req: Request): Promise<AuthenticatedUser & { csrfToken: string }> {
    const ip = clientIp(req);
    const attempts = await this.redisService.getFailedLogins(ip);
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      throw new HttpException("Too many login attempts, try again later", HttpStatus.TOO_MANY_REQUESTS);
    }

    let user: AuthenticatedUser;
    try {
      user = await this.usersService.signIn(dto.username, dto.password);
    } catch (error) {
      const attempt = await this.redisService.recordFailedLogin(ip, BASE_LOCKOUT_SECONDS);
      if (attempt >= MAX_LOGIN_ATTEMPTS) {
        await this.redisService.extendFailedLoginWindow(ip, lockoutWindow(attempt));
      }
      throw error;
    }

    await this.redisService.clearFailedLogins(ip);
    await this.redisService.clearSessionsForUser(user.id);
    (req.session as { userId?: string }).userId = user.id;

    return { ...user, csrfToken: rotateCsrfToken(req) };
  }

  // CsrfGuard only, as in pfa: logging out of an already-dead session must
  // succeed and clear the cookie, not 401. CsrfGuard still rejects a
  // cross-site attempt against a *live* session, which is the threat here.
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ ok: boolean }> {
    clearCsrfToken(req);
    return new Promise((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) reject(err instanceof Error ? err : new Error(String(err)));
        else {
          res.clearCookie("spira.sid");
          resolve({ ok: true });
        }
      });
    });
  }

  @Post("password")
  @UseGuards(SessionAuthGuard, CsrfGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(@GetUserId() userId: string, @Body() dto: ChangePasswordDto): Promise<{ ok: boolean }> {
    await this.usersService.changePassword(userId, dto.currentPassword, dto.newPassword);
    return { ok: true };
  }
}
