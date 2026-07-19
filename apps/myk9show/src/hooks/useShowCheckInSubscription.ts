import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { subscribeToShowChanges } from '@/features/show-live-sync/showChangeSignal';

/**
 * Subscribes to real-time check-in status changes for all entries in a show.
 * Invalidates the check-in report query cache when any entry's status changes.
 *
 * Broadcast carries no status fields, so an entries signal invalidates the
 * authoritative report query. React Query deduplicates overlapping refreshes.
 */
export function useShowCheckInSubscription(showId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!showId) return undefined;

    return subscribeToShowChanges(showId, signal => {
      if (signal.table !== 'entries') return;
      queryClient.invalidateQueries({
        queryKey: queryKeys.checkInReport(showId),
      });
    });
  }, [showId, queryClient]);
}
