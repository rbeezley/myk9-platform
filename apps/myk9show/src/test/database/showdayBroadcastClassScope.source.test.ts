import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260730100000_scope_showday_broadcasts_to_classes.sql'
);

function readMigration(): string {
  expect(
    existsSync(migrationPath),
    'The additive class-scoped show-day Broadcast migration must exist'
  ).toBe(true);
  return readFileSync(migrationPath, 'utf8');
}

describe('show-day Broadcast class-scope migration', () => {
  it('routes both old and new entry/class scope without broadcasting row data', () => {
    const migration = readMigration();

    expect(migration).toContain('OLD.class_id');
    expect(migration).toContain('NEW.class_id');
    expect(migration).toContain('OLD.id');
    expect(migration).toContain('NEW.id');
    expect(migration).toContain("'scope:%s'");
    expect(migration).toContain("'reconcile:%s'");
    expect(migration).not.toContain("'class_ids'");
    expect(migration).not.toContain('to_jsonb(OLD)');
    expect(migration).not.toContain('to_jsonb(NEW)');
  });

  it('pairs old/new show and class scope and forces full reconciliation for class moves', () => {
    const migration = readMigration();

    expect(migration).toContain('SELECT v_old_show_id AS show_id, v_old_class_id AS class_id');
    expect(migration).toContain('SELECT v_new_show_id AS show_id, v_new_class_id AS class_id');
    expect(migration).toContain('OLD.trial_id IS DISTINCT FROM NEW.trial_id');
    expect(migration).toContain('OLD.deleted_at IS NULL');
    expect(migration).toContain('NEW.deleted_at IS NOT NULL');
    expect(migration).toContain('v_requires_full_sync := true');
    expect(migration).toContain('v_reconcile_class_id := OLD.id');
    expect(migration).toContain('v_reconcile_class_id := NEW.id');
    expect(migration).toContain('WHEN v_requires_full_sync THEN');
    expect(migration).toContain("'id', v_signal_id");
  });

  it('preserves the advisory trigger and non-fatal failure contract', () => {
    const migration = readMigration();

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.broadcast_showday_change()');
    expect(migration).toContain('PERFORM realtime.send(');
    expect(migration).toContain("'showday_change'");
    expect(migration).toContain('EXCEPTION WHEN OTHERS THEN');
    expect(migration).toContain('RETURN NULL');
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION public.broadcast_showday_change()'
    );
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
  });
});
