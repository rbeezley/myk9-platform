#!/usr/bin/env node
/**
 * Script to create the Playwright test user in Supabase
 * This creates the actual auth.users record needed for testing
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEST_USER = {
  email: 'test@playwright.com',
  password: 'TestUser123!',
  user_metadata: {
    first_name: 'Test',
    last_name: 'User'
  }
};

async function createTestUser() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing environment variables:');
    console.error('   VITE_SUPABASE_URL:', SUPABASE_URL ? '✅' : '❌');
    console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌');
    console.error('\n💡 Please set these in your .env file');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    console.log('🔧 Creating Playwright test user...');
    
    // Create the user in auth.users using the admin API
    const { data, error } = await supabase.auth.admin.createUser({
      email: TEST_USER.email,
      password: TEST_USER.password,
      email_confirm: true, // Skip email confirmation for testing
      user_metadata: TEST_USER.user_metadata
    });

    if (error) {
      if (error.message.includes('already been registered')) {
        console.log('✅ Test user already exists');
        return;
      }
      throw error;
    }

    console.log('✅ Test user created successfully!');
    console.log('📧 Email:', TEST_USER.email);
    console.log('🔑 Password:', TEST_USER.password);
    console.log('🆔 User ID:', data.user?.id);
    
    // The user profile should be automatically created by the database trigger
    console.log('\n🎯 The user profile will be created automatically by database triggers');
    console.log('💡 You can now run Playwright tests with this user');

  } catch (error) {
    console.error('❌ Error creating test user:', error.message);
    process.exit(1);
  }
}

// Run the script
createTestUser();