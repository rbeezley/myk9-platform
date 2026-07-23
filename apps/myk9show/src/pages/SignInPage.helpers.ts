export const SIGN_IN_REDIRECT_STORAGE_KEY = 'myk9.signIn.redirectTo';

export function normalizeSignInRedirect(value: string | null): string | null {
  if (!value) return null;

  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;
    const target = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return target.startsWith('//') ? null : target;
  } catch {
    return null;
  }
}

export function getSignInReturnTo(searchParams: URLSearchParams): string {
  return (
    normalizeSignInRedirect(searchParams.get('redirectTo')) ??
    normalizeSignInRedirect(searchParams.get('returnTo')) ??
    '/'
  );
}

export function getShowEntryRedirectShowId(target: string): string | null {
  const match = /^\/shows\/([^/?#]+)\/register(?:[/?#]|$)/.exec(target);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function buildSignInPathForRedirect(target: string): string {
  const params = new URLSearchParams({ redirectTo: target });
  return `/sign-in?${params.toString()}`;
}

export function buildSignUpPathForRedirect(target: string): string {
  const params = new URLSearchParams({ redirectTo: target });
  return `/sign-up?${params.toString()}`;
}

export function persistSignInRedirect(target: string): void {
  const normalized = normalizeSignInRedirect(target);
  if (!normalized) return;
  window.sessionStorage.setItem(SIGN_IN_REDIRECT_STORAGE_KEY, normalized);
}

export function consumePersistedSignInRedirect(): string | null {
  const stored = normalizeSignInRedirect(
    window.sessionStorage.getItem(SIGN_IN_REDIRECT_STORAGE_KEY)
  );
  window.sessionStorage.removeItem(SIGN_IN_REDIRECT_STORAGE_KEY);
  return stored;
}
