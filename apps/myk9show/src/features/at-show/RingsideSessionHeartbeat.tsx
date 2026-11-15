import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { getExistingSubscription } from '@myk9/notifications';
import { useAuthContext } from '@/hooks/useAuthContext';
import { supabase } from '@/lib/supabase';
import { logger } from '@/utils/logger';
import { deriveRingsideRoleFromClaim } from '@/store/ringsideGrantStore';
import { readDogFavoriteArmbands } from './ringsideDogFavorites';
import { getAccountUserId } from './dogFavoritesSync';
import {
  handleRingsidePasscodeRevoked,
  isPasscodeRegeneratedError,
  revokeRingsidePasscodeAccess,
} from './ringsidePasscodeRevocation';

const HEARTBEAT_MS = 30_000;
/** Consecutive failed presence writes before the refusal is reported (once). */
const FAILURES_BEFORE_REPORT = 3;

const NOT_ENTERED_MESSAGE = 'account is not entered in exactly one active ringside show';

/** Refusals and connectivity failures that are normal, so they never count toward a report. */
function isExpectedPresenceFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (isPasscodeRegeneratedError(error)) return true;
  const e = (error ?? {}) as { code?: unknown; message?: unknown };
  if (e.code === '42501' && e.message === NOT_ENTERED_MESSAGE) return true;
  // No HTTP/db code: the request never got an answer (offline, DNS, aborted).
  return !e.code && /failed to fetch|network|load failed|aborted/i.test(String(e.message ?? ''));
}

/** PostgREST errors are plain objects, so lift the useful fields into the log metadata. */
function describeError(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') return {};
  const { code, message, details } = error as Record<string, unknown>;
  return {
    ...(code !== undefined ? { code } : {}),
    ...(message !== undefined ? { message } : {}),
    ...(details ? { details } : {}),
  };
}

export function RingsideSessionHeartbeat({ children }: { children: ReactNode }) {
  const { showId } = useParams<{ showId: string }>();
  const location = useLocation();
  const { user } = useAuthContext();
  // Presence rule (MYK9-2033): the only reader of ringside_sessions presence is
  // send-targeted-message, which selects role = 'exhibitor' rows. A passcode
  // (anonymous) session whose claim is judge, steward or admin is never read and
  // the server refuses its upsert with 403, so it skips presence. A signed-in
  // account always heartbeats: the server writes an exhibitor row only when the
  // account is entered in exactly one active show, so a judge who also shows a
  // dog keeps push suppression. The revocation check below still runs.
  const claimRole = deriveRingsideRoleFromClaim(user, showId);
  const sendsPresence = claimRole === null || claimRole === 'exhibitor';
  const failures = useRef({ count: 0, reported: false });
  const userId = getAccountUserId(user);
  const route = `${location.pathname}${location.search}`;

  useEffect(() => {
    if (!showId || !route.startsWith('/at-show')) return;
    const heartbeatShowId = showId;
    let cancelled = false;
    let endpoint: string | null = null;

    function recordFailure(error: unknown) {
      if (isExpectedPresenceFailure(error)) return;
      const state = failures.current;
      state.count += 1;
      if (state.count < FAILURES_BEFORE_REPORT || state.reported) return;
      state.reported = true;
      logger.warn(
        'Ringside presence heartbeat keeps failing',
        'ringside-heartbeat',
        { consecutiveFailures: state.count, showId: heartbeatShowId, ...describeError(error) },
        error instanceof Error ? error : undefined
      );
    }

    async function heartbeat() {
      const subscription = sendsPresence ? await getExistingSubscription() : null;
      endpoint = subscription?.endpoint ?? null;
      if (cancelled) return;

      // J1.3 — a device that denied notifications has no push endpoint, so it
      // never reaches upsert_ringside_session and would miss the revocation
      // signal. Do a lightweight, push-independent generation check: the helper
      // returns FALSE only for a STALE ringside_passcode claim (NULL when there
      // is no claim, TRUE when current), so we revoke on FALSE alone.
      if (!endpoint) {
        const { data: generationCurrent } = await supabase.rpc('ringside_claim_generation_current');
        if (!cancelled && generationCurrent === false) revokeRingsidePasscodeAccess();
        return;
      }

      // SA-011: the passcode is NEVER sent here. A passcode caller is a signed-in
      // anonymous session whose forge-proof app_metadata claim (minted + IP-rate-
      // limited by the validate-passcode edge function) rides on the JWT that
      // supabase.rpc attaches automatically; upsert_ringside_session authorizes on
      // that claim. Re-sending the raw passcode would reopen the brute-force path.
      const { error } = await supabase.rpc('upsert_ringside_session', {
        p_passcode_or_null: '',
        p_subscription_endpoint: endpoint,
        p_favorited_armbands: readDogFavoriteArmbands(heartbeatShowId, userId).map(String),
        p_route: route,
      });

      // J1.3 — if the secretary regenerated passcodes, this stale claim is now
      // rejected. Surface "access revoked — re-enter code" and route back to
      // sign-in instead of silently retrying every 30s. Other errors are
      // best-effort (no toast) but a persistent run is reported once.
      if (error) {
        handleRingsidePasscodeRevoked(error);
        recordFailure(error);
      } else {
        failures.current = { count: 0, reported: false };
      }
    }

    const runIfVisible = () => {
      if (document.visibilityState === 'visible') void heartbeat().catch(recordFailure);
    };

    runIfVisible();
    const interval = window.setInterval(runIfVisible, HEARTBEAT_MS);

    const clearPresence = () => {
      if (!endpoint) return;
      void supabase.rpc('clear_ringside_session_presence', {
        p_subscription_endpoint: endpoint,
        p_show_id: heartbeatShowId,
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') clearPresence();
      else runIfVisible();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearPresence();
    };
  }, [route, showId, userId, sendsPresence]);

  return <>{children}</>;
}
