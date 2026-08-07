/**
 * The connector's only way to reach Spira: the same REST API the browser uses, with a bearer token
 * instead of a session cookie.
 *
 * Deliberately not a database client. Every invariant Spira enforces — the epic rules, identifier
 * allocation, label validity, relation normalisation — lives behind these routes, so a connector that
 * went around them could write states the UI would refuse to produce.
 */

/** Thrown with the API's own message, so a tool error says what actually went wrong. */
export class SpiraApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly path: string,
  ) {
    super(message);
    this.name = "SpiraApiError";
  }
}

interface NestErrorBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
}

export interface SpiraClientConfig {
  baseUrl: string;
  token: string;
}

export class SpiraClient {
  private readonly baseUrl: string;

  constructor(private readonly config: SpiraClientConfig) {
    // One trailing slash difference otherwise turns every path into a 404.
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
  }

  get<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>("GET", path + toQueryString(query));
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.config.token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (cause) {
      // A DNS failure or a stopped API is not an API error, and saying "0" would imply it answered.
      throw new SpiraApiError(0, `Cannot reach Spira at ${this.baseUrl}: ${(cause as Error).message}`, path);
    }

    if (!response.ok) {
      throw new SpiraApiError(response.status, await readErrorMessage(response), path);
    }

    // 204, and any other body-less success.
    if (response.status === 204 || response.headers.get("content-length") === "0") {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

/**
 * Surfaces the API's own error rather than a generic failure. Nest sends
 * `{ statusCode, message, error }`, where `message` is an array when class-validator rejected the
 * body — that array is the actionable part, so it is joined rather than stringified.
 */
async function readErrorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as NestErrorBody | null;

  if (body?.message) {
    return Array.isArray(body.message) ? body.message.join("; ") : body.message;
  }
  if (body?.error) {
    return body.error;
  }
  return `${response.status} ${response.statusText}`;
}

/** Skips undefined and null so an unset filter never becomes `?project=undefined`. */
function toQueryString(query?: Record<string, unknown>): string {
  if (!query) return "";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;

    // Repeatable filters (state, label) are sent comma-joined, which is one of the three forms
    // `toList` on the API side accepts.
    params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }

  const serialised = params.toString();
  return serialised ? `?${serialised}` : "";
}
