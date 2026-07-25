import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { subscribeToShowChanges } from '@/features/show-live-sync/showChangeSignal';

const POLL_INTERVAL_MS = 30_000;

interface TVRealtimeState {
  isConnected: boolean;
}

export function useTVRealtime(showId: string): TVRealtimeState {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!showId) return;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tvClasses(showId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tvResults(showId) });
    };

    const unsubscribe = subscribeToShowChanges(showId, invalidate, status => {
      const connected = status === 'SUBSCRIBED';
      setIsConnected(connected);

      if (!connected && !pollRef.current) {
        pollRef.current = setInterval(invalidate, POLL_INTERVAL_MS);
      }
      if (connected && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        invalidate(); // Refresh immediately on reconnect
      }
    });

    return () => {
      unsubscribe();
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [showId, queryClient]);

  return { isConnected };
}
