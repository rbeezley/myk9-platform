import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useShowStore } from '@/store/showStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  syncShowRelationships,
  RelationshipPerformanceMonitor,
} from '@/utils/show-management-tracking';
import type { StoreShow as Show } from '@/types/show-types';
import type { Database } from '@/types/supabase';
import { reportWarning } from '@/utils/standardizedErrorHandler';
import { readRealtimeShow } from './realtimeShowRow';

type ShowRow = Database['public']['Tables']['shows']['Row'];

/**
 * Public Browse Shows updates. Entry/class freshness uses show-scoped Broadcast elsewhere.
 *
 * Subscribes once per mount: callbacks read the current user through a ref and the store through
 * `getState()`, so a store update never tears the channel down and resubscribes (every
 * resubscribe adds `realtime.list_changes` work, MYK9-1363). Each event touches one show only; a
 * DELETE removes that show from the store rather than reloading the whole list.
 *
 * An INSERT or UPDATE payload is a signal, not data: the show is re-read whole (MYK9-2350).
 * Re-reads of one show run one after another, so each starts after its event and a burst
 * collapses to the newest; a DELETE or a newer event makes an in-flight re-read stale.
 */
export const useRealTimeUpdates = () => {
  const { userWithRoles: user } = useAuthContext();
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Per show: the number of the newest event, and the tail of its queued re-reads.
  const latestEvent = useRef(new Map<string, number>());
  const queues = useRef(new Map<string, Promise<void>>());

  const markEvent = useCallback((showId: string): number => {
    const next = (latestEvent.current.get(showId) ?? 0) + 1;
    latestEvent.current.set(showId, next);
    return next;
  }, []);

  const refreshShow = useCallback(async (showId: string, eventNumber: number) => {
    const isStale = () => latestEvent.current.get(showId) !== eventNumber;
    if (isStale()) return; // a newer event is queued behind this one and will re-read
    const startTime = performance.now();
    const existing = useShowStore.getState().shows.find(s => s.id === showId);
    const show = await readRealtimeShow(showId, existing);
    if (isStale()) return;
    const store = useShowStore.getState();
    const inStore = store.shows.some(s => s.id === showId);
    if (!show) {
      // Soft deleted, or no longer visible to this account.
      if (inStore) store.removeShow(showId);
      return;
    }
    if (inStore) store.updateShowLegacy(show);
    else store.addShowLegacy(show);
    const currentUser = userRef.current;
    if (currentUser?.id) syncShowRelationships([show], currentUser);
    RelationshipPerformanceMonitor.getInstance().recordOperation(
      'realTimeShowUpdate',
      performance.now() - startTime
    );
  }, []);

  const handleShowUpdate = useCallback(
    (eventType: string, row: Pick<ShowRow, 'id' | 'deleted_at'>): Promise<void> => {
      const showId = row.id;
      const inStore = useShowStore.getState().shows.some(s => s.id === showId);
      if (row.deleted_at) {
        markEvent(showId);
        if (inStore) useShowStore.getState().removeShow(showId);
        return Promise.resolve();
      }
      // An UPDATE for a show this list never loaded (not public, or filtered out) stays out,
      // unless an INSERT for it is still being read.
      if (!inStore && eventType !== 'INSERT' && !queues.current.has(showId)) {
        return Promise.resolve();
      }
      const eventNumber = markEvent(showId);
      const previous = queues.current.get(showId) ?? Promise.resolve();
      const next = previous
        .then(() => refreshShow(showId, eventNumber))
        .catch((error: unknown) => {
          // Offline or a failed read: the card keeps what it showed; replication sync catches up.
          reportWarning('realtime', `Could not re-read show ${showId} after a realtime event`, {
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          if (queues.current.get(showId) === next) queues.current.delete(showId);
        });
      queues.current.set(showId, next);
      return next;
    },
    [markEvent, refreshShow]
  );

  const handleShowDelete = useCallback(
    (showId: string) => {
      markEvent(showId);
      useShowStore.getState().removeShow(showId);
    },
    [markEvent]
  );

  useEffect(() => {
    // Browse Shows stays calm (docs/INTENT.md): one event updates one show, never the whole list.
    const showsChannel = supabase
      .channel('realtime-shows')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shows' }, payload => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          void handleShowUpdate(payload.eventType, payload.new as ShowRow);
        } else if (payload.eventType === 'DELETE') {
          // Without REPLICA IDENTITY FULL a DELETE payload carries only the primary key.
          const deletedId = (payload.old as Partial<Show>).id;
          if (deletedId) handleShowDelete(deletedId);
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(showsChannel);
    };
  }, [handleShowUpdate, handleShowDelete]);

  useEffect(
    () => () => {
      RelationshipPerformanceMonitor.getInstance().getMetrics();
    },
    []
  );

  return {
    handleShowUpdate,
    handleShowDelete,
    performanceMetrics: RelationshipPerformanceMonitor.getInstance().getMetrics(),
  };
};

export const useShowRealTimeUpdates = (showId: string) => {
  const { handleShowUpdate } = useRealTimeUpdates();

  useEffect(() => {
    if (!showId) return undefined;

    const channel = supabase
      .channel(`realtime-show-${showId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shows', filter: `id=eq.${showId}` },
        payload => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            void handleShowUpdate(payload.eventType, payload.new as ShowRow);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [showId, handleShowUpdate]);
};
