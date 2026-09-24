/**
 * The sole identity source for account-entry reads. AuthContext owns the
 * explicit person identity state so a cached identity remains usable before
 * RBAC hydrates, while unresolved or missing identity cannot fall back to
 * stale role data.
 */

import { useAuthContext } from '@/hooks/useAuthContext';

export function useEntriesPersonId(): string | null {
  const { personId } = useAuthContext();
  return personId ?? null;
}
