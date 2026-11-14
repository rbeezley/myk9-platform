import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/hooks/useAuthContext';
import { managedClubIds } from '@/utils/roleScopes';

/**
 * Who sees the mock show test page: people who manage a club the site admin has
 * marked as a test club (`clubs.is_demo`). A site admin is not special here:
 * the page belongs to a test club's managers, so it follows their club scopes.
 *
 * Online-only on purpose: the notes become support tickets, which need a connection.
 */
export function useMockShowTestAccess(): {
  isLoading: boolean;
  /** The club lookup failed and there is no earlier answer to fall back on. */
  isError: boolean;
  hasAccess: boolean;
  retry: () => void;
} {
  const { user, userWithRoles } = useAuthContext();
  const clubIds = useMemo(
    () => [...(managedClubIds({ isAdmin: false, userWithRoles }) ?? [])].sort(),
    [userWithRoles]
  );

  const query = useQuery({
    queryKey: ['mock-show-test-club', user?.id ?? null, clubIds],
    enabled: !!user && clubIds.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clubs')
        .select('id')
        .in('id', clubIds)
        .eq('is_demo', true);
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
  });

  const retry = () => void query.refetch();
  if (!user || clubIds.length === 0) {
    return { isLoading: false, isError: false, hasAccess: false, retry };
  }
  // A failed refresh keeps the last good answer (query.data), so a weak
  // connection never takes the page away from someone who already has it.
  return {
    isLoading: query.isLoading,
    isError: query.isError && query.data === undefined,
    hasAccess: query.data === true,
    retry,
  };
}
