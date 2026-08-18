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

/**
 * The club id every club-scoped canonical grant must land on: Heartland, the
 * demo club that owns the seeded show (supabase/seed-demo.sql section 1).
 */
export const CANONICAL_SCOPE_CLUB_ID = 'dededede-0000-0000-0000-000000000001';

export interface ClubScopeCandidate {
  id: string;
  createdAt: string | null;
}

/**
 * Pick the club that secretary/club_admin grants are scoped to.
 *
 * This used to be "whichever club sorts first by created_at", which was
 * unambiguous only because exactly one club existed. MYK9-137 seeds a second
 * club in the SAME INSERT, so both rows can carry an identical created_at and
 * the winner becomes whatever order Postgres happens to return — scoping the
 * canonical accounts to the wrong club roughly half the time, with the only
 * symptom a 403 on /secretary/* after a reseed.
 *
 * Heartland therefore wins outright when present. The oldest-then-lowest-id
 * fallback keeps this working on databases seeded before that club existed.
 */
export function resolveScopedClubId(clubs: readonly ClubScopeCandidate[]): string {
  const canonical = clubs.find(club => club.id === CANONICAL_SCOPE_CLUB_ID);
  if (canonical) return canonical.id;

  const [oldest] = [...clubs].sort((left, right) => {
    const byCreatedAt = (left.createdAt ?? '').localeCompare(right.createdAt ?? '');
    return byCreatedAt !== 0 ? byCreatedAt : left.id.localeCompare(right.id);
  });

  if (!oldest) throw new Error('Could not find a club for scoped test roles: none found');
  return oldest.id;
}

export interface ProvisionableAccount {
  email: string;
  passwordEnv: string;
  /** Accounts CI has no secret for. Skipped rather than fatal — see below. */
  optional?: boolean;
}

export interface AccountProvisioningPlan<T extends ProvisionableAccount> {
  provision: T[];
  skipped: T[];
  missingRequired: T[];
}

/**
 * Split canonical accounts into the ones this environment can provision and the
 * ones it cannot.
 *
 * A missing password used to abort the whole run. That is right for the canonical
 * five — a silently-unprovisioned secretary is the F1 403 bug all over again — but
 * it makes any NEW account un-addable: this script runs inside
 * scripts/qa/isolated-e2e-lifecycle.ts, so an account whose secret does not exist
 * yet would turn a green nightly red everywhere at once. Optional accounts are
 * therefore skipped with a warning, and required ones still abort.
 */
export function planAccountProvisioning<T extends ProvisionableAccount>(
  accounts: readonly T[],
  env: Record<string, string | undefined>
): AccountProvisioningPlan<T> {
  const plan: AccountProvisioningPlan<T> = { provision: [], skipped: [], missingRequired: [] };

  for (const account of accounts) {
    if (env[account.passwordEnv]) {
      plan.provision.push(account);
    } else if (account.optional) {
      plan.skipped.push(account);
    } else {
      plan.missingRequired.push(account);
    }
  }

  return plan;
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
