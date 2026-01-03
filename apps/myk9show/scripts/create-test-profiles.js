/**
 * Script to create missing user profiles for test accounts
 * Run this script to create user profiles in the public.user table
 * for auth users that don't have corresponding profiles
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables:');
  console.error('VITE_SUPABASE_URL:', !!supabaseUrl);
  console.error('SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey);
  process.exit(1);
}

// Create Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const testUsers = [
  {
    email: 'working-admin@example.com',
    firstName: 'Working',
    lastName: 'Admin',
    roles: ['site_admin']
  },
  {
    email: 'working-secretary@example.com',
    firstName: 'Working',
    lastName: 'Secretary',
    roles: ['secretary']
  },
  {
    email: 'working-exhibitor@example.com',
    firstName: 'Working',
    lastName: 'Exhibitor', 
    roles: ['exhibitor']
  },
  {
    email: 'working-judge@example.com',
    firstName: 'Working',
    lastName: 'Judge',
    roles: ['judge']
  }
];

async function createTestProfiles() {
  console.log('🔍 Fetching auth users...');
  
  // Get auth users for test emails
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
  
  if (authError) {
    console.error('❌ Error fetching auth users:', authError);
    return;
  }
  
  console.log(`📊 Found ${authUsers.users.length} auth users`);
  
  // Filter to our test users
  const testAuthUsers = authUsers.users.filter(user => 
    testUsers.some(testUser => testUser.email === user.email)
  );
  
  console.log(`🎯 Found ${testAuthUsers.length} test auth users`);
  
  // Check existing profiles
  const { data: existingProfiles, error: profileError } = await supabase
    .from('user')
    .select('id, email')
    .in('email', testUsers.map(u => u.email));
  
  if (profileError) {
    console.error('❌ Error checking existing profiles:', profileError);
    return;
  }
  
  console.log(`📋 Found ${existingProfiles.length} existing profiles`);
  
  // Create missing profiles
  const missingProfiles = [];
  
  for (const testUser of testUsers) {
    const authUser = testAuthUsers.find(u => u.email === testUser.email);
    const existingProfile = existingProfiles.find(p => p.email === testUser.email);
    
    if (authUser && !existingProfile) {
      missingProfiles.push({
        id: authUser.id,
        first_name: testUser.firstName,
        last_name: testUser.lastName,
        email: testUser.email,
        roles: testUser.roles,
        user_id: authUser.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  }
  
  if (missingProfiles.length === 0) {
    console.log('✅ All test user profiles already exist');
    return;
  }
  
  console.log(`🔧 Creating ${missingProfiles.length} missing profiles...`);
  
  // Insert missing profiles
  const { data: insertedProfiles, error: insertError } = await supabase
    .from('user')
    .insert(missingProfiles)
    .select();
  
  if (insertError) {
    console.error('❌ Error creating profiles:', insertError);
    return;
  }
  
  console.log(`✅ Successfully created ${insertedProfiles.length} profiles:`);
  insertedProfiles.forEach(profile => {
    console.log(`  - ${profile.email} (${profile.roles.join(', ')})`);
  });
}

async function verifyProfiles() {
  console.log('\n🔍 Verifying test user profiles...');
  
  const { data: profiles, error } = await supabase
    .from('user')
    .select('id, email, first_name, last_name, roles')
    .in('email', testUsers.map(u => u.email));
  
  if (error) {
    console.error('❌ Error verifying profiles:', error);
    return;
  }
  
  console.log(`📊 Verification results:`);
  testUsers.forEach(testUser => {
    const profile = profiles.find(p => p.email === testUser.email);
    if (profile) {
      console.log(`✅ ${testUser.email}: ${profile.first_name} ${profile.last_name} (${profile.roles.join(', ')})`);
    } else {
      console.log(`❌ ${testUser.email}: Profile missing`);
    }
  });
}

async function main() {
  try {
    console.log('🚀 Starting test profile creation...\n');
    
    await createTestProfiles();
    await verifyProfiles();
    
    console.log('\n✅ Test profile creation completed!');
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

main();