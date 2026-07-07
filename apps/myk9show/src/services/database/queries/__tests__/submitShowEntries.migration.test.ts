import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('submit_show_entries migration authorization', () => {
  it('prevents non-official callers from assigning arbitrary handler ids', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        '../../supabase/migrations/20260706190500_submit_entries_preserve_selected_handler.sql'
      ),
      'utf8'
    );

    expect(migration).toContain('IF NOT v_is_official AND v_handler_person_id IS NOT NULL');
    expect(migration).toContain('v_handler_person_id IN (d.owner_id, d.co_owner_id)');
    expect(migration).toContain("USING ERRCODE = '42501'");
  });
});
