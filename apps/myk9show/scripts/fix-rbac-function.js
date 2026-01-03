const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://eergfbehjghvfqvzkhsu.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlcmdmYmVoamdodmZxdnpraHN1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTUwNTM1NiwiZXhwIjoyMDYxMDgxMzU2fQ.v-3F6uxGBhQTIgV1OgFR8LpGkGfPZ7JqIm9wxhEMkEM';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createRBACFunction() {
  console.log('🔧 Creating get_user_permissions function...');
  
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      -- Create get_user_permissions function for RBAC system
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
    `
  });

  if (error) {
    console.error('❌ Error creating function:', error);
  } else {
    console.log('✅ Function created successfully');
  }
}

// Alternative approach - direct SQL execution
async function createFunctionDirect() {
  console.log('🔧 Creating get_user_permissions function (direct approach)...');
  
  try {
    const { data, error } = await supabase
      .from('dummy') // This won't work, but let's try executing the function creation differently
      .select('*')
      .limit(0);
      
    // Let's try using the SQL editor endpoint directly
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey
      },
      body: JSON.stringify({
        sql: `
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
        `
      })
    });
    
    console.log('Function creation response:', await response.text());
  } catch (err) {
    console.error('Error in direct approach:', err);
  }
}

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

async function main() {
  // First test if function exists
  const functionExists = await testFunction();
  
  if (!functionExists) {
    // Try to create it
    await createRBACFunction();
    // Test again
    await testFunction();
    await createFunctionDirect();
    await testFunction();
  }
}

main().catch(console.error);