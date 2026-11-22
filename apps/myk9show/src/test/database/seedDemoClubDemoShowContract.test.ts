import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-text contract for MYK9-836: the prepared `Club demo show` in supabase/seed-demo.sql
 * (section 20). The section is INSERT-ONLY: a reseed adds the day's show, unpublishes the earlier
 * ones and never deletes or updates anything a live user could have attached. What the rows do on
 * a database is proven by the seed's own postcondition, which aborts a reseed that lacks any of
 * the shapes pinned here.
 */

const repoRoot = resolve(__dirname, '../../../../..');
const stripSqlComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const rawSeed = readFileSync(join(repoRoot, 'supabase/seed-demo.sql'), 'utf8');
const seed = stripSqlComments(rawSeed);

/** Cut [start, end) from the text by delimiters; a missing delimiter fails the test. */
const slice = (text: string, start: string, end: string): string => {
  const from = text.indexOf(start);
  expect(from, `start delimiter not found: ${start}`).toBeGreaterThan(-1);
  const to = text.indexOf(end, from + start.length);
  expect(to, `end delimiter not found: ${end}`).toBeGreaterThan(-1);
  return text.slice(from, to);
};

const SHOW_RANGE_LOW = 'dededede-0000-0000-0836-000000000000';
const PERSON = 'dededede-0000-0000-0836-0000000000e1';

const section = stripSqlComments(
  slice(
    rawSeed,
    'DECLARE\n  v_d date := (now() AT TIME ZONE',
    'SELECT public.seed_demo_assert_date_coherence();'
  )
);
// The whole section 20 DO block, from its opening to the postcondition's end.
const block = slice(section, 'DECLARE', '\nEND $$;');
const idempotentGuard = slice(block, 'BEGIN\n  IF EXISTS', 'INSERT INTO public.shows');

