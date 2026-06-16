import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// Source-level contract for the Deleted Entities (restore) UI reads.
// Two regressions to guard:
//   1. RLS-blocked tables (dogs/shows/classes/people) must list via the
//      admin-gated RPCs — a typo'd name silently empties the restore list.
//   2. The invalid `deleted_by -> auth.users` embed must stay removed from the
//      RLS-OK reads (trials/entries) or the query errors and the list goes empty.
const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('deleted-entity read wiring', () => {
  it('dogs read lists via get_deleted_dogs RPC', () => {
    expect(read('../dogs/reads.ts')).toContain("'get_deleted_dogs'");
  });

  it('shows read lists via get_deleted_shows RPC', () => {
    expect(read('../shows/writes.ts')).toContain("'get_deleted_shows'");
  });

  it('classes read lists via get_deleted_classes RPC', () => {
    expect(read('../classes/reads.ts')).toContain("'get_deleted_classes'");
  });

  it('people read lists via get_deleted_people RPC', () => {
    expect(read('../users/reads.ts')).toContain("'get_deleted_people'");
  });

  it('trials deleted read no longer embeds the invalid deleted_by user', () => {
    expect(read('../trials/reads.ts')).not.toContain('deleted_by_user');
  });

  it('entries deleted read no longer embeds the invalid deleted_by user', () => {
    expect(read('../entries/admin.ts')).not.toContain('deleted_by_user');
  });
});

describe('deleted-entity read RPC migration', () => {
  const migration = read(
    '../../../../../../supabase/migrations/20260616140000_deleted_entity_read_rpcs.sql'
  );

  it('defines all four admin read functions', () => {
    for (const fn of [
      'get_deleted_dogs',
      'get_deleted_shows',
      'get_deleted_classes',
      'get_deleted_people',
    ]) {
      expect(migration).toContain(`FUNCTION public.${fn}()`);
    }
  });

  it('gates every function on is_platform_admin()', () => {
    const gateCount = (migration.match(/is_platform_admin\(\)/g) ?? []).length;
    expect(gateCount).toBeGreaterThanOrEqual(4);
  });

  it('grants execute to authenticated', () => {
    expect((migration.match(/GRANT EXECUTE ON FUNCTION/g) ?? []).length).toBe(4);
  });
});
