import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/hooks/useAuthContext';

export type DbNotificationType =
  | 'entry_confirmed'
  | 'q_earned'
  | 'schedule_change'
  | 'judge_assignment';

export interface DbNotification {
  id: string;
  user_id: string;
  type: DbNotificationType;
  message: string;
  deep_link_url: string | null;
  read_at: string | null;
  created_at: string;
}

export function useDbNotifications(limit?: number) {
  const { user } = useAuthContext();

  return useQuery({
    queryKey: ['db-notifications', user?.id, limit],
    queryFn: async () => {
      // notifications table not yet in generated types — cast until migration is applied
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DbNotification[];
    },
    enabled: !!user?.id,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .in('id', ids)
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['db-notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const { user } = useAuthContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['db-notifications'] }),
  });
}
