import { UserRole, PERMISSIONS, UserWithRoles } from '@/types/auth-types';
import { Show } from '@/types/show-types';
import { SyncableShowEntry } from '@/store/entryStore';
import {
  ShowTab,
  TabConfiguration,
  UserShowContext,
  ShowWithRelationship,
  ShowRelationship,
} from '@/types/unified-shows-types';
import {
  getUserEntries,
  getUserManagedShows,
  getUserJudgeAssignments,
  getAdminManagedShows,
} from './show-relationships';
import { ShowPermissionValidator } from './permissionValidation';
import { showDateRangeStatus } from './date-format';
import { Globe, History, Settings, Gavel } from 'lucide-react';

/**
 * Generate tab configuration based on user roles and permissions
 */
export function getTabsForUser(user: UserWithRoles | null): TabConfiguration {
  // Audit tab access request
  ShowPermissionValidator.auditAction('get_tabs_for_user', user, 'interface', 'browse_shows', true);

  if (!user) {
    // Guest user - only show public tabs with permission filtering
    return {
      tabs: [
        {
          id: 'all',
          label: 'Browse All',
          icon: Globe,
          description: 'Browse all available shows',
          getCount: shows => shows.filter(s => ShowPermissionValidator.canView(null, s)).length,
          filterShows: shows => shows.filter(s => ShowPermissionValidator.canView(null, s)),
        },
        {
          id: 'past',
          label: 'Past Shows',
          icon: History,
          description: 'Historical shows for reference',
          getCount: shows =>
            shows.filter(
              s =>
                showDateRangeStatus(s.startDate, s.endDate) === 'past' &&
                ShowPermissionValidator.canView(null, s)
            ).length,
          filterShows: shows =>
            shows.filter(
              s =>
                showDateRangeStatus(s.startDate, s.endDate) === 'past' &&
                ShowPermissionValidator.canView(null, s)
            ),
        },
      ],
      defaultTab: 'all',
    };
  }

  const tabs: ShowTab[] = [];
  const userRoles = user.roles || [];
  const accessibleTabs = ShowPermissionValidator.getAccessibleTabs(user);

  const hasManagementRole =
    userRoles.includes(UserRole.SECRETARY) ||
    userRoles.includes(UserRole.CLUB_ADMIN) ||
    userRoles.includes(UserRole.SITE_ADMIN);

  // --- Role-specific "Managing" tab first (secretary/club_admin/site_admin) ---
  // Placed before "Browse All" so the secretary's primary view is front-and-center.
  if (hasManagementRole) {
    if (userRoles.includes(UserRole.SITE_ADMIN)) {
      tabs.push({
        id: 'managing',
        label: 'Managing',
        icon: Settings,
        description: 'Global administrative view of all shows',
        requiredRoles: [UserRole.SITE_ADMIN],
        requiredPermissions: [PERMISSIONS.SHOW_MANAGE],
        getCount: (shows, _entries, _userId) => {
          return getAdminManagedShows(shows, userRoles).length;
        },
        filterShows: (shows, _entries, _userId) => {
          return getAdminManagedShows(shows, userRoles);
        },
      });
    } else {
      tabs.push({
        id: 'managing',
        label: 'Managing',
        icon: Settings,
        description: 'Shows you are secretary or administrator for',
        requiredRoles: [UserRole.SECRETARY, UserRole.CLUB_ADMIN],
        requiredPermissions: [PERMISSIONS.SHOW_MANAGE],
        getCount: (shows, _entries, userId) => {
          if (!userId) return 0;
          return getUserManagedShows(userId, shows, userRoles, user.scopes ?? []).length;
        },
        filterShows: (shows, _entries, userId) => {
          if (!userId) return [];
          return getUserManagedShows(userId, shows, userRoles, user.scopes ?? []);
        },
      });
    }
  }

  // --- Browse All tab ---
  if (accessibleTabs.includes('all')) {
    tabs.push({
      id: 'all',
      label: 'Browse All',
      icon: Globe,
      description: 'Browse and register for available shows',
      getCount: shows => shows.filter(s => ShowPermissionValidator.canView(user, s)).length,
      filterShows: shows => shows.filter(s => ShowPermissionValidator.canView(user, s)),
    });
  }

  // --- Past Shows tab ---
  if (accessibleTabs.includes('past')) {
    tabs.push({
      id: 'past',
      label: 'Past Shows',
      icon: History,
      description: 'Historical shows for reference',
      getCount: shows =>
        shows.filter(
          s =>
            showDateRangeStatus(s.startDate, s.endDate) === 'past' &&
            ShowPermissionValidator.canView(user, s)
        ).length,
      filterShows: shows =>
        shows.filter(
          s =>
            showDateRangeStatus(s.startDate, s.endDate) === 'past' &&
            ShowPermissionValidator.canView(user, s)
        ),
    });
  }

  // The "Entered as exhibitor" tab is deliberately absent.
  //
  // It answered "what have I entered?" — which is My Shows, a whole page whose
  // own sidebar entry sits two rows above "Find Shows" for every exhibitor. Its
  // description was literally the sidebar's words for that page ("Your shows,
  // entries, and dogs"), so the two surfaces described themselves identically
  // and diverged in what they could actually do: My Shows carries the per-dog
  // bands, results, check-in and payment state; this tab carried a filtered
  // show list.
  //
  // Phase B of docs/plan-ia-exhibitor-surface.md: /shows is for FINDING shows;
  // "what I entered" reaches My Shows by link rather than being re-answered
  // here. The link already exists in the sidebar, so removing the tab needs no
  // replacement affordance — see the exhibitor sidebar contract in
  // unifiedSidebarConfig.test.ts.
  //
  // NOTE: the per-show `entries` RELATIONSHIP is untouched. It still drives the
  // View Entry / Modify actions on individual show cards, and
  // `mergeAccountEnteredShowStubs` still feeds it.

  // --- Judge assignments tab ---
  if (userRoles.includes(UserRole.JUDGE)) {
    tabs.push({
      id: 'assignments',
      label: 'My Assignments',
      icon: Gavel,
      description: 'Shows you are assigned to judge',
      requiredRoles: [UserRole.JUDGE],
      requiredPermissions: [PERMISSIONS.JUDGE_VIEW_ASSIGNMENTS],
      getCount: (shows, _entries, userId) => {
        if (!userId) return 0;
        return getUserJudgeAssignments(userId, shows).length;
      },
      filterShows: (shows, _entries, userId) => {
        if (!userId) return [];
        return getUserJudgeAssignments(userId, shows);
      },
    });
  }

  // Default tab: "Managing" for management roles, "Browse All" for others
  const defaultTab = hasManagementRole ? 'managing' : 'all';

  return {
    tabs,
    defaultTab,
  };
}

