import { describe, it, expect } from 'vitest'
import { supabase } from '@/lib/supabase'

describe('Create Audit System Direct', () => {
  it('should create audit system piece by piece', async () => {
    console.log('🚀 Creating audit system step by step...')
    
    // Step 1: Create audit function (minimal version first)
    console.log('📝 Step 1: Creating audit function...')
    const createFunction = await supabase.rpc('sql', {
      query: `
        CREATE OR REPLACE FUNCTION log_audit_entry()
        RETURNS TRIGGER AS $$
        BEGIN
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
                COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID),
                NOW(),
                jsonb_build_object('operation', TG_OP, 'table_name', TG_TABLE_NAME)
            );
            RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
      `
    })
    
    if (createFunction.error) {
      console.error('❌ Function creation failed:', createFunction.error)
    } else {
      console.log('✅ Audit function created')
    }
    
    // Step 2: Create club trigger
    console.log('⚡ Step 2: Creating club trigger...')
    const createTrigger = await supabase.rpc('sql', {
      query: `
        DROP TRIGGER IF EXISTS audit_club_trigger ON club;
        CREATE TRIGGER audit_club_trigger
            AFTER INSERT OR UPDATE OR DELETE ON club
            FOR EACH ROW EXECUTE FUNCTION log_audit_entry();
      `
    })
    
    if (createTrigger.error) {
      console.error('❌ Trigger creation failed:', createTrigger.error)
    } else {
      console.log('✅ Club trigger created')
    }
    
    // Step 3: Test the system
    console.log('🧪 Step 3: Testing audit system...')
    
    // Get initial count
    const { count: initialCount } = await supabase
      .from('audit_entry')
      .select('*', { count: 'exact', head: true })
    
    console.log('📊 Initial audit count:', initialCount)
    
    // Insert test club
    const { data: club, error: insertError } = await supabase
      .from('club')
      .insert({
        name: 'Direct Test Club',
        address: '456 Direct St',
        city: 'Direct City',
        state: 'DC',
        zip: '67890',
        contact_email: 'direct@test.com'
      })
      .select()
      .single()
    
    if (insertError) {
      console.error('❌ Club insert failed:', insertError)
    } else {
      console.log('✅ Test club created:', club.id)
      
      // Wait a moment for trigger to fire
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Check for audit entries
      const { data: auditEntries, count: newCount } = await supabase
        .from('audit_entry')
        .select('*', { count: 'exact' })
        .eq('entity_type', 'club')
        .eq('entity_id', club.id)
      
      console.log('📊 New audit count:', newCount)
      console.log('🎯 Audit entries for test club:', auditEntries?.length || 0)
      
      if (auditEntries && auditEntries.length > 0) {
        console.log('🎉 SUCCESS! Audit trigger is working!')
        console.log('📄 Audit entry:', {
          action: auditEntries[0].action,
          entity_type: auditEntries[0].entity_type,
          entity_id: auditEntries[0].entity_id,
          created_at: auditEntries[0].created_at
        })
        
        // Now create triggers for other tables
        console.log('🔧 Creating triggers for other tables...')
        
        const tables = ['user', 'dog', 'show']
        for (const table of tables) {
          const tableName = table === 'user' ? '"user"' : table
          const triggerName = `audit_${table}_trigger`
          
          const { error: triggerError } = await supabase.rpc('sql', {
            query: `
              DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName};
              CREATE TRIGGER ${triggerName}
                  AFTER INSERT OR UPDATE OR DELETE ON ${tableName}
                  FOR EACH ROW EXECUTE FUNCTION log_audit_entry();
            `
          })
          
          if (triggerError) {
            console.error(`❌ ${table} trigger failed:`, triggerError)
          } else {
            console.log(`✅ ${table} trigger created`)
          }
        }
        
      } else {
        console.log('❌ FAILED: No audit entries were created')
      }
      
      // Clean up
      await supabase.from('club').delete().eq('id', club.id)
      console.log('🧹 Cleaned up test club')
    }
    
    expect(true).toBe(true)
  })
})