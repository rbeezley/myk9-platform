/**
 * useRingsideGrantRole — reads the active ringside grant (Phase 1c) and returns
 * the grant's role IFF it is scoped to the given show, else null.
 *
 * The `/at-show` shims feed the result to `buildRingsideContextValue` as
 * `grantRole`, where it takes precedence over the account RBAC mapping. Null
 * (no grant, or a grant for a different show) means "fall back to RBAC".
 *
 * Consumed via `useRingsideEffectiveRole`, which every ringside-auth surface
 * now shares: `AtShowEntryListPage`, `AtShowCombinedEntryListPage`, AND
 * `AtShowScoresheetPage` (the scoresheet uses it to gate `canScore`, so a
 * steward admitted by the coarse `STAFF_ROLES` route guard can't submit a
 * score). `AtShowClassListPage` still derives no ringside role — it relies on
 * the route guard alone. Until Phase 1b actually sets a grant, none exists, so
 * the grant path is inert and every surface resolves via the account RBAC
 * mapping exactly as before; 1b only needs to call `setGrant`.
 */

import type { UserRole as RingsideRole } from '@myk9/ringside';
import { useRingsideGrantStore, selectGrantRoleForShow } from '@/store/ringsideGrantStore';

export function useRingsideGrantRole(showId: string | undefined): RingsideRole | null {
  const activeGrant = useRingsideGrantStore(state => state.activeGrant);
  return selectGrantRoleForShow(activeGrant, showId);
}
