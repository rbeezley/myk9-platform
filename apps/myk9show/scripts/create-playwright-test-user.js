// Create a real test user for Playwright testing
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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

const TEST_USER = {
  email: 'test@playwright.com',
  password: 'TestUser123!',
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  firstName: 'Playwright',
  lastName: 'Tester'
};

async function createTestUser() {
  console.log('🎭 Creating Playwright test user...');
  
  try {
    // Check if user already exists
    const { data: existingUser } = await supabase.auth.admin.getUserById(TEST_USER.id);
    
    if (existingUser.user) {
      console.log('✅ Test user already exists:', TEST_USER.email);
      return existingUser.user;
    }

    // Create auth user
    console.log('👤 Creating auth user...');
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      id: TEST_USER.id,
      email: TEST_USER.email,
      password: TEST_USER.password,
      email_confirm: true,
      user_metadata: {
        first_name: TEST_USER.firstName,
        last_name: TEST_USER.lastName
      }
    });

    if (authError) {
      throw new Error(`Auth user creation failed: ${authError.message}`);
    }

    console.log('✅ Auth user created:', authData.user.email);

    // Create public user record
    console.log('📝 Creating user profile...');
    const { error: profileError } = await supabase
      .from('user')
      .insert([
        {
          user_id: TEST_USER.id,
          first_name: TEST_USER.firstName,
          last_name: TEST_USER.lastName,
          email: TEST_USER.email,
          roles: ['exhibitor']
        }
      ]);

    if (profileError) {
      console.warn('⚠️ Profile creation failed (may already exist):', profileError.message);
    } else {
      console.log('✅ User profile created');
    }

    // Test authentication
    console.log('🔐 Testing authentication...');
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: TEST_USER.email,
      password: TEST_USER.password
    });

    if (signInError) {
      throw new Error(`Authentication test failed: ${signInError.message}`);
    }

    console.log('✅ Authentication test passed');

    // Test data access
    console.log('📊 Testing data access...');
    supabase.auth.setSession(signInData.session);
    
    const { data: shows, error: showsError } = await supabase
      .from('show')
      .select('id, name')
      .limit(3);

    if (showsError) {
      console.warn('⚠️ Data access test failed:', showsError.message);
    } else {
      console.log(`✅ Data access test passed - found ${shows.length} shows`);
    }

    console.log('\n🎉 Playwright test user setup complete!');
    console.log('📧 Email:', TEST_USER.email);
    console.log('🔑 Password:', TEST_USER.password);
    console.log('🆔 User ID:', TEST_USER.id);
    
    return authData.user;

  } catch (error) {
    console.error('❌ Failed to create test user:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createTestUser();
}

export { createTestUser, TEST_USER };