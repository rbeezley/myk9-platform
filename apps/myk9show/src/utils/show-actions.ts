import { Show } from '@/types/show-types';
import { UserWithRoles, PERMISSIONS, Permission } from '@/types/auth-types';
import { ShowWithRelationship, ShowRelationship } from '@/types/unified-shows-types';
import { ShowPermissionValidator } from './permissionValidation';
import { logger } from '@/services/LoggingService';

/**
 * Action types for show cards
 */
export interface ShowAction {
  id: string;
  label: string;
  icon: string;
  variant: 'default' | 'destructive';
  permission?: Permission;
  requiresRelationship?: ShowRelationship[];
  onClick: (show: Show) => void;
}

/**
 * Get contextual actions for a show based on current tab and user permissions
 */
export function getShowActions(
  show: ShowWithRelationship,
  currentTab: string,
  user: UserWithRoles | null
): ShowAction[] {
  // Audit the action request
  ShowPermissionValidator.auditAction('get_show_actions', user, 'show', show.id, true);

  if (!user) {
    // Guest users can only view details if they have permission
    if (!ShowPermissionValidator.canView(user, show)) {
      return [];
    }

    return [
      {
        id: 'view',
        label: 'View Details',
        icon: 'Eye',
        variant: 'default',
        onClick: show => {
          window.location.href = `/shows/${show.id}`;
        },
      },
    ];
  }

  const actions: ShowAction[] = [];
  const userPermissions = user.permissions || [];
  const now = new Date();
  const showStart = new Date(show.startDate);
  const showEnd = new Date(show.endDate);
  const isUpcoming = showStart > now;
  const isPast = showEnd < now;
  const isActive = showStart <= now && showEnd >= now;

  // Add view details as first action if user has permission
  if (ShowPermissionValidator.canView(user, show)) {
    actions.push({
      id: 'view',
      label: 'View Details',
      icon: 'Eye',
      variant: 'default',
      onClick: show => (window.location.href = `/shows/${show.id}`),
    });
  }

  switch (currentTab) {
    case 'all':
      // Register action for upcoming shows (with permission check)
      if (isUpcoming && ShowPermissionValidator.canRegister(user, show)) {
        actions.push({
          id: 'register',
          label: 'Register',
          icon: 'UserPlus',
          variant: 'default',
          onClick: show => {
            ShowPermissionValidator.auditAction('register_attempt', user, 'show', show.id, true);
            logger.logUserAction('register', 'show', { showId: show.id });
          },
        });
      }

      break;

    case 'past':
      // View results for past shows
      actions.push({
        id: 'results',
        label: 'View Results',
        icon: 'Trophy',
        variant: 'default',
        onClick: show => logger.logUserAction('view_results', 'show', { showId: show.id }),
      });

      // Export results if user participated
      if (show.userHasEntries) {
        actions.push({
          id: 'export_results',
          label: 'Export Results',
          icon: 'Download',
          variant: 'default',
          onClick: show => logger.logUserAction('export_results', 'show', { showId: show.id }),
        });
      }
      break;

    case 'entries':
      if (isUpcoming) {
        // Modify entry for upcoming shows
        actions.push({
          id: 'modify_entry',
          label: 'Modify Entry',
          icon: 'Edit',
          variant: 'default',
          onClick: show => logger.logUserAction('modify_entry', 'show', { showId: show.id }),
        });

        // Withdraw entry
        actions.push({
          id: 'withdraw',
          label: 'Withdraw',
          icon: 'UserMinus',
          variant: 'destructive',
          onClick: show => logger.logUserAction('withdraw', 'show', { showId: show.id }),
        });
      } else if (isPast) {
        // View results for completed shows
        actions.push({
          id: 'my_results',
          label: 'My Results',
          icon: 'Award',
          variant: 'default',
          onClick: show => logger.logUserAction('view_my_results', 'show', { showId: show.id }),
        });
      }

      // Print confirmation
      actions.push({
        id: 'print_confirmation',
        label: 'Print Confirmation',
        icon: 'Printer',
        variant: 'default',
        onClick: show => logger.logUserAction('print_confirmation', 'show', { showId: show.id }),
      });
      break;

    case 'managing':
      // Edit show details
      if (userPermissions.includes(PERMISSIONS.SHOW_UPDATE)) {
        actions.push({
          id: 'edit_show',
          label: 'Edit Show',
          icon: 'Settings',
          variant: 'default',
          permission: PERMISSIONS.SHOW_UPDATE,
          onClick: show => logger.logUserAction('edit_show', 'show', { showId: show.id }),
        });
      }

      // Manage entries
      if (userPermissions.includes(PERMISSIONS.SHOW_MANAGE_ENTRIES)) {
        actions.push({
          id: 'manage_entries',
          label: 'Manage Entries',
          icon: 'Users',
          variant: 'default',
          permission: PERMISSIONS.SHOW_MANAGE_ENTRIES,
          onClick: show => logger.logUserAction('manage_entries', 'show', { showId: show.id }),
        });
      }

      // Generate reports
      actions.push({
        id: 'reports',
        label: 'Reports',
        icon: 'FileText',
        variant: 'default',
        onClick: show => logger.logUserAction('generate_reports', 'show', { showId: show.id }),
      });

      // Manage run order for upcoming/active shows
      if (isUpcoming || isActive) {
        actions.push({
          id: 'run_order',
          label: 'Run Order',
          icon: 'List',
          variant: 'default',
          onClick: show => logger.logUserAction('manage_run_order', 'show', { showId: show.id }),
        });
      }
      break;

    case 'assignments':
      // View assignment details
      if (userPermissions.includes(PERMISSIONS.JUDGE_VIEW_ASSIGNMENTS)) {
        actions.push({
          id: 'assignment_details',
          label: 'Assignment Details',
          icon: 'ClipboardList',
          variant: 'default',
          permission: PERMISSIONS.JUDGE_VIEW_ASSIGNMENTS,
          onClick: show => logger.logUserAction('view_assignment', 'show', { showId: show.id }),
        });
      }

      // Enter results for active/past shows
      if ((isActive || isPast) && userPermissions.includes(PERMISSIONS.JUDGE_ENTER_RESULTS)) {
        actions.push({
          id: 'enter_results',
          label: 'Enter Results',
          icon: 'Edit3',
          variant: 'default',
          permission: PERMISSIONS.JUDGE_ENTER_RESULTS,
          onClick: show => logger.logUserAction('enter_results', 'show', { showId: show.id }),
        });
      }

      // View class schedule
      actions.push({
        id: 'schedule',
        label: 'Class Schedule',
        icon: 'Calendar',
        variant: 'default',
        onClick: show => logger.logUserAction('view_schedule', 'show', { showId: show.id }),
      });

      // Generate judge reports
      if (isPast) {
        actions.push({
          id: 'judge_report',
          label: 'Judge Report',
          icon: 'FileOutput',
          variant: 'default',
          onClick: show =>
            logger.logUserAction('generate_judge_report', 'show', { showId: show.id }),
        });
      }
      break;
  }

  // Filter actions based on permissions
  return actions.filter(action => {
    if (action.permission && !userPermissions.includes(action.permission)) {
      return false;
    }
    if (action.requiresRelationship) {
      return action.requiresRelationship.some(rel => show.relationship.includes(rel));
    }
    return true;
  });
}

