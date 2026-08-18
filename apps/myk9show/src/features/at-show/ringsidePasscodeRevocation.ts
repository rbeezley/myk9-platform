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
import { replicatedClassesTable } from '@/services/replication';
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
 * handling). Matches the structured PostgREST error (code + message) surfaced on
 * a direct RPC call (e.g. the heartbeat's upsert_ringside_session).
 */
export function isPasscodeRegeneratedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as PostgrestLikeError;
  return e.code === INSUFFICIENT_PRIVILEGE && e.message === PASSCODE_REGENERATED_DB_MESSAGE;
}

/**
 * True when a free-text error string carries the regeneration message. The
 * replication queue collapses a failed mutation's error to a string
 * (`"Non-retryable error: <message>"`), losing the structured `code`, so the
 * score-write surface (ReplicationSyncProvider) matches on the message substring.
 */
export function isPasscodeRegeneratedMessage(text: string | undefined | null): boolean {
  return typeof text === 'string' && text.includes(PASSCODE_REGENERATED_DB_MESSAGE);
}

/**
 * Surface the revocation to the user and route out of ringside: toast, drop any
 * account-scoped grant, and sign out an anonymous passcode session (a signed-in
 * account keeps its account session — only the grant is dropped). Either way
 * `AtShowAccessGate` stops looping: anonymous sessions land on sign-in, and
 * signed-in accounts get the gate's explanatory no-access state (the passcode
 * form is reserved for anonymous / explicit `?passcode=1` flows).
 *
 * `suppressRehydration` is held true from the synchronous `clearGrant()` until
 * the anon session's `signOut()` actually resolves (or immediately, for a
 * signed-in account with no anon session to sign out) — closing the window
 * where `useRehydrateRingsideGrant` could otherwise see "no grant, but a
 * still-claim-shaped session" and re-admit the just-revoked user before the
 * session catches up.
 */
export function revokeRingsidePasscodeAccess(): void {
  logger.warn('[at-show] ringside passcode regenerated — revoking stale claim', 'at-show');
  toast.error(PASSCODE_REVOKED_TOAST_MESSAGE);

  const { clearGrant, setSuppressRehydration } = useRingsideGrantStore.getState();
  setSuppressRehydration(true);
  clearGrant();

  void supabase.auth
    .getSession()
    .then(({ data }) => {
      if (data.session?.user?.is_anonymous === true) {
        return supabase.auth.signOut().then(() => replicatedClassesTable.clearCachedHideCounts());
      }
      return undefined;
    })
    .finally(() => {
      useRingsideGrantStore.getState().setSuppressRehydration(false);
    });
}

/**
 * If `error` is the passcode-regeneration 42501, surface it and route back to
 * sign-in. Returns true when it handled the error (so callers can stop further
 * generic error surfacing), false otherwise.
 */
export function handleRingsidePasscodeRevoked(error: unknown): boolean {
  if (!isPasscodeRegeneratedError(error)) return false;
  revokeRingsidePasscodeAccess();
  return true;
}
