import type { TransformFnParams } from "class-transformer";

import { FIELD_LIMITS } from "@config/field-limits";

/** The identifier prefix: uppercase alphanumerics, 2-5 characters ("PFA" in "PFA-12"). */
export const PROJECT_KEY_PATTERN = /^[A-Z0-9]{2,5}$/;

/**
 * Keys the front's routing cannot survive. A project lives at `/<key>/issues`,
 * a static segment beats the dynamic `[key]` one, and the loser is the project:
 * keyed ISSUE it would sit under `/issue/...`, keyed LOGIN under the login
 * screen. API is the same story for the `/api` rewrite, and NEW is held back
 * for the create routes. `PROJECTS` and `SETTINGS` need no entry — both are
 * longer than the five characters a key is allowed.
 *
 * Mirrored in `front/src/components/shared/config/constants.ts`, which uses it
 * to say so before the request leaves the browser. This copy is the one that
 * decides.
 */
export const RESERVED_PROJECT_KEYS: readonly string[] = ["ISSUE", "LOGIN", "API", "NEW"];

const SUGGESTION_LENGTH = 3;
const MAX_KEY_LENGTH = FIELD_LIMITS.projectKey;
const FALLBACK_KEY = "PRJ";
const MAX_SUFFIX = 999;
const ALL_DIGITS = /^\d+$/;

export function normaliseProjectKey(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isReservedProjectKey(key: string): boolean {
  return RESERVED_PROJECT_KEYS.includes(normaliseProjectKey(key));
}

/**
 * A key made only of digits reads as an issue number, and a reserved one
 * collides with a route, so neither is ever suggested.
 */
function isUsable(candidate: string): boolean {
  return PROJECT_KEY_PATTERN.test(candidate) && !ALL_DIGITS.test(candidate) && !isReservedProjectKey(candidate);
}

function baseKey(name: string): string {
  const upper = normaliseProjectKey(name);

  const head = upper.replace(/[^A-Z0-9]/g, "").slice(0, SUGGESTION_LENGTH);
  if (isUsable(head)) {
    return head;
  }

  // "1991chat" heads with "199". Dropping the vowels keeps the fallback
  // recognisable ("CHT") where the first three letters would give "CHA".
  const letters = upper.replace(/[^A-Z]/g, "");
  const consonants = letters.replace(/[AEIOU]/g, "").slice(0, SUGGESTION_LENGTH);
  if (isUsable(consonants)) {
    return consonants;
  }

  const initials = letters.slice(0, SUGGESTION_LENGTH);
  return isUsable(initials) ? initials : FALLBACK_KEY;
}

export function suggestProjectKey(name: string, taken: string[]): string {
  const used = new Set(taken.map(normaliseProjectKey));
  const base = baseKey(name);
  if (!used.has(base)) {
    return base;
  }

  for (let suffix = 2; suffix <= MAX_SUFFIX; suffix += 1) {
    const digits = String(suffix);
    const candidate = `${base.slice(0, MAX_KEY_LENGTH - digits.length)}${digits}`;
    if (!used.has(candidate) && isUsable(candidate)) {
      return candidate;
    }
  }

  // Every variant is taken; hand back the base and let the uniqueness check speak.
  return base;
}

/**
 * `@Transform` adapter for the two project DTOs. Typed rather than inline
 * because `TransformFnParams["value"]` is `any`, and returning that straight
 * from a DTO decorator silently lets a non-string body value through.
 */
export function normaliseProjectKeyValue({ value }: TransformFnParams): unknown {
  return typeof value === "string" ? normaliseProjectKey(value) : value;
}
