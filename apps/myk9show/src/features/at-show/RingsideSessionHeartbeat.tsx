import { useEffect, type ReactNode } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { getExistingSubscription } from '@myk9/notifications';
import { supabase } from '@/lib/supabase';
import { useRingsideGrantStore } from '@/store/ringsideGrantStore';

const HEARTBEAT_MS = 30_000;
// TODO: Replace this shim after regenerating Supabase types for the Phase 3 ringside RPCs.
const rpc = supabase.rpc as unknown as (
  fn: string,
  args: Record<string, unknown>
) => Promise<unknown>;

export function RingsideSessionHeartbeat({ children }: { children: ReactNode }) {
  const { showId } = useParams<{ showId: string }>();
  const location = useLocation();
  const activeGrant = useRingsideGrantStore(state => state.activeGrant);
  const passcode =
    activeGrant && activeGrant.showId === showId && activeGrant.source === 'passcode'
      ? activeGrant.passcode
      : undefined;
  const route = `${location.pathname}${location.search}`;

  useEffect(() => {
    if (!showId || !route.startsWith('/at-show')) return;
    let cancelled = false;
    let endpoint: string | null = null;

    async function heartbeat() {
      const subscription = await getExistingSubscription();
      endpoint = subscription?.endpoint ?? null;
      if (!endpoint || cancelled) return;

      await rpc('upsert_ringside_session', {
        p_passcode_or_null: passcode ?? null,
        p_subscription_endpoint: endpoint,
        // Favorites are captured in a follow-up; until then passcode class-targeting
        // only works after the client can send the exhibitor's armband selections.
        p_favorited_armbands: [],
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
      void rpc('clear_ringside_session_presence', {
        p_subscription_endpoint: endpoint,
        p_show_id: showId,
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
  }, [passcode, route, showId]);

  return <>{children}</>;
}
