/**
 * An issue identifier is `{projectKey}-{number}`. It is stored on the row, never
 * derived at read time, so re-keying a project cannot move an existing issue.
 */
export const IDENTIFIER_PATTERN = /^[A-Z0-9]{2,5}-\d+$/;

export function formatIdentifier(key: string, number: number): string {
  return `${key.toUpperCase()}-${number}`;
}
