import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

console.log('Testing authentication with:');
console.log('URL:', supabaseUrl);
console.log('Key:', supabaseAnonKey ? 'Present' : 'Missing');

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testAuth() {
  console.log('\n🧪 Testing authentication...');
  
  const testUsers = [
    'test-admin@example.com',
    'test-secretary@example.com', 
    'test-judge@example.com',
    'test-exhibitor@example.com'
  ];
  
  for (const email of testUsers) {
    console.log(`\n📧 Testing ${email}...`);
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: 'testpass123'
      });
      
      if (error) {
        console.log(`❌ Error: ${error.message}`);
      } else {
        console.log(`✅ Success! User ID: ${data.user?.id}`);
        console.log(`   Email confirmed: ${data.user?.email_confirmed_at ? 'Yes' : 'No'}`);
        
        // Sign out
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.log(`❌ Exception: ${err.message}`);
    }
  }
}

testAuth().catch(console.error);