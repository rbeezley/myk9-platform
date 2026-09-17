import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowManageScope } from '@/hooks/useShowManageScope';
import { PERMISSIONS, UserRole } from '@/types/auth-types';
import {
  parseActionRouteContext,
  resolveActions,
  type AppAction,
  type ActionRouteContext,
} from './actionRegistry';

export interface CurrentActions {
  route: ActionRouteContext;
  actions: AppAction[];
}

/**
 * The action list for wherever the viewer currently is. The ONE composition
 * point: `HeaderActions` and the command palette both call this, so the two
 * doors can never offer different lists (MYK9-630).
 *
 * Ownership of the show comes from `useShowManageScope`, the canonical gate the
 * management routes themselves use, so the menu can never offer a surface the
 * route would then bounce the viewer off.
 */
export function useCurrentActions(): CurrentActions {
  const { pathname } = useLocation();
  const route = useMemo(() => parseActionRouteContext(pathname), [pathname]);
  const { hasRole, hasPermission } = useAuthContext();

  const showId = route.kind === 'show' ? route.showId : undefined;
  const scope = useShowManageScope(showId);

  const canCreateShows = hasPermission(PERMISSIONS.SHOW_CREATE);
  const isShowManagementStaff = hasRole(UserRole.SECRETARY) || hasRole(UserRole.SITE_ADMIN);

  const actions = useMemo(
    () =>
      resolveActions(route, {
        // Fail closed while ownership is still resolving: an empty list hides
        // the button, which is honest, where a flashed-then-withdrawn menu is
        // the mistake-anxiety bug docs/INTENT.md names.
        canManageShow: scope.status === 'resolved' && scope.canManage,
        canOperateShow: scope.status === 'resolved' && scope.canOperate,
        canCreateShows,
        isShowManagementStaff,
      }),
    [route, scope.status, scope.canManage, scope.canOperate, canCreateShows, isShowManagementStaff]
  );

  return { route, actions };
}
