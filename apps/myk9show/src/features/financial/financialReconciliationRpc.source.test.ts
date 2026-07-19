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
    expect(migrationSource).toMatch(/SUM\(so\.amount_cents\)/);
    expect(migrationSource).toMatch(/SUM\(so\.platform_fee_cents\)/);
    expect(migrationSource).toMatch(/SUM\(so\.entry_subtotal_cents\)/);
    expect(migrationSource).toMatch(/count\(\*\)/);
  });

  // REGRESSION PIN (found by executing the migration against a real Postgres,
  // not by reading it): the RETURNS TABLE output columns become PL/pgSQL
  // variables, and entry_subtotal_cents / platform_fee_cents / refunded_cents
  // collide with the CTE column of the same name. An UNQUALIFIED reference
  // raises `column reference "..." is ambiguous` at RUNTIME on every call — the
  // function still CREATEs fine, so neither a source pin nor a successful
  // migration apply catches it. Every aggregate must stay alias-qualified.
  it('alias-qualifies every aggregate so no column collides with an output variable', () => {
    for (const collidingColumn of [
      'entry_subtotal_cents',
      'platform_fee_cents',
      'refunded_cents',
      'amount_cents',
    ]) {
      // No bare SUM(<col>) — it must always be SUM(<alias>.<col>).
      expect(migrationSource).not.toMatch(new RegExp(`SUM\\(${collidingColumn}\\)`));
    }
    // And the aggregate FROMs must actually bind those aliases.
    expect(migrationSource).toMatch(/FROM scoped_orders so/);
    expect(migrationSource).toMatch(/FROM scoped_non_entry ne/);
    expect(migrationSource).toMatch(/FROM scoped_payouts sp/);
  });

  it('reports both refund kinds as SEPARATE explicit sums, never re-derived', () => {
    // A cart-overflow make-whole refund returns money for lines that were never
    // accepted: no platform fee was earned and no club transfer was made, so it
    // is NOT a platform loss. Only refunded_cents (POST-HOC) may reduce net income.
    // Both come straight from their own columns.
    expect(migrationSource).toMatch(/SUM\(so\.refunded_cents\)/);
    expect(migrationSource).toMatch(/SUM\(so\.make_whole_refunded_cents\)/);
    expect(migrationSource).toContain('make_whole_refunded_cents    bigint');
  });

  it('no longer DERIVES the split from amount − subtotal − fee (the tautology)', () => {
    // ROOT FIX: re-deriving overflow as amount − subtotal − fee is an identity for
    // a well-formed order, so an overflow order could never independently fail a
    // tie-out and charge verification was tautological. That expression, and the
    // post_hoc_refunded_cents output it fed, must be GONE.
    // No post_hoc_refunded_cents OUTPUT COLUMN any more (the header still
    // explains, in prose, why it was removed — that is intentional history).
    expect(migrationSource).not.toMatch(/^\s*post_hoc_refunded_cents\s+bigint/m);
    expect(migrationSource).not.toMatch(
      /so\.amount_cents - so\.entry_subtotal_cents - so\.platform_fee_cents/
    );
    // And no CASE-based per-order refund derivation feeding a SUM.
    expect(migrationSource).not.toMatch(/SUM\(\s*CASE/);
  });

  it('counts a snapshot as missing when EITHER column is null', () => {
    // Review finding 6: the snapshot contract and the client resolver both treat a
    // null entry_subtotal_cents OR a null platform_fee_cents as missing, so
    // counting only platform_fee_cents under-reported rate-unverifiable orders.
    expect(migrationSource).toMatch(
      /WHERE so\.platform_fee_cents IS NULL OR so\.entry_subtotal_cents IS NULL/
    );
  });

  it('exposes make_whole_refunded_cents on the orders detail row too', () => {
    // A per-row tie-out (amount == subtotal + fee + make_whole) needs it; deriving
    // it client-side would reintroduce the same tautology.
    expect(migrationSource).toMatch(/make_whole_refunded_cents {3}integer/);
    expect(migrationSource).toMatch(/o\.make_whole_refunded_cents/);
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
    expect(migrationSource).toMatch(/WHERE so\.stripe_processing_fee_cents IS NULL/);
  });

  it('scopes entry/fee accounting to ENTRY orders only', () => {
    // Review finding 1: one-time 'payment' orders carry a real amount and a real
    // processing fee but NO platform-fee snapshot. Folding them in would count
    // them as entry collections AND subtract their processing cost from fee
    // income they never contributed to. The entry CTE must filter order_type.
    expect(migrationSource).toMatch(
      /scoped_orders AS \(\s*SELECT \* FROM scoped_charges WHERE order_type = 'entry'/
    );
  });

  it('reports non-entry charges as a SEPARATE labeled total, never dropped', () => {
    expect(migrationSource).toContain('non_entry_order_count');
    expect(migrationSource).toContain('non_entry_gross_cents');
    expect(migrationSource).toMatch(/scoped_non_entry AS \(/);
    // Legacy NULL order_type falls into the non-entry bucket (IS DISTINCT FROM).
    expect(migrationSource).toMatch(/order_type IS DISTINCT FROM 'entry'/);
  });

  it('sums FAILED payouts as their own total, not merged into pending', () => {
    // Review finding 2: a failed transfer is still money owed to the club, so it
    // must have an amount — a bare count understates outstanding liability.
    expect(migrationSource).toContain('payout_failed_cents');
    expect(migrationSource).toMatch(
      /SUM\(sp\.amount_cents\), 0\) FROM scoped_payouts sp\s*\n\s*WHERE sp\.status = 'failed'/
    );
    // ...and must NOT be folded into the pending sum.
    expect(migrationSource).toMatch(
      /SUM\(sp\.amount_cents\), 0\) FROM scoped_payouts sp WHERE sp\.status IN \('pending', 'processing'\)/
    );
    expect(migrationSource).not.toMatch(/WHERE status IN \([^)]*'pending'[^)]*'failed'/);
  });

  it('excludes SUPERSEDED failed payouts (a failure already retried) from liability', () => {
    // Review finding 3: cron-process-payouts leaves the failed row in place and
    // INSERTs a new row for the retry, so a show can hold an old 'failed' row AND
    // a later completed/pending one. Summing every failed row kept an
    // already-retried-and-paid show counting as outstanding liability forever.
    // The unique index show_payouts_one_live_per_show is
    // `(show_id) WHERE status <> 'failed'`, so a show has AT MOST ONE non-failed
    // ("live") row — a failed row is genuinely outstanding only with NO live row.
    expect(migrationSource).toMatch(/has_live_payout/);
    expect(migrationSource).toMatch(/EXISTS \(\s*\n\s*SELECT 1 FROM public\.show_payouts live/);
    expect(migrationSource).toMatch(/live\.show_id = sp\.show_id/);
    expect(migrationSource).toMatch(/live\.status <> 'failed'/);
    // BOTH failed aggregates must apply the rule — amount and count alike.
    const guarded =
      migrationSource.match(/WHERE sp\.status = 'failed' AND NOT sp\.has_live_payout/g) ?? [];
    expect(guarded.length).toBe(2);
    // The rule must be documented, not silently applied.
    expect(migrationSource).toContain('show_payouts_one_live_per_show');
  });
});

