import { ScopeType, UserRole, type RoleScope } from '@/types/auth-types';

/** Role names `is_trial_secretary` accepts (`trial_secretary` is not a UserRole). */
const SECRETARY_ROLE_NAMES: readonly string[] = [UserRole.SECRETARY, 'trial_secretary'];

export interface SecretaryAppointments {
  clubIds: string[];
  showCount: number;
}

/**
 * The secretary appointments a user actually holds, read from their RBAC
 * scopes — club-level grants (grant_club_secretary) and show-level ones.
 */
export function getSecretaryAppointments(scopes: readonly RoleScope[]): SecretaryAppointments {
  const clubIds = new Set<string>();
  const showIds = new Set<string>();
  for (const scope of scopes) {
    if (!SECRETARY_ROLE_NAMES.includes(scope.roleId)) continue;
    if (scope.scopeType === ScopeType.CLUB) clubIds.add(scope.scopeId);
    if (scope.scopeType === ScopeType.SHOW) showIds.add(scope.scopeId);
  }
  return { clubIds: [...clubIds], showCount: showIds.size };
}
