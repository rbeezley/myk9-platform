import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-text contract for MYK9-2202: the show-day fixture's entries have an entry form (one per
 * exhibitor per show) and are seeded owing, never "paid" with no money recorded anywhere. What the
 * function does on a database is proven by the native-stack reseed in the PR, not here.
 */

const repoRoot = resolve(__dirname, '../../../../..');
const stripSqlComments = (text: string): string => text.replace(/--[^\n]*/g, '');
const migration = stripSqlComments(
  readFileSync(
    join(repoRoot, 'supabase/migrations/20261119234100_myk9_2202_show_day_fixture_entry_forms.sql'),
    'utf8'
  )
);
const seed = stripSqlComments(readFileSync(join(repoRoot, 'supabase/seed-demo.sql'), 'utf8'));

const restoreBody = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.seed_demo_restore_show_day_fixture()'),
  migration.indexOf('$fn$;', migration.indexOf('FUNCTION public.seed_demo_restore'))
);
const retireBody = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.seed_demo_retire_stale_fixture_shows()'),
  migration.indexOf(
    '$fn$;',
    migration.indexOf('FUNCTION public.seed_demo_retire_stale_fixture_shows()')
  )
);

describe('show-day fixture entry forms (MYK9-2202)', () => {
  it('inserts one pending form per exhibitor in the marker range, with no money', () => {
    const insert = restoreBody.slice(
      restoreBody.indexOf('INSERT INTO public.enrollments'),
      restoreBody.indexOf(';', restoreBody.indexOf('INSERT INTO public.enrollments'))
    );
    expect(insert).toContain("(v_form_exhibitor, v_show, v_exhibitor, 'pending')");
    expect(insert).toContain("(v_form_secretary, v_show, v_secretary, 'pending')");
    expect(insert).not.toMatch(/paid_amount|total_amount|payment_method/);
    expect(restoreBody).toMatch(/v_form_exhibitor uuid := \('dededede-0000-0000-0731-'/);
  });

  it('seeds every fixture entry owing and linked to its owner form, never paid', () => {
    const entries = restoreBody.slice(restoreBody.indexOf('INSERT INTO public.entries'));
    expect(entries).toContain("'confirmed', 'pending', 30.00");
    expect(entries).not.toContain("'paid'");
    expect(entries).toContain('registration_id');
    expect(entries).toContain(
      'CASE WHEN k.handler_id = v_exhibitor THEN v_form_exhibitor ELSE v_form_secretary END'
    );
  });

  it('invents no money: no Stripe order, payment row or desk amount', () => {
    expect(restoreBody).not.toMatch(/stripe_orders|show_payments|paid_amount|refund/);
  });

  it('keeps the ACL and SECURITY mode of both functions', () => {
    expect(restoreBody).toContain("SECURITY DEFINER\nSET search_path = ''");
    expect(retireBody).toContain("SECURITY INVOKER\nSET search_path = ''");
    for (const fn of [
      'seed_demo_restore_show_day_fixture',
      'seed_demo_retire_stale_fixture_shows',
    ]) {
      expect(migration).toContain(
        `REVOKE ALL ON FUNCTION public.${fn}() FROM PUBLIC, anon, authenticated;`
      );
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${fn}() TO service_role;`);
    }
  });

  it('retire ignores only fixture-range forms the shared untouched rule passes', () => {
    const at = retireBody.indexOf('FROM public.enrollments en');
    const clause = retireBody.slice(at, retireBody.indexOf('waitlist_entries', at));
    expect(clause).toContain('en.show_id = v_show.id');
    expect(clause).toContain("AND NOT (en.id >= 'dededede-0000-0000-0731-000000000000'::uuid");
    expect(clause).toContain('public.seed_demo_fixture_form_untouched(en.id)');
  });

  it('the untouched rule checks money, notes and every dependent of a form', () => {
    const rule = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.seed_demo_fixture_form_untouched'),
      migration.indexOf('COMMENT ON FUNCTION public.seed_demo_fixture_form_untouched')
    );
    for (const part of [
      "payment_status = 'pending'",
      'paid_amount',
      'refund_amount',
      'card_covered_cents',
      'entry_form_notes',
      'show_lifecycle_email_jobs',
      'show_payments',
      'stripe_orders',
    ]) {
      expect(rule, part).toContain(part);
    }
  });

  it('the reseed keeps fixture entries on a touched form and deletes no form itself', () => {
    expect(seed).not.toMatch(
      /DELETE FROM public\.enrollments\s+WHERE id >= 'dededede-0000-0000-0731/
    );
    const at = seed.indexOf(
      "DELETE FROM public.entries\nWHERE id >= 'dededede-0000-0000-0731-000000000000'::uuid"
    );
    const statement = seed.slice(at, seed.indexOf(';', at));
    expect(statement).toContain(
      'registration_id IS NULL OR public.seed_demo_fixture_form_untouched(registration_id)'
    );
  });

  it('the by-dog fixture entry delete keeps the entries of a touched form too', () => {
    const at = seed.indexOf('DELETE FROM public.entries\nWHERE dog_id IN (');
    expect(at).toBeGreaterThan(-1);
    const statement = seed.slice(at, seed.indexOf(';\nDELETE FROM public.dog_registrations', at));
    expect(statement).toContain(
      'registration_id IS NULL OR public.seed_demo_fixture_form_untouched(registration_id)'
    );
  });
});
