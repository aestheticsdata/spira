/** Longer than any route Spira generates; a `?next=` beyond this is not one of ours. */
const MAX_LENGTH = 512;

/**
 * Narrows a `?next=` value to a path this app can safely send a browser to after login.
 *
 * The parameter is attacker-controllable — it is whatever was in the URL bar — so it is treated as a
 * path and never as a URL. Anything that could resolve to another origin is dropped in favour of the
 * caller's default:
 *
 * - `//evil.com` is protocol-relative and navigates off-site despite the leading slash.
 * - `/\evil.com` is the same trick: browsers normalise the backslash to a slash.
 * - `https://evil.com` fails the leading-slash test outright.
 *
 * Returns null when the value cannot be trusted, so callers fall back rather than guess.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) {
    return null;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  return value;
}
