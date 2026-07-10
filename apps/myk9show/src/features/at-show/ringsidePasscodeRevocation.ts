/**
 * ringsidePasscodeRevocation — surface the "passcode was regenerated" case
 * (J1.3) to a ringside user instead of failing silently.
 *
 * When a secretary regenerates show passcodes, any device holding a claim minted
 * from the OLD code is now stale: the SECURITY DEFINER ringside RPCs
 * (`ringside_update_entry`, `upsert_ringside_session`) reject it with error code
 * 42501 and the message "Passcode has been regenerated; re-enter a new code"
 * (migration 20260710150000). Without handling, the periodic heartbeat would just
 * swallow the error and the judge would keep seeing stale data with no idea their
 * access was revoked.
 *
 * On detection we: (1) toast "access revoked — re-enter code", (2) drop any
 * account-scoped ringside grant, and (3) sign out an anonymous passcode session.
 * Both (2) and (3) cause `AtShowAccessGate` to fall through to the passcode
 * sign-in prompt rather than a silent retry loop.
 */

import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useRingsideGrantStore } from '@/store/ringsideGrantStore';
import { logger } from '@/utils/logger';

/** Postgres SQLSTATE raised by the ringside RPCs for an insufficient-privilege denial. */
const INSUFFICIENT_PRIVILEGE = '42501';

/**
 * The exact message the ringside RPCs raise when the claim's stamped generation
 * no longer matches the current show_passcodes row. Pinned to the migration text
 * so a wording change there without updating here is caught by the unit test.
 */
export const PASSCODE_REGENERATED_DB_MESSAGE = 'Passcode has been regenerated; re-enter a new code';

/** User-facing copy shown when a ringside passcode has been revoked by regeneration. */
export const PASSCODE_REVOKED_TOAST_MESSAGE = 'Access revoked — re-enter code';

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

/**
 * True when `error` is the specific 42501 raised because the passcode was
 * regenerated (NOT a generic "not authorized" 42501, which must keep its own
 * handling).
 */
export function isPasscodeRegeneratedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as PostgrestLikeError;
  return e.code === INSUFFICIENT_PRIVILEGE && e.message === PASSCODE_REGENERATED_DB_MESSAGE;
}

/**
 * If `error` is the passcode-regeneration 42501, surface it to the user and route
 * back to passcode sign-in. Returns true when it handled the error (so callers can
 * stop further generic error surfacing), false otherwise.
 */
export function handleRingsidePasscodeRevoked(error: unknown): boolean {
  if (!isPasscodeRegeneratedError(error)) return false;

  logger.warn('[at-show] ringside passcode regenerated — revoking stale claim', 'at-show');
  toast.error(PASSCODE_REVOKED_TOAST_MESSAGE);

  // Drop an account-scoped grant so the gate stops admitting this show.
  useRingsideGrantStore.getState().clearGrant();

  // Sign out an anonymous passcode session so the gate redirects to sign-in
  // (a signed-in account keeps its account session — only the grant is dropped).
  void supabase.auth.getSession().then(({ data }) => {
    if (data.session?.user?.is_anonymous === true) {
      void supabase.auth.signOut();
    }
  });

  return true;
}
