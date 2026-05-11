/**
 * Setup E2E Test Users in Supabase
 *
 * Creates test users for each role needed in E2E testing.
 * All users share a simple password: Test1234!
 *
 * Prerequisites:
 *   - VITE_SUPABASE_URL in .env or .env.local
 *   - SUPABASE_SERVICE_ROLE_KEY in .env or .env.local (get from Supabase dashboard)
 *
 * Usage:
 *   node scripts/setup-e2e-test-users.js
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables from the same files used during local development.
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing required environment variables:');
  console.error('- VITE_SUPABASE_URL:', !!supabaseUrl);
  console.error('- SUPABASE_SERVICE_ROLE_KEY:', !!serviceRoleKey);
  console.error('\nTo get SUPABASE_SERVICE_ROLE_KEY:');
  console.error('1. Go to Supabase dashboard');
  console.error('2. Settings -> API -> service_role key');
  console.error('3. Add to .env.local: SUPABASE_SERVICE_ROLE_KEY=your-key');
  process.exit(1);
}

// Create admin client with service role key
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Simple shared password for all test accounts
const TEST_PASSWORD = 'Test1234!';

// Test users to create
const TEST_USERS = [
  {
    email: 'e2e-exhibitor@test.myk9.com',
    firstName: 'Test',
    lastName: 'Exhibitor',
    roles: ['exhibitor']
  },
  {
    email: 'e2e-secretary@test.myk9.com',
    firstName: 'Test',
    lastName: 'Secretary',
    roles: ['secretary', 'exhibitor']
  },
  {
    email: 'e2e-judge@test.myk9.com',
    firstName: 'Test',
    lastName: 'Judge',
    roles: ['judge']
  },
  {
    email: 'e2e-clubadmin@test.myk9.com',
    firstName: 'Test',
    lastName: 'ClubAdmin',
    roles: ['club_admin', 'exhibitor']
  },
  {
    email: 'e2e-admin@test.myk9.com',
    firstName: 'Test',
    lastName: 'Admin',
    roles: ['site_admin', 'secretary', 'exhibitor']
  },
  {
    email: 'e2e-steward@test.myk9.com',
    firstName: 'Test',
    lastName: 'Steward',
    roles: ['steward']
  }
];

// Cache for role IDs
let roleIdCache = {};
let scopedClubId = null;

async function getRoleId(roleName) {
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

async function getScopedClubId() {
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
    throw new Error(`Could not find a club for scoped test roles: ${error?.message || 'none found'}`);
  }

  scopedClubId = data.id;
  console.log(`Using club scope for secretary/club_admin roles: ${data.name || data.id}`);
  return scopedClubId;
}

async function getRoleScope(roleName) {
  if (roleName === 'secretary' || roleName === 'club_admin') {
    return { club_id: await getScopedClubId(), show_id: null };
  }

  return { club_id: null, show_id: null };
}

function applyRoleScopeFilters(query, scope) {
  return Object.entries(scope).reduce((scopedQuery, [column, value]) => {
    return value === null ? scopedQuery.is(column, null) : scopedQuery.eq(column, value);
  }, query);
}

async function createTestUser(user) {
  const { email, firstName, lastName, roles } = user;

  console.log(`\nProcessing: ${email}`);

  try {
    // Check if auth user exists by email
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);

    let userId;

    if (existingUser) {
      console.log(`  Auth user exists: ${existingUser.id}`);
      userId = existingUser.id;
    } else {
      // Create new auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName
        }
      });

      if (authError) {
        throw new Error(`Auth creation failed: ${authError.message}`);
      }

      userId = authData.user.id;
      console.log(`  Auth user created: ${userId}`);
    }

    // Check/create people profile
    const { data: profile } = await supabase
      .from('people')
      .select('id, auth_user_id')
      .eq('auth_user_id', userId)
      .maybeSingle();

    let peopleId;

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
      // Create profile in people table
      const { data: newProfile, error: insertError } = await supabase
        .from('people')
        .insert({
          auth_user_id: userId,
          first_name: firstName,
          last_name: lastName,
          email
        })
        .select('id')
        .single();

      if (insertError) {
        console.warn(`  Could not create people profile: ${insertError.message}`);
      } else {
        peopleId = newProfile?.id;
        console.log('  People profile created');
      }
    }

    // Now assign roles in user_roles table (the RBAC system)
    // user_roles.user_id references people.id, not auth.users.id
    if (!peopleId) {
      console.warn(`  No people profile ID - cannot assign RBAC roles`);
    } else {
      for (const roleName of roles) {
        const roleId = await getRoleId(roleName);
        if (!roleId) {
          console.warn(`  Skipping role '${roleName}' - not found in roles table`);
          continue;
        }

        const scope = await getRoleScope(roleName);

        // Check if role assignment exists
        const existingRoleQuery = supabase
          .from('user_roles')
          .select('id')
          .eq('user_id', peopleId)
          .eq('role_id', roleId)
          .eq('is_active', true);

        const { data: existingRole } = await applyRoleScopeFilters(existingRoleQuery, scope).maybeSingle();

        if (existingRole) {
          console.log(`  Role '${roleName}' already assigned`);
        } else {
          // Create role assignment
          const { error: roleError } = await supabase
            .from('user_roles')
            .insert({
              user_id: peopleId,
              role_id: roleId,
              auth_user_id: userId,
              ...scope,
              granted_at: new Date().toISOString()
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
    console.error(`  FAILED: ${error.message}`);
    return { success: false, email, error: error.message };
  }
}

async function main() {
  console.log('========================================');
  console.log('E2E Test User Setup');
  console.log('========================================');
  console.log(`Password for all accounts: ${TEST_PASSWORD}`);

  // First, list available roles
  console.log('\nFetching available roles...');
  const { data: rolesData, error: rolesError } = await supabase
    .from('roles')
    .select('id, name, description');

  if (rolesError) {
    console.error('Could not fetch roles:', rolesError.message);
  } else {
    console.log('Available roles:');
    rolesData.forEach(r => {
      roleIdCache[r.name] = r.id;
      console.log(`  - ${r.name} (${r.id})`);
    });
  }

  const results = [];

  for (const user of TEST_USERS) {
    const result = await createTestUser(user);
    results.push(result);
  }

  console.log('\n========================================');
  console.log('Summary');
  console.log('========================================');

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\nSuccessful: ${successful.length}/${results.length}`);
  successful.forEach(r => console.log(`  - ${r.email}`));

  if (failed.length > 0) {
    console.log(`\nFailed: ${failed.length}/${results.length}`);
    failed.forEach(r => console.log(`  - ${r.email}: ${r.error}`));
  }

  console.log('\n========================================');
  console.log('Test Credentials');
  console.log('========================================');
  console.log(`Password: ${TEST_PASSWORD}`);
  console.log('\nAccounts:');
  TEST_USERS.forEach(u => {
    console.log(`  ${u.roles[0].padEnd(12)} : ${u.email}`);
  });
}

main().catch(console.error);
