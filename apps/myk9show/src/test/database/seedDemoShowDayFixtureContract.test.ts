import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-text contract for the show-day fixture (MYK9-731): a show with a trial
 * dated TODAY, self-check-in on, a published class time and running order, the
 * demo exhibitor's entry, and the seed's only announcements.
 *
 * The fixture is INSERT-ONLY. public.seed_demo_restore_show_day_fixture()
 * (migration 20261006014300) returns today's ready fixture or inserts a new one
 * with fresh ids in the marker range dededede-0000-0000-0731-*, and never
 * updates or deletes an existing row. Section 19 of supabase/seed-demo.sql calls
 * it; section 0 clears what it minted before the paid-stray guard.
 *
 * Source text only. What the function DOES on a database -- readiness,
 * idempotence, refusals, leaving every existing row byte-for-byte unchanged,
 * RLS, ACL -- is supabase/tests/myk9_731_restore_show_day_fixture*_test.sql.
 */

const repoRoot = resolve(__dirname, '../../../../..');
const stripSqlComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const seed = stripSqlComments(readFileSync(join(repoRoot, 'supabase/seed-demo.sql'), 'utf8'));
const fn = stripSqlComments(
  readFileSync(
    join(repoRoot, 'supabase/migrations/20261006014300_myk9_731_restore_show_day_fixture.sql'),
    'utf8'
  )
);

const CALL = 'SELECT public.seed_demo_restore_show_day_fixture();';
const MARKER = "'dededede-0000-0000-0731-'";
const RANGE_LOW = "'dededede-0000-0000-0731-000000000000'::uuid";
const RANGE_HIGH = "'dededede-0000-0000-0732-000000000000'::uuid";
const RETIRED_SHOW = 'dededede-0000-0000-0000-000000000014';

/** The restore's body, from its CREATE to the end of its dollar-quote. */
const restoreBody = (() => {
  const start = fn.indexOf(
    'CREATE OR REPLACE FUNCTION public.seed_demo_restore_show_day_fixture()'
  );
  return fn.slice(start, fn.indexOf('$fn$;', start));
})();

describe('seed-demo show-day fixture (MYK9-731)', () => {
  it('section 19 calls the fixture function and inserts nothing of its own', () => {
    const call = seed.indexOf(CALL);
    expect(call, 'section 19 call not found').toBeGreaterThan(-1);
    const section = seed.slice(call, seed.indexOf('IF v_entry_count', call));
    expect(section).toContain('public.seed_demo_show_day_fixture_today() IS NULL');
    for (const table of [
      'shows',
      'trials',
      'classes',
      'entries',
      'armbands',
      'judge_assignments',
      'show_announcements',
      'show_visibility_settings',
    ]) {
      expect(section, `section 19 still writes ${table}`).not.toMatch(
        new RegExp(`(INSERT INTO|UPDATE|DELETE FROM) public\\.${table}\\b`)
      );
    }
    // The retired fixed show is never created or reset any more.
    expect(seed).not.toContain(`'${RETIRED_SHOW}',\n  'Heartland Scent Work Week'`);
  });

  it('clears what the fixture minted before the paid-stray guard and the dog delete', () => {
    const guard = seed.indexOf('SELECT public.seed_demo_assert_no_paid_strays();');
    const entryDelete = seed.indexOf(
      `DELETE FROM public.entries\nWHERE id >= ${RANGE_LOW}\n  AND id <  ${RANGE_HIGH};`
    );
    expect(entryDelete, 'marker-range entry delete not found').toBeGreaterThan(-1);
    expect(entryDelete).toBeLessThan(guard);
    const armbandDelete = seed.indexOf(`OR (show_id >= ${RANGE_LOW}`);
    expect(armbandDelete, 'marker-range armband delete not found').toBeGreaterThan(-1);
    expect(armbandDelete).toBeLessThan(guard);
    expect(seed.indexOf(CALL)).toBeGreaterThan(guard);
  });

  it('never updates or deletes an existing row', () => {
    expect(restoreBody.length).toBeGreaterThan(1000);
    expect(restoreBody).not.toMatch(/\bUPDATE\s+public\./);
    expect(restoreBody).not.toMatch(/\bDELETE\s+FROM\b/);
    expect(restoreBody).not.toMatch(/ON CONFLICT/);
    expect(restoreBody).not.toMatch(/EXECUTE\s/);
  });

  it('mints every id in the marker range, which gen_random_uuid can never produce', () => {
    const inserts = [...restoreBody.matchAll(/INSERT INTO public\.(\w+)/g)].map(m => m[1]);
    expect(inserts).toEqual([
      'shows',
      'show_visibility_settings',
      'trials',
      'classes',
      'armbands',
      'entries',
      'judge_assignments',
      'show_announcements',
    ]);
    // Seven minting sites: trials, classes, the show, armbands, entries, judges,
    // announcements (show_visibility_settings is keyed by the show).
    expect(restoreBody.split(MARKER).length - 1).toBe(7);
    expect(fn).toContain(`s.id >= ${RANGE_LOW}`);
    expect(fn).toContain("s.club_id = 'dededede-0000-0000-0000-000000000001'");
  });

  it("dates the fixture from now() in the show's timezone, never from UTC CURRENT_DATE", () => {
    expect(fn).toContain("v_today date := (now() AT TIME ZONE 'America/Chicago')::date;");
    expect(fn).not.toMatch(/CURRENT_DATE/);
    expect(restoreBody).toMatch(/v_today \+ o\.n/);
    expect(fn).toContain('AND t.date = (now() AT TIME ZONE t.timezone)::date');
  });

  it('posts only normal-priority announcements, so a fixture never pushes', () => {
    const at = restoreBody.indexOf('INSERT INTO public.show_announcements');
    const body = restoreBody.slice(at, restoreBody.indexOf(';', at));
    expect(body).toContain("'secretary', 'Jordan Ellis', v.title, v.content, 'normal'");
    expect(body).not.toMatch(/'(high|urgent)'/);
  });

  it('keeps self-check-in on at both levels and requires live rows for readiness', () => {
    expect(restoreBody).toContain("'8:00 AM', true, 'scent_work'");
    expect(restoreBody).toContain(
      "'open', 'class_complete', 'immediate', 'immediate', 'immediate', true"
    );
    expect(restoreBody).toContain("'09:00'::time");
    expect(fn).toMatch(/s\.deleted_at IS NULL AND t\.deleted_at IS NULL/);
    expect(fn).toMatch(/c\.deleted_at IS NULL AND e\.deleted_at IS NULL/);
  });

  it('is service-role only: a SECURITY DEFINER restore and an INVOKER lookup', () => {
    expect(restoreBody).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
    expect(fn).toMatch(/STABLE\s+SECURITY INVOKER\s+SET search_path = ''/);
    for (const name of ['seed_demo_restore_show_day_fixture', 'seed_demo_show_day_fixture_today']) {
      for (const role of ['PUBLIC', 'anon', 'authenticated']) {
        expect(fn).toContain(`REVOKE ALL ON FUNCTION public.${name}() FROM ${role};`);
      }
      expect(fn).toContain(`GRANT EXECUTE ON FUNCTION public.${name}() TO service_role;`);
    }
  });
});
