import { describe, it, expect } from 'vitest'
import { supabase } from '@/lib/supabase'

describe('Database Trigger Check', () => {
  it('should list all triggers in the database', async () => {
    // Query to check if audit triggers exist
    const { data: triggers, error } = await supabase
      .rpc('sql', {
        query: `
          SELECT 
            trigger_name,
            event_manipulation,
            event_object_table,
            action_statement
          FROM information_schema.triggers 
          WHERE trigger_schema = 'public'
          AND trigger_name LIKE '%audit%'
          ORDER BY event_object_table, trigger_name;
        `
      })

    if (error) {
      console.error('Error checking triggers:', error)
      // Fallback: Try direct query to pg_triggers
      const { data: pgTriggers, error: pgError } = await supabase
        .from('pg_triggers')
        .select('*')
        .ilike('tgname', '%audit%')

      if (pgError) {
        console.error('Error with pg_triggers:', pgError)
        
        // Last resort: Check if we can at least query the audit_entry table
        const { error: auditError, count } = await supabase
          .from('audit_entry')
          .select('*', { count: 'exact', head: true })

        console.log('Audit entry table exists:', !auditError)
        console.log('Current audit entry count:', count)
        
        expect(auditError).toBeNull()
      } else {
        console.log('PG Triggers found:', pgTriggers)
      }
    } else {
      console.log('Triggers found:', triggers)
      console.log('Number of audit triggers:', triggers?.length || 0)
    }
  })

  it('should check audit function exists', async () => {
    const { data, error } = await supabase
      .rpc('sql', {
        query: `
          SELECT routine_name, routine_type
          FROM information_schema.routines 
          WHERE routine_schema = 'public'
          AND routine_name LIKE '%audit%'
          ORDER BY routine_name;
        `
      })

    if (error) {
      console.error('Error checking functions:', error)
    } else {
      console.log('Audit functions found:', data)
    }
  })
})