/**
 * Get quick actions for the top of each tab
 */
export function getTabQuickActions(currentTab: string, user: UserWithRoles | null): ShowAction[] {
  if (!user) return [];

  const userPermissions = user.permissions || [];
  const actions: ShowAction[] = [];

  switch (currentTab) {
    case 'all':
      // Create new show
      if (userPermissions.includes(PERMISSIONS.SHOW_CREATE)) {
        actions.push({
          id: 'create_show',
          label: 'New Show',
          icon: 'Plus',
          variant: 'default',
          permission: PERMISSIONS.SHOW_CREATE,
          onClick: () => {
            ShowPermissionValidator.auditAction('create_show_attempt', user, 'show', 'new', true);
            window.location.href = '/secretary/create-show/wizard';
          },
        });
      }

      // Bulk register (for club admins)
      if (userPermissions.includes(PERMISSIONS.REGISTRATION_BULK_OPERATIONS)) {
        actions.push({
          id: 'bulk_register',
          label: 'Bulk Register',
          icon: 'Users',
          variant: 'default',
          permission: PERMISSIONS.REGISTRATION_BULK_OPERATIONS,
          onClick: () => logger.logUserAction('bulk_register', 'shows', {}),
        });
      }
      break;

    case 'entries':
      // Quick entry search
      actions.push({
        id: 'search_entries',
        label: 'Search My Entries',
        icon: 'Search',
        variant: 'default',
        onClick: () => logger.logUserAction('search_entries', 'entries', {}),
      });

      // Export entries
      actions.push({
        id: 'export_entries',
        label: 'Export Entries',
        icon: 'Download',
        variant: 'default',
        onClick: () => logger.logUserAction('export_entries', 'entries', {}),
      });
      break;

    case 'managing':
      // Create new show
      if (userPermissions.includes(PERMISSIONS.SHOW_CREATE)) {
        actions.push({
          id: 'create_show',
          label: 'New Show',
          icon: 'Plus',
          variant: 'default',
          permission: PERMISSIONS.SHOW_CREATE,
          onClick: () => {
            ShowPermissionValidator.auditAction('create_show_attempt', user, 'show', 'new', true);
            window.location.href = '/secretary/create-show/wizard';
          },
        });
      }

      // Bulk show management
      if (userPermissions.includes(PERMISSIONS.SHOW_MANAGE)) {
        actions.push({
          id: 'bulk_manage',
          label: 'Bulk Actions',
          icon: 'Settings',
          variant: 'default',
          permission: PERMISSIONS.SHOW_MANAGE,
          onClick: () => logger.logUserAction('bulk_manage', 'shows', {}),
        });
      }

      // Show analytics
      actions.push({
        id: 'analytics',
        label: 'Analytics',
        icon: 'BarChart3',
        variant: 'default',
        onClick: () => {
          logger.logUserAction('view_analytics', 'shows', {});
          window.location.href = '/admin/analytics';
        },
      });
      break;

    case 'assignments':
      // Judge schedule overview
      actions.push({
        id: 'schedule_overview',
        label: 'Schedule Overview',
        icon: 'Calendar',
        variant: 'default',
        onClick: () => logger.logUserAction('view_schedule_overview', 'judge', {}),
      });

      // Judging reports
      actions.push({
        id: 'judging_reports',
        label: 'My Reports',
        icon: 'FileText',
        variant: 'default',
        onClick: () => logger.logUserAction('view_judging_reports', 'judge', {}),
      });
      break;
  }

  return actions;
}

