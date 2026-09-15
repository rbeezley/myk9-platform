/**
 * MYK9-579 — pins the DB trigger's RAISE EXCEPTION text to the exact TS
 * constants it is supposed to mirror. The trigger's own comment claims its
 * copy IS onlineEntryGate.ts's friendly text (so isPublishGateDbError callers
 * can trust `error.message` without a second lookup table) -- nothing else
 * enforces that the two stay byte-identical after an edit to either side.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PUBLISH_BLOCKED_MESSAGE,
  CLUB_REQUIRED_MESSAGE,
} from '@/features/payments/onlineEntryGate';

// Resolved by glob, not a hard-coded filename -- a re-versioned migration
// (the file is renamed, never edited in place once merged) must fail this
// test with a useful "no match" / "multiple matches" message instead of a
// silent ENOENT against a stale path.
const MIGRATIONS_DIR = resolve(__dirname, '../../../../../supabase/migrations');
const MIGRATION_NAME_PATTERN = /_enforce_show_publish_gate\.sql$/;

function migrationPath(): string {
  const matches = readdirSync(MIGRATIONS_DIR).filter(name => MIGRATION_NAME_PATTERN.test(name));
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one migration matching ${MIGRATION_NAME_PATTERN} in ${MIGRATIONS_DIR}, found ${matches.length}: ${matches.join(', ')}`
    );
  }
  return resolve(MIGRATIONS_DIR, matches[0]);
}

function migrationSql(): string {
  return readFileSync(migrationPath(), 'utf8');
}

/** A SQL string literal escapes an apostrophe as `''`, not `'` -- compare
 * against that form rather than the raw TS constant. */
function sqlEscaped(text: string): string {
  return text.replace(/'/g, "''");
}

describe('enforce_show_publish_gate migration text', () => {
  it('resolves to exactly one enforce_show_publish_gate migration', () => {
    expect(() => migrationSql()).not.toThrow();
  });

  it('raises PUBLISH_BLOCKED_MESSAGE verbatim for the no-Stripe-readiness refusal', () => {
    const sql = migrationSql();
    expect(sql).toContain(sqlEscaped(PUBLISH_BLOCKED_MESSAGE));
  });

  it('raises CLUB_REQUIRED_MESSAGE verbatim for the missing-club refusal', () => {
    const sql = migrationSql();
    expect(sql).toContain(sqlEscaped(CLUB_REQUIRED_MESSAGE));
  });

  it('raises both refusals with SQLSTATE MK003', () => {
    const sql = migrationSql();
    const mk003Count = (sql.match(/USING ERRCODE = 'MK003'/g) ?? []).length;
    expect(mk003Count).toBe(2);
  });

  it('fires on BEFORE INSERT OR UPDATE OF status, not UPDATE alone', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF status ON public\.shows/);
  });
});
