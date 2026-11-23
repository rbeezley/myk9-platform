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
import { realtimeRowToStoreShow } from './realtimeShowRow';

type ShowRow = Database['public']['Tables']['shows']['Row'];

/**
 * Public Browse Shows updates. Entry/class freshness uses show-scoped Broadcast elsewhere.
 *
 * Subscribes once per mount: callbacks read the current user through a ref and the store through
 * `getState()`, so a store update never tears the channel down and resubscribes (every
 * resubscribe adds `realtime.list_changes` work, MYK9-1363). Each event touches one show only; a
 * DELETE removes that show from the store rather than reloading the whole list.
 */
const mapRealtimeRow = (row: ShowRow): Show =>
  realtimeRowToStoreShow(
    row,
    useShowStore.getState().shows.find(s => s.id === row.id)
  );

export const useRealTimeUpdates = () => {
  const { userWithRoles: user } = useAuthContext();
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const handleShowUpdate = useCallback((updatedShow: Show) => {
    const startTime = performance.now();
    const store = useShowStore.getState();
    // updateShowLegacy only replaces; an INSERT for a show not in the list must be added.
    if (store.shows.some(s => s.id === updatedShow.id)) store.updateShowLegacy(updatedShow);
    else store.addShowLegacy(updatedShow);
    const currentUser = userRef.current;
    if (currentUser?.id) syncShowRelationships([updatedShow], currentUser);
    RelationshipPerformanceMonitor.getInstance().recordOperation(
      'realTimeShowUpdate',
      performance.now() - startTime
    );
  }, []);

  const handleShowDelete = useCallback((showId: string) => {
    useShowStore.getState().removeShow(showId);
  }, []);

  useEffect(() => {
    // Browse Shows stays calm (docs/INTENT.md): one event updates one show, never the whole list.
    const showsChannel = supabase
      .channel('realtime-shows')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shows' }, payload => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          handleShowUpdate(mapRealtimeRow(payload.new as ShowRow));
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
            handleShowUpdate(mapRealtimeRow(payload.new as ShowRow));
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [showId, handleShowUpdate]);
};
