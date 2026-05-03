import { UserRole, USER_ROLE_HIERARCHY } from '@/types/auth-types';

// Priority: SITE_ADMIN > SECRETARY > JUDGE > CLUB_ADMIN > CHAIRMAN > STEWARD > EXHIBITOR
export function getHighestRole(roles: UserRole[]): UserRole {
  return USER_ROLE_HIERARCHY.find(role => roles.includes(role)) ?? UserRole.EXHIBITOR;
}