describe('seed-demo club demo show (MYK9-836)', () => {
  it('is insert-only: nothing deletes or updates a club demo row except the status-only unpublish', () => {
    // No delete anywhere in the file touches the 0836 range, and section 20 has none at all.
    expect(block).not.toMatch(/\bDELETE\b/i);
    for (const statement of seed.match(/DELETE\s+FROM[^;]*;/gi) ?? []) {
      expect(statement, 'a delete reaches the club demo range').not.toMatch(
        /0836|dec1a55e-0000-0000-0836/
      );
    }
    expect(seed).not.toMatch(/DELETE\s+FROM\s+public\.people\b/i);
    // The old refusals and the clear are gone.
    expect(rawSeed).not.toContain('Club demo show refusals');
    expect(rawSeed).not.toContain('refusing to delete it');
    expect(rawSeed).not.toContain('the demo exhibitor was used at another show');
    expect(seed).not.toMatch(/DELETE\s+FROM\s+public\.show_payments/i);
    // Every UPDATE in the section is either the one status-only unpublish, or a write to the
    // rows this same run just inserted (scoring and the entry form link), keyed by today's ids.
    const updates = block.match(/UPDATE\s+public\.\w+[\s\S]*?;/gi) ?? [];
    const unpublish = updates.filter(u => /UPDATE\s+public\.shows\b/i.test(u));
    expect(unpublish).toHaveLength(1);
    expect(unpublish[0].replace(/\s+/g, ' ')).toBe(
      "UPDATE public.shows SET status = 'draft' WHERE id >= 'dededede-0000-0000-0836-000000000000'::uuid AND id < 'dededede-0000-0000-0837-000000000000'::uuid AND start_date < v_midnight AND status = 'published';"
    );
    for (const update of updates.filter(u => !/UPDATE\s+public\.shows\b/i.test(u))) {
      expect(update, 'an update that is not keyed to today ids').toMatch(
        /WHERE (id = v_e\[\d\]|id = v_c\[\d\]|show_id = v_show);/
      );
    }
    expect(block).not.toMatch(/UPDATE\s+public\.(people|dogs|dog_registrations)\b/i);
  });

  it('creates the person and the dogs once, ON CONFLICT (id) DO NOTHING', () => {
    const person = slice(block, 'INSERT INTO public.people', 'INSERT INTO public.dogs');
    expect(person).toContain('v_person');
    expect(person).toMatch(/'[^']+@example\.com'/);
    expect(person).toContain("'Dana', 'Whitcomb'");
    expect(person).not.toContain('auth_user_id');
    expect(person).toMatch(/ON CONFLICT \(id\) DO NOTHING;\s*$/);
    expect(block).toContain(`v_person constant uuid := '${PERSON}'`);
    expect(block.match(/INSERT INTO public\.people/g)).toHaveLength(1);
    expect(block).not.toMatch(/INSERT INTO auth\./);

    const dogs = slice(block, 'INSERT INTO public.dogs', 'INSERT INTO public.dog_registrations');
    const dogIds = [...dogs.matchAll(/'(dededede-0000-0000-0836-0000000000d\d)'/g)].map(m => m[1]);
    expect(dogIds).toHaveLength(6);
    expect(new Set(dogIds).size).toBe(6);
    expect(dogs).toContain('JOIN public.people p ON p.id = v_person');
    expect(dogs).toMatch(/ON CONFLICT \(id\) DO NOTHING;\s*$/);
    // Registrations are added only to a dog that has none.
    const registrations = slice(
      block,
      'INSERT INTO public.dog_registrations',
      'INSERT INTO public.entries'
    );
    expect(registrations).toContain(
      'NOT EXISTS (SELECT 1 FROM public.dog_registrations r WHERE r.dog_id = d.id)'
    );
    expect(registrations).toContain('ON CONFLICT DO NOTHING;');
    // The demo accounts' dogs are not referenced; the only account is the judge.
    expect(block).not.toMatch(/dededede-0000-0000-0000-00000000004[1-6]/);
    expect([...block.matchAll(/[\w.+-]+@myk9t\.com/g)].map(m => m[0])).toEqual(['judge@myk9t.com']);
    expect(block).not.toContain('exhibitor2');
  });

  it('derives every per-day id from the Chicago date, inside the 0836 range', () => {
    expect(block).toContain("v_d date := (now() AT TIME ZONE 'America/Chicago')::date");
    expect(block).toContain("v_day text := to_char(v_d, 'YYYYMMDD')");
    for (const [name, suffix] of [
      ['v_show', '0010'],
      ['v_trial', '0021'],
      ['v_form', '0070'],
    ]) {
      expect(block).toContain(
        `${name} uuid := ('dededede-0000-0000-0836-' || v_day || '${suffix}')::uuid`
      );
    }
    expect(block).toContain(
      "('dec1a55e-0000-0000-0836-' || v_day || '00' || n)::uuid FROM generate_series(31, 33) n"
    );
    expect(block).toContain(
      "('dededede-0000-0000-0836-' || v_day || '00' || n)::uuid FROM generate_series(51, 59) n"
    );
    expect(block).toContain("('dededede-0000-0000-0836-' || v_day || '00a' || n)::uuid");
    expect(block).toContain("('dededede-0000-0000-0836-' || v_day || '00b' || n)::uuid");
    // No fixed (un-stamped) show, trial, class or entry id is left in section 20.
    expect(block).not.toMatch(/'dededede-0000-0000-0836-0000000000(?:10|21|5\d|70|a\d|b\d)'/);
    expect(block).not.toMatch(/'dec1a55e-0000-0000-0836-0000000000\d\d'/);
  });

  it('is a no-op when today show exists, and unpublishes earlier shows before inserting', () => {
    expect(idempotentGuard).toMatch(
      /IF EXISTS \(SELECT 1 FROM public\.shows WHERE id = v_show\) THEN[\s\S]*RETURN;\s*END IF;/
    );
    // The guard comes first: nothing precedes it that writes.
    expect(block.indexOf('IF EXISTS (SELECT 1 FROM public.shows WHERE id = v_show)')).toBeLessThan(
      block.indexOf('UPDATE public.shows')
    );
    expect(block.indexOf('UPDATE public.shows')).toBeLessThan(
      block.indexOf('INSERT INTO public.shows')
    );
    expect(block.slice(0, block.indexOf('IF EXISTS'))).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
    expect(block).toContain('v_midnight timestamptz := v_d::timestamp AT TIME ZONE');
  });

  it('is a published Heartland show dated the reseed day in the show timezone', () => {
    const insert = slice(
      block,
      'INSERT INTO public.shows',
      'INSERT INTO public.show_visibility_settings'
    );
    expect(insert).toContain("'Club demo show'");
    expect(insert).toContain("'published', 'dededede-0000-0000-0000-000000000001'");
    // Starts and ends today, entries open 30 days before and closed 3 days before.
    expect(insert).toMatch(/v_show,\s*'Club demo show',[\s\S]*v_midnight,\s*v_midnight,/);
    expect(insert).toContain('(v_d - 30)::timestamp AT TIME ZONE');
    expect(insert).toContain('(v_d - 3)::timestamp AT TIME ZONE');
    expect(block).toMatch(/v_trial, v_show, 'Trial 1', v_d, 'Trial 1'/);
    expect(block).toContain("'America/Chicago', 1");
  });

  it('shapes the three classes like their AKC templates in migration 030', () => {
    const classes = slice(block, 'INSERT INTO public.classes', 'INSERT INTO public.people').replace(
      /\s+/g,
      ' '
    );
    // name, level, element, section, entry_fee, status, time, hides, areas, blank, timer, known
    expect(classes).toContain(
      "(v_c[1], v_trial, 'Container Novice A', 'Novice', 'Container', 'A', 30.00, 'upcoming', 120, 1, 1, false, 'single', true, 1, '09:00'::time, 1)"
    );
    expect(classes).toContain(
      "(v_c[2], v_trial, 'Interior Advanced', 'Advanced', 'Interior', NULL, 30.00, 'upcoming', 180, 2, 1, false, 'single', true, 2, '10:30'::time, 1)"
    );
    expect(classes).toContain(
      "(v_c[3], v_trial, 'Exterior Excellent', 'Excellent', 'Exterior', NULL, 30.00, 'upcoming', 180, 3, 1, false, 'single', true, 3, '13:00'::time, 1)"
    );
    // The template rows themselves, so a template change makes this fail loudly.
    const template = readFileSync(
      join(repoRoot, 'supabase/migrations/030_seed_sport_templates.sql'),
      'utf8'
    ).replace(/\s+/g, ' ');
    expect(template).toContain(
      "(akc_id, 'Container', 'Novice', 'Container Novice A', 'A', 1, 120, NULL, NULL, 1, NULL, NULL, true, 1, false"
    );
    expect(template).toContain(
      "(akc_id, 'Interior', 'Advanced', 'Interior Advanced', NULL, 8, NULL, 60, 180, 2, NULL, NULL, true, 1, false"
    );
    expect(template).toContain(
      "(akc_id, 'Exterior', 'Excellent', 'Exterior Excellent', NULL, 14, NULL, 180, 300, 3, NULL, NULL, true, 1, false"
    );
  });

  it('seeds nine owing entries on one entry form, with no money', () => {
    const entries = slice(block, 'INSERT INTO public.entries', 'INSERT INTO public.armbands');
    expect(entries.match(/\(v_e\[\d\], v_dog\[\d\], v_c\[\d\]/g)).toHaveLength(9);
    expect(entries).toContain("'confirmed', 'pending', 30.00");
    expect(entries).not.toMatch(/'paid'/);
    const forms = slice(block, 'INSERT INTO public.enrollments', 'UPDATE public.entries');
    expect(forms).toContain("VALUES (v_form, v_show, v_person, 'pending')");
    const written = block
      .slice(0, block.indexOf('SELECT count(*), count(*) FILTER'))
      .replace(/\n/g, ' ');
    expect(written).not.toMatch(/paid_amount\s*=|stripe_order|pi_|payment_method|total_amount/);
    expect(block.match(/INSERT INTO public\.stripe_orders/g)).toBeNull();
  });

  it('finishes one class like section 8 and leaves another half scored with no placements', () => {
    expect(block).toMatch(
      /status = 'completed', is_scoring_finalized = true, scored_count = 3,\s*results_released_at = [^;]*WHERE id = v_c\[1\]/
    );
    const finishedPlacements = [
      ...block.matchAll(/final_placement = (\d)[\s\S]*?WHERE id = v_e\[(\d)\]/g),
    ].map(m => `${m[2]}:${m[1]}`);
    // Nova (entry 1) first, Poppy (entry 2) second, Rusty (entry 3) third.
    expect(finishedPlacements.sort()).toEqual(['1:1', '2:2', '3:3']);
    const half = slice(block, 'WHERE id = v_c[1];', 'SELECT count(*), count(*) FILTER');
    expect(half).not.toContain('final_placement');
    expect(half).toContain('WHERE id = v_e[4];');
    expect(half).toContain('WHERE id = v_e[5];');
    expect(half).not.toContain('v_e[6]');
    expect(half).not.toContain('v_e[7]');
  });

  it('puts the judge fixture on all three classes at class level', () => {
    const judges = slice(
      block,
      'INSERT INTO public.judge_assignments',
      'UPDATE public.entries SET'
    );
    expect(judges).toContain('v_c[n]');
    expect(judges).toContain('FROM generate_series(1, 3) n');
    expect(judges).toContain("JOIN public.people p ON lower(p.email) = 'judge@myk9t.com'");
  });

  it('never stamps a time later than the reseed', () => {
    const stamps = [...block.matchAll(/(?:scoring_completed_at|results_released_at) = ([^\n]*)/g)];
    expect(stamps).toHaveLength(6);
    for (const stamp of stamps) {
      expect(stamp[1]).toMatch(/^LEAST\(now\(\) - INTERVAL '\d+ minutes', /);
    }
  });

  it('checks the postcondition against today show only', () => {
    const post = block.slice(block.indexOf('SELECT count(*), count(*) FILTER'));
    expect(post).toContain('FROM public.entries\n  WHERE show_id = v_show;');
    expect(post).toContain('SELECT count(*) FROM public.stripe_orders WHERE show_id = v_show');
    expect(post).toContain('FROM public.classes c WHERE c.id = v_c[1]');
    expect(post).toContain('FROM public.classes c WHERE c.id = v_c[2]');
    expect(post).not.toMatch(/0836/);
  });

  it('runs after section 19 and before the closing date-coherence check', () => {
    const at = rawSeed.indexOf('DECLARE\n  v_d date := (now() AT TIME ZONE');
    expect(at).toBeGreaterThan(
      rawSeed.indexOf('SELECT public.seed_demo_restore_show_day_fixture();')
    );
    expect(at).toBeLessThan(rawSeed.indexOf('SELECT public.seed_demo_assert_date_coherence();'));
  });

  it('keeps the capture clear to localhost databases and to the whole club demo range', () => {
    const clear = readFileSync(
      join(repoRoot, 'apps/myk9show/src/test/e2e/capture/landingClubDemoClear.sql'),
      'utf8'
    );
    const sql = stripSqlComments(clear);
    for (const table of [
      'shows',
      'trials',
      'classes',
      'entries',
      'enrollments',
      'dogs',
      'people',
    ]) {
      expect(sql, table).toMatch(new RegExp(`DELETE FROM public\\.${table}\\b`));
    }
    expect(sql).toContain(SHOW_RANGE_LOW);
    expect(sql).toContain(`WHERE id = '${PERSON}'`);
    const workflow = readFileSync(join(repoRoot, '.github/workflows/landing-capture.yml'), 'utf8');
    expect(workflow).toContain('*@127.0.0.1:*|*@localhost:*) ;;');
    expect(workflow).toContain('landingClubDemoClear.sql');
  });
});
