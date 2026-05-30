/**
 * Client wrapper around the `validate-passcode` edge function (Phase 1b).
 *
 * The edge function is the trust boundary: it HMAC-validates the passcode,
 * rate-limits by IP, and on success returns the show + ringside role. This
 * wrapper normalizes its responses into a single discriminated result so the
 * smart-input page can branch without poking at HTTP internals.
 */

import { supabase } from '@/services/database/supabaseClient';
import type { UserRole as RingsideRole } from '@myk9/ringside';

export type ValidatePasscodeResult =
  | { ok: true; role: RingsideRole; showId: string; showName: string }
  | { ok: false; kind: 'invalid' | 'rate_limited' | 'error'; message: string };

/** Calm, enumeration-resistant copy — never leak which part failed. */
const GENERIC_INVALID =
  "That credential wasn't recognized. Double-check the passcode your secretary gave you.";
const RATE_LIMITED =
  'Too many attempts. Please wait a minute and try again.';
const SERVER_ERROR =
  "We couldn't reach the server. Check your connection and try again.";

export async function validatePasscode(passcode: string): Promise<ValidatePasscodeResult> {
  const { data, error } = await supabase.functions.invoke('validate-passcode', {
    body: { passcode },
  });

  if (!error && data?.success && data?.showData) {
    return {
      ok: true,
      role: data.role as RingsideRole,
      showId: String(data.showData.showId),
      showName: String(data.showData.showName ?? ''),
    };
  }

  // Non-2xx: supabase-js exposes the Response on error.context. 401 = bad
  // passcode (generic copy), 429 = rate limited, everything else = server-side.
  const status = (error as { context?: { status?: number } } | null)?.context?.status;
  if (status === 429) return { ok: false, kind: 'rate_limited', message: RATE_LIMITED };
  if (status === 401) return { ok: false, kind: 'invalid', message: GENERIC_INVALID };
  return { ok: false, kind: 'error', message: SERVER_ERROR };
}
