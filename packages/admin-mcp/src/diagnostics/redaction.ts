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
import { redactSecretLikeString, redactSecretLikeValue } from '@myk9/core';

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

/**
 * Replace any secret-shaped substring with a labeled placeholder. Idempotent
 * and safe to apply to every string value before it leaves the server.
 */
export function redactSensitive(value: string): string {
  return redactSecretLikeString(value);
}

/** Apply {@link redactSensitive} to string evidence values; pass others through. */
export function redactEvidenceValue(
  value: string | number | boolean | null
): string | number | boolean | null {
  return redactSecretLikeValue(value);
}
