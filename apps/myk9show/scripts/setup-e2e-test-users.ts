/**
 * Setup E2E Test Users in Supabase.
 *
 * Each canonical account uses its own env-provided password; never print or
 * commit credentials.
 *
 * Usage:
 *   pnpm exec tsx scripts/setup-e2e-test-users.ts --dry-run
 *   pnpm exec tsx scripts/setup-e2e-test-users.ts --apply
 *
 * WARNING: --apply reconciles each canonical user's role grants and deactivates
 * stale grants. Run --dry-run first and review the role plan before mutating
 * the shared Supabase project.
 */

import { createClient, type User } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import {
  planAccountProvisioning,
  planRoleReconciliation,
  resolveEffectiveSetupMode,
  resolveScopedClubId,
  type ScopedRoleGrant,
} from './setup-e2e-test-users.helpers';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing required environment variables:');
  console.error('- VITE_SUPABASE_URL:', !!supabaseUrl);
  console.error('- SUPABASE_SERVICE_ROLE_KEY:', !!serviceRoleKey);
  console.error('\nAdd SUPABASE_SERVICE_ROLE_KEY from Supabase Settings → API to .env.local.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const authOnly = process.env.MYK9_E2E_AUTH_ONLY === 'true';
const setupMode = resolveEffectiveSetupMode(process.argv.slice(2), authOnly);
const isPreview = setupMode === 'preview';

interface TestUser {
  email: string;
  passwordEnv: string;
  firstName: string;
  lastName: string;
  roles: string[];
  /** Provisioned only where its password env is set; otherwise skipped. */
  optional?: boolean;
}

interface RoleScope {
  club_id: string | null;
  show_id: string | null;
}

type TestUserResult =
  | { success: true; email: string; userId: string }
  | { success: false; email: string; error: string };

const CANONICAL_TEST_USERS: TestUser[] = [
  {
    email: 'e2e-exhibitor@test.myk9.com',
    passwordEnv: 'E2E_DEMO_EXHIBITOR_PASSWORD',
    firstName: 'Test',
    lastName: 'Exhibitor',
    roles: ['exhibitor'],
  },
  {
    email: 'e2e-secretary@test.myk9.com',
    passwordEnv: 'E2E_SECRETARY_PASSWORD',
    firstName: 'Test',
    lastName: 'Secretary',
    roles: ['secretary', 'steward', 'exhibitor'],
  },
  {
    email: 'e2e-judge@test.myk9.com',
    passwordEnv: 'E2E_JUDGE_PASSWORD',
    firstName: 'Test',
    lastName: 'Judge',
    roles: ['judge'],
  },
  {
    email: 'e2e-judge-empty@test.myk9.com',
    passwordEnv: 'E2E_JUDGE_EMPTY_PASSWORD',
    firstName: 'Test',
    lastName: 'Judge No Assignments',
    roles: ['judge'],
  },
  {
    email: 'e2e-admin@test.myk9.com',
    passwordEnv: 'E2E_ADMIN_PASSWORD',
    firstName: 'Test',
    lastName: 'Admin',
    roles: ['site_admin', 'secretary', 'club_admin', 'chairman', 'exhibitor'],
  },
  // Club-scoped authority with NO site-wide role (MYK9-137). e2e-admin above is
  // both a site_admin and a club_admin, and every club gate is a disjunction
  // (`is_site_admin() OR is_club_admin(id)`), so it clears them through the site
  // branch and can never demonstrate that a club admin is confined to its club.
  //
  // Optional: provisioning it needs an E2E_CLUB_ADMIN_PASSWORD secret that does
  // not exist yet. Marked so, rather than added to the required set, because this
  // script runs inside scripts/qa/isolated-e2e-lifecycle.ts — a required account
  // with no secret would abort the nightly run outright.
  {
    email: 'e2e-club-admin@test.myk9.com',
    passwordEnv: 'E2E_CLUB_ADMIN_PASSWORD',
    firstName: 'Test',
    lastName: 'Club Admin',
    roles: ['club_admin'],
    optional: true,
  },
];

const provisioningPlan = planAccountProvisioning(CANONICAL_TEST_USERS, process.env);

if (provisioningPlan.missingRequired.length > 0) {
  for (const user of provisioningPlan.missingRequired) {
    console.error(
      `Refusing to run: set ${user.passwordEnv} for ${user.email} in apps/myk9show/.env.local`
    );
  }
  process.exit(1);
}

for (const user of provisioningPlan.skipped) {
  console.warn(
    `Skipping ${user.email}: ${user.passwordEnv} is not set. ` +
      'Club-scope tests that sign in as this account cannot run until it is.'
  );
}

const TEST_USERS = provisioningPlan.provision;

const roleIdCache: Record<string, string> = {};
let scopedClubId: string | null = null;

async function getRoleId(roleName: string): Promise<string | null> {
  if (roleIdCache[roleName]) {
    return roleIdCache[roleName];
  }

  const { data, error } = await supabase
    .from('roles')
    .select('id, name')
    .eq('name', roleName)
    .single();

  if (error || !data) {
    console.warn(`  Role '${roleName}' not found in roles table`);
    return null;
  }

  roleIdCache[roleName] = data.id;
  return data.id;
}

async function getScopedClubId(): Promise<string> {
  if (scopedClubId) {
    return scopedClubId;
  }

  // Every club, not just the first: with two seeded clubs sharing a created_at,
  // "order by created_at limit 1" is a coin flip, and losing it scopes the
  // canonical secretary/club_admin grants to the WRONG club (MYK9-137).
  const { data, error } = await supabase
    .from('clubs')
    .select('id, name, created_at')
    .order('created_at', { ascending: true });

  if (error || !data || data.length === 0) {
    throw new Error(
      `Could not find a club for scoped test roles: ${error?.message || 'none found'}`
    );
  }

  scopedClubId = resolveScopedClubId(
    data.map(club => ({ id: club.id, createdAt: club.created_at }))
  );
  const scopedClub = data.find(club => club.id === scopedClubId);
  console.log(
    `Using club scope for secretary/club_admin roles: ${scopedClub?.name || scopedClubId}`
  );
  return scopedClubId;
}

async function getRoleScope(roleName: string): Promise<RoleScope> {
  if (roleName === 'secretary' || roleName === 'club_admin') {
    return { club_id: await getScopedClubId(), show_id: null };
  }

  return { club_id: null, show_id: null };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function desiredRoleGrants(roleNames: readonly string[]): Promise<ScopedRoleGrant[]> {
  const desired: ScopedRoleGrant[] = [];

  for (const roleName of roleNames) {
    const roleId = await getRoleId(roleName);
    if (!roleId) throw new Error(`Required role '${roleName}' was not found`);
    const scope = await getRoleScope(roleName);
    desired.push({ roleId, clubId: scope.club_id, showId: scope.show_id });
  }

  return desired;
}

async function reconcileRoles(
  peopleId: string,
  authUserId: string,
  roleNames: readonly string[]
): Promise<void> {
  const desired = await desiredRoleGrants(roleNames);
  const { data, error } = await supabase
    .from('user_roles')
    .select('id, role_id, club_id, show_id, is_active')
    .eq('user_id', peopleId);

  if (error) throw new Error(`Role inventory failed: ${error.message}`);

  const plan = planRoleReconciliation(
    (data ?? []).map(grant => ({
      id: grant.id,
      roleId: grant.role_id,
      clubId: grant.club_id,
      showId: grant.show_id,
      isActive: grant.is_active,
    })),
    desired
  );

  console.log(
    `  Role plan: deactivate ${plan.deactivateIds.length}, reactivate ${plan.reactivateIds.length}, insert ${plan.insert.length}`
  );
  if (isPreview) return;

  if (plan.deactivateIds.length > 0) {
    const { error: deactivateError } = await supabase
      .from('user_roles')
      .update({ is_active: false })
      .in('id', plan.deactivateIds);
    if (deactivateError) throw new Error(`Role deactivation failed: ${deactivateError.message}`);
  }

  if (plan.reactivateIds.length > 0) {
    const { error: reactivateError } = await supabase
      .from('user_roles')
      .update({ is_active: true, auth_user_id: authUserId, expires_at: null })
      .in('id', plan.reactivateIds);
    if (reactivateError) throw new Error(`Role reactivation failed: ${reactivateError.message}`);
  }

  if (plan.insert.length > 0) {
    const { error: insertError } = await supabase.from('user_roles').insert(
      plan.insert.map(grant => ({
        user_id: peopleId,
        role_id: grant.roleId,
        club_id: grant.clubId,
        show_id: grant.showId,
        is_active: true,
        auth_user_id: authUserId,
        granted_at: new Date().toISOString(),
      }))
    );
    if (insertError) throw new Error(`Role insertion failed: ${insertError.message}`);
  }
}

async function createTestUser(user: TestUser): Promise<TestUserResult> {
  const { email, passwordEnv, firstName, lastName, roles } = user;
  const password = process.env[passwordEnv];

  if (!password) {
    return { success: false, email, error: `Missing ${passwordEnv}` };
  }

  console.log(`\nProcessing: ${email}`);

  try {
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = (existingUsers?.users as User[] | undefined)?.find(
      candidate => candidate.email === email
    );
    let userId: string;

    if (existingUser) {
      console.log(`  Auth user exists: ${existingUser.id}`);
      userId = existingUser.id;

      if (!isPreview) {
        const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
          user_metadata: { first_name: firstName, last_name: lastName },
        });

        if (updateError) {
          throw new Error(`Auth password update failed: ${updateError.message}`);
        }
        console.log(`  Auth password reset from ${passwordEnv}`);
      }
    } else {
      if (isPreview) {
        console.log('  Auth user missing: would create');
        return { success: true, email, userId: '' };
      }
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName },
      });

      if (authError || !authData.user) {
        throw new Error(`Auth creation failed: ${authError?.message || 'missing user'}`);
      }

      userId = authData.user.id;
      console.log(`  Auth user created: ${userId}`);
    }

    if (authOnly) {
      console.log('  Auth-only mode: profile and role setup delegated to isolated SQL');
      return { success: true, email, userId };
    }

    const { data: profile } = await supabase
      .from('people')
      .select('id, auth_user_id')
      .eq('auth_user_id', userId)
      .maybeSingle();

    let peopleId: string | undefined;

    if (profile) {
      peopleId = profile.id;
      if (!isPreview) {
        const { error: updateError } = await supabase
          .from('people')
          .update({ first_name: firstName, last_name: lastName, email })
          .eq('auth_user_id', userId);

        if (updateError) {
          throw new Error(`People profile update failed: ${updateError.message}`);
        }
        console.log('  People profile updated');
      }
    } else {
      if (isPreview) {
        console.log('  People profile missing: would create');
        return { success: true, email, userId };
      }
      const { data: newProfile, error: insertError } = await supabase
        .from('people')
        .insert({ auth_user_id: userId, first_name: firstName, last_name: lastName, email })
        .select('id')
        .single();

      if (insertError) throw new Error(`People profile creation failed: ${insertError.message}`);
      peopleId = newProfile?.id;
      console.log('  People profile created');
    }

    if (!peopleId) {
      throw new Error('No people profile ID - cannot reconcile RBAC roles');
    } else {
      await reconcileRoles(peopleId, userId, roles);
    }

    return { success: true, email, userId };
  } catch (error) {
    const message = errorMessage(error);
    console.error(`  FAILED: ${message}`);
    return { success: false, email, error: message };
  }
}

