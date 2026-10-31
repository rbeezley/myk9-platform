import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowManageScope } from '@/hooks/useShowManageScope';
import { useShowStore } from '@/store/showStore';
import { usePageEditTargetStore, type ShowToolsRegistration } from './pageEditTarget';
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
import { ENTRY_LISTS_GROUP, SHOW_DESK_TOOL_GROUP_HEADINGS } from './showToolActions';
import { UserRole } from '@/types/auth-types';
import { useEntryEligibleShows } from './useEntryEligibleShows';
import { useAddEntryPickerStore } from './addEntryPickerStore';

export interface CurrentActions {
  route: ActionRouteContext;
  actions: AppAction[];
  /** The same actions as labelled sections, in menu order. */
  groups: ActionGroup[];
  /** The show page's attention glance, while it is mounted and registered; else null. */
  showToolsAttention: ShowToolsRegistration['attention'] | null;
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
  // The roles `/secretary/register/:showId` admits (routes/secretaryRoutes.tsx). Withheld until
  // the shows replica's first read, so a secretary with shows is never told they have none; a
  // later save or refetch does not withdraw it.
  const showsLoaded = useShowStore(state => state.hasLoaded);
  const canAddEntries =
    !rbacLoading && showsLoaded && (hasRole(UserRole.SECRETARY) || hasRole(UserRole.SITE_ADMIN));
  const entryShows = useEntryEligibleShows();
  const openEntryPicker = useAddEntryPickerStore(state => state.setOpen);
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
  // Same sources, for the one item that depends on where the show is in its life (close-out).
  const storedShowStatus = useShowStore(state =>
    showId ? state.shows.find(show => show.id === showId)?.status : undefined
  );
  const showStatus = storedShowStatus ?? queriedShow?.status;

  // The detail page on screen, when it registered an Edit it lets this viewer use.
  const pageTarget = usePageEditTargetStore(state => state.target);
  const pageExports = usePageEditTargetStore(state => state.exports);
  const pageExportIds = pageExports.map(item => item.id).join('|');
  // Joined for a stable memo dependency, then split once for both readers.
  const exportIdList = useMemo(
    () => (pageExportIds === '' ? [] : pageExportIds.split('|')),
    [pageExportIds]
  );
  const registeredShowTools = usePageEditTargetStore(state => state.showTools);
  // Another show's tools (a registration left over from a page that is leaving) are not this
  // route's: rows and badge are used only for the show the route names.
  const showToolsRegistration =
    registeredShowTools && showId !== undefined && registeredShowTools.showId === showId
      ? registeredShowTools
      : null;
  const showTools = showToolsRegistration?.tools;
  const pageKind = pageTarget?.kind;
  const pageAddClassesHref = pageTarget?.addClassesHref;
  const pageTitle = pageTarget?.title;
  const pageCanEdit = pageTarget?.canEdit;
  // Replaced only when the page re-registers, so a stable dependency.
  const pageExtras = pageTarget?.extras;

  const resolved = useMemo(
    () =>
      resolveActions(route, {
        pageObject: pageKind
          ? {
              kind: pageKind,
              canEdit: pageCanEdit,
              addClassesHref: pageAddClassesHref,
              extras: pageExtras,
            }
          : null,
        pageExports: exportIdList.map(id => ({ id })),
        showTools,
        // Fail closed while ownership is still resolving: an empty list hides
        // the button, which is honest, where a flashed-then-withdrawn menu is
        // the mistake-anxiety bug docs/INTENT.md names.
        canManageShow: scope.status === 'resolved' && scope.canManage,
        showScopeResolving: route.kind === 'show' && scope.status !== 'resolved',
        canOperateShow: scope.status === 'resolved' && scope.canOperate,
        canCreateShows,
        canCreateDogs,
        canCreatePeople,
        canCreateClubs,
        canAddEntries,
        entryShows,
        showStatus,
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
      canAddEntries,
      entryShows,
      showStatus,
      pageKind,
      pageCanEdit,
      pageAddClassesHref,
      pageExtras,
      exportIdList,
      showTools,
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
        if (action.command === 'pick-entry-show') {
          return { ...action, run: () => openEntryPicker(true) };
        }
        if (action.command === 'page-export') {
          const exported = pageExports.find(item => `page-export-${item.id}` === action.id);
          return exported ? { ...action, run: exported.run } : action;
        }
        return action;
      }),
    [resolved, search, pageTarget, pageExports, openEntryPicker]
  );

  const groups = useMemo(
    () =>
      groupActions(actions, {
        page: pageKind ? pageObjectHeading(pageKind, pageTitle) : 'This page',
        show: showName?.trim() || 'This show',
        ...SHOW_DESK_TOOL_GROUP_HEADINGS,
        [ENTRY_LISTS_GROUP.id]: ENTRY_LISTS_GROUP.label,
        list: listHeading(exportIdList),
        create: 'Create',
      }),
    [actions, pageKind, pageTitle, showName, exportIdList]
  );

  // Only while the tools' rows are in the menu: the badge and the rows share one gate.
  const showToolsAttention =
    scope.status === 'resolved' && scope.canManage && route.kind === 'show'
      ? (showToolsRegistration?.attention ?? null)
      : null;

  return { route, actions, groups, showToolsAttention };
}
