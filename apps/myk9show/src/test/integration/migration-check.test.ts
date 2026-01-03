import { describe, it } from 'vitest'
import { supabase } from '@/lib/supabase'

describe('Migration Status Check', () => {
  it('should show applied migrations', async () => {
    const { data, error } = await supabase
      .from('supabase_migrations.schema_migrations')
      .select('version, name')
      .order('version', { ascending: false })

    if (error) {
      console.error('Error checking migrations:', error)
    } else {
      console.log('Applied migrations:')
      data?.forEach(migration => {
        console.log(`  ${migration.version}: ${migration.name || 'No name'}`)
      })
    }
  })

  it('should check for audit objects directly', async () => {
    // Check tables
    const { data: tables } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .ilike('table_name', '%audit%')

    console.log('Audit tables:', tables?.map(t => t.table_name))

    // Check functions - try a direct approach
    try {
      const { data: functions } = await supabase.rpc('sql', {
        query: `
          SELECT proname as function_name 
          FROM pg_proc 
          WHERE proname LIKE '%audit%'
          AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
        `
      })
      console.log('Audit functions:', functions)
    } catch {
      console.log('Could not check functions via SQL')
    }

    // Check triggers
    try {
      const { data: triggers } = await supabase.rpc('sql', {
        query: `
          SELECT tgname as trigger_name, tgrelid::regclass as table_name
          FROM pg_trigger 
          WHERE tgname LIKE '%audit%';
        `
      })
      console.log('Audit triggers:', triggers)
    } catch {
      console.log('Could not check triggers via SQL')
    }
  })
})