import type { TransformFnParams } from "class-transformer";

/**
 * Reusable `@Transform` callbacks.
 *
 * They exist as typed functions rather than inline arrows because
 * `TransformFnParams["value"]` is `any`: returning it straight from an inline
 * arrow makes the DTO's transform an `any`-typed expression, which is both a
 * lint error and a real hole — a non-string body value would flow through
 * untouched and unremarked. Narrowing here keeps every DTO honest.
 */

/** Trims a string value; anything else is passed through for the validator to reject. */
export function trim({ value }: TransformFnParams): unknown {
  return typeof value === "string" ? value.trim() : value;
}

/** Trims and uppercases — project keys and issue identifiers are stored uppercase. */
export function trimUpper({ value }: TransformFnParams): unknown {
  return typeof value === "string" ? value.trim().toUpperCase() : value;
}
