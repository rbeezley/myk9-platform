import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-text contract for MYK9-836: the prepared `Club demo show` in supabase/seed-demo.sql
 * (section 20) and how a reseed clears it (section 0). What the rows do on a database is proven by
 * the seed's own postcondition, which aborts a reseed that lacks any of the shapes pinned here.
 */

const repoRoot = resolve(__dirname, '../../../../..');
const stripSqlComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const rawSeed = readFileSync(join(repoRoot, 'supabase/seed-demo.sql'), 'utf8');
const seed = stripSqlComments(rawSeed);

/** Cut [start, end) from RAW text by executable delimiters; a missing delimiter fails the test. */
const slice = (text: string, start: string, end: string): string => {
  const from = text.indexOf(start);
  expect(from, `start delimiter not found: ${start}`).toBeGreaterThan(-1);
  const to = text.indexOf(end, from + start.length);
  expect(to, `end delimiter not found: ${end}`).toBeGreaterThan(-1);
  return text.slice(from, to);
};

const LOW = "'dededede-0000-0000-0836-000000000000'::uuid";
const HIGH = "'dededede-0000-0000-0837-000000000000'::uuid";
const SHOW = 'dededede-0000-0000-0836-000000000010';
const PERSON = 'dededede-0000-0000-0836-0000000000e1';

const section = stripSqlComments(
  slice(
    rawSeed,
    'CREATE TEMP TABLE club_demo_day',
    'SELECT public.seed_demo_assert_date_coherence();'
  )
);
const refusals = stripSqlComments(slice(rawSeed, 'DO $$\nDECLARE v_orders integer', '\nEND $$;'));
const clear = stripSqlComments(
  slice(
    rawSeed,
    "DELETE FROM public.show_payments\nWHERE (show_id >= 'dededede-0000-0000-0836",
    'DELETE FROM public.show_lifecycle_email_attempts'
  )
);
const section0Start = rawSeed.indexOf('-- 0. Idempotency: remove prior seed rows');

