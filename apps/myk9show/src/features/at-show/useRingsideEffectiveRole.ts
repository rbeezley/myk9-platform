/**
 * useRingsideEffectiveRole — single source of truth for "what ringside role does
 * this account hold on this show, and what may it do?"
 *
 * Collapses the role + permission derivation that every `/at-show` host shim
 * needs into one hook: account RBAC → primary `ShowRole` → ringside's 4-role
 * enum, with a Phase 1c show-scoped passcode grant (`useRingsideGrantRole`)
 * taking precedence over the RBAC mapping (Locked Decision #8). It then derives
 * the ringside permission bag from the resolved role and exposes a
 * `hasPermission` checker.
 *
 * Consumers: `AtShowEntryListPage` + `AtShowCombinedEntryListPage` (build the
 * provider auth bag + per-page context) and `AtShowScoresheetPage` (gates
 * `canScore`). Keeping the derivation here means the precedence rule — which
 * Phase 1b changes when it actually wires grant-setting — lives in exactly one
 * place, and no surface can drift out of agreement with the others.
 */

import { useCallback, useMemo } from 'react';
import type {
  UserRole as RingsideRole,
  UserPermissions as RingsidePermissions,
} from '@myk9/ringside';
import { useAuthContext, getPrimaryRole } from '@/hooks/useAuthContext';
import type { UserRole as ShowRole } from '@/types/auth-types';
import { resolveRingsideAccess } from './ringsideAuthAdapter';
import { useRingsideGrantRole } from './useRingsideGrantRole';

export interface RingsideEffectiveRole {
  /** Account RBAC primary role — drives the provider auth + the grant fallback. */
  showRole: ShowRole;
  /** Phase 1c show-scoped passcode grant role, or null when none applies. */
  grantRole: RingsideRole | null;
  /** Resolved ringside role: the grant wins when present, else the RBAC mapping. */
  ringsideRole: RingsideRole | null;
  /** Permission bag for the resolved role; null when the role is null. */
  permissions: RingsidePermissions | null;
  /** Convenience checker — false when the permission (or the role) is absent. */
  hasPermission: (permission: keyof RingsidePermissions) => boolean;
}

export function useRingsideEffectiveRole(showId: string | undefined): RingsideEffectiveRole {
  const { getUserRoles } = useAuthContext();

  const showRole = useMemo(() => getPrimaryRole(getUserRoles()), [getUserRoles]);
  const grantRole = useRingsideGrantRole(showId);

  // Precedence + permission derivation lives in `resolveRingsideAccess` (shared
  // with `buildRingsideAuth`); the hook only adds React memoization + the
  // `hasPermission` checker.
  const { role: ringsideRole, permissions } = useMemo(
    () => resolveRingsideAccess({ showRole, grantRole }),
    [showRole, grantRole]
  );
  const hasPermission = useCallback(
    (permission: keyof RingsidePermissions) => permissions?.[permission] ?? false,
    [permissions]
  );

  return { showRole, grantRole, ringsideRole, permissions, hasPermission };
}
