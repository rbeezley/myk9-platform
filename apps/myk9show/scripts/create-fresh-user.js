import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createFreshUser() {
  console.log('🧪 Creating a fresh test user...');
  
  const testEmail = `test-fresh-${Date.now()}@example.com`;
  const testPassword = 'testpass123';
  
  console.log(`📧 Creating user: ${testEmail}`);
  
  try {
    // Try to sign up
    const { data, error } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: {
          role: 'exhibitor'
        }
      }
    });
    
    if (error) {
      console.log(`❌ Sign up error: ${error.message}`);
      return;
    }
    
    console.log(`✅ User created! ID: ${data.user?.id}`);
    console.log(`   Email confirmed: ${data.user?.email_confirmed_at ? 'Yes' : 'No'}`);
    console.log(`   Session: ${data.session ? 'Yes' : 'No'}`);
    
    // Wait a moment then try to sign in
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log(`\n🔑 Testing login...`);
    
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });
    
    if (loginError) {
      console.log(`❌ Login error: ${loginError.message}`);
    } else {
      console.log(`✅ Login successful! User ID: ${loginData.user?.id}`);
      await supabase.auth.signOut();
    }
    
  } catch (err) {
    console.log(`❌ Exception: ${err.message}`);
  }
}

createFreshUser().catch(console.error);