describe('seed-demo club demo show (MYK9-836)', () => {
  it('is a published Heartland show dated the reseed day in the show timezone', () => {
    const insert = slice(
      section,
      'INSERT INTO public.shows',
      'INSERT INTO public.show_visibility_settings'
    );
    expect(insert).toContain(`'${SHOW}'`);
    expect(insert).toContain("'Club demo show'");
    expect(insert).toContain("'published', 'dededede-0000-0000-0000-000000000001'");
    expect(section).toContain("(now() AT TIME ZONE 'America/Chicago')::date");
    // Starts and ends today, entries closed before it starts.
    expect(insert).toMatch(
      /\(\(SELECT d FROM club_demo_day\)\)::timestamp AT TIME ZONE 'UTC'\),\s*\(\(\(SELECT d FROM club_demo_day\)\)::timestamp AT TIME ZONE 'UTC'\)/
    );
    expect(insert).toContain('club_demo_day) - 30');
    expect(insert).toContain('club_demo_day) - 3');
    expect(section).toMatch(/'Trial 1', \(SELECT d FROM club_demo_day\)/);
    expect(section).toContain("'America/Chicago', 1");
  });

  it('seeds nine owing entries on one entry form, with no money', () => {
    const entries = slice(section, 'INSERT INTO public.entries', 'INSERT INTO public.armbands');
    expect(entries.match(/'dededede-0000-0000-0836-0000000000(?:5[1-9])'/g)).toHaveLength(9);
    expect(entries).toContain("'confirmed', 'pending', 30.00");
    expect(entries).not.toMatch(/'paid'/);
    const forms = slice(section, 'INSERT INTO public.enrollments', 'UPDATE public.entries');
    expect(forms).toContain('dededede-0000-0000-0836-000000000070');
    const code = section
      .slice(0, section.indexOf('DO $$\nDECLARE\n  v_entries'))
      .replace(/\n/g, ' ');
    expect(code).not.toMatch(/paid_amount\s*=|stripe_order|pi_|payment_method|total_amount/);
    expect(code.match(/INSERT INTO public\.stripe_orders/g)).toBeNull();
  });

  it('creates one made-up exhibitor person with no sign-in, who owns and handles every dog', () => {
    const person = slice(section, 'INSERT INTO public.people', 'INSERT INTO public.dogs');
    expect(person).toContain(`'${PERSON}'`);
    expect(person).toMatch(/'[^']+@example\.com'/);
    expect(person).not.toContain('auth_user_id');
    expect(section.match(/INSERT INTO public\.people/g)).toHaveLength(1);
    expect(section).not.toMatch(/INSERT INTO auth\./);
    // The name is the made-up one, not a demo account's.
    expect(person).toContain("'Dana', 'Whitcomb'");
    // The seed header names this one exception to "does NOT create people".
    expect(rawSeed).toMatch(/does NOT create people[\s\S]{0,80}ONE exception/);
    expect(rawSeed).toContain(PERSON);
  });

  it('gives the show six dogs of its own, owned by that person, and touches none of the demo dogs', () => {
    const dogs = slice(section, 'INSERT INTO public.dogs', 'INSERT INTO public.dog_registrations');
    const dogIds = [...dogs.matchAll(/'(dededede-0000-0000-0836-0000000000d\d)'/g)].map(m => m[1]);
    expect(dogIds).toHaveLength(6);
    expect(new Set(dogIds).size).toBe(6);
    expect(dogs).toContain(`JOIN public.people p ON p.id = '${PERSON}'`);
    // The registrations entries_require_dog_registration needs, for these dogs only.
    const registrations = section.slice(section.indexOf('INSERT INTO public.dog_registrations'));
    expect(registrations).toContain("WHERE d.id >= 'dededede-0000-0000-0836-000000000000'::uuid");
    // Every entry and armband uses one of them, handled by the same person.
    const entries = slice(section, 'INSERT INTO public.entries', 'INSERT INTO public.enrollments');
    expect(entries.match(/'dededede-0000-0000-0836-0000000000d\d'/g)).toHaveLength(9 + 6);
    expect(entries.match(new RegExp(`'${PERSON}'`, 'g'))).toHaveLength(9 + 1);
    // Section 20 references no 04{1..6} dog and no account of the @myk9t.com set other than the judge.
    expect(section).not.toMatch(/dededede-0000-0000-0000-00000000004[1-6]/);
    expect(section).not.toMatch(/dededede-0000-0000-0836-000000000071/);
    expect([...section.matchAll(/[\w.+-]+@myk9t\.com/g)].map(m => m[0])).toEqual([
      'judge@myk9t.com',
    ]);
    expect(section).not.toContain('exhibitor2');
  });

  it('finishes one class like section 8 and leaves another half scored with no placements', () => {
    expect(section).toMatch(
      /status = 'completed', is_scoring_finalized = true, scored_count = 3,\s*results_released_at = [^;]*WHERE id = 'dec1a55e-0000-0000-0836-000000000031'/
    );
    const finishedPlacements = [
      ...section.matchAll(
        /final_placement = (\d)[\s\S]*?WHERE id = 'dededede-0000-0000-0836-0000000000(5[123])'/g
      ),
    ].map(m => `${m[2]}:${m[1]}`);
    expect(finishedPlacements.sort()).toEqual(['51:1', '52:2', '53:3']);
    // Half scored: entries 054 and 055 only, and nothing placed.
    const half = slice(
      section,
      "WHERE id = 'dec1a55e-0000-0000-0836-000000000031'",
      'DO $$\nDECLARE\n  v_entries'
    );
    expect(half).not.toContain('final_placement');
    expect(half).toContain("'dededede-0000-0000-0836-000000000054'");
    expect(half).toContain("'dededede-0000-0000-0836-000000000055'");
    expect(half).not.toContain("'dededede-0000-0000-0836-000000000056'");
    expect(half).not.toContain("'dededede-0000-0000-0836-000000000057'");
  });

  it('puts the judge fixture on all three classes at class level', () => {
    const block = slice(
      section,
      'INSERT INTO public.judge_assignments',
      "JOIN public.people p ON lower(p.email) = 'judge@myk9t.com'"
    );
    for (const n of ['31', '32', '33']) {
      expect(block).toContain(`'dec1a55e-0000-0000-0836-0000000000${n}'`);
    }
  });

  it('refuses only on card money or a demo dog entered elsewhere, before any delete', () => {
    expect(section0Start).toBeGreaterThan(-1);
    const refusalAt = rawSeed.indexOf('DO $$\nDECLARE v_orders integer');
    expect(refusalAt).toBeGreaterThan(section0Start);
    // Before the first delete of section 0, so the canonical show wipe cannot hide an entry.
    expect(rawSeed.indexOf('DELETE FROM public.', section0Start)).toBeGreaterThan(refusalAt);
    expect(refusals.match(/RAISE EXCEPTION/g)).toHaveLength(3);
    // 1. a Stripe order on the show or on one of its entry forms
    expect(refusals).toMatch(
      /FROM public\.stripe_orders\s+WHERE \(show_id >= [^;]*OR \(enrollment_id >= [^;]*;/
    );
    // 2. an entry in the range with a payment intent
    expect(refusals).toMatch(
      /FROM public\.entries\s+WHERE show_id >= [^;]*stripe_payment_intent_id IS NOT NULL;/
    );
    // 3. an entry for a demo dog on a show outside the range
    expect(refusals).toMatch(
      /FROM public\.entries\s+WHERE dog_id >= [^;]*AND NOT \(show_id >= [^;]*\);/
    );
    // 4. the demo exhibitor used outside the range: enrollment, entry as handler, dog, and every
    // other foreign key to people(id) counted from the catalog
    expect(refusals).toMatch(
      /FROM public\.enrollments\s+WHERE handler_id = 'dededede-0000-0000-0836-0000000000e1'\s+AND NOT \(show_id >= [^;]*\)\)/
    );
    expect(refusals).toMatch(
      /FROM public\.entries\s+WHERE handler_id = 'dededede-0000-0000-0836-0000000000e1'\s+AND NOT \(show_id >= [^;]*\)\)/
    );
    expect(refusals).toContain("confrelid = 'public.people'::regclass");
    expect(refusals).toContain('IF v_person > 0');
    expect(refusals).toContain('the demo exhibitor was used at another show');
    expect(refusals).toContain('remove that deliberately, then rerun');
    expect(refusals).toContain('IF v_orders > 0 OR v_intents > 0');
    expect(refusals).toContain('holds card money');
    expect(refusals).toContain('a demo dog was entered at another show');
    expect(refusals).toContain('remove that entry deliberately');
    // Nothing else refuses: refunds and payment_status never count, and nothing is voided.
    expect(refusals).not.toMatch(/refunded_at|'refunded'|payment_status|void/i);
    expect(refusals).toContain(LOW);
    expect(refusals).toContain(HIGH);
  });

  it('clears everything else in the range, children first, the person last', () => {
    const order = [
      'DELETE FROM public.show_payments',
      'DELETE FROM public.entry_cart_items',
      'DELETE FROM public.waitlist_entries',
      'DELETE FROM public.entries',
      'DELETE FROM public.armbands',
      'DELETE FROM public.enrollments',
      'DELETE FROM public.judge_assignments',
      'DELETE FROM public.classes',
      'DELETE FROM public.trials',
      'DELETE FROM public.show_visibility_settings',
      'DELETE FROM public.shows',
      'DELETE FROM public.dogs',
      'DELETE FROM public.people',
    ].map(statement => {
      const at = rawSeed.indexOf(
        statement + '\n',
        rawSeed.indexOf('DELETE FROM public.show_payments\nWHERE (show_id >= ')
      );
      expect(at, statement).toBeGreaterThan(-1);
      return at;
    });
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(clear).toContain(LOW);
    expect(clear).toContain(HIGH);
    // Desk payments are scoped by show, enrollment and entry.
    const payments = slice(
      clear,
      'DELETE FROM public.show_payments',
      'DELETE FROM public.entry_cart_items'
    );
    for (const column of ['show_id', 'enrollment_id', 'entry_id']) {
      expect(payments).toContain(`(${column} >= ${LOW}`);
      expect(payments).toContain(`${column} <  ${HIGH}`);
    }
    // The two NO ACTION children of dogs and people are cleared before them.
    for (const table of ['entry_cart_items', 'waitlist_entries']) {
      const del = slice(clear, `DELETE FROM public.${table}`, ';');
      expect(del).toContain(`dog_id >= ${LOW}`);
      expect(del).toContain(`handler_id = '${PERSON}'`);
    }
    const personDelete = slice(clear, 'DELETE FROM public.people', ';');
    expect(personDelete).toContain(`WHERE id = '${PERSON}'`);
    // No refusal lives in the clear, and no reseed path writes a refund.
    expect(clear).not.toContain('RAISE EXCEPTION');
    // Runs after the paid-stray guard, which does not name this range.
    expect(rawSeed.indexOf('DELETE FROM public.show_payments\nWHERE (show_id >= ')).toBeGreaterThan(
      rawSeed.indexOf('SELECT public.seed_demo_assert_no_paid_strays();')
    );
  });

  it('has a capture clear that mirrors the reseed clear, person included', () => {
    const captureClear = stripSqlComments(
      readFileSync(
        join(repoRoot, 'apps/myk9show/src/test/e2e/capture/landingClubDemoClear.sql'),
        'utf8'
      )
    )
      .replace(/^\s*(BEGIN|COMMIT);\s*$/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
    expect(captureClear).toContain(`DELETE FROM public.people WHERE id = '${PERSON}';`);
    expect(captureClear).toBe(clear.replace(/\s+/g, ' ').trim());
  });

  it('never stamps a time later than the reseed', () => {
    const stamps = [
      ...section.matchAll(/(?:scoring_completed_at|results_released_at) = ([^\n]*)/g),
    ];
    expect(stamps).toHaveLength(6);
    for (const stamp of stamps) {
      expect(stamp[1]).toMatch(/^LEAST\(now\(\) - INTERVAL '\d+ minutes', /);
    }
  });

  it('runs after section 19 and before the closing date-coherence check', () => {
    expect(seed.indexOf('CREATE TEMP TABLE club_demo_day')).toBeGreaterThan(
      seed.indexOf('SELECT public.seed_demo_restore_show_day_fixture();')
    );
    expect(seed.indexOf('CREATE TEMP TABLE club_demo_day')).toBeLessThan(
      seed.indexOf('SELECT public.seed_demo_assert_date_coherence();')
    );
  });
});
