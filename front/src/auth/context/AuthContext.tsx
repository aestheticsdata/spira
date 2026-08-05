"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import type { AuthenticatedUserDto } from "@lib/api-types";

interface AuthState {
  user: AuthenticatedUserDto | null;
  csrfToken: string | null;
  setSession: (user: AuthenticatedUserDto | null) => void;
  setCsrfToken: (token: string) => void;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * The session itself lives in an httpOnly cookie the browser never reads. What
 * this context holds is only what the client needs to *send*: the CSRF token,
 * which every unsafe verb echoes in `X-CSRF-Token`, and the display data.
 *
 * Seeded from the server layout, so a signed-in reload never flashes as logged
 * out and never needs a round-trip to find out who it is.
 */
export function AuthProvider({
  initialUser,
  children,
}: {
  initialUser: AuthenticatedUserDto | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<AuthenticatedUserDto | null>(initialUser);
  const [csrfToken, setCsrfTokenState] = useState<string | null>(initialUser?.csrfToken ?? null);

  const setSession = useCallback((next: AuthenticatedUserDto | null) => {
    setUser(next);
    setCsrfTokenState(next?.csrfToken ?? null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, csrfToken, setSession, setCsrfToken: setCsrfTokenState }),
    [user, csrfToken, setSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}
