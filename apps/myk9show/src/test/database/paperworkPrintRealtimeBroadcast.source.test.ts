import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260720102000_broadcast_paperwork_print_changes.sql'
  ),
  'utf8'
);

describe('Paperwork Print Realtime Broadcast migration', () => {
  it('sends a private show-scoped invalidation after every append or void', () => {
    expect(migration).toMatch(
      /CREATE TRIGGER broadcast_paperwork_print_change[\s\S]*AFTER INSERT OR UPDATE OR DELETE[\s\S]*ON public\.paperwork_prints/s
    );
    expect(migration).toMatch(
      /realtime\.send\([\s\S]*jsonb_build_object\('table', 'paperwork_prints'\)[\s\S]*'showday_change'[\s\S]*format\('show:%s:changes', v_show_id\)[\s\S]*true/s
    );
  });

  it('keeps signaling failure-isolated from the print write', () => {
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain('EXCEPTION WHEN OTHERS THEN');
    expect(migration).toContain('RETURN NULL');
  });
});
