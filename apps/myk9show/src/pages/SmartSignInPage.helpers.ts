/**
 * SmartSignInPage helpers (Phase 1b) — pure credential classification.
 *
 * The single email-or-passcode field disambiguates client-side which branch a
 * keystroke belongs to. Kept pure + dependency-free of React so the rules are
 * unit-testable against the exact strings the field emits (per the
 * assertion-first / ui-id-shapes convention).
 *
 * The actual smart-input page (SmartSignInPage.tsx) + confirmation flow land in
 * the second 1b PR; this module is the foundation it builds on.
 */

import { parsePasscode, type UserRole as RingsideRole } from '@myk9/ringside';

export type CredentialKind = 'email' | 'passcode' | 'invalid';

/**
 * Plain-language ringside role for user-facing copy (the §2.2 confirmation).
 * INTENT: never show the raw enum — "could my mom use this?".
 */
export function humanizeRingsideRole(role: RingsideRole): string {
  switch (role) {
    case 'admin':
      return 'show admin';
    case 'judge':
      return 'judge';
    case 'steward':
      return 'gate steward';
    case 'exhibitor':
      return 'exhibitor';
  }
}

/**
 * Leading/trailing ASCII whitespace + zero-width chars (U+200B ZWSP, U+FEFF
 * BOM). Built from an escape string so no invisible characters live in source.
 */
const EDGE_JUNK = new RegExp('^[\\s\\u200B\\uFEFF]+|[\\s\\u200B\\uFEFF]+$', 'g');
const PASSCODE_SHAPE = /^[ajse][a-z0-9]{4}$/;

/**
 * Normalize a raw field value before classification: strip leading/trailing
 * whitespace and zero-width characters, then lowercase (passcodes are
 * lowercase; emails are case-insensitive). Internal whitespace is intentionally
 * preserved here so {@link classifyCredential} can reject it.
 */
export function normalizeCredential(raw: string): string {
  return raw.replace(EDGE_JUNK, '').toLowerCase();
}

/**
 * Classify a raw credential as an email branch, a passcode branch, or invalid.
 *
 * Order (first match wins), after normalization:
 *  1. empty / contains internal whitespace → `invalid`
 *  2. contains `@` → `email` (branch signal only — Supabase does real
 *     email validation; we never reject a shape that has an `@`)
 *  3. valid 5-char passcode shape + `parsePasscode().isValid` → `passcode`
 *  4. otherwise → `invalid`
 *
 * Discriminates on `parsePasscode(...).isValid`, never on its defaulted
 * `role` (bad input returns `{ role: 'exhibitor', isValid: false }`).
 */
export function classifyCredential(raw: string): CredentialKind {
  const normalized = normalizeCredential(raw);
  if (normalized === '') return 'invalid';
  if (/\s/.test(normalized)) return 'invalid';
  if (normalized.includes('@')) return 'email';
  if (!PASSCODE_SHAPE.test(normalized)) return 'invalid';
  return parsePasscode(normalized).isValid ? 'passcode' : 'invalid';
}
