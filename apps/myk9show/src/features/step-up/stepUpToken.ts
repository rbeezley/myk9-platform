/**
 * MYK9-1208: the browser's reading of a session token's re-authentication time.
 *
 * The server decides (public.require_recent_reauth, _shared/stepUpReauth.ts). The browser
 * only uses this to avoid asking twice: a refusal that lands after another request already
 * confirmed, or a confirmation made in another tab through the emailed link, can be answered
 * with the session the client already holds. The window here is shorter than the server's
 * 300 s, so a token this calls fresh is still fresh when the replay arrives.
 */
const CLIENT_FRESH_WINDOW_SECONDS = 240;
const FUTURE_SKEW_SECONDS = 60;
const STEP_UP_METHODS = new Set([
  'password',
  'otp',
  'magiclink',
  'totp',
  'mfa/totp',
  'mfa/phone',
  'mfa/webauthn',
]);

interface TokenClaims {
  sub?: unknown;
  amr?: unknown;
}

function claimsOf(token: string | null | undefined): TokenClaims | null {
  const part = token?.split('.')[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), char => char.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return claims && typeof claims === 'object' ? (claims as TokenClaims) : null;
  } catch {
    return null;
  }
}

export function tokenSubject(token: string | null | undefined): string | null {
  const sub = claimsOf(token)?.sub;
  return typeof sub === 'string' ? sub : null;
}

/** True when the token's latest password, code or MFA confirmation is inside the window. */
export function isFreshlyReauthenticated(
  token: string | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  const amr = claimsOf(token)?.amr;
  if (!Array.isArray(amr)) return false;
  return amr.some(entry => {
    if (!entry || typeof entry !== 'object') return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    return (
      typeof method === 'string' &&
      STEP_UP_METHODS.has(method) &&
      typeof timestamp === 'number' &&
      Number.isFinite(timestamp) &&
      timestamp <= nowSeconds + FUTURE_SKEW_SECONDS &&
      nowSeconds - timestamp <= CLIENT_FRESH_WINDOW_SECONDS
    );
  });
}

/**
 * The held session token, when it can answer a refusal without a prompt: a different token
 * from the refused one, for the same account, and freshly re-authenticated.
 */
export function reusableFreshToken(
  heldToken: string | null | undefined,
  refusedToken: string | null | undefined,
  nowSeconds?: number
): string | null {
  if (!heldToken || heldToken === refusedToken) return null;
  const refusedSubject = tokenSubject(refusedToken);
  if (refusedSubject !== null && refusedSubject !== tokenSubject(heldToken)) return null;
  return isFreshlyReauthenticated(heldToken, nowSeconds) ? heldToken : null;
}
