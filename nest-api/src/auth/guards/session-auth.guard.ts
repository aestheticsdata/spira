import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";

export interface SessionUser {
  id: string;
}

/**
 * The only authorisation point. Every controller that touches data is behind
 * it — a forged or expired cookie fails here, not in the front's middleware.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = (request.session as { userId?: string })?.userId;

    if (!userId) {
      throw new UnauthorizedException("Session required");
    }

    (request as Request & { user: SessionUser }).user = { id: userId };
    return true;
  }
}
