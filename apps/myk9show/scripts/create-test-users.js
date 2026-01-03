#!/usr/bin/env node

/**
 * Test User Creation Script for myK9Show
 * Creates standardized test users with proper role assignments
 * 
 * Usage: node scripts/create-test-users.js
 * 
 * Requirements:
 * - VITE_SUPABASE_URL in .env
 * - SUPABASE_SERVICE_ROLE_KEY in .env (service role, not anon key)
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import path from 'path'

// Load environment variables
config()

// Validate environment variables
if (!process.env.VITE_SUPABASE_URL) {
  console.error('❌ VITE_SUPABASE_URL is required in .env file')
  process.exit(1)
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required in .env file')
  console.log('ℹ️  This must be the service_role key, not the anon key')
  process.exit(1)
}

// Initialize Supabase client with service role key
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Role mappings from database
const ROLE_MAP = {
  'testadmin@example.com': 'f2b71ca0-5744-472f-93a0-dad01c86143c',     // site_admin
  'testsecretary@example.com': 'edbe3429-0083-465c-b16b-037098965941', // secretary
  'testjudge@example.com': 'b81a1987-4162-455a-9285-942b4d8fc826',     // judge
  'testclubadmin@example.com': '300e718e-c211-48f4-a7b4-f65fbbd76f9d', // club_admin
  'testexhibitor@example.com': '3d2003e7-80ea-4386-8b0f-2b6692107f67'  // exhibitor
}

// Standardized test users
const TEST_USERS = [
  { 
    email: 'testadmin@example.com', 
    password: 'TestAdmin123!', 
    first_name: 'Test', 
    last_name: 'Admin',
    role: 'Site Administrator'
  },
  { 
    email: 'testsecretary@example.com', 
    password: 'TestSecretary123!', 
    first_name: 'Test', 
    last_name: 'Secretary',
    role: 'Show Secretary'
  },
  { 
    email: 'testjudge@example.com', 
    password: 'TestJudge123!', 
    first_name: 'Test', 
    last_name: 'Judge',
    role: 'Judge'
  },
  { 
    email: 'testclubadmin@example.com', 
    password: 'TestClubAdmin123!', 
    first_name: 'Test', 
    last_name: 'ClubAdmin',
    role: 'Club Administrator'
  },
  { 
    email: 'testexhibitor@example.com', 
    password: 'TestExhibitor123!', 
    first_name: 'Test', 
    last_name: 'Exhibitor',
    role: 'Exhibitor'
  }
]

async function cleanupExistingUsers() {
  console.log('🧹 Cleaning up existing test users...')
  
  const emails = TEST_USERS.map(u => u.email)
  
  try {
    // Get existing users
    const { data: existingUsers, error: fetchError } = await supabase.auth.admin.listUsers()
    
    if (fetchError) {
      console.error('Failed to fetch existing users:', fetchError.message)
      return
    }

    const testUsersToDelete = existingUsers.users.filter(user => 
      emails.includes(user.email)
    )

    // Delete existing test users
    for (const user of testUsersToDelete) {
      const { error } = await supabase.auth.admin.deleteUser(user.id)
      if (error) {
        console.error(`Failed to delete ${user.email}:`, error.message)
      } else {
        console.log(`🗑️  Deleted existing user: ${user.email}`)
      }
    }

  } catch (error) {
    console.error('Error during cleanup:', error.message)
  }
}

async function createTestUsers() {
  console.log('👥 Creating standardized test users...\n')
  
  const createdUsers = []

  for (const user of TEST_USERS) {
    try {
      console.log(`Creating ${user.role}: ${user.email}`)
      
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        user_metadata: { 
          first_name: user.first_name, 
          last_name: user.last_name 
        },
        email_confirm: true
      })

      if (error) {
        console.error(`❌ Failed to create ${user.email}:`, error.message)
        continue
      }

      console.log(`✅ Created ${user.email} with ID: ${data.user.id}`)
      createdUsers.push({ 
        ...user, 
        id: data.user.id,
        auth_user: data.user
      })

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100))

    } catch (error) {
      console.error(`❌ Error creating ${user.email}:`, error.message)
    }
  }

  return createdUsers
}

async function assignRoles(createdUsers) {
  console.log('\n🔐 Assigning user roles...')
  
  for (const user of createdUsers) {
    try {
      const roleId = ROLE_MAP[user.email]
      
      if (!roleId) {
        console.error(`❌ No role mapping found for ${user.email}`)
        continue
      }

      // Insert into user_role table
      const { error } = await supabase
        .from('user_role')
        .insert({
          user_id: user.id,
          role_id: roleId,
          is_active: true,
          assigned_at: new Date().toISOString()
        })

      if (error) {
        console.error(`❌ Failed to assign role to ${user.email}:`, error.message)
      } else {
        console.log(`✅ Assigned ${user.role} role to ${user.email}`)
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100))

    } catch (error) {
      console.error(`❌ Error assigning role to ${user.email}:`, error.message)
    }
  }
}

async function verifyUsers() {
  console.log('\n🔍 Verifying created users...')
  
  try {
    const { data, error } = await supabase
      .from('user')
      .select(`
        email,
        first_name,
        last_name,
        user_id,
        user_role (
          is_active,
          role (
            name,
            display_name
          )
        )
      `)
      .in('email', TEST_USERS.map(u => u.email))

    if (error) {
      console.error('❌ Failed to verify users:', error.message)
      return
    }

    console.log('\n📊 User Verification Summary:')
    console.log('━'.repeat(80))
    
    data.forEach(user => {
      const role = user.user_role?.[0]?.role
      const isActive = user.user_role?.[0]?.is_active
      
      console.log(`👤 ${user.email}`)
      console.log(`   Name: ${user.first_name} ${user.last_name}`)
      console.log(`   ID: ${user.user_id}`)
      console.log(`   Role: ${role?.display_name || 'No role assigned'} ${isActive ? '✅' : '❌'}`)
      console.log('')
    })

  } catch (error) {
    console.error('❌ Error during verification:', error.message)
  }
}

async function generatePlaywrightConfig(createdUsers) {
  console.log('\n⚙️ Generating Playwright configuration...')
  
  const playwrightConfig = {
    TEST_USERS: {}
  }

  createdUsers.forEach(user => {
    const key = user.email.split('@')[0].toUpperCase().replace('TEST', '')
    playwrightConfig.TEST_USERS[key] = {
      email: user.email,
      password: user.password,
      id: user.id
    }
  })

  console.log('\n📝 Add this to your Playwright test configuration:')
  console.log('━'.repeat(50))
  console.log(JSON.stringify(playwrightConfig, null, 2))
  console.log('━'.repeat(50))
}

async function main() {
  console.log('🚀 myK9Show Test User Setup')
  console.log('═'.repeat(50))
  
  try {
    // Clean up existing test users
    await cleanupExistingUsers()
    
    // Create new test users
    const createdUsers = await createTestUsers()
    
    if (createdUsers.length === 0) {
      console.error('❌ No users were created successfully')
      process.exit(1)
    }
    
    // Assign roles
    await assignRoles(createdUsers)
    
    // Verify everything worked
    await verifyUsers()
    
    // Generate Playwright config
    await generatePlaywrightConfig(createdUsers)
    
    console.log('\n🎉 Test user setup completed successfully!')
    console.log('\nNext steps:')
    console.log('1. Update your Playwright test configuration with the generated config above')
    console.log('2. Test login with each user to verify authentication works')
    console.log('3. Verify role-based permissions are working correctly')
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message)
    process.exit(1)
  }
}

// Run the script
main().catch(console.error)