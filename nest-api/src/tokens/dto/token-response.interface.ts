export interface ApiTokenDto {
  id: string;
  name: string;
  /** Last four characters of the raw token — the list's only handle on which secret this is. */
  suffix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/**
 * The creation response, and the only time `token` is ever populated. It is not stored, so this
 * response is the sole opportunity to read it.
 */
export interface CreatedApiTokenDto extends ApiTokenDto {
  token: string;
}
