import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { hasAuthenticatedSession, hasValidCsrfToken, isSafeHttpMethod } from "@auth/csrf-token.util";

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (isSafeHttpMethod(request.method)) {
      return true;
    }

    // Public routes (login) can still use unsafe verbs and don't rely on cookie auth.
    if (!hasAuthenticatedSession(request)) {
      return true;
    }

    if (!hasValidCsrfToken(request)) {
      throw new ForbiddenException("Invalid CSRF token");
    }

    return true;
  }
}
