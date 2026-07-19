import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useShowStore } from '@/store/showStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  syncShowRelationships,
  RelationshipPerformanceMonitor,
} from '@/utils/show-management-tracking';
import { Show } from '@/types/show-types';

/** Public Browse Shows updates. Entry/class freshness uses show-scoped Broadcast elsewhere. */
export const useRealTimeUpdates = () => {
  const { shows, loadShows } = useShowStore();
  const { userWithRoles: user } = useAuthContext();
  const lastUpdateRef = useRef(0);

  const handleShowUpdate = useCallback(
    (updatedShow: Show) => {
      const startTime = performance.now();
      useShowStore.getState().updateShowLegacy(updatedShow);
      if (user?.id) syncShowRelationships([updatedShow], user);
      RelationshipPerformanceMonitor.getInstance().recordOperation(
        'realTimeShowUpdate',
        performance.now() - startTime
      );
    },
    [user]
  );

  const handleBatchUpdate = useCallback(async () => {
    const now = Date.now();
    if (now - lastUpdateRef.current < 1000) return;
    lastUpdateRef.current = now;

    try {
      const startTime = performance.now();
      await loadShows();
      if (user?.id && shows.length > 0) syncShowRelationships(shows, user);
      RelationshipPerformanceMonitor.getInstance().recordOperation(
        'batchUpdate',
        performance.now() - startTime
      );
    } catch {
      // The page's normal query path remains the fallback.
    }
  }, [user, shows, loadShows]);

  useEffect(() => {
    const showsChannel = supabase
      .channel('realtime-shows')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shows' }, payload => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          handleShowUpdate(payload.new as Show);
        } else {
          void handleBatchUpdate();
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(showsChannel);
    };
  }, [handleShowUpdate, handleBatchUpdate]);

  useEffect(
    () => () => {
      RelationshipPerformanceMonitor.getInstance().getMetrics();
    },
    []
  );

  return {
    handleShowUpdate,
    handleBatchUpdate,
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
            handleShowUpdate(payload.new as Show);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [showId, handleShowUpdate]);
};
