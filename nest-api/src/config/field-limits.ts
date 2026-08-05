/**
 * Maximum lengths of the user-writable text columns, mirroring
 * `prisma/schema.prisma`. Without them an oversized input travels all the way
 * to MySQL and comes back as a raw SQL error instead of a form message.
 *
 * The front mirrors this table in `front/src/schemas/field-limits.ts` — the two
 * must move together, and both only ever move with the column.
 */
export const FIELD_LIMITS = {
  /** `Project.key` — the identifier prefix. */
  projectKey: 5,
  /** `Project.name`. */
  projectName: 120,
  /** `Project.summary` and `Issue.description`'s single-line sibling. */
  summary: 255,
  /** `Issue.title`. */
  issueTitle: 255,
  /** `Label.name`. */
  labelName: 60,
  /** `SavedView.name`. */
  viewName: 80,
  /** `Project.icon` — a Material Symbols ligature name or one emoji. */
  icon: 40,
  /** `*.color` — `#rrggbb` or `#rrggbbaa`. */
  color: 9,
  /** `User.username` — the login. */
  username: 60,
  /** `Issue.identifier` and `Issue.legacyIdentifier`. */
  identifier: 20,
} as const;

/**
 * Minimum length for a password the owner *sets* (seed, change-password).
 *
 * Deliberately not enforced on sign-in: login checks a credential, it does not
 * police one. A length rule there only rejects passwords that already exist and
 * advertises the policy to whoever is guessing.
 */
export const PASSWORD_MIN_LENGTH = 6;
