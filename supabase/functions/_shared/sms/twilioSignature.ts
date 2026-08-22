/**
 * Twilio request signature verification.
 *
 * Twilio signs `X-Twilio-Signature` as base64(HMAC-SHA1(authToken, s)) where
 * `s` is the full request URL with every POST parameter appended to it, sorted
 * by parameter name, each key immediately followed by its value and no
 * separators. This is not the Standard Webhooks scheme `_shared/
 * standardWebhookSignature.ts` implements for Resend, so it needs its own
 * implementation — the fail-closed shape is what carries over, not the
 * algorithm.
 *
 * The signature IS the authentication here: the function deploys with
 * `--no-verify-jwt` because Twilio sends no Authorization header. Nothing may
 * touch the database before this returns ok.
 */

export interface TwilioSignatureInput {
  /** The exact URL Twilio signed. See `resolveSignedUrl`. */
  url: string;
  /** Decoded form fields from the POST body. */
  params: Record<string, string[]>;
  signature: string | null;
  authToken: string | undefined;
}

export type TwilioSignatureResult = { ok: true } | { ok: false; status: number; message: string };

/**
 * Twilio signs the URL it was configured with. Behind a proxy that is not
 * always what `req.url` reports — a scheme or host rewrite silently breaks
 * every signature and presents as "Twilio is sending garbage". `
 * TWILIO_WEBHOOK_URL` pins the value to whatever is configured in the Twilio
 * console; without it we fall back to the request's own URL.
 */
export function resolveSignedUrl(requestUrl: string, configuredUrl: string | undefined): string {
  const configured = configuredUrl?.trim();
  return configured ? configured : requestUrl;
}

/** Parses an application/x-www-form-urlencoded body, preserving repeats. */
export function parseFormBody(body: string): Record<string, string[]> {
  const params: Record<string, string[]> = {};
  for (const [key, value] of new URLSearchParams(body)) {
    (params[key] ??= []).push(value);
  }
  return params;
}

function buildSignatureBase(url: string, params: Record<string, string[]>): string {
  // Sort by parameter NAME, then append each name immediately followed by its
  // value, no delimiters — Twilio's documented algorithm, verified against the
  // published test vector in the unit test.
  //
  // Repeated names are explicitly undefined in that documentation, and every
  // official helper takes a single-valued map, so there is no canonical answer
  // to match. Values are emitted in ARRIVAL order rather than sorted: sorting
  // would be our own invention, and if Twilio ever does send a duplicate name
  // the failure is a 403 on a legitimate request, which silently stops opt-out
  // learning. Standard inbound SMS sends none (MMS uses MediaUrl0, MediaUrl1).
  return Object.keys(params)
    .sort()
    .reduce((base, key) => params[key].reduce((acc, value) => acc + key + value, base), url);
}

/** Length-independent comparison; avoids leaking the signature via timing. */
function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  // Fold length into the result rather than returning early on a mismatch.
  let mismatch = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return mismatch === 0;
}

export async function verifyTwilioSignature({
  url,
  params,
  signature,
  authToken,
}: TwilioSignatureInput): Promise<TwilioSignatureResult> {
  // Fail closed on missing configuration. A webhook that accepts everything
  // because its secret was never set is worse than one that is switched off:
  // it looks healthy while anyone can write opt-out rows.
  if (!authToken?.trim()) {
    return { ok: false, status: 503, message: 'Signature verification is not configured' };
  }
  if (!signature?.trim()) {
    return { ok: false, status: 401, message: 'Missing signature' };
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(buildSignatureBase(url, params))
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  return timingSafeEqual(expected, signature.trim())
    ? { ok: true }
    : { ok: false, status: 403, message: 'Invalid signature' };
}
