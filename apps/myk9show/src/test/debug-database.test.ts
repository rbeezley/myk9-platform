/**
 * Database Debug Tool
 * 
 * This tool helps debug database connectivity, RLS policies, and permissions.
 * Run this before integration tests to identify potential issues.
 */

import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

describe('Database Connectivity and Permissions Debug', () => {
  it('should connect to Supabase', async () => {
    console.log('🔗 Testing Supabase connection...');
    console.log(`URL: ${supabaseUrl}`);
    console.log(`Key: ${supabaseAnonKey.slice(0, 20)}...`);
    
    // Simple connection test
    const { data, error } = await supabase.from('club').select('count');
    console.log('Connection test result:', { data, error });
  });

  it('should list all available tables', async () => {
    console.log('📋 Checking available tables...');
    
    const tables = [
      'club', 'user', 'dog', 'show', 'trial', 'class', 'entry',
      'result', 'health_record', 'achievement'
    ];
    
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('id')
        .limit(1);
      
      console.log(`Table '${table}':`, {
        accessible: error === null,
        error: error?.message || 'none',
        recordCount: data?.length || 0
      });
    }
  });

  it('should test simple insert permissions', async () => {
    console.log('🔒 Testing insert permissions...');
    
    // Test club insert (simplest table)
    const testData = {
      name: 'Debug Test Club',
      email: 'debug@test.com'
    };
    
    const { data, error } = await supabase
      .from('club')
      .insert(testData)
      .select()
      .single();
    
    console.log('Insert test result:', { 
      success: error === null,
      data: data ? { id: data.id, name: data.name } : null,
      error: error ? {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      } : null
    });
    
    // Clean up if successful
    if (data?.id) {
      await supabase.from('club').delete().eq('id', data.id);
      console.log('✅ Cleanup completed');
    }
  });

  it('should check RLS policies', async () => {
    console.log('🛡️ Checking RLS policy information...');
    
    // This query checks if RLS policies exist and are accessible
    const { data, error } = await supabase.rpc('check_rls_policies', {});
    
    console.log('RLS policy check:', { data, error });
    
    // Alternative: Try to query system tables (might not work with RLS)
    const { data: policies, error: policyError } = await supabase
      .from('pg_policies')
      .select('*')
      .limit(5);
    
    console.log('System policies query:', { 
      accessible: policyError === null,
      error: policyError?.message || 'none',
      policyCount: policies?.length || 0
    });
  });

  it('should test field requirements', async () => {
    console.log('📝 Testing required fields...');
    
    // Test what happens with minimal data
    const minimalClub = { name: 'Minimal Test' };
    
    const { error } = await supabase
      .from('club')
      .insert(minimalClub)
      .select()
      .single();
    
    console.log('Minimal data test:', {
      success: error === null,
      errorType: error?.message || 'none',
      requiredFields: error?.details || 'none identified'
    });
  });

  it('should provide debugging recommendations', () => {
    console.log('💡 Debugging Recommendations:');
    console.log('1. Check if all table names are singular (club, not clubs)');
    console.log('2. Verify RLS policies allow anon access for testing');
    console.log('3. Check required fields in database schema');
    console.log('4. Ensure foreign key relationships are properly set');
    console.log('5. Verify environment variables are correct');
    console.log('6. Check Supabase dashboard for detailed error logs');
    
    // Always pass this test
    expect(true).toBe(true);
  });
});
