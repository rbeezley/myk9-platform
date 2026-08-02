export interface ScopedRoleGrant {
  roleId: string;
  clubId: string | null;
  showId: string | null;
}

export interface ExistingScopedRoleGrant extends ScopedRoleGrant {
  id: string;
  isActive: boolean;
}

export interface RoleReconciliationPlan {
  deactivateIds: string[];
  reactivateIds: string[];
  insert: ScopedRoleGrant[];
}

export type SetupMode = 'preview' | 'apply';

export function resolveSetupMode(args: readonly string[]): SetupMode {
  const preview = args.includes('--dry-run');
  const apply = args.includes('--apply');

  if (preview === apply) {
    throw new Error('E2E account setup requires exactly one of --dry-run or --apply');
  }

  return preview ? 'preview' : 'apply';
}

/**
 * Auth-only setup is the CI default, but an explicit --dry-run must always
 * remain a non-mutating preview. This keeps the safety flag authoritative even
 * when MYK9_E2E_AUTH_ONLY=true is inherited from the test runner.
 */
export function resolveEffectiveSetupMode(args: readonly string[], authOnly: boolean): SetupMode {
  if (args.includes('--dry-run') || args.includes('--apply')) {
    return resolveSetupMode(args);
  }
  if (authOnly) return 'apply';
  return resolveSetupMode(args);
}

function grantKey(grant: ScopedRoleGrant): string {
  return [grant.roleId, grant.clubId ?? '', grant.showId ?? ''].join(':');
}

export function planRoleReconciliation(
  existing: readonly ExistingScopedRoleGrant[],
  desired: readonly ScopedRoleGrant[]
): RoleReconciliationPlan {
  const desiredKeys = new Set(desired.map(grantKey));
  const existingByKey = new Map(existing.map(grant => [grantKey(grant), grant]));

  return {
    deactivateIds: existing
      .filter(grant => grant.isActive && !desiredKeys.has(grantKey(grant)))
      .map(grant => grant.id),
    reactivateIds: desired
      .map(grant => existingByKey.get(grantKey(grant)))
      .filter((grant): grant is ExistingScopedRoleGrant => Boolean(grant && !grant.isActive))
      .map(grant => grant.id),
    insert: desired.filter(grant => !existingByKey.has(grantKey(grant))),
  };
}
