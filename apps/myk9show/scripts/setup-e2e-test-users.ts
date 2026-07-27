/**
 * Setup E2E Test Users in Supabase.
 *
 * Each canonical account uses its own env-provided password; never print or
 * commit credentials.
 *
 * Usage: pnpm exec tsx scripts/setup-e2e-test-users.ts
 */

import { createClient, type User } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

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

interface TestUser {
  email: string;
  passwordEnv: string;
  firstName: string;
  lastName: string;
  roles: string[];
}

interface RoleScope {
  club_id: string | null;
  show_id: string | null;
}

type TestUserResult =
  | { success: true; email: string; userId: string }
  | { success: false; email: string; error: string };

const TEST_USERS: TestUser[] = [
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
    email: 'e2e-admin@test.myk9.com',
    passwordEnv: 'E2E_ADMIN_PASSWORD',
    firstName: 'Test',
    lastName: 'Admin',
    roles: ['site_admin', 'secretary', 'club_admin', 'chairman', 'exhibitor'],
  },
];

for (const user of TEST_USERS) {
  if (!process.env[user.passwordEnv]) {
    console.error(
      `Refusing to run: set ${user.passwordEnv} for ${user.email} in apps/myk9show/.env.local`
    );
    process.exit(1);
  }
}

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

  const { data, error } = await supabase
    .from('clubs')
    .select('id, name')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(
      `Could not find a club for scoped test roles: ${error?.message || 'none found'}`
    );
  }

  scopedClubId = data.id;
  console.log(`Using club scope for secretary/club_admin roles: ${data.name || data.id}`);
  return data.id;
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

      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName },
      });

      if (updateError) {
        throw new Error(`Auth password update failed: ${updateError.message}`);
      }
      console.log(`  Auth password reset from ${passwordEnv}`);
    } else {
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
      const { error: updateError } = await supabase
        .from('people')
        .update({ first_name: firstName, last_name: lastName, email })
        .eq('auth_user_id', userId);

      if (updateError) {
        console.warn(`  Could not update people profile: ${updateError.message}`);
      } else {
        console.log('  People profile updated');
      }
    } else {
      const { data: newProfile, error: insertError } = await supabase
        .from('people')
        .insert({ auth_user_id: userId, first_name: firstName, last_name: lastName, email })
        .select('id')
        .single();

      if (insertError) {
        console.warn(`  Could not create people profile: ${insertError.message}`);
      } else {
        peopleId = newProfile?.id;
        console.log('  People profile created');
      }
    }

    if (!peopleId) {
      console.warn('  No people profile ID - cannot assign RBAC roles');
    } else {
      for (const roleName of roles) {
        const roleId = await getRoleId(roleName);
        if (!roleId) {
          console.warn(`  Skipping role '${roleName}' - not found in roles table`);
          continue;
        }

        const scope = await getRoleScope(roleName);
        let existingRoleQuery = supabase
          .from('user_roles')
          .select('id')
          .eq('user_id', peopleId)
          .eq('role_id', roleId)
          .eq('is_active', true);

        existingRoleQuery =
          scope.club_id === null
            ? existingRoleQuery.is('club_id', null)
            : existingRoleQuery.eq('club_id', scope.club_id);
        existingRoleQuery =
          scope.show_id === null
            ? existingRoleQuery.is('show_id', null)
            : existingRoleQuery.eq('show_id', scope.show_id);

        const { data: existingRole } = await existingRoleQuery.maybeSingle();

        if (existingRole) {
          console.log(`  Role '${roleName}' already assigned`);
        } else {
          const { error: roleError } = await supabase.from('user_roles').insert({
            user_id: peopleId,
            role_id: roleId,
            auth_user_id: userId,
            ...scope,
            granted_at: new Date().toISOString(),
          });

          if (roleError) {
            console.warn(`  Could not assign role '${roleName}': ${roleError.message}`);
          } else {
            console.log(`  Role '${roleName}' assigned via user_roles`);
          }
        }
      }
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
