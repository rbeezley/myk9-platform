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

describe('self check-in RLS contract', () => {
  it('keeps direct entries UPDATE scoped to show managers only', () => {
    const updatePolicy = migration.match(
      /create policy "entries_update" on public\.entries[\s\S]*?;/i
    )?.[0];

    expect(updatePolicy).toContain('public.can_manage_show(entries.show_id)');
    expect(updatePolicy).not.toContain('handler_id');
    expect(updatePolicy).not.toContain('owner_id');
    expect(updatePolicy).not.toContain('co_owner_id');
  });

  it('keeps self_checkin_entry limited to check-in status bookkeeping', () => {
    const updateStatement = migration.match(/update public\.entries e[\s\S]*?;/i)?.[0];

    expect(updateStatement).toContain('check_in_status = p_new_status');
    expect(updateStatement).toContain('updated_at = now()');
    expect(updateStatement).not.toContain('is_in_ring');
    expect(updateStatement).not.toContain('ring_entry_time');
    expect(updateStatement).not.toContain('judge_notes');
  });
});
