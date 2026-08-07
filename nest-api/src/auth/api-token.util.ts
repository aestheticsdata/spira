import { createHash, randomBytes } from "crypto";
import type { Request } from "express";

/** Namespaces the secret so one found in a log or a shell history is identifiable on sight. */
export const TOKEN_PREFIX = "spira_pat_";

/** 32 bytes — 256 bits. Guessing is not a threat model at this width. */
const TOKEN_BYTES = 32;

/** What the list shows after the dots. Four hex characters of a 256-bit secret narrow nothing. */
const SUFFIX_LENGTH = 4;

const BEARER = /^Bearer\s+(.+)$/i;

export interface NewApiToken {
  /** Returned to the caller once, at creation, and never obtainable again. */
  raw: string;
  hash: string;
  suffix: string;
}

/**
 * SHA-256 rather than bcrypt, deliberately.
 *
 * bcrypt exists to make guessing a *low-entropy* secret expensive, and it costs ~100ms by design.
 * This secret is 256 random bits, so there is nothing to guess — and unlike a password, which is
 * verified once per login, a token is verified on every request the connector makes. Paying a KDF
 * there would make the MCP server slow for no security gained.
 *
 * The hash is also what the lookup keys on, so verification is a unique-index hit rather than a
 * compare — there is no candidate row to leak timing about.
 */
export function hashApiToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function createApiToken(): NewApiToken {
  const raw = `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString("hex")}`;
  return { raw, hash: hashApiToken(raw), suffix: raw.slice(-SUFFIX_LENGTH) };
}

/** The bearer credential, or null when the header is absent or not a bearer. */
export function readBearerToken(request: Request): string | null {
  const header = request.header("authorization");
  if (!header) {
    return null;
  }
  const match = BEARER.exec(header.trim());
  return match ? match[1].trim() : null;
}
