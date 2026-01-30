// Create a secretary test user for Playwright E2E testing
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing required environment variables:');
  console.error('- VITE_SUPABASE_URL:', !!supabaseUrl);
  console.error('- SUPABASE_SERVICE_ROLE_KEY:', !!serviceRoleKey);
  process.exit(1);
}

// Create admin client with service role key
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export const SECRETARY_TEST_USER = {
  email: 'secretary@playwright.com',
  password: 'SecretaryTest123!',
  id: 'b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  firstName: 'Secretary',
  lastName: 'Tester'
};

async function createSecretaryTestUser() {
  console.log('Creating Playwright secretary test user...');

  try {
    // Check if user already exists
    const { data: existingUser } = await supabase.auth.admin.getUserById(SECRETARY_TEST_USER.id);

    if (existingUser.user) {
      console.log('Secretary test user already exists:', SECRETARY_TEST_USER.email);

      // Ensure the user has secretary role
      const { error: updateError } = await supabase
        .from('user')
        .update({ roles: ['secretary', 'exhibitor'] })
        .eq('user_id', SECRETARY_TEST_USER.id);

      if (updateError) {
        console.warn('Could not update roles:', updateError.message);
      } else {
        console.log('Roles updated to include secretary');
      }

      return existingUser.user;
    }

    // Create auth user
    console.log('Creating auth user...');
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      id: SECRETARY_TEST_USER.id,
      email: SECRETARY_TEST_USER.email,
      password: SECRETARY_TEST_USER.password,
      email_confirm: true,
      user_metadata: {
        first_name: SECRETARY_TEST_USER.firstName,
        last_name: SECRETARY_TEST_USER.lastName
      }
    });

    if (authError) {
      throw new Error(`Auth user creation failed: ${authError.message}`);
    }

    console.log('Auth user created:', authData.user.email);

    // Create public user record with secretary role
    console.log('Creating user profile with secretary role...');
    const { error: profileError } = await supabase
      .from('user')
      .insert([
        {
          user_id: SECRETARY_TEST_USER.id,
          first_name: SECRETARY_TEST_USER.firstName,
          last_name: SECRETARY_TEST_USER.lastName,
          email: SECRETARY_TEST_USER.email,
          roles: ['secretary', 'exhibitor']
        }
      ]);

    if (profileError) {
      console.warn('Profile creation failed (may already exist):', profileError.message);
    } else {
      console.log('User profile created with secretary role');
    }

    // Test authentication
    console.log('Testing authentication...');
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: SECRETARY_TEST_USER.email,
      password: SECRETARY_TEST_USER.password
    });

    if (signInError) {
      throw new Error(`Authentication test failed: ${signInError.message}`);
    }

    console.log('Authentication test passed');

    console.log('\nSecretary test user setup complete!');
    console.log('Email:', SECRETARY_TEST_USER.email);
    console.log('Password:', SECRETARY_TEST_USER.password);
    console.log('User ID:', SECRETARY_TEST_USER.id);
    console.log('Roles: secretary, exhibitor');

    return authData.user;

  } catch (error) {
    console.error('Failed to create secretary test user:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createSecretaryTestUser();
}

export { createSecretaryTestUser };
