import { UserWithRoles, Permission, PERMISSIONS, UserRole } from '@/types/auth-types';
import { Show } from '@/types/show-types';
import { ShowWithRelationship } from '@/types/unified-shows-types';

/**
 * Permission validation utilities for the unified shows interface
 * Provides centralized permission checking for enhanced security
 */

/**
 * Check if user has permission to view a specific show
 */
export function canViewShow(user: UserWithRoles | null, show: Show): boolean {
  // Guest users can view public shows (status values are lowercase post-migration 072)
  if (!user) {
    const s = show.status.toLowerCase();
    return s === 'upcoming' || s === 'completed' || s === 'published' || s === 'in_progress';
  }

  // Authenticated users can view all shows
  return true;
}

/**
 * Check if user has permission to create shows
 */
export function canCreateShow(user: UserWithRoles | null): boolean {
  if (!user) return false;

  const permissions = user.permissions || [];
  const roles = user.roles || [];

  return (
    permissions.includes(PERMISSIONS.SHOW_CREATE) ||
    roles.includes(UserRole.SECRETARY) ||
    roles.includes(UserRole.CLUB_ADMIN) ||
    roles.includes(UserRole.SITE_ADMIN)
  );
}

/**
 * Check if user has permission to edit a specific show
 */
export function canEditShow(user: UserWithRoles | null, show: ShowWithRelationship): boolean {
  if (!user) return false;

  const permissions = user.permissions || [];
  const roles = user.roles || [];

  // Site admins can edit any show
  if (roles.includes(UserRole.SITE_ADMIN)) return true;

  // Check if user has general show update permission
  if (!permissions.includes(PERMISSIONS.SHOW_UPDATE)) return false;

  // Check if user has management relationship with the show (secretary/chairman/steward via user_roles)
  return show.userCanManage;
}

/**
 * Check if user has permission to delete a specific show
 */
export function canDeleteShow(user: UserWithRoles | null, show: ShowWithRelationship): boolean {
  if (!user) return false;

  const permissions = user.permissions || [];
  const roles = user.roles || [];

  // Only site admins or users with explicit delete permission can delete shows
  if (roles.includes(UserRole.SITE_ADMIN)) return true;

  if (!permissions.includes(PERMISSIONS.SHOW_DELETE)) return false;

  // Additional checks for non-admin users
  // Officials (secretary/chairman) are now managed via user_roles — RLS enforces access at DB level
  return show.userCanManage;
}

/**
 * Check if user has permission to manage entries for a show
 */
export function canManageEntries(user: UserWithRoles | null, show: ShowWithRelationship): boolean {
  if (!user) return false;

  const permissions = user.permissions || [];
  const roles = user.roles || [];

  // Site admins can manage any show entries
  if (roles.includes(UserRole.SITE_ADMIN)) return true;

  // Check if user has entry management permission
  if (!permissions.includes(PERMISSIONS.SHOW_MANAGE_ENTRIES)) return false;

  // Check management relationship
  // Officials (secretary/chairman/chiefSteward) are now managed via user_roles — RLS enforces access at DB level
  return show.userCanManage;
}

/**
 * Check if user has permission to register for a show
 */
export function canRegisterForShow(user: UserWithRoles | null, show: Show): boolean {
  if (!user) return false;

  const now = new Date();
  const showStart = new Date(show.startDate);
  const entryClose = new Date(show.entryCloseDate);

  // Show must be upcoming and entries must be open
  if (showStart <= now || entryClose <= now) return false;

  // Show must be in 'Upcoming' status
  if (show.status !== 'Upcoming') return false;

  // All authenticated users can register (basic check)
  return true;
}

/**
 * Check if user can view judging assignments
 */
export function canViewJudgeAssignments(
  user: UserWithRoles | null,
  show: ShowWithRelationship
): boolean {
  if (!user) return false;

  const permissions = user.permissions || [];
  const roles = user.roles || [];

  // Admins and secretaries can view all assignments
  if (roles.includes(UserRole.SITE_ADMIN) || roles.includes(UserRole.SECRETARY)) return true;

  // Judges can view their own assignments
  if (roles.includes(UserRole.JUDGE)) {
    return show.assignedJudges?.some(j => j.judgeId === user.id) || false;
  }

  // Show managers can view assignments
  return show.userCanManage && permissions.includes(PERMISSIONS.SHOW_READ);
}

/**
 * Check if user can enter results/scores
 */
