import { UserRole, PERMISSIONS, UserWithRoles } from '@/types/auth-types';
import { Show } from '@/types/show-types';
import { SyncableShowEntry } from '@/store/entryStore';
import { logger } from '@/services/LoggingService';
import {
  ShowTab,
  TabConfiguration,
  UserShowContext,
  ShowWithRelationship,
  ShowRelationship,
  TabAction,
} from '@/types/unified-shows-types';
import {
  getUserEntries,
  getUserManagedShows,
  getUserJudgeAssignments,
  getAdminManagedShows,
} from './show-relationships';
import { ShowPermissionValidator } from './permissionValidation';
import { Globe, History, ClipboardList, Settings, Gavel } from 'lucide-react';

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
              s => new Date(s.endDate) < new Date() && ShowPermissionValidator.canView(null, s)
            ).length,
          filterShows: shows =>
            shows.filter(
              s => new Date(s.endDate) < new Date() && ShowPermissionValidator.canView(null, s)
            ),
        },
      ],
      defaultTab: 'all',
      actions: {},
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
          s => new Date(s.endDate) < new Date() && ShowPermissionValidator.canView(user, s)
        ).length,
      filterShows: shows =>
        shows.filter(
          s => new Date(s.endDate) < new Date() && ShowPermissionValidator.canView(user, s)
        ),
    });
  }

  // --- My Shows tab (only for exhibitor/handler roles) ---
  if (accessibleTabs.includes('entries')) {
    tabs.push({
      id: 'entries',
      label: 'My Shows',
      icon: ClipboardList,
      description: 'Shows you have entered as an exhibitor',
      getCount: (shows, entries, userId) => {
        if (!userId || !entries) return 0;
        const userEntries = getUserEntries(userId, shows, entries);
        return userEntries.filter(s => ShowPermissionValidator.canView(user, s)).length;
      },
      filterShows: (shows, entries, userId) => {
        if (!userId || !entries) return [];
        const userEntries = getUserEntries(userId, shows, entries);
        return userEntries.filter(s => ShowPermissionValidator.canView(user, s));
      },
    });
  }

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
    actions: generateTabActions(userRoles),
  };
}

/**
 * Generate available actions for each tab based on user roles
 */
function generateTabActions(userRoles: UserRole[]) {
  const actions: Record<string, TabAction[]> = {
    all: [
      {
        id: 'register',
        label: 'Register',
        variant: 'default',
        onClick: (showId: string) => logger.debug('Register for show action', 'shows', { showId }),
      },
    ],
    past: [
      {
        id: 'view_results',
        label: 'View Results',
        variant: 'outline',
        onClick: (showId: string) =>
          logger.debug('View results for show action', 'shows', { showId }),
      },
    ],
    entries: [
      {
        id: 'view_entry',
        label: 'View Entry',
        variant: 'outline',
        onClick: (showId: string) =>
          logger.debug('View entry for show action', 'shows', { showId }),
      },
      {
        id: 'modify_entry',
        label: 'Modify',
        variant: 'outline',
        onClick: (showId: string) =>
          logger.debug('Modify entry for show action', 'shows', { showId }),
      },
    ],
  };

  // Add role-specific actions
  if (
    userRoles.includes(UserRole.SECRETARY) ||
    userRoles.includes(UserRole.CLUB_ADMIN) ||
    userRoles.includes(UserRole.SITE_ADMIN)
  ) {
    actions.all.unshift({
      id: 'create_show',
      label: 'New Show',
      variant: 'default',
      requiredPermissions: [PERMISSIONS.SHOW_CREATE],
      onClick: () => logger.debug('Create new show action', 'shows'),
    });

    actions.managing = [
      {
        id: 'edit_show',
        label: 'Edit Show',
        variant: 'outline',
        requiredPermissions: [PERMISSIONS.SHOW_UPDATE],
        onClick: (showId: string) => logger.debug('Edit show action', 'shows', { showId }),
      },
      {
        id: 'manage_entries',
        label: 'Manage Entries',
        variant: 'outline',
        requiredPermissions: [PERMISSIONS.SHOW_MANAGE_ENTRIES],
        onClick: (showId: string) =>
          logger.debug('Manage entries for show action', 'shows', { showId }),
      },
      {
        id: 'view_reports',
        label: 'Reports',
        variant: 'ghost',
        onClick: (showId: string) =>
          logger.debug('View reports for show action', 'shows', { showId }),
      },
    ];
  }

  if (userRoles.includes(UserRole.JUDGE)) {
    actions.assignments = [
      {
        id: 'view_assignment',
        label: 'View Assignment',
        variant: 'outline',
        requiredPermissions: [PERMISSIONS.JUDGE_VIEW_ASSIGNMENTS],
        onClick: (showId: string) =>
          logger.debug('View assignment for show action', 'shows', { showId }),
      },
      {
        id: 'enter_results',
        label: 'Enter Results',
        variant: 'default',
        requiredPermissions: [PERMISSIONS.JUDGE_ENTER_RESULTS],
        onClick: (showId: string) =>
          logger.debug('Enter results for show action', 'shows', { showId }),
      },
    ];
  }

  return actions;
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

    if (new Date(show.endDate) < new Date()) {
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
        return shows.filter(s => new Date(s.endDate) < new Date());
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
