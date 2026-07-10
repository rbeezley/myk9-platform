import { useEffect, type ReactNode } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { getExistingSubscription } from '@myk9/notifications';
import { supabase } from '@/lib/supabase';
import { readDogFavoriteArmbands } from './ringsideDogFavorites';
import {
  handleRingsidePasscodeRevoked,
  revokeRingsidePasscodeAccess,
} from './ringsidePasscodeRevocation';

const HEARTBEAT_MS = 30_000;

export function RingsideSessionHeartbeat({ children }: { children: ReactNode }) {
  const { showId } = useParams<{ showId: string }>();
  const location = useLocation();
  const route = `${location.pathname}${location.search}`;

  useEffect(() => {
    if (!showId || !route.startsWith('/at-show')) return;
    const heartbeatShowId = showId;
    let cancelled = false;
    let endpoint: string | null = null;

    async function heartbeat() {
      const subscription = await getExistingSubscription();
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
        p_favorited_armbands: readDogFavoriteArmbands(heartbeatShowId).map(String),
        p_route: route,
      });

      // J1.3 — if the secretary regenerated passcodes, this stale claim is now
      // rejected. Surface "access revoked — re-enter code" and route back to
      // sign-in instead of silently retrying every 30s. Other errors stay
      // swallowed (presence is best-effort).
      if (error) handleRingsidePasscodeRevoked(error);
    }

    const runIfVisible = () => {
      if (document.visibilityState === 'visible') void heartbeat().catch(() => {});
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
  }, [route, showId]);

  return <>{children}</>;
}