export function canEnterResults(user: UserWithRoles | null, show: ShowWithRelationship): boolean {
  if (!user) return false;

  const roles = user.roles || [];

  // Must be an assigned judge for the show
  if (roles.includes(UserRole.JUDGE)) {
    return show.assignedJudges?.some(j => j.judgeId === user.id) || false;
  }

  // Secretaries can enter results on behalf of judges
  if (roles.includes(UserRole.SECRETARY) && show.userCanManage) {
    return true;
  }

  // Site admins can enter results
  return roles.includes(UserRole.SITE_ADMIN);
}

/**
 * Get accessible tabs for a user based on permissions and relationships
 */
export function getAccessibleTabs(user: UserWithRoles | null): string[] {
  if (!user) {
    return ['all', 'past']; // Guests can only see public tabs
  }

  const tabs = ['all', 'past']; // Base tabs for authenticated users
  const roles = user.roles || [];

  // My Shows tab only for exhibitor/handler roles
  if (roles.includes(UserRole.EXHIBITOR)) {
    tabs.push('entries');
  }

  // My Shows tab for users who can manage shows
  if (
    roles.includes(UserRole.SECRETARY) ||
    roles.includes(UserRole.CLUB_ADMIN) ||
    roles.includes(UserRole.SITE_ADMIN)
  ) {
    tabs.push('managing');
  }

  // My Assignments tab for judges
  if (roles.includes(UserRole.JUDGE)) {
    tabs.push('assignments');
  }

  return tabs;
}

/**
 * Validate if user should see a specific tab
 */
export function canAccessTab(user: UserWithRoles | null, tabId: string): boolean {
  const accessibleTabs = getAccessibleTabs(user);
  return accessibleTabs.includes(tabId);
}

/**
 * Security audit: Log permission-related actions
 */
export function auditPermissionAction(
  _action: string,
  _user: UserWithRoles | null,
  _resource: string,
  _resourceId: string,
  _granted: boolean
): void {
  // Audit logging disabled - integrate with audit service in production
}

/**
 * Comprehensive permission check with audit logging
 */
export function checkPermissionWithAudit(
  permission: Permission,
  user: UserWithRoles | null,
  resource: string,
  resourceId: string = 'unknown'
): boolean {
  if (!user) {
    auditPermissionAction(permission, user, resource, resourceId, false);
    return false;
  }

  const permissions = user.permissions || [];
  const granted = permissions.includes(permission);

  auditPermissionAction(permission, user, resource, resourceId, granted);

  return granted;
}

/**
 * Role-based access check with audit logging
 */
export function checkRoleWithAudit(
  requiredRole: string,
  user: UserWithRoles | null,
  resource: string,
  resourceId: string = 'unknown'
): boolean {
  if (!user) {
    auditPermissionAction(`role:${requiredRole}`, user, resource, resourceId, false);
    return false;
  }

  const roles = user.roles || [];
  const granted = roles.includes(requiredRole as UserRole);

  auditPermissionAction(`role:${requiredRole}`, user, resource, resourceId, granted);

  return granted;
}

/**
 * Data filtering based on user permissions
 * Filters shows based on what user is allowed to see
 */
export function filterShowsByPermissions(shows: Show[], user: UserWithRoles | null): Show[] {
  if (!user) {
    // Guests can see public shows (status values are lowercase post-migration 072)
    return shows.filter(show => {
      const s = show.status.toLowerCase();
      return s === 'upcoming' || s === 'completed' || s === 'published' || s === 'in_progress';
    });
  }

  const roles = user.roles || [];

  // Site admins can see all shows
  if (roles.includes(UserRole.SITE_ADMIN)) {
    return shows;
  }

  // Other authenticated users can see all shows but with different access levels
  return shows;
}

/**
 * Enhanced permission validation for show actions
 */
export const ShowPermissionValidator = {
  canView: canViewShow,
  canCreate: canCreateShow,
  canEdit: canEditShow,
  canDelete: canDeleteShow,
  canManageEntries: canManageEntries,
  canRegister: canRegisterForShow,
  canViewJudgeAssignments: canViewJudgeAssignments,
  canEnterResults: canEnterResults,
  canAccessTab: canAccessTab,
  getAccessibleTabs: getAccessibleTabs,
  filterShows: filterShowsByPermissions,

  // Audit functions
  checkPermissionWithAudit,
  checkRoleWithAudit,
  auditAction: auditPermissionAction,
};
