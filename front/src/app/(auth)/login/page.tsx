import { LoginForm } from "@app/(auth)/login/login-form";
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
 * layout: either the session is live and both send you to /projects, or it is
 * not and both leave you here.
 */
export default async function LoginPage() {
  const signedIn = await serverFetch<AuthenticatedUserDto>("/users/me").then(
    () => true,
    () => false,
  );

  if (signedIn) {
    redirect("/projects");
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

        <LoginForm />
      </div>
    </div>
  );
}
