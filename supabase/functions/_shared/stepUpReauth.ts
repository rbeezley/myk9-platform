// Step-up re-authentication for money and power (MYK9-1208). Deno-free; colocated vitest.
//
// A signed-in session can be weeks old on an unlocked club laptop. Before a refund is
// issued or approved, the edge function asks: did this person prove who they are in the
// last five minutes? The answer is in the session JWT's `amr` claim, which GoTrue signs
// into every access token as `[{ method, timestamp }]` and carries unchanged through
// token refreshes. Signing in again (password, or an emailed code for accounts with no
// password) mints a session whose timestamp is now.
//
// Call this only AFTER `auth.getUser(token)` has succeeded: that call is what verifies the
// token with GoTrue, so reading its payload here without checking the signature is safe.
// The SQL twin is public.require_recent_reauth (migration 20261017163700); keep the method
// list, window and skew in step with it.

export const STEP_UP_REQUIRED_CODE = 'step_up_required';
export const STEP_UP_WINDOW_SECONDS = 300;
/** Clock drift tolerated between GoTrue and the edge runtime. */
export const STEP_UP_FUTURE_SKEW_SECONDS = 60;

/**
 * Ways of proving identity that count as "the person at the keyboard just did it".
 * OAuth is left out on purpose: a provider can sign someone back in without asking them
 * anything, so OAuth-only accounts confirm with an emailed code instead.
 */
const STEP_UP_METHODS: ReadonlySet<string> = new Set([
  'password',
  'otp',
  'magiclink',
  'totp',
  'mfa/totp',
  'mfa/phone',
  'mfa/webauthn',
]);

export interface StepUpRefusal {
  status: 403;
  body: { error: typeof STEP_UP_REQUIRED_CODE; message: string };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), char => char.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The most recent accepted re-authentication in an `amr` claim, in epoch seconds. */
export function latestReauthAt(amr: unknown): number | null {
  if (!Array.isArray(amr)) return null;
  let latest: number | null = null;
  for (const entry of amr) {
    if (!entry || typeof entry !== 'object') continue;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (typeof method !== 'string' || !STEP_UP_METHODS.has(method)) continue;
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) continue;
    if (latest === null || timestamp > latest) latest = timestamp;
  }
  return latest;
}

/**
 * Null when the caller re-authenticated within the window; otherwise the response to send.
 * Accepts the raw `Authorization` header value or the bare token.
 */
export function stepUpRefusal(
  authorization: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): StepUpRefusal | null {
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  const reauthAt = latestReauthAt(decodeJwtPayload(token)?.amr);
  const fresh =
    reauthAt !== null &&
    reauthAt <= nowSeconds + STEP_UP_FUTURE_SKEW_SECONDS &&
    nowSeconds - reauthAt <= STEP_UP_WINDOW_SECONDS;
  if (fresh) return null;
  return {
    status: 403,
    body: { error: STEP_UP_REQUIRED_CODE, message: 'Confirm your password to continue.' },
  };
}
