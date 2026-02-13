import { useEffect, useCallback, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useShowStore } from '@/store/showStore';
import { useEntryStore } from '@/store/entryStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { syncShowRelationships, RelationshipPerformanceMonitor } from '@/utils/show-management-tracking';
import { Show } from '@/types/show-types';

/**
 * Real-time updates hook for show and entry data
 * Integrates with the new relationship tracking system
 */
export const useRealTimeUpdates = () => {
  const { shows, loadShows } = useShowStore();
  const { loadEntries } = useEntryStore();
  const { userWithRoles: user } = useAuthContext();
  const lastUpdateRef = useRef<number>(0);

  // Handle real-time show updates
  const handleShowUpdate = useCallback((updatedShow: Show) => {
    const { updateShowLegacy } = useShowStore.getState();
    
    const startTime = performance.now();
    updateShowLegacy(updatedShow);
    
    // Re-sync relationships when show data changes
    if (user?.id) {
      syncShowRelationships([updatedShow], user);
    }
    
    // Monitor performance
    const duration = performance.now() - startTime;
    RelationshipPerformanceMonitor.getInstance().recordOperation('realTimeShowUpdate', duration);
  }, [user]);

  // Handle real-time entry updates
  const handleEntryUpdate = useCallback((updatedEntry: Record<string, unknown>) => {
    const { updateRegistrationLegacy } = useEntryStore.getState();
    
    const startTime = performance.now();
    updateRegistrationLegacy(updatedEntry.id as string, updatedEntry.registrationData as Partial<Record<string, unknown>>);
    
    // Monitor performance
    const duration = performance.now() - startTime;
    RelationshipPerformanceMonitor.getInstance().recordOperation('realTimeEntryUpdate', duration);
  }, []);

  // Handle batch updates for better performance
  const handleBatchUpdate = useCallback(async () => {
    const now = Date.now();
    
    // Throttle updates to prevent excessive re-renders
    if (now - lastUpdateRef.current < 1000) {
      return;
    }
    
    lastUpdateRef.current = now;
    
    try {
      const startTime = performance.now();
      
      await Promise.all([
        loadShows(),
        loadEntries()
      ]);
      
      // Re-sync relationships after batch update
      if (user?.id && shows.length > 0) {
        syncShowRelationships(shows, user);
      }
      
      // Monitor performance
      const duration = performance.now() - startTime;
      RelationshipPerformanceMonitor.getInstance().recordOperation('batchUpdate', duration);
      
    } catch {
      // Batch update failed
    }
  }, [user, shows, loadShows, loadEntries]);

  // Set up real-time listeners via Supabase Realtime channels
  useEffect(() => {
    const channels: RealtimeChannel[] = [];

    // Subscribe to shows table changes
    const showsChannel = supabase
      .channel('realtime-shows')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shows' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            handleShowUpdate(payload.new as Show);
          } else {
            // For DELETE or other events, do a full batch reload
            handleBatchUpdate();
          }
        }
      )
      .subscribe();
    channels.push(showsChannel);

    // Subscribe to entries table changes
    const entriesChannel = supabase
      .channel('realtime-entries')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entries' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            handleEntryUpdate(payload.new as Record<string, unknown>);
          } else {
            // For DELETE or other events, do a full batch reload
            handleBatchUpdate();
          }
        }
      )
      .subscribe();
    channels.push(entriesChannel);

    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [handleShowUpdate, handleEntryUpdate, handleBatchUpdate]);

  // Performance monitoring and cleanup
  useEffect(() => {
    return () => {
      // Cleanup performance monitor on unmount
      RelationshipPerformanceMonitor.getInstance().getMetrics();
    };
  }, []);

  return {
    handleShowUpdate,
    handleEntryUpdate,
    handleBatchUpdate,
    performanceMetrics: RelationshipPerformanceMonitor.getInstance().getMetrics()
  };
};

/**
 * Hook for subscribing to specific show updates
 * Useful for show management pages that need real-time updates
 */
export const useShowRealTimeUpdates = (showId: string) => {
  const { handleShowUpdate } = useRealTimeUpdates();

  useEffect(() => {
    if (!showId) return;

    // Subscribe to changes for this specific show
    const channel = supabase
      .channel(`realtime-show-${showId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shows',
          filter: `id=eq.${showId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            handleShowUpdate(payload.new as Show);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showId, handleShowUpdate]);
};

/**
 * Hook for subscribing to entry updates for a specific show
 * Useful for entry management and results tracking
 */
export const useEntryRealTimeUpdates = (showId: string) => {
  const { handleEntryUpdate } = useRealTimeUpdates();

  useEffect(() => {
    if (!showId) return;

    // Subscribe to entry changes for this specific show
    const channel = supabase
      .channel(`realtime-entries-${showId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'entries',
          filter: `show_id=eq.${showId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            handleEntryUpdate(payload.new as Record<string, unknown>);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showId, handleEntryUpdate]);
};