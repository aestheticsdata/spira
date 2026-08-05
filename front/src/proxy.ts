import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

/**
 * A UX shortcut, NOT a security boundary.
 *
 * This runs on the Edge runtime, where the Redis client cannot run — so
 * it can only see whether the cookie is *present*, never whether the session
 * behind it is real. Authorisation is enforced server-side by the Nest API's
 * `SessionAuthGuard` on every single route; a forged cookie sails through here
 * and dies there.
 *
 * If authorisation ever creeps into this file it silently becomes
 * unenforceable. Do not put it here.
 *
 * There is deliberately no "already signed in, skip the login screen" rule
 * here either. Cookie presence is not the same fact as a live session, so such
 * a rule bounces a stale cookie — a Redis restart is enough to make one —
 * straight back into the layout that just rejected it, and the two redirects
 * chase each other until the browser gives up. `/login` makes that call itself,
 * against the API, which is the only thing that actually knows.
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/login" || pathname === "/login/";

  if (!request.cookies.has("spira.sid") && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // `api` MUST stay excluded. These are the browser's calls to the Nest API,
  // rewritten to it by next.config.js — sending an unauthenticated one to the
  // login *page* turns a clean 401 into a 307 towards HTML, and makes the login
  // request itself, which by definition has no session yet, impossible.
  matcher: ["/((?!api|_next/static|_next/image|favicon.svg|favicon.ico|.*\\.svg$).*)"],
};
