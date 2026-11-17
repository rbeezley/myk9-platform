import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { latestDefinitions, latestViewDefinition, migrationsDir } from './migrationTextScanners';

// MYK9-2031: entries left as "I'll decide at the show" are flagged for the secretary. Static SQL
// contracts over the migration text; the behavioral counterpart
// (supabase/tests/myk9_2031_handler_to_decide_test.sql) only runs in CI.

const FILE = '20261117062300_myk9_2031_handler_to_decide.sql';
const sql = readFileSync(resolve(migrationsDir, FILE), 'utf8');

function functionBody(name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}`);
  if (start < 0) throw new Error(`migration does not define ${name}`);
  const end = sql.indexOf('\n$$;', start);
  return sql.slice(start, end);
}

describe('entries.handler_to_decide', () => {
  it('is a NOT NULL boolean that starts false and is hidden from anon', () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS handler_to_decide boolean NOT NULL DEFAULT false/
    );
    expect(sql).toContain('REVOKE ALL (handler_to_decide) ON public.entries FROM anon;');
  });

  it('mark_entries_handler_to_decide marks only entries the caller owns or manages', () => {
    const body = functionBody('public.mark_entries_handler_to_decide(p_entry_ids uuid[])');
    expect(body).toContain('SET handler_to_decide = true');
    expect(body).toContain('d.owner_id = v_person_id');
    expect(body).toContain('public.can_manage_show(e.show_id)');
    expect(body).toContain('public.is_show_secretary(e.show_id)');
    expect(body).toContain('e.deleted_at IS NULL');
    expect(body).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.mark_entries_handler_to_decide(uuid[]) FROM PUBLIC, anon;'
    );
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.mark_entries_handler_to_decide(uuid[]) TO authenticated, service_role;'
    );
  });

  it('Change handler clears the flag for staff and for the owner, in the same UPDATE', () => {
    const body = functionBody('public.update_entry_handler_for_entry_management(');
    expect(body.match(/handler_to_decide = false,/g)).toHaveLength(2);
  });

  it('is the latest definition of Change handler and both entry views', () => {
    expect(latestDefinitions().get('update_entry_handler_for_entry_management')?.file).toBe(FILE);
    expect(latestViewDefinition('view_authenticated_entry_results').file).toBe(FILE);
    expect(latestViewDefinition('view_authenticated_entry_results_replication').file).toBe(FILE);
  });

  it('appends the column LAST on both views and keeps security_invoker = false', () => {
    const inner = sql.slice(
      sql.indexOf('CREATE OR REPLACE VIEW public.view_authenticated_entry_results\n')
    );
    expect(inner).toContain(
      'CASE WHEN access.can_view_admin THEN e.handler_to_decide END AS handler_to_decide\nFROM public.entries e'
    );
    expect(inner).toContain(
      '  entries.handler_to_decide\nFROM public.view_authenticated_entry_results AS entries'
    );
    expect(sql.match(/WITH \(security_invoker = false\)/g)).toHaveLength(2);
  });
});
