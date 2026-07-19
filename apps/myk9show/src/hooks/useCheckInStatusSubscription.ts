import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeToShowChanges } from '@/features/show-live-sync/showChangeSignal';

/**
 * Subscribes to real-time check-in status changes for entries in a class.
 * Invalidates React Query cache on change so all viewers see updates instantly.
 */
export function useCheckInStatusSubscription(
  showId: string | undefined,
  classId: string | undefined
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!showId || !classId) return undefined;

    return subscribeToShowChanges(showId, () => {
      queryClient.invalidateQueries({
        queryKey: ['classes', classId, 'entries'],
      });
    });
  }, [showId, classId, queryClient]);
}
