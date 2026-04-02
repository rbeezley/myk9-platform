import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';

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

    // Realtime subscription
    const channel = supabase.channel(`tv:${showId}`);

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entries', filter: `show_id=eq.${showId}` },
        invalidate
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'classes' }, invalidate)
      .subscribe(status => {
        const connected = status === 'SUBSCRIBED';
        setIsConnected(connected);

        // Start polling fallback when disconnected
        if (!connected && !pollRef.current) {
          pollRef.current = setInterval(invalidate, POLL_INTERVAL_MS);
        }
        // Stop polling when reconnected
        if (connected && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          invalidate(); // Refresh immediately on reconnect
        }
      });

    return () => {
      supabase.removeChannel(channel);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [showId, queryClient]);

  return { isConnected };
}
