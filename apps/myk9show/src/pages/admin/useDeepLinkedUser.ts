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
import { isValidUUID } from '@/utils/validation';
import type { User } from '@/types/user-types';

export interface DeepLinkedUser {
  user: User | null;
  /** True only once the roster and any auth-id lookup have settled with no match. */
  notFound: boolean;
  /** The auth-id lookup itself failed (network/database), so the user may exist. */
  lookupFailed: boolean;
  /** Offline: the auth-id lookup is paused until the connection returns, then runs on its own. */
  needsConnection: boolean;
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

  const unresolved = !!deepLinkUserId && rosterReady && !direct;
  // A hand-edited id that is not a UUID can never match `people.auth_user_id`;
  // querying it would only make PostgreSQL reject it (22P02) as a "failure".
  const malformedId = unresolved && !isValidUUID(deepLinkUserId);
  const needsLookup = unresolved && !malformedId;
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
    notFound: (malformedId || (needsLookup && lookup.isSuccess)) && !user,
    lookupFailed: needsLookup && !user && lookup.isError,
    needsConnection: needsLookup && !user && lookup.fetchStatus === 'paused',
    retryLookup: () => void lookup.refetch(),
  };
}