/**
 * Get empty state content for each tab
 */
export interface EmptyStateContent {
  icon: string;
  title: string;
  description: string;
  actionLabel?: string | undefined;
  actionIcon?: string | undefined;
  onAction?: (() => void) | undefined;
}

export function getEmptyStateContent(
  currentTab: string,
  user: UserWithRoles | null
): EmptyStateContent {
  const userPermissions = user?.permissions || [];

  switch (currentTab) {
    case 'all':
      return {
        icon: 'Calendar',
        title: 'No upcoming shows',
        description:
          'There are no upcoming shows available at this time. Check back later or create a new show.',
        actionLabel: userPermissions.includes(PERMISSIONS.SHOW_CREATE) ? 'New Show' : undefined,
        actionIcon: 'Plus',
        onAction: userPermissions.includes(PERMISSIONS.SHOW_CREATE)
          ? () => (window.location.href = '/secretary/create-show/wizard')
          : undefined,
      };

    case 'past':
      return {
        icon: 'Archive',
        title: 'No past shows',
        description: 'No completed shows to display yet.',
        actionLabel: 'Browse All Shows',
        actionIcon: 'Eye',
        onAction: () => logger.logUserAction('navigate', 'shows', { target: 'all' }),
      };

    case 'entries':
      return {
        icon: 'UserPlus',
        title: 'No entries yet',
        description: "You haven't entered any shows yet. Browse available shows to get started.",
        actionLabel: 'Browse Shows',
        actionIcon: 'Search',
        onAction: () => logger.logUserAction('navigate', 'shows', { target: 'all' }),
      };

    case 'managing':
      return {
        icon: 'Settings',
        title: 'No shows to manage',
        description: 'You are not currently managing any shows.',
        actionLabel: userPermissions.includes(PERMISSIONS.SHOW_CREATE) ? 'New Show' : undefined,
        actionIcon: 'Plus',
        onAction: userPermissions.includes(PERMISSIONS.SHOW_CREATE)
          ? () => (window.location.href = '/secretary/create-show/wizard')
          : undefined,
      };

    case 'assignments':
      return {
        icon: 'Gavel',
        title: 'No judge assignments',
        description: 'You are not currently assigned to judge any shows.',
        actionLabel: 'View All Shows',
        actionIcon: 'Eye',
        onAction: () => logger.logUserAction('navigate', 'shows', { target: 'all' }),
      };

    default:
      return {
        icon: 'Search',
        title: 'No shows found',
        description: 'Try adjusting your filters to see more results.',
        actionLabel: 'Clear Filters',
        actionIcon: 'X',
        onAction: () => logger.logUserAction('clear_filters', 'shows', {}),
      };
  }
}
