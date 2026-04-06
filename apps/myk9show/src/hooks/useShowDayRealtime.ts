import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';

/**
 * Subscribes to entry updates for the exhibitor's classes and invalidates
 * the ring-progress cache so dogs-ahead counts stay current.
 */
export function useShowDayRealtime(classIds: string[]) {
  const queryClient = useQueryClient();
  const classIdsKey = classIds.join(',');

  useEffect(() => {
    if (!classIdsKey) return;

    const channel = supabase.channel(`show-day-entries:${classIdsKey}`);

    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'entries',
          filter: `class_id=in.(${classIdsKey})`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['show-day', 'ring-progress'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [classIdsKey, queryClient]);
}
