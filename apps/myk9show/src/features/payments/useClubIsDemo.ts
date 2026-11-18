import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cacheStrategies } from '@/lib/queryClient';

/**
 * Whether the club is a demo club (clubs.is_demo). The server publishes a demo club's shows
 * without payouts, so the app must not nag them. Online-only: offline, the query errors and the
 * answer stays unknown, which is never read as "not a demo club" by the readiness line.
 */
export function useClubIsDemo(clubId: string | undefined) {
  return useQuery({
    queryKey: ['club-is-demo', clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clubs')
        .select('is_demo')
        .eq('id', clubId!)
        .maybeSingle();
      if (error) throw error;
      return data?.is_demo === true;
    },
    enabled: !!clubId,
    ...cacheStrategies.moderate,
  });
}
