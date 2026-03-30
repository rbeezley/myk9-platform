import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryClient';

/**
 * Subscribes to real-time check-in status changes for all entries in a show.
 * Invalidates the check-in report query cache when any entry's status changes.
 *
 * Uses the entries table filtered by class→trial→show relationship.
 * Since Supabase real-time filters are limited to direct column equality,
 * we subscribe to all entry updates and let React Query deduplication handle
 * the invalidation efficiently.
 */
export function useShowCheckInSubscription(showId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!showId) return;

    const channel = supabase.channel(`checkin-report:${showId}`);

    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'entries',
        },
        payload => {
          // Only invalidate if check_in_status actually changed
          const oldStatus = (payload.old as Record<string, unknown>)?.check_in_status;
          const newStatus = (payload.new as Record<string, unknown>)?.check_in_status;
          if (oldStatus !== newStatus) {
            queryClient.invalidateQueries({
              queryKey: queryKeys.checkInReport(showId),
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showId, queryClient]);
}
