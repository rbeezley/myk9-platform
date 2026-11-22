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

  it('seeds nine owing entries on two entry forms, with no money', () => {
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
    expect(forms).toContain('dededede-0000-0000-0836-000000000071');
    const code = section
      .slice(0, section.indexOf('DO $$\nDECLARE\n  v_entries'))
      .replace(/\n/g, ' ');
    expect(code).not.toMatch(/paid_amount\s*=|stripe_order|pi_|payment_method|total_amount/);
    expect(code.match(/INSERT INTO public\.stripe_orders/g)).toBeNull();
  });

  it('reuses the six demo dogs and adds none', () => {
    expect(section).not.toMatch(/INSERT INTO public\.dogs/);
    const dogIds = new Set(
      [...section.matchAll(/'(dededede-0000-0000-0000-0000000000(4[1-6]))'/g)].map(m => m[1])
    );
    expect(dogIds.size).toBeGreaterThanOrEqual(5);
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
    // Recorded money refuses the reseed, by show, enrollment and entry.
    const payments = cleanup.slice(
      cleanup.indexOf('FROM public.show_payments'),
      cleanup.indexOf('FROM public.entries')
    );
    for (const column of ['show_id', 'enrollment_id', 'entry_id']) {
      expect(payments).toContain(`(${column} >= ${LOW}`);
      expect(payments).toContain(`${column} <  ${HIGH}`);
    }
    expect(cleanup).toMatch(
      /enrollment_id >= [^;]*FROM public\.show_payments|FROM public\.stripe_orders[^;]*enrollment_id >=/
    );
    expect(cleanup).toContain('v_orders + v_card + v_payments > 0');
    expect(cleanup).toContain('Remove or void the recorded payment deliberately');
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
