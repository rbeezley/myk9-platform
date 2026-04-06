import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/hooks/useAuthContext';

/**
 * Subscribes to entry updates for the exhibitor's classes and invalidates
 * the ring-progress cache so dogs-ahead counts stay current.
 */
export function useShowDayRealtime(classIds: string[]) {
  const queryClient = useQueryClient();
  const { userWithRoles } = useAuthContext();
  const userId = userWithRoles?.databaseUserId ?? '';
  // Sort before joining so classId order changes don't needlessly re-create the channel
  const classIdsKey = [...classIds].sort().join(',');

  useEffect(() => {
    if (!classIdsKey || !userId) return;

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
          // Prefix match — invalidates all cached ring-progress snapshots for this user
          queryClient.invalidateQueries({
            queryKey: ['show-day', 'ring-progress', userId],
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [classIdsKey, userId, queryClient]);
}
