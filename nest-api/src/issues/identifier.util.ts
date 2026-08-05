/**
 * An issue identifier is `{projectKey}-{number}`. It is stored on the row, never
 * derived at read time, so re-keying a project cannot move an existing issue.
 */
export const IDENTIFIER_PATTERN = /^[A-Z0-9]{2,5}-\d+$/;

export function formatIdentifier(key: string, number: number): string {
  return `${key.toUpperCase()}-${number}`;
}

export function parseIdentifier(raw: string): { key: string; number: number } | null {
  const normalised = raw.trim().toUpperCase();
  if (!IDENTIFIER_PATTERN.test(normalised)) {
    return null;
  }

  const separator = normalised.indexOf("-");
  const digits = normalised.slice(separator + 1);
  const number = Number(digits);

  // "PFA-0" and "PFA-007" are shapes we never wrote: the counter starts at 1 and
  // the digits have to survive the round trip through `formatIdentifier`.
  if (!Number.isSafeInteger(number) || number < 1 || String(number) !== digits) {
    return null;
  }

  return { key: normalised.slice(0, separator), number };
}
