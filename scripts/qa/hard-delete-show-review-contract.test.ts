import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const migration = readFileSync(
  resolve(
    repositoryRoot,
    'supabase/migrations/20260920173147_harden_hard_delete_show_money_guards.sql'
  ),
  'utf8'
);
const sqlFixture = readFileSync(
  resolve(repositoryRoot, 'supabase/tests/hard_delete_show_money_guards_test.sql'),
  'utf8'
);
const concurrencyHarness = readFileSync(
  resolve(repositoryRoot, 'scripts/qa/hard-delete-show-concurrency.sh'),
  'utf8'
);
const lockProtocolHarness = readFileSync(
  resolve(repositoryRoot, 'scripts/qa/hard-delete-show-lock-protocol.sh'),
  'utf8'
);

describe('MYK9-615 hard-delete review guarantees', () => {
  it('stabilizes catalog DDL in child-to-parent order while permitting ordinary writes', () => {
    const timeout = migration.indexOf("set_config('lock_timeout', '2s', true)");
    const classesDdlLock = migration.indexOf(
      'LOCK TABLE public.classes IN SHARE UPDATE EXCLUSIVE MODE;'
    );
    const trialsDdlLock = migration.indexOf(
      'LOCK TABLE public.trials IN SHARE UPDATE EXCLUSIVE MODE;'
    );
    const showsDdlLock = migration.indexOf(
      'LOCK TABLE public.shows IN SHARE UPDATE EXCLUSIVE MODE;'
    );
    const targetShowRowLock = migration.indexOf(
      'FROM public.shows\n  WHERE id = p_show_id\n  FOR UPDATE;'
    );
    const graphRead = migration.indexOf('FROM pg_catalog.pg_constraint');
    const firstDelete = migration.indexOf('DELETE FROM public.classes');

    expect(classesDdlLock).toBeGreaterThan(timeout);
    expect(trialsDdlLock).toBeGreaterThan(classesDdlLock);
    expect(showsDdlLock).toBeGreaterThan(trialsDdlLock);
    expect(targetShowRowLock).toBeGreaterThan(showsDdlLock);
    expect(graphRead).toBeGreaterThan(targetShowRowLock);
    expect(firstDelete).toBeGreaterThan(graphRead);

    expect(concurrencyHarness).toContain('hard-delete-show-lock-protocol.sh');
    expect(lockProtocolHarness).toContain('start_schema_ddl_race');
    expect(lockProtocolHarness).toContain('ALTER TABLE public.$ddl_child_table');
    expect(lockProtocolHarness).toContain('expect_dml_compatible');
    expect(lockProtocolHarness).toContain('UPDATE public.shows SET name = name');
    expect(lockProtocolHarness).toContain('UPDATE public.trials SET name = name');
    expect(lockProtocolHarness).toContain('UPDATE public.classes SET name = name');
  });

  it('preserves native deadlock_detected and tests the reversed FK lock order', () => {
    expect(migration).toMatch(/WHEN deadlock_detected THEN[\s\S]{0,180}\bRAISE;/);
    expect(migration).toContain('WHEN lock_not_available THEN');
    expect(lockProtocolHarness).toContain('start_deadlock_interleave');
    expect(lockProtocolHarness).toContain('FOR KEY SHARE');
    expect(lockProtocolHarness).toContain('class_lock_acquired');
    expect(lockProtocolHarness).toContain('trial_key_share_after_rpc_wait');
    expect(lockProtocolHarness).toContain("SET LOCAL deadlock_timeout = '500ms'");
    expect(lockProtocolHarness).toContain("SET LOCAL deadlock_timeout = '1500ms'");
    expect(lockProtocolHarness).toContain('40P01');
    expect(lockProtocolHarness).toContain('23503');
  });

  it('calls the RPC as authenticated and keeps club-admin soft delete available', () => {
    const setAuthenticated = sqlFixture.indexOf('SET LOCAL ROLE authenticated;');
    const rpcCall = sqlFixture.indexOf(
      "PERFORM public.hard_delete_show('00000000-0000-0000-0000-000000615020');"
    );
    const resetAuthenticated = sqlFixture.indexOf('RESET ROLE;', rpcCall);

    expect(setAuthenticated).toBeGreaterThan(-1);
    expect(rpcCall).toBeGreaterThan(setAuthenticated);
    expect(resetAuthenticated).toBeGreaterThan(rpcCall);
    expect(sqlFixture).toContain('PERFORM public.soft_delete_show(');
    expect(sqlFixture).toContain('deleted_at IS NOT NULL');
  });
});
