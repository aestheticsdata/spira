import { LoginForm } from "@app/(auth)/login/login-form";
import { safeNextPath } from "@lib/next-path";
import { serverFetch } from "@lib/server-api";
import Image from "next/image";
import { redirect } from "next/navigation";

import type { AuthenticatedUserDto } from "@lib/api-types";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in · Spira" };

/**
 * The design file has no login screen — Spira has one account and the session
 * lasts eight hours, so this is seen roughly never. It is built from the same
 * tokens as everything else and deliberately kept plain.
 *
 * The "you are already signed in" redirect lives here rather than in the proxy
 * because it needs the API's answer, not the cookie's presence. Asking the
 * authority in both places is what keeps this from looping against the app
 * layout: either the session is live and both send you on, or it is not and both
 * leave you here.
 *
 * Where "on" points is `?next=`, set by the proxy when it bounced the request.
 * It is narrowed by `safeNextPath` before it reaches either redirect — it is
 * whatever was in the URL bar, so it is treated as an attacker's string and is
 * never allowed to name another origin.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const [{ next }, signedIn] = await Promise.all([
    searchParams,
    serverFetch<AuthenticatedUserDto>("/users/me").then(
      () => true,
      () => false,
    ),
  ]);

  // A repeated ?next= arrives as an array; there is no sensible way to pick one, so take neither.
  const destination = safeNextPath(Array.isArray(next) ? null : next) ?? "/projects";

  if (signedIn) {
    redirect(destination);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-[360px]">
        <div className="mb-7 flex items-center gap-[9px]">
          <Image
            src="/spira-mark.svg"
            alt=""
            width={26}
            height={26}
            priority
          />
          <div>
            <h1 className="text-16 font-semibold tracking-row text-ink-1">Spira</h1>
            <p className="mt-0.5 text-115 text-ink-7">Self-hosted · one account</p>
          </div>
        </div>

        <LoginForm destination={destination} />
      </div>
    </div>
  );
}
