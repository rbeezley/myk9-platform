import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-text contract for section 19 of supabase/seed-demo.sql, the show-day
 * fixture (MYK9-731): a show with a trial dated TODAY, self-check-in on, a
 * published class time and running order, the demo exhibitor's entry, and the
 * seed's only announcements.
 *
 * What it pins is what a later edit could quietly break without any SQL error:
 * the dates coming from the show's own timezone rather than the server's UTC
 * CURRENT_DATE, the fixture's entries being removed by id BEFORE the paid-stray
 * guard, the show never being deleted (an unguarded cascade), and the
 * announcements never being high priority (a web push on every reseed).
 *
 * Source text only. The seed's own postcondition at the end of section 19 is
 * what proves, on a real database, that SQL finds the today-dated trial and a
 * non-empty inbox; this file cannot.
 */

const repoRoot = resolve(__dirname, '../../../../..');
const stripSqlComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const seed = stripSqlComments(readFileSync(join(repoRoot, 'supabase/seed-demo.sql'), 'utf8'));

const SHOW_ID = 'dededede-0000-0000-0000-000000000014';
const sectionStart = seed.indexOf(`'${SHOW_ID}',\n  'Heartland Scent Work Week'`);
const sectionEnd = seed.indexOf(
  "WHERE show_id = 'dededede-0000-0000-0000-000000000010';\n\n  IF v_entry_count"
);
const section = seed.slice(sectionStart, sectionEnd > -1 ? sectionEnd : undefined);

/** The ids section 19 generates for its entries: Willow `…10d`, Cooper `…20d`, d = 0..6. */
const showDayEntryIds = [1, 2].flatMap(kind =>
  Array.from({ length: 7 }, (_, d) => `dededede-0000-0000-0014-000000000${kind}0${d}`)
);

describe('seed-demo show-day fixture (MYK9-731)', () => {
  it('exists after every other section and generates the entry ids it claims', () => {
    expect(sectionStart, 'section 19 show insert not found').toBeGreaterThan(-1);
    expect(section).toContain(
      "'dededede-0000-0000-0014-0000000' || e.kind || lpad(o.n::text, 2, '0')"
    );
    expect(section).toContain("('001', 'dededede-0000-0000-0000-000000000041'::uuid");
    expect(section).toContain("('002', 'dededede-0000-0000-0000-000000000046'::uuid");
    expect(section).toContain('generate_series(0, 6)');
  });

  it("dates the show from now() in the show's timezone, never from UTC CURRENT_DATE", () => {
    // A reseed run in a Chicago evening is already tomorrow in UTC; a
    // CURRENT_DATE offset would date the "today" trial tomorrow.
    expect(section).toContain("(now() AT TIME ZONE 'America/Chicago')::date AS today");
    const showInsert = section.slice(0, section.indexOf('ON CONFLICT (id) DO UPDATE'));
    expect(showInsert).not.toMatch(/CURRENT_DATE/);
    const trialInsert = section.slice(section.indexOf('INSERT INTO public.trials'));
    expect(trialInsert.slice(0, trialInsert.indexOf('ON CONFLICT'))).toMatch(
      /\(d\.today \+ o\.n\)/
    );
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

  it('never deletes the show-day show, its trials or its classes: they are upserted', () => {
    // Section 0 may only delete shows the paid-stray guard names, and this one
    // is not named there. A delete would cascade its entries past the guard.
    for (const table of ['shows', 'trials', 'classes']) {
      for (const del of seed.matchAll(new RegExp(`DELETE FROM public\\.${table}\\b[^;]*;`, 'g'))) {
        expect(del[0]).not.toContain(SHOW_ID);
        expect(del[0]).not.toMatch(/dededede-0000-0000-0014-|dec1a55e-0000-0000-0014-/);
      }
    }
    expect(section.match(/ON CONFLICT \(id\) DO UPDATE/g)?.length).toBe(3);
  });

  it('posts only normal-priority announcements, so a reseed never sends a web push', () => {
    const insert = section.slice(section.indexOf('INSERT INTO public.show_announcements'));
    const body = insert.slice(0, insert.indexOf(';'));
    expect(body).toContain("'secretary', 'Test Secretary', v.title, v.content, 'normal'");
    expect(body).not.toMatch(/'(high|urgent)'/);
  });

  it('keeps self-check-in on at both levels and asserts the fixture after inserting it', () => {
    expect(section).toContain("'8:00 AM', true, 'scent_work'");
    expect(section).toContain(
      "'open', 'class_complete', 'immediate', 'immediate', 'immediate', true"
    );
    expect(section).toContain("'09:00'::time");
    expect(section).toContain('AND t.date = (now() AT TIME ZONE t.timezone)::date');
    expect(section).toContain("RAISE EXCEPTION 'seed-demo: expected exactly 1 show-day entry");
  });
});
