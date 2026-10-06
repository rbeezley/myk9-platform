import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-text contract for the show-day fixture (MYK9-731): a show with a trial
 * dated TODAY, self-check-in on, a published class time and running order, the
 * demo exhibitor's entry, and the seed's only announcements.
 *
 * Section 19 of supabase/seed-demo.sql creates the show row and then calls
 * public.seed_demo_restore_show_day_fixture() (migration 20261006014300), the
 * same function an operator runs to re-date the fixture between reseeds. So
 * this file pins the seed's half (create the show, clear by id, call the
 * function, assert) and the function's half (dates from the show's timezone,
 * fixed ids only, normal-priority announcements, live-row postcondition).
 *
 * Source text only. What the function DOES on a database -- readiness,
 * idempotence, the money refusal, leaving another show alone, its ACL -- is
 * supabase/tests/myk9_731_restore_show_day_fixture_test.sql.
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

const SHOW_ID = 'dededede-0000-0000-0000-000000000014';
const sectionStart = seed.indexOf(`'${SHOW_ID}',\n  'Heartland Scent Work Week'`);
const sectionEnd = seed.indexOf(
  "WHERE show_id = 'dededede-0000-0000-0000-000000000010';\n\n  IF v_entry_count"
);
const section = seed.slice(sectionStart, sectionEnd > -1 ? sectionEnd : undefined);

/** The ids the fixture uses for its entries: Willow `…10d`, Cooper `…20d`, d = 0..6. */
const showDayEntryIds = [1, 2].flatMap(kind =>
  Array.from({ length: 7 }, (_, d) => `dededede-0000-0000-0014-000000000${kind}0${d}`)
);

/** One statement of the function body, from its first line to its `;`. */
const statement = (start: string): string => {
  const at = fn.indexOf(start);
  expect(at, `statement not found: ${start}`).toBeGreaterThan(-1);
  return fn.slice(at, fn.indexOf(';', at));
};

