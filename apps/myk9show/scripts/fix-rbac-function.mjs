import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://eergfbehjghvfqvzkhsu.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlcmdmYmVoamdodmZxdnpraHN1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTUwNTM1NiwiZXhwIjoyMDYxMDgxMzU2fQ.v-3F6uxGBhQTIgV1OgFR8LpGkGfPZ7JqIm9wxhEMkEM';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Test the function exists
async function testFunction() {
  console.log('🧪 Testing get_user_permissions function...');
  
  const { data, error } = await supabase.rpc('get_user_permissions', {
    p_user_id: '49bb6813-99c1-4f5a-a9fb-b596601a7353'
  });
  
  if (error) {
    console.error('❌ Function test failed:', error);
    return false;
  } else {
    console.log('✅ Function test successful:', data);
    return true;
  }
}

// Create function using SQL execution
async function createRBACFunction() {
  console.log('🔧 Creating get_user_permissions function...');
  
  // Let's create the function using a direct SQL approach
  const sql = `
    CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID)
    RETURNS TABLE(permission TEXT) AS $$
    BEGIN
      RETURN QUERY
      SELECT DISTINCT rp.permission
      FROM auth.users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN role_permissions rp ON ur.role = rp.role
      WHERE u.id = p_user_id;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `;

  try {
    // Try using the SQL editor API directly
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey
      },
      body: JSON.stringify({ query: sql })
    });
    
    if (response.ok) {
      console.log('✅ Function created successfully via SQL API');
      return true;
    } else {
      console.log('❌ SQL API response:', await response.text());
    }
  } catch (err) {
    console.error('❌ Error creating function via SQL API:', err);
  }
  
  return false;
}

async function main() {
  console.log('🚀 RBAC Function Fix Script');
  
  // First test if function exists
  const functionExists = await testFunction();
  
  if (!functionExists) {
    console.log('📝 Function missing, attempting to create...');
    const created = await createRBACFunction();
    
    if (created) {
      // Test again
      await testFunction();
    } else {
      console.log('❌ Could not create function automatically');
      console.log('💡 Please run this SQL manually in your Supabase SQL editor:');
      console.log(`
CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID)
RETURNS TABLE(permission TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT rp.permission
  FROM auth.users u
  JOIN user_roles ur ON u.id = ur.user_id
  JOIN role_permissions rp ON ur.role = rp.role
  WHERE u.id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_user_permissions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(UUID) TO anon;
      `);
    }
  } else {
    console.log('✅ Function already exists and working!');
  }
}

main().catch(console.error);