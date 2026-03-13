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
 * The email_log table is created by migration but may not yet be in generated types.
 */
export function useEmailStatus(registrationIds: string[]) {
  return useQuery({
    queryKey: ['email-status', registrationIds],
    queryFn: async () => {
      if (registrationIds.length === 0) return {};

      // email_log table exists in DB but not yet in generated Supabase types.
      // Use rpc-style raw query via the REST endpoint.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any;
      const { data, error } = await client
        .from('email_log')
        .select('id, related_id, status, error_message, created_at')
        .in('related_id', registrationIds)
        .eq('email_type', 'registration_confirmation')
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      // Group by related_id, take most recent
      const statusMap: Record<string, EmailLogEntry> = {};
      for (const row of (data as EmailLogEntry[]) || []) {
        if (!statusMap[row.related_id]) {
          statusMap[row.related_id] = row;
        }
      }
      return statusMap;
    },
    enabled: registrationIds.length > 0,
    staleTime: 30_000,
  });
}
