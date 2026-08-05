import "server-only";

import { cookies } from "next/headers";

/**
 * Server Components read through the Nest API rather than the database: the
 * front holds no Prisma client and no DB credentials, so the API stays the one
 * place where authorisation and the business rules live.
 *
 * The browser's session cookie is forwarded verbatim — `requireSession()` on
 * the Nest side is what actually authorises the call.
 */
const API_URL = process.env.SPIRA_API_URL ?? "http://localhost:6700";

export class ApiError extends Error {
  /** Structural marker — see `isApiError`. */
  readonly isApiError = true;

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Use this instead of `instanceof ApiError`.
 *
 * Next bundles a Server Component's imports into several chunks, and a module
 * pulled into two of them yields two distinct `ApiError` classes. An error
 * thrown through one prototype then fails `instanceof` against the other, so a
 * 401 that should have become a redirect escaped to the error boundary
 * instead — with `status: 401` sitting right there on the object. Testing the
 * shape survives that; testing the prototype does not.
 */
export function isApiError(error: unknown): error is ApiError {
  return typeof error === "object" && error !== null && (error as ApiError).isApiError === true;
}

export async function serverFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  const response = await fetch(`${API_URL}/api${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      cookie: cookieHeader,
    },
    // Ticket data changes on every mutation and the app is single-user, so
    // there is nothing to gain from Next's data cache here.
    cache: "no-store",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new ApiError(response.status, body?.message ?? response.statusText);
  }

  return (await response.json()) as T;
}

/** Same as `serverFetch`, but a 404 is a value rather than a throw. */
export async function serverFetchOptional<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    return await serverFetch<T>(path, init);
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      return null;
    }
    throw error;
  }
}
