export interface AuthActionUrlInput {
  tokenHash: string;
  actionType: 'signup' | 'recovery' | 'magiclink';
  redirectTo?: string;
}

export function buildAuthActionUrl(siteUrl: string, input: AuthActionUrlInput): string {
  const actionUrl = new URL('/auth/callback', siteUrl);

  if (input.redirectTo) {
    try {
      const suppliedRedirect = new URL(input.redirectTo, siteUrl);
      if (suppliedRedirect.pathname === '/auth/callback') {
        for (const parameter of ['redirectTo', 'returnTo']) {
          const value = suppliedRedirect.searchParams.get(parameter);
          if (value) actionUrl.searchParams.set(parameter, value);
        }
      }
    } catch {
      // Keep the canonical callback for an invalid redirect value.
    }
  }

  actionUrl.searchParams.set('token_hash', input.tokenHash);
  actionUrl.searchParams.set('type', input.actionType);
  return actionUrl.toString();
}
