export class SocialConnectionError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'MISSING_CREDENTIALS'
      | 'TOKEN_EXPIRED'
      | 'TOKEN_REFRESH_FAILED'
      | 'PROVIDER_ERROR'
      | 'ACCOUNT_UNAVAILABLE' = 'PROVIDER_ERROR',
  ) {
    super(message);
    this.name = 'SocialConnectionError';
  }
}
