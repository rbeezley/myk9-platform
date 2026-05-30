/**
 * useRingsideGrantRole — reads the active ringside grant (Phase 1c) and returns
 * the grant's role IFF it is scoped to the given show, else null.
 *
 * The `/at-show` shims feed the result to `buildRingsideContextValue` as
 * `grantRole`, where it takes precedence over the account RBAC mapping. Null
 * (no grant, or a grant for a different show) means "fall back to RBAC".
 */

import type { UserRole as RingsideRole } from '@myk9/ringside';
import { useRingsideGrantStore, selectGrantRoleForShow } from '@/store/ringsideGrantStore';

export function useRingsideGrantRole(showId: string | undefined): RingsideRole | null {
  const activeGrant = useRingsideGrantStore(state => state.activeGrant);
  return selectGrantRoleForShow(activeGrant, showId);
}
