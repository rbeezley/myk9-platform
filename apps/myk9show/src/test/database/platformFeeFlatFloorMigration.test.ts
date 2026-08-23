import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PLATFORM_FEE_LIMITS } from '../../../supabase/functions/_shared/platformFee';

/**
 * MYK9-197 — the flat per-checkout fee component and the floor.
 *
 * The load-bearing property of migration 20260823140000 is that BOTH columns
 * default to 0. That is the whole safety argument for landing it before anyone
 * has decided to turn the fee on: at 0/0 the expression collapses to the
 * percentage-only math that already shipped, so the migration is inert on
 * arrival and `platform_settings` itself is the kill switch. A non-zero default
 * would silently start charging every exhibitor the moment it is pushed.
 *
 * The bounds are asserted against PLATFORM_FEE_LIMITS rather than re-typed, so
 * the CHECK constraints and the calculator's clamps cannot drift apart — a
 * value the app accepts and the database rejects is a 400 at checkout.
 */
const repoRoot = resolve(__dirname, '../../../../..');
const migrationsDir = resolve(repoRoot, 'supabase/migrations');

function readMigration(versionPrefix: string): string {
  const file = readdirSync(migrationsDir).find(
    name => name.startsWith(versionPrefix) && name.endsWith('.sql')
  );
  if (!file) throw new Error(`No migration found starting with ${versionPrefix}`);
  return readFileSync(resolve(migrationsDir, file), 'utf8').toLowerCase();
}

/** Statements only. A migration explaining WHY it grants nothing would otherwise
 *  fail an assertion that it contains no GRANT. */
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n');
}

describe('platform fee flat component + floor migration', () => {
  const sql = readMigration('20260823140000');

  it('adds both columns DEFAULTING TO 0, so the change is inert until switched on', () => {
    expect(sql).toMatch(
      /add column if not exists platform_fee_flat_cents integer not null default 0\b/
    );
    expect(sql).toMatch(
      /add column if not exists platform_fee_min_cents integer not null default 0\b/
    );
    // And nothing seeds a non-zero value behind the default.
    expect(sql).not.toMatch(/update\s+public\.platform_settings/);
    expect(sql).not.toMatch(/insert\s+into\s+public\.platform_settings/);
  });

  it('bounds each column with the same limits the calculator clamps to', () => {
    expect(sql).toContain(
      `check (platform_fee_flat_cents >= ${PLATFORM_FEE_LIMITS.minFlatCents} and ` +
        `platform_fee_flat_cents <= ${PLATFORM_FEE_LIMITS.maxFlatCents})`
    );
    expect(sql).toContain(
      `check (platform_fee_min_cents >= ${PLATFORM_FEE_LIMITS.minMinCents} and ` +
        `platform_fee_min_cents <= ${PLATFORM_FEE_LIMITS.maxMinCents})`
    );
  });

  it('grants nothing to anon', () => {
    // platform_settings is operator config; 20260730220000 REVOKEs ALL on it
    // from anon and this migration must not reopen that. Adding a column to an
    // existing table does not re-trigger the ALTER DEFAULT PRIVILEGES trap
    // (that fires on CREATE TABLE), and the table-level authenticated grant
    // already covers new columns — so the correct number of grants here is zero.
    expect(stripComments(sql)).not.toMatch(/\bgrant\b/);
  });

  it('runs inside a transaction', () => {
    expect(sql.trimStart().startsWith('begin;')).toBe(false); // comments come first
    expect(sql).toContain('begin;');
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
  });
});
