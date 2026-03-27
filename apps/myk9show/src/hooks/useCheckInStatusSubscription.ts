import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Subscribes to real-time check-in status changes for entries in a class.
 * Invalidates React Query cache on change so all viewers see updates instantly.
 */
export function useCheckInStatusSubscription(classId: string | undefined) {
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

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
          queryClientRef.current.invalidateQueries({
            queryKey: ['classes', classId, 'entries'],
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [classId]);
}