/**
 * Get user show context for filtering and relationship determination
 */
export function getUserShowContext(
  user: UserWithRoles | null,
  shows: Show[],
  entries: SyncableShowEntry[]
): UserShowContext | null {
  if (!user) return null;

  const userId = user.databaseUserId ?? user.id;
  const userRoles = user.roles || [];

  const userEntries = getUserEntries(userId, shows, entries).map(s => s.id);
  const directlyManaged = getUserManagedShows(userId, shows, userRoles).map(s => s.id);
  const adminManaged = getAdminManagedShows(shows, userRoles).map(s => s.id);
  const managedShows = [...new Set([...directlyManaged, ...adminManaged])];
  const judgeAssignments = getUserJudgeAssignments(userId, shows).map(s => s.id);

  return {
    userId,
    roles: user.roles || [],
    permissions: user.permissions || [],
    managedShows,
    judgeAssignments,
    entries: userEntries,
  };
}

/**
 * Enhance shows with relationship metadata
 */
export function enhanceShowsWithRelationships(
  shows: Show[],
  context: UserShowContext | null
): ShowWithRelationship[] {
  if (!context) {
    return shows.map(show => ({
      ...show,
      relationship: ['all'] as ShowRelationship[],
      userCanManage: false,
      userIsJudging: false,
      userHasEntries: false,
    }));
  }

  return shows.map(show => {
    const relationships: ShowRelationship[] = ['all'];

    if (showDateRangeStatus(show.startDate, show.endDate) === 'past') {
      relationships.push('past');
    }

    const userCanManage = context.managedShows.includes(show.id);
    const userIsJudging = context.judgeAssignments.includes(show.id);
    const userHasEntries = context.entries.includes(show.id);

    if (userHasEntries) relationships.push('entries');
    if (userCanManage) relationships.push('managing');
    if (userIsJudging) relationships.push('assignments');

    return {
      ...show,
      relationship: relationships,
      userCanManage,
      userIsJudging,
      userHasEntries,
    };
  });
}

/**
 * Filter shows based on tab selection and user context
 */
export function filterShowsForTab(
  tabId: string,
  shows: Show[],
  _entries: SyncableShowEntry[],
  context: UserShowContext | null
): Show[] {
  if (!context) {
    // Guest filtering
    switch (tabId) {
      case 'past':
        return shows.filter(s => showDateRangeStatus(s.startDate, s.endDate) === 'past');
      case 'all':
      default:
        return shows;
    }
  }

  const enhancedShows = enhanceShowsWithRelationships(shows, context);

  switch (tabId) {
    case 'past':
      return enhancedShows.filter(s => s.relationship.includes('past'));
    case 'entries':
      return enhancedShows.filter(s => s.relationship.includes('entries'));
    case 'managing':
      return enhancedShows.filter(s => s.relationship.includes('managing'));
    case 'assignments':
      return enhancedShows.filter(s => s.relationship.includes('assignments'));
    case 'all':
    default:
      return enhancedShows;
  }
}
