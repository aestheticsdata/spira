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

    // A bearer token is never ambient: nothing attaches it to a cross-site request the way a browser
    // attaches a cookie, so there is no forgery for this check to prevent — and demanding a CSRF
    // header would make the connector unusable. Stated rather than left to fall through the session
    // test below, which it currently would, silently and for a different reason (C1).
    if ((request as Request & { authMethod?: string }).authMethod === "token") {
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