describe('seed-demo show-day fixture (MYK9-731)', () => {
  it('creates the show, then hands everything else to the restore function', () => {
    expect(sectionStart, 'section 19 show insert not found').toBeGreaterThan(-1);
    const call = section.indexOf('SELECT public.seed_demo_restore_show_day_fixture();');
    expect(call).toBeGreaterThan(section.indexOf('INSERT INTO public.shows'));
    // The function writes these; a second copy in the seed is a second source
    // of truth that can drift.
    for (const table of [
      'trials',
      'classes',
      'entries',
      'armbands',
      'judge_assignments',
      'show_announcements',
      'show_visibility_settings',
    ]) {
      expect(section, `seed section 19 still inserts ${table}`).not.toContain(
        `INSERT INTO public.${table}`
      );
    }
    // The two wider resets the seed keeps run BEFORE the call.
    for (const reset of [
      "DELETE FROM public.show_announcements\nWHERE id IN ('dededede-0000-0000-0014-0000000004a1'",
      `DELETE FROM public.judge_assignments\nWHERE show_id = '${SHOW_ID}'`,
    ]) {
      const at = section.indexOf(reset);
      expect(at, `missing reset: ${reset}`).toBeGreaterThan(-1);
      expect(at).toBeLessThan(call);
    }
  });

  it('generates the entry ids the seed clears, and only from fixed ids', () => {
    expect(fn).toContain("'dededede-0000-0000-0014-0000000' || k.kind || lpad(o.n::text, 2, '0')");
    expect(fn).toContain("('001', 'dededede-0000-0000-0000-000000000041'::uuid, $2");
    expect(fn).toContain("('002', 'dededede-0000-0000-0000-000000000046'::uuid, $3");
    expect(fn).toContain('USING c_show, v_exhibitor, v_secretary;');
    // Fixture entries are reset in place, never deleted: a delete would cascade
    // their children and drop their replication version back to 1.
    expect(fn).not.toMatch(/DELETE FROM public\.entries/);
    expect(fn).toContain(
      'ON CONFLICT (id) DO UPDATE SET (%1$s) = (%2$s) WHERE (%3$s) IS DISTINCT FROM (%2$s)'
    );
    expect(fn).toContain('generate_series(0, 6)');
    // No predicate-wide write: every DELETE/UPDATE in the body names the
    // fixture by id.
    for (const m of fn.matchAll(/\b(DELETE FROM|UPDATE) public\.(\w+)[^;]*;/g)) {
      expect(m[0], `unscoped ${m[1]} on ${m[2]}`).toMatch(/e\.id = f\.id|s\.id = c_show/);
    }
  });

  it('deletes every show-day entry by id before the paid-stray guard, in the seed-owned id list', () => {
    const guardCall = seed.indexOf('SELECT public.seed_demo_assert_no_paid_strays();');
    const idListDelete = seed.indexOf(
      "DELETE FROM public.entries WHERE id IN (\n  'dededede-0000-0000-0000-000000000051'"
    );
    expect(guardCall).toBeGreaterThan(-1);
    expect(idListDelete).toBeGreaterThan(-1);
    expect(idListDelete).toBeLessThan(guardCall);
    const idList = seed.slice(idListDelete, seed.indexOf(';', idListDelete));
    for (const id of showDayEntryIds) {
      expect(idList, `show-day entry ${id} is not in the pre-guard id-list delete`).toContain(
        `'${id}'`
      );
    }
  });

  it('never deletes the show-day show, its trials or its classes', () => {
    // Section 0 may only delete shows the paid-stray guard names, and this one
    // is not named there. A delete would cascade its entries past the guard.
    for (const source of [seed, fn]) {
      for (const table of ['shows', 'trials', 'classes']) {
        for (const del of source.matchAll(
          new RegExp(`DELETE FROM public\\.${table}\\b[^;]*;`, 'g')
        )) {
          expect(del[0]).not.toContain(SHOW_ID);
          expect(del[0]).not.toMatch(/dededede-0000-0000-0014-|dec1a55e-0000-0000-0014-/);
        }
      }
    }
    expect(fn).not.toMatch(/DELETE FROM public\.(shows|trials|classes)\b/);
  });

  it("dates the fixture from now() in the show's timezone, never from UTC CURRENT_DATE", () => {
    // A run in a Chicago evening is already tomorrow in UTC; a CURRENT_DATE
    // offset would date the "today" trial tomorrow.
    expect(fn).toContain("v_today date := (now() AT TIME ZONE 'America/Chicago')::date;");
    expect(fn).not.toMatch(/CURRENT_DATE/);
    expect(statement('INSERT INTO public.trials')).toMatch(/v_today \+ o\.n/);
  });

  it('posts only normal-priority announcements, so neither a reseed nor a restore pushes', () => {
    const body = statement('INSERT INTO public.show_announcements');
    expect(body).toContain("'secretary', 'Jordan Ellis', v.title, v.content, 'normal'");
    expect(body).not.toMatch(/'(high|urgent)'/);
  });

  it('keeps self-check-in on at both levels and asserts LIVE rows after writing them', () => {
    expect(statement('INSERT INTO public.trials')).toContain("'8:00 AM', true, 'scent_work'");
    expect(statement('INSERT INTO public.show_visibility_settings')).toContain(
      "'open', 'class_complete', 'immediate', 'immediate', 'immediate', true"
    );
    expect(fn).toContain("'09:00'::time");
    for (const source of [fn, section]) {
      expect(source).toContain('AND t.date = (now() AT TIME ZONE t.timezone)::date');
      expect(source).toMatch(/s\.deleted_at IS NULL AND t\.deleted_at IS NULL/);
      expect(source).toMatch(/c\.deleted_at IS NULL AND e\.deleted_at IS NULL/);
    }
    expect(section).toContain("RAISE EXCEPTION 'seed-demo: expected exactly 1 show-day entry");
  });

  it('is a service-role-only SECURITY DEFINER with an empty search_path', () => {
    expect(fn).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      expect(fn).toContain(
        `REVOKE ALL ON FUNCTION public.seed_demo_restore_show_day_fixture() FROM ${role};`
      );
    }
    expect(fn).toContain(
      'GRANT EXECUTE ON FUNCTION public.seed_demo_restore_show_day_fixture() TO service_role;'
    );
  });
});
