import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowManageScope } from '@/hooks/useShowManageScope';
import { PERMISSIONS, UserRole } from '@/types/auth-types';
import { usePremiumPublishControl } from '@/features/premium/usePremiumPublishControl';
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

  // The one control behind the `publish-premium` command -- the same read,
  // derivation and flow the Premium List card renders, so the menu can never
  // offer a publish the card has withdrawn. Called unconditionally (hooks
  // rules) with an empty id off a show route, or with the show-management gate
  // closed while scope resolves. `true`: this menu is manager-only, so
  // staleness is always the viewer's business here.
  const premium = usePremiumPublishControl(
    showId ?? '',
    true,
    scope.status === 'resolved' && scope.canManage
  );

  const resolved = useMemo(
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

  // Bind each `command` to its real callback. THE one place that may: the
  // registry stays pure and every other consumer reads `run` without knowing
  // what is behind it.
  const actions = useMemo(
    () =>
      resolved.map(action => {
        if (action.command !== 'publish-premium') return action;
        return {
          ...action,
          // Label AND availability come from the shared derivation, not from
          // the registry's static text: "Republish premium" when the show data
          // moved on, greyed with a reason when there is nothing to publish.
          label: premium.action.label,
          run: premium.run,
          ...(premium.action.disabledReason
            ? { disabledReason: premium.action.disabledReason }
            : {}),
        };
      }),
    [resolved, premium.action.label, premium.action.disabledReason, premium.run]
  );

  return { route, actions };
}