describe('financial reconciliation RPC — detail/aggregate agreement (source-pinned)', () => {
  it('orders detail applies the SAME status + order_type predicate as the summary', () => {
    // Refund-bearing pending/processing rows are financially active and must
    // remain visible, while unrefunded failed/pending/cancelled rows stay out.
    const statusPredicates = migrationSource.match(/status IN \('succeeded', 'refunded'\)/g) ?? [];
    expect(statusPredicates.length).toBe(2); // summary CTE + orders detail
    const entryPredicates = migrationSource.match(/order_type = 'entry'/g) ?? [];
    // Summary CTE + orders detail (the header comment documents it a third time).
    expect(entryPredicates.length).toBeGreaterThanOrEqual(2);
    // The detail function specifically must carry both.
    const ordersFnBody = migrationSource.slice(
      migrationSource.indexOf(`FUNCTION public.${ordersFn}(`),
      migrationSource.indexOf(`REVOKE ALL ON FUNCTION public.${ordersFn}`)
    );
    expect(ordersFnBody).toContain("o.status IN ('succeeded', 'refunded')");
    expect(ordersFnBody).toContain('o.refunded_cents > 0');
    expect(ordersFnBody).toContain('o.make_whole_refunded_cents > 0');
    expect(ordersFnBody).toContain("o.order_type = 'entry'");
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
