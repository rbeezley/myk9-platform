/**
 * PII and secret redaction for diagnostic evidence.
 *
 * Two layers:
 *  - Intentional trimming: {@link redactEmail} / {@link shortenProviderId} keep
 *    just enough of a value to be useful to an admin (first initial, last 4).
 *  - Defensive scrubbing: {@link redactSensitive} / {@link redactEvidenceValue}
 *    guarantee that secret-shaped strings (JWTs/service-role keys, Stripe secret
 *    keys, full checkout URLs) never leave the server even if a query
 *    accidentally selects a column that contains one.
 */

/** Mask an email to first-initial + domain, e.g. `handler@example.com` → `h***@example.com`. */
export function redactEmail(email: string | null | undefined): string | null {
  if (!email) {
    return null;
  }
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  // Require a non-empty local part and a domain to be a plausible email.
  if (at <= 0) {
    return null;
  }
  const domain = trimmed.slice(at + 1);
  if (domain.length === 0) {
    return null;
  }
  const firstInitial = trimmed[0] ?? '';
  return `${firstInitial}***@${domain}`;
}

/**
 * Shorten a provider reference to its type prefix + last 4 chars, e.g.
 * `pi_3NabcdefXyZ9` → `pi_…XyZ9`. Returns null for empty input.
 */
export function shortenProviderId(id: string | null | undefined): string | null {
  if (!id) {
    return null;
  }
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const underscore = trimmed.indexOf('_');
  const prefix = underscore >= 0 ? trimmed.slice(0, underscore + 1) : '';
  // Too short to mask meaningfully without leaking — collapse to prefix only.
  if (trimmed.length <= prefix.length + 4) {
    return `${prefix}…`;
  }
  return `${prefix}…${trimmed.slice(-4)}`;
}

// Supabase anon/service-role keys and any other JWT (header starts with `eyJ`).
const JWT_RE = /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g;
// Stripe secret + webhook signing keys, and the newer Supabase secret key format.
const SECRET_KEY_RE =
  /\b(?:sk_(?:live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|sb_secret_[A-Za-z0-9_-]{8,})\b/g;
// Full Stripe Checkout / billing-portal URLs can embed session secrets.
const STRIPE_URL_RE = /https?:\/\/(?:checkout|billing)\.stripe\.com\/\S+/gi;

/**
 * Replace any secret-shaped substring with a labeled placeholder. Idempotent
 * and safe to apply to every string value before it leaves the server.
 */
export function redactSensitive(value: string): string {
  return value
    .replace(JWT_RE, '[redacted-token]')
    .replace(SECRET_KEY_RE, '[redacted-secret]')
    .replace(STRIPE_URL_RE, '[redacted-url]');
}

/** Apply {@link redactSensitive} to string evidence values; pass others through. */
export function redactEvidenceValue(
  value: string | number | boolean | null,
): string | number | boolean | null {
  return typeof value === 'string' ? redactSensitive(value) : value;
}
