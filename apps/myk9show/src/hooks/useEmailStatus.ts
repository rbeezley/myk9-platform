import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface EmailLogEntry {
  id: string;
  related_id: string;
  status: string;
  error_message?: string;
  created_at: string;
}

/**
 * Fetches email delivery status for a set of registration IDs.
 */
export function useEmailStatus(registrationIds: string[]) {
  return useQuery({
    queryKey: ['email-status', registrationIds],
    queryFn: async () => {
      if (registrationIds.length === 0) return {};

      const { data, error } = await supabase
        .from('email_log')
        .select('id, related_id, status, error_message, created_at')
        .in('related_id', registrationIds)
        .eq('email_type', 'registration_confirmation')
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      // Group by related_id, take most recent
      const statusMap: Record<string, EmailLogEntry> = {};
      for (const row of data ?? []) {
        if (row.related_id && !statusMap[row.related_id]) {
          const entry: EmailLogEntry = {
            id: row.id,
            related_id: row.related_id,
            status: row.status,
            created_at: row.created_at,
          };
          if (row.error_message != null) entry.error_message = row.error_message;
          statusMap[row.related_id] = entry;
        }
      }
      return statusMap;
    },
    enabled: registrationIds.length > 0,
    staleTime: 30_000,
  });
}
