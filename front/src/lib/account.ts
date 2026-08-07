/**
 * How an account is written on screen.
 *
 * `User.username` is the credential — an email (`cosmokaat@protonmail.com`),
 * which is what the login form takes and what the seeder creates. The app never
 * shows that address as the identity: what belongs in a sidebar is `cosmokaat`.
 *
 * Kept in one module because the sidebar's user menu and the settings page have
 * to agree. They are the same account in both places, and two implementations
 * would eventually disagree about one.
 */

/**
 * The name the app displays: the local part of the login address.
 *
 * Falls back to the whole string when there is no `@` — the seeder allows a
 * bare name (`joe`) and local dev uses one — and when the address begins with
 * `@`, where the local part is empty and dropping it would render nothing.
 */
export function displayName(username: string): string {
  const [local] = username.split("@");
  return local || username;
}

/** The two characters the round account badge draws. */
export function initials(username: string): string {
  const words = displayName(username)
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);

  if (words.length > 1) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}
