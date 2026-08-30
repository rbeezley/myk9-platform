import { Show } from '@/types/show-types';
import { UserWithRoles, PERMISSIONS, Permission } from '@/types/auth-types';
import { ShowRelationship } from '@/types/unified-shows-types';
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
 * Navigation for a quick action. Injected rather than imported because this
 * module is not a component and has no router of its own.
 *
 * These used to be `window.location.href = ...`, a full document load inside an
 * offline-first PWA: it tears down React state, refetches the bundle, and
 * offline it fails outright rather than routing to a cached view.
 *
 * There WAS a mechanism for this — `useOptimizedNavigation` set
 * `window.__NAVIGATE_FUNCTION__` "for compatibility with show-actions" — but
 * that hook had no consumers, so the global was never set and never read.
 * Reaching for it would have made these buttons do nothing at all, which is
 * why the navigator is now an explicit parameter: a missing one is a type
 * error rather than a silent no-op.
 */
export type ShowActionNavigate = (path: string) => void;

export function getTabQuickActions(
  currentTab: string,
  user: UserWithRoles | null,
  navigate: ShowActionNavigate
): ShowAction[] {
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
            navigate('/secretary/create-show/wizard');
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
            navigate('/secretary/create-show/wizard');
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
          navigate('/exhibitor/analytics');
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

