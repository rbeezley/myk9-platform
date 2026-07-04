import { useEffect, type ReactNode } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { getExistingSubscription } from '@myk9/notifications';
import { supabase } from '@/lib/supabase';
import { readDogFavoriteArmbands } from './ringsideDogFavorites';

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
      if (!endpoint || cancelled) return;

      // SA-011: the passcode is NEVER sent here. A passcode caller is a signed-in
      // anonymous session whose forge-proof app_metadata claim (minted + IP-rate-
      // limited by the validate-passcode edge function) rides on the JWT that
      // supabase.rpc attaches automatically; upsert_ringside_session authorizes on
      // that claim. Re-sending the raw passcode would reopen the brute-force path.
      await supabase.rpc('upsert_ringside_session', {
        p_passcode_or_null: '',
        p_subscription_endpoint: endpoint,
        p_favorited_armbands: readDogFavoriteArmbands(heartbeatShowId).map(String),
        p_route: route,
      });
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
