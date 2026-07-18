// Source-pins the scoped, PII-free financial reconciliation RPC migration
// (financial-reconciliation, MYK9-54, task 1.7).
//
// A >1000-row aggregation cannot be exercised against a live DB from this
// vitest suite, so — following the source-text-regression convention (#624,
// same approach as orderSnapshot.source.test.ts) — we PIN the migration text to
// prove the authorization, PII exclusion, SQL-side aggregation, pagination, and
// grant properties that make large-scope totals correct and safe. Grep this
// file before touching migration 20260717130000.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260717130000_financial_reconciliation_rpc.sql'
  ),
  'utf8'
);

// The three callable RPCs plus the internal authorize helper.
const summaryFn = 'financial_reconciliation_summary';
const ordersFn = 'financial_reconciliation_orders';
const payoutsFn = 'financial_reconciliation_payouts';
const authorizeFn = '_financial_reconciliation_authorize';

describe('financial reconciliation RPC — authorization (source-pinned)', () => {
  it('authorizes platform scope with is_site_admin()', () => {
    expect(migrationSource).toContain("p_scope = 'platform'");
    expect(migrationSource).toContain('public.is_site_admin()');
  });

  it('authorizes club scope with is_club_admin(club_id)', () => {
    expect(migrationSource).toContain("p_scope = 'club'");
    expect(migrationSource).toContain('public.is_club_admin(p_club_id)');
  });

  it('authorizes show scope with can_manage_show(show_id)', () => {
    expect(migrationSource).toContain("p_scope = 'show'");
    expect(migrationSource).toContain('public.can_manage_show(p_show_id)');
  });

  it('RAISEs 42501 for an unauthorized caller (never a silent empty result)', () => {
    // Every scope branch must reject with a permission error.
    const raises = migrationSource.match(/RAISE EXCEPTION 'Not authorized[^']*'/g) ?? [];
    expect(raises.length).toBeGreaterThanOrEqual(3);
    expect(migrationSource).toContain("USING ERRCODE = '42501'");
  });

  it('rejects an unknown scope value', () => {
    expect(migrationSource).toContain('Unknown financial scope');
  });

  it('runs every reconciliation function through the shared authorize helper', () => {
    // Each of the three callable functions must PERFORM the authorize check.
    const performs =
      migrationSource.match(/PERFORM public\._financial_reconciliation_authorize\(/g) ?? [];
    expect(performs.length).toBe(3);
    expect(migrationSource).toContain(`FUNCTION public.${authorizeFn}(`);
  });
});

describe('financial reconciliation RPC — no customer PII (source-pinned)', () => {
  it('exposes only reconciliation identifiers, never customer PII columns', () => {
    // stripe_payment_intent_id / stripe_transfer_id are matchable Stripe ids and
    // are allowed; customer-identifying columns must never appear in a RETURNS
    // TABLE or a SELECT projection.
    for (const forbidden of [
      'email',
      'customer_id',
      'first_name',
      'last_name',
      'full_name',
      'person_id',
      'phone',
      'billing_name',
    ]) {
      expect(migrationSource).not.toContain(forbidden);
    }
    // Bare "name" would catch the forbidden columns above; assert it too, but
    // allow the allowed identifier ids we DO return.
    expect(migrationSource).not.toMatch(/\bcustomer_name\b/);
  });

  it('returns the Stripe ids needed for matching (allowed, not PII)', () => {
    expect(migrationSource).toContain('stripe_payment_intent_id');
    expect(migrationSource).toContain('stripe_transfer_id');
  });
});

describe('financial reconciliation RPC — SQL-side aggregation (source-pinned)', () => {
  // NOTE: a genuine >1000-row aggregation test needs a live DB and is not
  // runnable here. This pin proves the SUM/count happen INSIDE the SQL function
  // (so the PostgREST row cap can never understate a total), which is the
  // property that makes the >1000-row case correct.
  it('aggregates totals with SUM/count in the summary function body', () => {
    expect(migrationSource).toContain(`FUNCTION public.${summaryFn}(`);
    expect(migrationSource).toMatch(/SUM\(amount_cents\)/);
    expect(migrationSource).toMatch(/SUM\(platform_fee_cents\)/);
    expect(migrationSource).toMatch(/SUM\(entry_subtotal_cents\)/);
    expect(migrationSource).toMatch(/count\(\*\)/);
  });

  it('keeps charge facts and payout settlement as separate totals', () => {
    // Two independent CTEs — charges never conflated with transfers.
    expect(migrationSource).toContain('scoped_orders');
    expect(migrationSource).toContain('scoped_payouts');
    expect(migrationSource).toContain('public.stripe_orders');
    expect(migrationSource).toContain('public.show_payouts');
  });

  it('surfaces a pending processing fee as a COUNT, not a zeroed SUM', () => {
    // NULL fees are excluded from the captured-fee SUM and counted separately.
    expect(migrationSource).toContain('processing_fee_pending_count');
    expect(migrationSource).toMatch(/WHERE stripe_processing_fee_cents IS NULL/);
  });
});

describe('financial reconciliation RPC — pagination (source-pinned)', () => {
  it('detail functions take keyset cursor + limit params', () => {
    for (const fn of [ordersFn, payoutsFn]) {
      expect(migrationSource).toContain(`FUNCTION public.${fn}(`);
    }
    expect(migrationSource).toContain('p_after_created_at');
    expect(migrationSource).toContain('p_after_id');
    expect(migrationSource).toContain('p_limit');
  });

  it('orders detail rows by the stable (created_at, id) keyset', () => {
    const keyset = migrationSource.match(/ORDER BY \w+\.created_at ASC, \w+\.id ASC/g) ?? [];
    expect(keyset.length).toBe(2); // orders + payouts
    // Cursor comparison uses the row-value tuple for a strict > keyset.
    expect(migrationSource).toMatch(
      /\(\w+\.created_at, \w+\.id\) > \(p_after_created_at, p_after_id\)/
    );
  });

  it('clamps the page limit so a caller cannot request an unbounded page', () => {
    expect(migrationSource).toMatch(/LEAST\(GREATEST\(COALESCE\(p_limit, 200\), 1\), 1000\)/);
  });
});

describe('financial reconciliation RPC — security definer + grants (source-pinned)', () => {
  it('every function is SECURITY DEFINER with a locked search_path', () => {
    // All four function definitions pin search_path (comment mentions also
    // match, so assert at least one per function).
    const searchPaths = migrationSource.match(/^SET search_path = ''$/gm) ?? [];
    expect(searchPaths.length).toBe(4);
    // The three table-reading RPCs are SECURITY DEFINER; the authorize helper
    // deliberately is NOT (it only calls other functions). Count definer lines
    // that sit on their own line (function-body clauses, not prose).
    const definers = migrationSource.match(/^SECURITY DEFINER$/gm) ?? [];
    expect(definers.length).toBe(3);
  });

  it('grants EXECUTE to authenticated and revokes from PUBLIC per callable RPC', () => {
    for (const fn of [summaryFn, ordersFn, payoutsFn]) {
      expect(migrationSource).toContain(`GRANT EXECUTE ON FUNCTION public.${fn}`);
    }
    const revokes = migrationSource.match(/REVOKE ALL ON FUNCTION public\.\w+/g) ?? [];
    expect(revokes.length).toBe(4); // 3 RPCs + authorize helper
  });

  it('does NOT grant the internal authorize helper to authenticated', () => {
    expect(migrationSource).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\._financial_reconciliation_authorize/
    );
  });

  it('reloads the PostgREST schema cache', () => {
    expect(migrationSource).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
