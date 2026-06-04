import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260604004045_restrict_entries_update_to_managers.sql'
  ),
  'utf8'
);

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);

  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

describe('self check-in RLS contract', () => {
  it('keeps direct entries UPDATE scoped to show managers only', () => {
    const updatePolicy = sliceBetween(
      migration,
      'create policy "entries_update" on public.entries',
      "notify pgrst, 'reload schema'"
    );

    expect(updatePolicy).toContain('public.can_manage_show(entries.show_id)');
    expect(updatePolicy).not.toContain('handler_id');
    expect(updatePolicy).not.toContain('owner_id');
    expect(updatePolicy).not.toContain('co_owner_id');
  });

  it('removes older permissive check-in UPDATE policies before recreating entries_update', () => {
    expect(migration).toContain('drop policy if exists "entries_checkin_update_staff"');
    expect(migration).toContain('drop policy if exists "entries_checkin_update_own"');
  });

  it('keeps self_checkin_entry limited to check-in status bookkeeping', () => {
    const updateStatement = sliceBetween(
      migration,
      'update public.entries e',
      'if not found then'
    );

    expect(updateStatement).toContain('check_in_status = p_new_status');
    expect(updateStatement).toContain('updated_at = now()');
    expect(migration).not.toContain('is_in_ring');
    expect(migration).not.toContain('ring_entry_time');
    expect(migration).not.toContain('judge_notes');
  });
});
