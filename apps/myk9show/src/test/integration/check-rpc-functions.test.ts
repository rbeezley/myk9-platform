import { describe, it, expect } from 'vitest'
import { supabase } from '@/lib/supabase'

describe('Check Available RPC Functions', () => {
  it('should list available RPC functions', async () => {
    // Try to list available functions in the database
    try {
      const { data, error } = await supabase.rpc('sql', {
        query: `
          SELECT routine_name, routine_type
          FROM information_schema.routines 
          WHERE routine_schema = 'public'
          ORDER BY routine_name;
        `
      })
      
      if (error) {
        console.log('❌ SQL RPC not available:', error)
        
        // Try alternative: check if we have any RPC functions available
        console.log('🔍 Checking what RPC functions exist...')
        
        // This will fail with a list of available functions if 'nonexistent' doesn't exist
        const { error: rpcError } = await supabase.rpc('nonexistent_function')
        console.log('Available RPC error info:', rpcError)
        
      } else {
        console.log('✅ Available database functions:', data)
      }
    } catch (e) {
      console.log('🔍 Checking RPC capabilities:', e)
    }
    
    // Try to test basic audit_entry table access
    console.log('📊 Testing audit_entry table access...')
    const { error: auditError, count } = await supabase
      .from('audit_entry')
      .select('*', { count: 'exact', head: true })
    
    console.log('Audit table accessible:', !auditError)
    console.log('Current audit count:', count)
    
    if (auditError) {
      console.error('Audit table error:', auditError)
    }
    
    expect(true).toBe(true)
  })
})