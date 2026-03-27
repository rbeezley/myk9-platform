import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Subscribes to real-time check-in status changes for entries in a class.
 * Invalidates React Query cache on change so all viewers see updates instantly.
 */
export function useCheckInStatusSubscription(classId: string | undefined) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!classId) return;

    const channel = supabase.channel(`checkin:${classId}`);

    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'entries',
          filter: `class_id=eq.${classId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ['classes', classId, 'entries'],
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [classId, queryClient]);
}
