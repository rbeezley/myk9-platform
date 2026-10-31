/**
 * Resolves the support deep link's `?userId=` to a roster row.
 *
 * supportDiagnosticActions emits the people id when it has one and the auth user
 * id otherwise (identity unresolved, e.g. an offline cold boot). The roster RPC
 * (`get_admin_user_list`) returns no `auth_user_id`, so an auth id never matches
 * a roster row directly: look it up once in `people` (admin pages are online-only)
 * and match the people id it names.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import type { User } from '@/types/user-types';

export interface DeepLinkedUser {
  user: User | null;
  /** True only once the roster and any auth-id lookup have settled with no match. */
  notFound: boolean;
  /** The auth-id lookup itself failed (network/database), so the user may exist. */
  lookupFailed: boolean;
  retryLookup: () => void;
}

export function useDeepLinkedUser(
  deepLinkUserId: string | null,
  users: User[],
  rosterReady: boolean
): DeepLinkedUser {
  const direct = useMemo(
    () =>
      deepLinkUserId
        ? (users.find(user => user.id === deepLinkUserId || user.user_id === deepLinkUserId) ??
          null)
        : null,
    [deepLinkUserId, users]
  );

  const needsLookup = !!deepLinkUserId && rosterReady && !direct;
  const lookup = useQuery({
    queryKey: ['admin-deep-link-person', deepLinkUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people')
        .select('id')
        .eq('auth_user_id', deepLinkUserId!)
        .maybeSingle();
      if (error) throw error;
      return (data?.id as string | undefined) ?? null;
    },
    enabled: needsLookup,
    retry: false,
  });

  const resolved = useMemo(
    () => (lookup.data ? (users.find(user => user.id === lookup.data) ?? null) : null),
    [lookup.data, users]
  );

  const user = direct ?? resolved;
  return {
    user,
    notFound: needsLookup && !user && lookup.isSuccess,
    lookupFailed: needsLookup && !user && lookup.isError,
    retryLookup: () => void lookup.refetch(),
  };
}
