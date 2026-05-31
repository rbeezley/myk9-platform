import { useEffect, type ReactNode } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { getExistingSubscription } from '@myk9/notifications';
import { supabase } from '@/lib/supabase';
import { useRingsideGrantStore } from '@/store/ringsideGrantStore';

const HEARTBEAT_MS = 30_000;
const DOG_FAVORITES_KEY_PREFIX = 'dog_favorites';
// TODO: Replace this shim after regenerating Supabase types for the Phase 3 ringside RPCs.
const rpc = supabase.rpc as unknown as (
  fn: string,
  args: Record<string, unknown>
) => Promise<unknown>;

function getFavoritedArmbands(showId: string): string[] {
  try {
    const stored = localStorage.getItem(`${DOG_FAVORITES_KEY_PREFIX}_${showId}`);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const armbands: string[] = [];

    for (const value of parsed) {
      const armband =
        typeof value === 'number' && Number.isFinite(value)
          ? String(value)
          : typeof value === 'string'
            ? value.trim()
            : '';
      if (!armband || seen.has(armband)) continue;
      seen.add(armband);
      armbands.push(armband);
    }

    return armbands;
  } catch {
    return [];
  }
}

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
    const heartbeatShowId = showId;
    let cancelled = false;
    let endpoint: string | null = null;

    async function heartbeat() {
      const subscription = await getExistingSubscription();
      endpoint = subscription?.endpoint ?? null;
      if (!endpoint || cancelled) return;

      await rpc('upsert_ringside_session', {
        p_passcode_or_null: passcode ?? null,
        p_subscription_endpoint: endpoint,
        p_favorited_armbands: getFavoritedArmbands(heartbeatShowId),
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
  }, [passcode, route, showId]);

  return <>{children}</>;
}
