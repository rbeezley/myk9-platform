import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const workingTestUsers = [
  { email: 'working-admin@example.com', password: 'testpass123', role: 'admin' },
  { email: 'working-secretary@example.com', password: 'testpass123', role: 'secretary' },
  { email: 'working-judge@example.com', password: 'testpass123', role: 'judge' },
  { email: 'working-exhibitor@example.com', password: 'testpass123', role: 'exhibitor' }
];

async function createWorkingTestUsers() {
  console.log('🧪 Creating working test users...');
  
  for (const user of workingTestUsers) {
    console.log(`\n📧 Creating ${user.email}...`);
    
    try {
      // Sign up user
      const { data, error } = await supabase.auth.signUp({
        email: user.email,
        password: user.password,
        options: {
          data: {
            role: user.role
          }
        }
      });
      
      if (error) {
        if (error.message.includes('already registered')) {
          console.log(`⚠️  User ${user.email} already exists, testing login...`);
        } else {
          console.log(`❌ Error creating ${user.email}: ${error.message}`);
          continue;
        }
      } else {
        console.log(`✅ Created ${user.email} (ID: ${data.user?.id})`);
      }
      
      // Wait a moment then test login
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: user.password
      });
      
      if (loginError) {
        console.log(`❌ Login test failed: ${loginError.message}`);
      } else {
        console.log(`✅ Login test passed for ${user.email}`);
        await supabase.auth.signOut();
      }
      
    } catch (err) {
      console.log(`❌ Exception for ${user.email}: ${err.message}`);
    }
  }
  
  console.log('\n🎉 Working test users setup complete!');
  console.log('\nYou can now use these credentials in tests:');
  workingTestUsers.forEach(user => {
    console.log(`- ${user.role}: ${user.email} / ${user.password}`);
  });
}

createWorkingTestUsers().catch(console.error);