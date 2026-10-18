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
const STEP_UP_METHODS: ReadonlySet<string> = new Set([
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

/** True when the token holds an `amr` entry of one of `methods` inside `windowSeconds`. */
function hasFreshMethod(
  token: string | null | undefined,
  methods: ReadonlySet<string>,
  windowSeconds: number,
  nowSeconds: number
): boolean {
  const amr = claimsOf(token)?.amr;
  if (!Array.isArray(amr)) return false;
  return amr.some(entry => {
    if (!entry || typeof entry !== 'object') return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    return (
      typeof method === 'string' &&
      methods.has(method) &&
      typeof timestamp === 'number' &&
      Number.isFinite(timestamp) &&
      timestamp <= nowSeconds + FUTURE_SKEW_SECONDS &&
      nowSeconds - timestamp <= windowSeconds
    );
  });
}

/** True when the token's latest password, code or MFA confirmation is inside the window. */
export function isFreshlyReauthenticated(
  token: string | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  return hasFreshMethod(token, STEP_UP_METHODS, CLIENT_FRESH_WINDOW_SECONDS, nowSeconds);
}

/**
 * The reset-password page only: a session minted by a recovery link (or an emailed code or
 * magic link) proves control of the account's email, which is the whole point of a reset.
 * It gets 15 minutes, so someone reading the email and choosing a password is not asked for
 * the password they forgot.
 */
const RECOVERY_METHODS: ReadonlySet<string> = new Set(['recovery', 'otp', 'magiclink']);
const RECOVERY_WINDOW_SECONDS = 15 * 60;

export function isFreshRecoverySession(
  token: string | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  return hasFreshMethod(token, RECOVERY_METHODS, RECOVERY_WINDOW_SECONDS, nowSeconds);
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
