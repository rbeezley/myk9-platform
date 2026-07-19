/**
 * roleUiConstants
 * Shared vocabulary for RBAC role-management UI (single-user and bulk dialogs).
 * Moved verbatim from ManageUserRolesDialog.tsx — do not change values without
 * updating both consumers.
 */

import { UserRole } from '@/types/auth-types';

// Roles that must be scoped to a club
export const CLUB_SCOPED_ROLES = new Set<string>([UserRole.SECRETARY, UserRole.CLUB_ADMIN]);

// Roles that are permanently assigned and cannot be removed
export const LOCKED_ROLES = new Set<string>([UserRole.EXHIBITOR]);

export const ROLE_LABELS: Record<string, string> = {
  site_admin: 'Site Admin',
  secretary: 'Secretary',
  club_admin: 'Club Admin',
  judge: 'Judge',
  exhibitor: 'Exhibitor',
  steward: 'Steward',
  chairman: 'Chairman',
};

export const MANAGEABLE_ROLES = [
  UserRole.SITE_ADMIN,
  UserRole.SECRETARY,
  UserRole.CLUB_ADMIN,
  UserRole.JUDGE,
  UserRole.EXHIBITOR,
  UserRole.STEWARD,
  UserRole.CHAIRMAN,
];
