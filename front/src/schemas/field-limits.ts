/**
 * The front's copy of `nest-api/src/config/field-limits.ts`, which is itself a
 * copy of the column widths in `prisma/schema.prisma`. Three copies of one
 * number is two too many, but the alternative — a shared package — buys a
 * build step and a workspace link for a table of integers that changes once a
 * year, and the two lockfiles are deliberately separate.
 *
 * What this copy buys: a `maxLength` on the input, so an over-long name is
 * refused under the caret instead of coming back as a 400 after a round trip.
 * The API's copy is still the one that decides.
 *
 * Only the limits the front actually shows are mirrored here; the rest stay on
 * the API side until a form needs them.
 */
export const FIELD_LIMITS = {
  /** `Project.key` — the identifier prefix. */
  projectKey: 5,
  /** `Project.name`. */
  projectName: 120,
  /** `Project.summary`. */
  summary: 255,
  /** `Issue.title`. */
  issueTitle: 255,
  /** `Project.icon` and `SavedView.icon` — a Material Symbols name or one emoji. */
  icon: 40,
  /** `SavedView.name`. */
  viewName: 80,
  /** `ApiToken.name` — what the token is for. */
  apiTokenName: 80,
} as const;
