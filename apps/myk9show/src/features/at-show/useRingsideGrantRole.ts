/**
 * useRingsideGrantRole — reads the active ringside grant (Phase 1c) and returns
 * the grant's role IFF it is scoped to the given show, else null.
 *
 * The `/at-show` shims feed the result to `buildRingsideContextValue` as
 * `grantRole`, where it takes precedence over the account RBAC mapping. Null
 * (no grant, or a grant for a different show) means "fall back to RBAC".
 *
 * Consumers today: `AtShowEntryListPage` and `AtShowCombinedEntryListPage` (the
 * surfaces that build a ringside auth bag). `AtShowScoresheetPage` and
 * `AtShowClassListPage` derive no ringside role yet — they rely on the coarse
 * `STAFF_ROLES` route guard. Threading the grant (and fine-grained `canScore`)
 * into the scoresheet is deferred to Phase 1b, when grants are actually set;
 * until then no grant exists, so all surfaces behave exactly as before.
 */

import type { UserRole as RingsideRole } from '@myk9/ringside';
import { useRingsideGrantStore, selectGrantRoleForShow } from '@/store/ringsideGrantStore';

export function useRingsideGrantRole(showId: string | undefined): RingsideRole | null {
  const activeGrant = useRingsideGrantStore(state => state.activeGrant);
  return selectGrantRoleForShow(activeGrant, showId);
}
