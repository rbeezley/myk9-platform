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
  ENTRY_WINDOW_REQUIRED_MESSAGE,
  ENTRY_WINDOW_ORDER_MESSAGE,
  ENTRY_WINDOW_PUBLISHED_MESSAGE,
  PUBLISH_GATE_ERRCODE_ENTRY_WINDOW,
} from '@/features/payments/onlineEntryGate';

// Resolved by content, not a hard-coded filename: the function body under
// test is the one in the LATEST migration that (re)defines it (MYK9-716
// replaced 20260916003500's body), and the trigger wiring is the latest
// migration that creates the trigger. Migration versions sort
// lexicographically, so the last match is the one applied last.
const MIGRATIONS_DIR = resolve(__dirname, '../../../../../supabase/migrations');

function latestMigrationContaining(marker: RegExp): string {
  const matches = readdirSync(MIGRATIONS_DIR)
    .filter(name => name.endsWith('.sql'))
    .sort()
    .filter(name => marker.test(readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8')));
  const latest = matches.at(-1);
  if (!latest) {
    throw new Error(`expected a migration matching ${marker} in ${MIGRATIONS_DIR}, found none`);
  }
  return readFileSync(resolve(MIGRATIONS_DIR, latest), 'utf8');
}

function migrationSql(): string {
  return latestMigrationContaining(
    /CREATE OR REPLACE FUNCTION public\.enforce_show_publish_gate\(\)/
  );
}

function triggerSql(): string {
  return latestMigrationContaining(/CREATE TRIGGER trg_enforce_show_publish_gate\b/);
}

/** A SQL string literal escapes an apostrophe as `''`, not `'` -- compare
 * against that form rather than the raw TS constant. */
function sqlEscaped(text: string): string {
  return text.replace(/'/g, "''");
}

describe('enforce_show_publish_gate migration text', () => {
  it('resolves the latest enforce_show_publish_gate definition', () => {
    expect(() => migrationSql()).not.toThrow();
    expect(migrationSql()).toMatch(/MYK9-716/);
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

  // MYK9-716: publishing requires an entry window.
  it('raises the entry-window refusals verbatim with their own SQLSTATE', () => {
    const sql = migrationSql();
    expect(sql).toContain(sqlEscaped(ENTRY_WINDOW_REQUIRED_MESSAGE));
    expect(sql).toContain(sqlEscaped(ENTRY_WINDOW_ORDER_MESSAGE));
    const code = `USING ERRCODE = '${PUBLISH_GATE_ERRCODE_ENTRY_WINDOW}'`;
    expect(sql.split(code)).toHaveLength(4);
  });

  it('checks the entry window after the Stripe refusal, so MK003 keeps precedence', () => {
    const sql = migrationSql();
    expect(sql.indexOf(sqlEscaped(ENTRY_WINDOW_REQUIRED_MESSAGE))).toBeGreaterThan(
      sql.indexOf(sqlEscaped(PUBLISH_BLOCKED_MESSAGE))
    );
  });

  it('fires on INSERT and on UPDATE OF status or either entry date (MYK9-716)', () => {
    expect(triggerSql()).toMatch(
      /BEFORE INSERT OR UPDATE OF status, entry_open_date, entry_close_date ON public\.shows/
    );
  });

  // The window is compared as the UTC calendar day, the reading every
  // entry-open/close guard uses, never as a raw timestamptz: a legacy
  // non-midnight value must not invert a same-day window by its time of day.
  it('compares the entry dates by UTC calendar day, never as raw timestamps', () => {
    const sql = migrationSql();
    const dayComparison =
      /\(NEW\.entry_open_date AT TIME ZONE 'UTC'\)::date\s+>\s+\(NEW\.entry_close_date AT TIME ZONE 'UTC'\)::date/g;
    expect(sql.match(dayComparison)).toHaveLength(2);
    expect(sql).not.toMatch(/NEW\.entry_open_date\s*>\s*NEW\.entry_close_date/);
  });

  it('raises the published-window refusal verbatim', () => {
    expect(migrationSql()).toContain(sqlEscaped(ENTRY_WINDOW_PUBLISHED_MESSAGE));
  });
});
