"use client";

import { useAuth } from "@auth/context/AuthContext";
import { ROUTES } from "@components/shared/config/constants";

const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const normalizeUrl = (url: string): string => (url.startsWith("/") ? url : `/${url}`);

/**
 * Always same-origin: nginx serves `/api` in production, and `next.config.js`
 * rewrites it to the Nest process in development. Nothing on the client needs
 * to know the API's host, which is what lets the CSP stay at
 * `connect-src 'self'` in every environment.
 */
const getRequestUrl = (url: string): string => `/api${normalizeUrl(url)}`;

const isUnsafeMethod = (method?: string): boolean => !SAFE_HTTP_METHODS.has((method ?? "GET").toUpperCase());

export class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

/**
 * Sends the user to the login screen when the backend session is gone.
 *
 * Returns `true` when it triggered the redirect — the caller then leaves its
 * promise pending so the 401 never reaches the error boundary. Returns `false`
 * when it can't navigate (SSR, or already on `/login`), so the caller throws
 * normally instead of hanging forever. `trailingSlash: true` means the path can
 * be `/login/`, hence the strip.
 */
const redirectToLogin = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  if (window.location.pathname.replace(/\/$/, "") === ROUTES.login.path) {
    return false;
  }

  window.location.replace(ROUTES.login.path);
  return true;
};

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  const message = body?.message;
  return Array.isArray(message) ? message.join(", ") : (message ?? response.statusText);
}

const useRequestHelper = () => {
  const { user, csrfToken, setCsrfToken } = useAuth();

  /** Unauthenticated calls — only login uses this. */
  const request = async <T>(url: string, options?: RequestInit): Promise<T> => {
    // `...options` has to come first: spread last it would put back the caller's
    // own `headers` on top of the merge below, dropping the content-type that
    // every JSON body needs, and undo `credentials: "include"`.
    const response = await fetch(getRequestUrl(url), {
      ...options,
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(options?.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new RequestError(response.status, await readError(response));
    }

    return (await response.json()) as T;
  };

  const privateRequest = async <T>(url: string, options?: RequestInit): Promise<T> => {
    if (!user) {
      if (redirectToLogin()) {
        return new Promise<never>(() => {});
      }
      throw new RequestError(401, "User not logged in");
    }

    const method = (options?.method ?? "GET").toUpperCase();

    const execute = (token: string | null): Promise<Response> =>
      fetch(getRequestUrl(url), {
        ...options,
        method,
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(options?.headers ?? {}),
          ...(token && isUnsafeMethod(method) ? { "x-csrf-token": token } : {}),
        },
      });

    let response = await execute(csrfToken);

    // A stale CSRF token is recoverable: fetch a fresh one and replay once.
    // Anything else keeps its original status.
    if (response.status === 403 && isUnsafeMethod(method)) {
      const refresh = await fetch(getRequestUrl("/users/csrf"), {
        credentials: "include",
      });
      if (refresh.ok) {
        const { csrfToken: refreshed } = (await refresh.json()) as {
          csrfToken?: string;
        };
        if (refreshed) {
          setCsrfToken(refreshed);
          response = await execute(refreshed);
        }
      }
    }

    if (response.status === 401 && redirectToLogin()) {
      // Expired session: navigate to /login and leave this promise pending so
      // the 401 never becomes a React Query error and never reaches error.tsx.
      return new Promise<never>(() => {});
    }

    if (!response.ok) {
      throw new RequestError(response.status, await readError(response));
    }

    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  };

  return { request, privateRequest };
};

export default useRequestHelper;
