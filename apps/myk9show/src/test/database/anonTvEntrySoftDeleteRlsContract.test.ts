import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260801150000_exclude_soft_deleted_entries_from_anon_tv.sql'
  ),
  'utf8'
);

describe('anonymous TV entry soft-delete RLS contract (MYK9-149)', () => {
  it('updates the existing anonymous TV policy instead of adding a broader policy', () => {
    expect(migration).toMatch(
      /ALTER\s+POLICY\s+"entries_anon_select_for_tv"\s+ON\s+public\.entries/i
    );
    expect(migration).toContain('entries.deleted_at IS NULL');
  });

  it('retains the public-show scope and excludes deleted shows', () => {
    expect(migration).toContain(
      "s.status IN ('published', 'upcoming', 'in_progress', 'completed')"
    );
    expect(migration).toContain('s.deleted_at IS NULL');
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
