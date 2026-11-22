import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-text contract for MYK9-836: the prepared `Club demo show` in supabase/seed-demo.sql
 * (section 20). What the rows do on a database is proven by the seed's own postcondition,
 * which aborts a reseed that lacks any of the shapes pinned here.
 */

const repoRoot = resolve(__dirname, '../../../../..');
const stripSqlComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const seed = stripSqlComments(readFileSync(join(repoRoot, 'supabase/seed-demo.sql'), 'utf8'));

const LOW = "'dededede-0000-0000-0836-000000000000'::uuid";
const HIGH = "'dededede-0000-0000-0837-000000000000'::uuid";
const SHOW = 'dededede-0000-0000-0836-000000000010';

const section = seed.slice(
  seed.indexOf('CREATE TEMP TABLE club_demo_day'),
  seed.indexOf('-- MYK9-979: shows.online_entries_enabled')
);
const cleanup = seed.slice(
  seed.indexOf('DO $$\nDECLARE v_orders integer'),
  seed.indexOf('-- Email delivery history fixtures')
);

describe('seed-demo club demo show (MYK9-836)', () => {
  it('is a published Heartland show dated the reseed day in the show timezone', () => {
    const insert = section.slice(
      section.indexOf('INSERT INTO public.shows'),
      section.indexOf('INSERT INTO public.show_visibility_settings')
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
    const entries = section.slice(
      section.indexOf('INSERT INTO public.entries'),
      section.indexOf('INSERT INTO public.armbands')
    );
    expect(entries.match(/'dededede-0000-0000-0836-0000000000(?:5[1-9])'/g)).toHaveLength(9);
    expect(entries).toContain("'confirmed', 'pending', 30.00");
    expect(entries).not.toMatch(/'paid'/);
    const forms = section.slice(
      section.indexOf('INSERT INTO public.enrollments'),
      section.indexOf('UPDATE public.entries')
    );
    expect(forms).toContain('dededede-0000-0000-0836-000000000070');
    const code = section
      .slice(0, section.indexOf('DO $$\nDECLARE\n  v_entries'))
      .replace(/\n/g, ' ');
    expect(code).not.toMatch(/paid_amount\s*=|stripe_order|pi_|payment_method|total_amount/);
    expect(code.match(/INSERT INTO public\.stripe_orders/g)).toBeNull();
  });

  it('gives the show six dogs of its own, owned by exhibitor2@, and touches none of the six demo dogs', () => {
    const dogs = section.slice(
      section.indexOf('INSERT INTO public.dogs'),
      section.indexOf('INSERT INTO public.dog_registrations')
    );
    const dogIds = [...dogs.matchAll(/'(dededede-0000-0000-0836-0000000000d\d)'/g)].map(m => m[1]);
    expect(dogIds).toHaveLength(6);
    expect(new Set(dogIds).size).toBe(6);
    expect(dogs).toContain("lower(p.email) = 'exhibitor2@myk9t.com'");
    // The registrations entries_require_dog_registration needs, for these dogs only.
    const registrations = section.slice(section.indexOf('INSERT INTO public.dog_registrations'));
    expect(registrations).toContain("WHERE d.id >= 'dededede-0000-0000-0836-000000000000'::uuid");
    // Every entry and armband uses one of them, handled by the same owner.
    const entries = section.slice(
      section.indexOf('INSERT INTO public.entries'),
      section.indexOf('INSERT INTO public.enrollments')
    );
    expect(entries.match(/'dededede-0000-0000-0836-0000000000d\d'/g)).toHaveLength(9 + 6);
    expect(entries).toContain("lower(p.email) = 'exhibitor2@myk9t.com'");
    expect(entries).not.toMatch(/exhibitor@myk9t|secretary@myk9t/);
    // None of the six hand-authored demo dogs (...041 to ...046) appears anywhere in section 20.
    expect(section).not.toMatch(/dededede-0000-0000-0000-00000000004[1-6]/);
    expect(section).not.toMatch(/dededede-0000-0000-0836-000000000071/);
  });

  it('deletes its own dogs, after its entries and armbands, scoped to the range', () => {
    const entriesAt = cleanup.indexOf('DELETE FROM public.entries');
    const armbandsAt = cleanup.indexOf('DELETE FROM public.armbands');
    const dogsAt = cleanup.indexOf('DELETE FROM public.dogs');
    expect(dogsAt).toBeGreaterThan(entriesAt);
    expect(dogsAt).toBeGreaterThan(armbandsAt);
    const del = cleanup.slice(dogsAt, cleanup.indexOf(';', dogsAt));
    expect(del).toContain(`id >= ${LOW}`);
    expect(del).toContain(`id <  ${HIGH}`);
    // The two NO ACTION children are cleared by dog id first.
    for (const table of ['waitlist_entries', 'entry_cart_items']) {
      const at = cleanup.indexOf(`DELETE FROM public.${table}\nWHERE dog_id >= ${LOW}`);
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeLessThan(dogsAt);
    }
    expect(cleanup.indexOf('DELETE FROM public.dogs')).toBeLessThan(
      cleanup.indexOf('DELETE FROM public.enrollments')
    );
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
    // Half scored: Ranger (054) and Juniper (055) only, and nothing placed.
    const half = section.slice(
      section.indexOf("WHERE id = 'dec1a55e-0000-0000-0836-000000000031'"),
      section.indexOf('DO $$\nDECLARE\n  v_entries')
    );
    expect(half).not.toContain('final_placement');
    expect(half).toContain("'dededede-0000-0000-0836-000000000054'");
    expect(half).toContain("'dededede-0000-0000-0836-000000000055'");
    expect(half).not.toContain("'dededede-0000-0000-0836-000000000056'");
    expect(half).not.toContain("'dededede-0000-0000-0836-000000000057'");
  });

  it('puts the judge fixture on all three classes at class level', () => {
    const block = section.slice(section.indexOf('INSERT INTO public.judge_assignments'));
    for (const n of ['31', '32', '33']) {
      expect(block).toContain(`'dec1a55e-0000-0000-0836-0000000000${n}'`);
    }
    expect(block).toContain("lower(p.email) = 'judge@myk9t.com'");
  });

  it('clears only its own range, children first, and refuses card money', () => {
    const order = [
      'DELETE FROM public.entry_cart_items',
      'DELETE FROM public.entries',
      'DELETE FROM public.armbands',
      'DELETE FROM public.enrollments',
      'DELETE FROM public.judge_assignments',
      'DELETE FROM public.classes',
      'DELETE FROM public.trials',
      'DELETE FROM public.show_visibility_settings',
      'DELETE FROM public.shows',
    ].map(statement => cleanup.indexOf(statement));
    expect(order.every(at => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(cleanup).toContain(LOW);
    expect(cleanup).toContain(HIGH);
    expect(cleanup).toContain('stripe_payment_intent_id IS NOT NULL');
    expect(cleanup).toContain('FROM public.stripe_orders');
    // Card money refuses the reseed; the text never mentions voiding.
    expect(cleanup).toMatch(
      /FROM public\.stripe_orders\s+WHERE \(show_id >= [^;]*OR \(enrollment_id >= [^;]*;/
    );
    expect(cleanup).toContain('v_orders + v_card > 0');
    expect(cleanup).toContain('holds card money');
    expect(cleanup).not.toMatch(/void/i);
    expect(cleanup).not.toContain('v_payments');
    // A cash or check payment recorded in a demo is cleared, range-scoped by show,
    // enrollment and entry, before the entries and enrollments it references.
    const clear = cleanup.slice(
      cleanup.indexOf('DELETE FROM public.show_payments'),
      cleanup.indexOf('DELETE FROM public.entry_cart_items')
    );
    expect(clear).not.toBe('');
    for (const column of ['show_id', 'enrollment_id', 'entry_id']) {
      expect(clear).toContain(`(${column} >= ${LOW}`);
      expect(clear).toContain(`${column} <  ${HIGH}`);
    }
    expect(cleanup.indexOf('DELETE FROM public.show_payments')).toBeGreaterThan(
      cleanup.indexOf('END $;')
    );
    expect(cleanup.indexOf('DELETE FROM public.show_payments')).toBeLessThan(
      cleanup.indexOf('DELETE FROM public.entries')
    );
    expect(cleanup.indexOf('DELETE FROM public.show_payments')).toBeLessThan(
      cleanup.indexOf('DELETE FROM public.enrollments')
    );
    expect(cleanup.indexOf('RAISE EXCEPTION')).toBeLessThan(order[0]);
    // Runs after the paid-stray guard, which does not name this range.
    expect(seed.indexOf('DO $$\nDECLARE v_orders integer')).toBeGreaterThan(
      seed.indexOf('SELECT public.seed_demo_assert_no_paid_strays();')
    );
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
