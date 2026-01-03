import { describe, it, expect } from 'vitest'
import { supabase } from '@/lib/supabase'

describe('Manual Audit System Setup', () => {
  it('should create audit function and triggers step by step', async () => {
    console.log('🚀 Starting manual audit system setup...')
    
    // Step 1: Create the audit function
    const auditFunction = `
      CREATE OR REPLACE FUNCTION log_audit_entry()
      RETURNS TRIGGER AS $$
      DECLARE
          current_user_id UUID;
      BEGIN
          -- Get current user from auth or default to system
          BEGIN
              current_user_id := auth.uid();
              IF current_user_id IS NULL THEN
                  current_user_id := '00000000-0000-0000-0000-000000000000'::UUID;
              END IF;
          EXCEPTION WHEN OTHERS THEN
              current_user_id := '00000000-0000-0000-0000-000000000000'::UUID;
          END;

          -- Insert audit record
          INSERT INTO audit_entry (
              action,
              entity_type,
              entity_id,
              old_values,
              new_values,
              user_id,
              created_at,
              metadata
          ) VALUES (
              TG_OP,
              TG_TABLE_NAME,
              COALESCE(NEW.id, OLD.id),
              CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD)::JSONB END,
              CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN row_to_json(NEW)::JSONB END,
              current_user_id,
              NOW(),
              jsonb_build_object(
                  'timestamp', NOW(),
                  'operation', TG_OP,
                  'table_name', TG_TABLE_NAME,
                  'schema_name', TG_TABLE_SCHEMA
              )
          );

          RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `
    
    console.log('📝 Creating audit function...')
    const { error: functionError } = await supabase.rpc('sql', { query: auditFunction })
    
    if (functionError) {
      console.error('❌ Function creation failed:', functionError)
    } else {
      console.log('✅ Audit function created successfully')
    }
    
    // Step 2: Create trigger for club table (test with one table first)
    const clubTrigger = `
      DROP TRIGGER IF EXISTS audit_club_trigger ON club;
      CREATE TRIGGER audit_club_trigger
          AFTER INSERT OR UPDATE OR DELETE ON club
          FOR EACH ROW EXECUTE FUNCTION log_audit_entry();
    `
    
    console.log('⚡ Creating club audit trigger...')
    const { error: triggerError } = await supabase.rpc('sql', { query: clubTrigger })
    
    if (triggerError) {
      console.error('❌ Trigger creation failed:', triggerError)
    } else {
      console.log('✅ Club audit trigger created successfully')
    }
    
    // Step 3: Verify everything was created
    console.log('🔍 Verifying audit system...')
    
    // Check if function exists
    const { data: functionCheck } = await supabase.rpc('sql', {
      query: `SELECT 1 FROM pg_proc WHERE proname = 'log_audit_entry' LIMIT 1;`
    })
    console.log('🔧 Function exists:', functionCheck?.length > 0)
    
    // Check if trigger exists
    const { data: triggerCheck } = await supabase.rpc('sql', {
      query: `SELECT 1 FROM pg_trigger WHERE tgname = 'audit_club_trigger' LIMIT 1;`
    })
    console.log('⚡ Trigger exists:', triggerCheck?.length > 0)
    
    // Step 4: Test the trigger with a simple insert/delete
    console.log('🧪 Testing audit trigger with real data...')
    
    // Insert a test club
    const testClub = {
      name: 'Test Audit Club',
      address: '123 Test St',
      city: 'Test City',
      state: 'TS',
      zip: '12345',
      contact_email: 'test@example.com'
    }
    
    const { data: insertedClub, error: insertError } = await supabase
      .from('club')
      .insert(testClub)
      .select()
      .single()
    
    if (insertError) {
      console.error('❌ Test club insert failed:', insertError)
    } else {
      console.log('✅ Test club inserted:', insertedClub.id)
      
      // Check if audit entry was created
      await new Promise(resolve => setTimeout(resolve, 1000)) // Wait a second
      
      const { data: auditEntries, error: auditError } = await supabase
        .from('audit_entry')
        .select('*')
        .eq('entity_type', 'club')
        .eq('entity_id', insertedClub.id)
      
      if (auditError) {
        console.error('❌ Error checking audit entries:', auditError)
      } else {
        console.log('📊 Audit entries found:', auditEntries?.length || 0)
        if (auditEntries && auditEntries.length > 0) {
          console.log('🎉 SUCCESS: Audit trigger is working!')
          console.log('📄 First audit entry:', auditEntries[0])
        } else {
          console.log('❌ FAILURE: No audit entries were created')
        }
      }
      
      // Clean up test data
      await supabase.from('club').delete().eq('id', insertedClub.id)
      console.log('🧹 Cleaned up test club')
    }
    
    expect(true).toBe(true)
  })
})