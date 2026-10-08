import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowManageScope } from '@/hooks/useShowManageScope';
import { usePremiumPublishControl } from '@/features/premium/usePremiumPublishControl';
import { useShowStore } from '@/store/showStore';
import { usePageEditTargetStore } from './pageEditTarget';
import { resolveCreateGates } from './createGates';
import { useShowQuery } from '@/hooks/queries/useShowsDatabase';
import { groupActions, listHeading, pageObjectHeading, type ActionGroup } from './actionGroups';
import {
  mergeSearchOnlyHref,
  parseActionRouteContext,
  resolveActions,
  type AppAction,
  type ActionRouteContext,
} from './actionRegistry';

export interface CurrentActions {
  route: ActionRouteContext;
  actions: AppAction[];
  /** The same actions as labelled sections, in menu order. */
  groups: ActionGroup[];
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
  const { pathname, search } = useLocation();
  const route = useMemo(() => parseActionRouteContext(pathname), [pathname]);
  const { hasRole, hasPermission, rbacLoading } = useAuthContext();

  const showId = route.kind === 'show' ? route.showId : undefined;
  const scope = useShowManageScope(showId);

  // Fail closed while the viewer's permissions load, as the list pages' own Add buttons do:
  // an item that appears late is honest, one shown and then withdrawn is not.
  const gates = resolveCreateGates({ hasRole, hasPermission });
  const canCreateShows = !rbacLoading && gates.canCreateShows;
  const canCreateDogs = !rbacLoading && gates.canCreateDogs;
  const canCreatePeople = !rbacLoading && gates.canCreatePeople;
  const canCreateClubs = !rbacLoading && gates.canCreateClubs;
  // The show section's heading: the replicated store first (offline-durable, no read), then the
  // show's own query, which the show page has already cached under the same key. Asked only
  // when the section will render and the store does not have the show.
  const storedShowName = useShowStore(state =>
    showId ? state.shows.find(show => show.id === showId)?.name : undefined
  );
  const canSeeShowSection = scope.status === 'resolved' && scope.canManage;
  const { data: queriedShow } = useShowQuery(
    showId && canSeeShowSection && !storedShowName ? showId : ''
  );
  const showName = storedShowName ?? queriedShow?.name;

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

  // The detail page on screen, when it registered an Edit it lets this viewer use.
  const pageTarget = usePageEditTargetStore(state => state.target);
  const addClassesTrialId = usePageEditTargetStore(state => state.addClassesTrialId);
  const pageExports = usePageEditTargetStore(state => state.exports);
  const pageExportIds = pageExports.map(item => item.id).join('|');
  // Joined for a stable memo dependency, then split once for both readers.
  const exportIdList = useMemo(
    () => (pageExportIds === '' ? [] : pageExportIds.split('|')),
    [pageExportIds]
  );
  const pageKind = pageTarget?.kind;
  const pageAddClassesHref = pageTarget?.addClassesHref;
  const pageTitle = pageTarget?.title;
  const pageCanEdit = pageTarget?.canEdit;
  // Replaced only when the page re-registers, so a stable dependency.
  const pageExtras = pageTarget?.extras;

  const resolved = useMemo(
    () =>
      resolveActions(route, {
        addClassesTrialId,
        pageObject: pageKind
          ? {
              kind: pageKind,
              canEdit: pageCanEdit,
              addClassesHref: pageAddClassesHref,
              extras: pageExtras,
            }
          : null,
        pageExports: exportIdList.map(id => ({ id })),
        // Fail closed while ownership is still resolving: an empty list hides
        // the button, which is honest, where a flashed-then-withdrawn menu is
        // the mistake-anxiety bug docs/INTENT.md names.
        canManageShow: scope.status === 'resolved' && scope.canManage,
        canOperateShow: scope.status === 'resolved' && scope.canOperate,
        canCreateShows,
        canCreateDogs,
        canCreatePeople,
        canCreateClubs,
      }),
    [
      route,
      scope.status,
      scope.canManage,
      scope.canOperate,
      canCreateShows,
      canCreateDogs,
      canCreatePeople,
      canCreateClubs,
      pageKind,
      pageCanEdit,
      pageAddClassesHref,
      pageExtras,
      addClassesTrialId,
      exportIdList,
    ]
  );

  // Bind each `command` to its real callback. THE one place that may: the
  // registry stays pure and every other consumer reads `run` without knowing
  // what is behind it.
  const actions = useMemo(
    () =>
      resolved.map(action => {
        // A search-only destination keeps the section's own query params.
        if (action.href?.startsWith('?')) {
          return { ...action, href: mergeSearchOnlyHref(action.href, search) };
        }
        // One of the page's other actions (Change Photo, Suspend account...), run by the page.
        if (action.command === 'page-extra') {
          const extra = pageTarget?.extras.find(
            item => `${pageTarget.kind}-${item.id}` === action.id
          );
          return extra ? { ...action, run: extra.run } : action;
        }
        // The page's own Edit panel, opened by the page that registered it.
        if (action.command === 'edit-object') {
          return pageTarget ? { ...action, run: pageTarget.run } : action;
        }
        if (action.command === 'page-export') {
          const exported = pageExports.find(item => `page-export-${item.id}` === action.id);
          return exported ? { ...action, run: exported.run } : action;
        }
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
    [
      resolved,
      search,
      pageTarget,
      pageExports,
      premium.action.label,
      premium.action.disabledReason,
      premium.run,
    ]
  );

  const groups = useMemo(
    () =>
      groupActions(actions, {
        page: pageKind ? pageObjectHeading(pageKind, pageTitle) : 'This page',
        show: showName?.trim() || 'This show',
        list: listHeading(exportIdList),
        create: 'Create',
      }),
    [actions, pageKind, pageTitle, showName, exportIdList]
  );

  return { route, actions, groups };
}
