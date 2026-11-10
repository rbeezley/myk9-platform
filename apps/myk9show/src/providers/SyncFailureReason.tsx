import { useContext } from 'react';
import { isExhibitorOnlyRoles } from '@/components/layout/sidebar/browseTabs';
import { AuthContext } from '@/context/AuthContext';
import { hasRingsideStaffRole } from '@/features/at-show/ringsideAccountAccess';
import { SYNC_FAILURE_REASON_PREFIX } from './replicationSyncFormatters';

/**
 * Description line of the sync-failure toast (MYK9-1849). The technical
 * "Reason:" detail is for staff, so a secretary and whoever she calls can see
 * why Retry keeps failing; an exhibitor-only account does not see it.
 *
 * `ReplicationSyncProvider` sits above `AuthProvider`, so roles are read here,
 * where the toast renders (sonner's Toaster is mounted under `AuthProvider`).
 * Outside an auth tree, or while roles are not known yet (empty), the line is
 * shown: only a viewer known to be exhibitor-only loses it.
 */
export function SyncFailureReason({ reason }: { reason: string }) {
  const auth = useContext(AuthContext);
  const isTechnical = reason.startsWith(SYNC_FAILURE_REASON_PREFIX);
  const roles = auth?.getUserRoles() ?? [];
  // The Account predicate does not include stewards and chairmen as staff.
  if (
    isTechnical &&
    isExhibitorOnlyRoles(roles) &&
    !hasRingsideStaffRole(role => roles.includes(role))
  ) {
    return null;
  }
  return <>{reason}</>;
}
