import { UserRole } from '@/types/auth-types';

export const RINGSIDE_STAFF_ROLES: readonly UserRole[] = [
  UserRole.SITE_ADMIN,
  UserRole.SECRETARY,
  UserRole.CLUB_ADMIN,
  UserRole.CHAIRMAN,
  UserRole.JUDGE,
  UserRole.STEWARD,
];

export function hasRingsideStaffRole(hasRole: (role: UserRole) => boolean): boolean {
  return RINGSIDE_STAFF_ROLES.some(role => hasRole(role));
}
