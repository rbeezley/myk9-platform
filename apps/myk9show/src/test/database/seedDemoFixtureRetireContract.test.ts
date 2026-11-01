import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-text pins for public.seed_demo_retire_stale_fixture_shows() as MYK9-1595 redefined it
 * (migration 20261101221700). What the function DOES on a database, including which fixtures
 * survive and that no refund or payment row appears, is Parts B, D and E of
 * supabase/tests/myk9_1309_seed_fixture_functions_test.sql; these pins only name the three
 * clauses a quiet rewrite could drop, so a change to them is a deliberate edit of this file.
 */

const repoRoot = resolve(__dirname, '../../../../..');
const stripSqlComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const migration = stripSqlComments(
  readFileSync(
    join(repoRoot, 'supabase/migrations/20261101221700_myk9_1595_fixture_retire_and_name.sql'),
    'utf8'
  )
);

const body = (() => {
  const start = migration.indexOf(
    'CREATE OR REPLACE FUNCTION public.seed_demo_retire_stale_fixture_shows()'
  );
  return migration.slice(start, migration.indexOf('$fn$;', start)).replace(/\s+/g, ' ');
})();

const RANGE =
  "e.id >= 'dededede-0000-0000-0731-000000000000'::uuid AND e.id < 'dededede-0000-0000-0732-000000000000'::uuid";

describe('seed_demo_retire_stale_fixture_shows (MYK9-1595)', () => {
  it('ignores entries in the fixture marker range, and only entries', () => {
    expect(body).toContain(`FROM public.entries e WHERE NOT (${RANGE}) AND (`);
    // Exactly one place carries the exemption; every other hang term is unqualified.
    expect(body.split(RANGE).length - 1).toBe(1);
  });

  it('never retires the ready fixture, nor a fixture still running with its seeded entries', () => {
    expect(body).toContain('v_ready uuid := public.seed_demo_show_day_fixture_today();');
    expect(body).toContain('CONTINUE WHEN v_show.id IS NOT DISTINCT FROM v_ready;');
    expect(body).toContain(
      'CONTINUE WHEN v_show.last_day >= v_today AND v_show.has_fixture_entries;'
    );
    expect(body).toContain("v_today date := (now() AT TIME ZONE 'America/Chicago')::date;");
  });

  it('keeps every other hang condition', () => {
    for (const table of [
      'enrollments',
      'waitlist_entries',
      'entry_carts',
      'entry_cart_items',
      'stripe_orders',
      'show_payments',
      'show_payouts',
      'entry_payment_links',
      'show_money_locks',
      'refund_requests',
    ]) {
      expect(body, `${table} no longer keeps a fixture show`).toContain(`FROM public.${table} `);
    }
  });

  it('deletes packet snapshots itself, inside the per-show block, and no longer lets them keep a show', () => {
    expect(body).not.toContain('FROM public.trial_packet_snapshots tps');
    const snap = body.indexOf(
      'DELETE FROM public.trial_packet_snapshots WHERE show_id = v_show.id;'
    );
    const block = body.indexOf('BEGIN DELETE FROM public.trial_packet_snapshots');
    const show = body.indexOf('DELETE FROM public.shows WHERE id = v_show.id;');
    expect(snap).toBeGreaterThan(-1);
    expect(block, 'snapshot delete must open the per-show BEGIN block').toBeGreaterThan(-1);
    expect(show).toBeGreaterThan(snap);
    expect(body.indexOf('EXCEPTION WHEN foreign_key_violation')).toBeGreaterThan(show);
  });

  it('keeps the ACL: invoker, empty search_path, no client role', () => {
    expect(body).toMatch(/SECURITY INVOKER SET search_path = ''/);
    expect(migration).not.toMatch(/GRANT EXECUTE[^;]*\b(anon|authenticated|PUBLIC)\b/);
  });
});