async function main(): Promise<void> {
  console.log('========================================');
  console.log('E2E Test User Setup');
  console.log('========================================');
  console.log(`Mode: ${setupMode}`);
  console.log(
    "Passwords: loaded from each account's E2E_*_PASSWORD env var; values are not printed"
  );

  if (authOnly) {
    console.log('\nAuth-only mode enabled; skipping PostgREST profile and role setup.');
  } else {
    console.log('\nFetching available roles...');
    const { data: rolesData, error: rolesError } = await supabase
      .from('roles')
      .select('id, name, description');

    if (rolesError) {
      console.error('Could not fetch roles:', rolesError.message);
    } else {
      console.log('Available roles:');
      for (const role of rolesData ?? []) {
        roleIdCache[role.name] = role.id;
        console.log(`  - ${role.name} (${role.id})`);
      }
    }
  }

  const results: TestUserResult[] = [];
  for (const user of TEST_USERS) {
    results.push(await createTestUser(user));
  }

  const successful = results.filter(
    (result): result is Extract<TestUserResult, { success: true }> => result.success
  );
  const failed = results.filter(
    (result): result is Extract<TestUserResult, { success: false }> => !result.success
  );

  console.log('\n========================================');
  console.log('Summary');
  console.log('========================================');
  console.log(`\nSuccessful: ${successful.length}/${results.length}`);
  successful.forEach(result => console.log(`  - ${result.email}`));

  if (failed.length > 0) {
    console.log(`\nFailed: ${failed.length}/${results.length}`);
    failed.forEach(result => console.log(`  - ${result.email}: ${result.error}`));
    process.exitCode = 1;
  }

  console.log('\n========================================');
  console.log('Test Credentials');
  console.log('========================================');
  console.log('Password: loaded from local/CI env; not printed');
  console.log('\nAccounts:');
  TEST_USERS.forEach(user => console.log(`  ${user.roles[0].padEnd(12)} : ${user.email}`));
}

main().catch(error => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
