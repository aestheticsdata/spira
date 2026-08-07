"use client";

import { Button } from "@components/ui/button";
import { PasswordField } from "@components/ui/password-field";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AuthenticatedUserDto } from "@lib/api-types";

/**
 * Login cannot go through `useRequestHelper`: that hook refuses to fire without
 * a session, which is exactly what this form is trying to create. The URL is
 * still same-origin — nginx owns /api in production, `next.config.js` rewrites
 * it in development — so no host and no CORS are involved either way.
 */
export function LoginForm({ destination }: { destination: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/users/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
        setError(response.status === 429 ? "Too many attempts. Try again later." : (message ?? "Sign in failed"));
        return;
      }

      // Consume the response so the session cookie is committed before the
      // navigation, then refresh so the server layout re-runs with it.
      (await response.json()) as AuthenticatedUserDto;
      // Already narrowed to a same-origin path by the server component that rendered this form.
      router.replace(destination);
      router.refresh();
    } catch {
      setError("The API is unreachable.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-115 text-ink-7">Username</span>
        <input
          type="text"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          name="username"
          className="h-8 rounded-lg border border-line bg-field px-2.5 text-13 text-ink-2 outline-none focus:border-line-focus"
        />
      </label>

      <PasswordField
        label="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
        required
      />

      {error && <p className="text-115 text-danger">{error}</p>}

      <Button
        type="submit"
        variant="primary"
        disabled={pending}
        className="mt-1"
      >
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-11 text-ink-8">There is no signup. The account is created by the seed script.</p>
    </form>
  );
}
