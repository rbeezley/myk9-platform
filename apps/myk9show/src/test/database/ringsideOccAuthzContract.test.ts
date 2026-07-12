import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260712101000_authorize_ringside_occ_conflicts.sql'
);

function normalizedMigration(): string {
  return readFileSync(migrationPath, 'utf8').replace(/\s+/g, ' ').toLowerCase();
}

describe('ringside_update_entry OCC authorization contract', () => {
  it('authorizes callers before counting or returning OCC conflicts', () => {
    const sql = normalizedMigration();
    const unauthorizedIndex = sql.indexOf('not authorized to update entry %');
    const firstCounterIndex = sql.indexOf("nextval('public.ringside_conflict_seq')");
    const firstConflictIndex = sql.indexOf("using errcode = '40001'");

    expect(unauthorizedIndex).toBeGreaterThan(0);
    expect(firstCounterIndex).toBeGreaterThan(unauthorizedIndex);
    expect(firstConflictIndex).toBeGreaterThan(unauthorizedIndex);
  });

  it('keeps the RPC callable only by authenticated clients after the replacement', () => {
    const sql = normalizedMigration();

    expect(sql).toContain(
      'revoke all on function public.ringside_update_entry(uuid, jsonb, integer) from public'
    );
    expect(sql).toContain(
      'revoke all on function public.ringside_update_entry(uuid, jsonb, integer) from anon'
    );
    expect(sql).toContain(
      'grant execute on function public.ringside_update_entry(uuid, jsonb, integer) to authenticated'
    );
  });
});
