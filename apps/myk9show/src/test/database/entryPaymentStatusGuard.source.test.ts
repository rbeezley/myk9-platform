import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const migrationsDir = join(repoRoot, 'supabase/migrations');

function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort()
    .map(file => join(migrationsDir, file));
}

function latestMigrationContaining(pattern: RegExp): { file: string; sql: string } {
  const matches = migrationFiles()
    .map(file => ({ file, sql: readFileSync(file, 'utf8') }))
    .filter(({ sql }) => pattern.test(sql));
  const match = matches[matches.length - 1];

  expect(match, `No migration matched ${pattern}`).toBeDefined();
  return match!;
}

describe('entries payment_status payout guard', () => {
  it('adds a standalone entries payment_status update trigger', () => {
    const { file, sql } = latestMigrationContaining(/entries_protect_payment_status/i);

    expect(basename(file)).toMatch(/entries_protect_payment_status/);
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.entries_protect_payment_status');
    expect(sql).toContain('CREATE TRIGGER trg_entries_protect_payment_status');
    expect(sql).toContain('BEFORE UPDATE OF payment_status');
    expect(sql).toContain('new.payment_status is distinct from old.payment_status');
  });

  it('keeps the Stripe webhook service-role path able to mark online entries paid', () => {
    const { sql } = latestMigrationContaining(/entries_protect_payment_status/i);

    expect(sql).toContain("current_setting('role', true)");
    expect(sql).toContain("'service_role'");
    expect(sql).toContain('RETURN NEW;');
  });

  it('blocks non-service writers from moving online entries into paid or refunded states', () => {
    const { sql } = latestMigrationContaining(/entries_protect_payment_status/i);

    expect(sql).toContain("new.payment_status in ('paid', 'refunded')");
    expect(sql).toContain("new.payment_method = 'online'");
    expect(sql).toContain("old.payment_method = 'online'");
    expect(sql).toContain('42501');
  });

  it('leaves desk-payment methods to the existing staff authorization path', () => {
    const { sql } = latestMigrationContaining(/entries_protect_payment_status/i);

    expect(sql).toContain("new.payment_method is distinct from 'online'");
    expect(sql).toContain("old.payment_method is distinct from 'online'");
  });
});
