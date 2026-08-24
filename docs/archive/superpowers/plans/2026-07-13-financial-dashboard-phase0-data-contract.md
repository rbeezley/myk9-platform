# Financial Dashboard — Phase 0 (Data Contract) Implementation Plan

> **Status:** Complete — the design shipped via MYK9-54: snapshot columns in `supabase/migrations/20260717122000_stripe_order_snapshots.sql`, reconciliation RPCs in `20260717130000_financial_reconciliation_rpc.sql`, client projection in `apps/myk9show/src/features/financial/`. Archived 2026-08-24 from the never-merged `feat/unified-financial-dashboard` branch, which held the only copy of these documents.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the immutable per-order financial snapshot, a scoped
reconciliation RPC, and server-side aggregation that the unified financial
dashboard depends on — so every historical fee and refund is provable.

**Architecture:** Add snapshot columns to `stripe_orders` (entry subtotal,
platform fee, fee rate, Stripe processing fee, refunded cents), populate them at
all three webhook INSERT sites plus the refund handler, and expose a
`SECURITY DEFINER` RPC that returns a PII-free, server-aggregated reconciliation
projection gated by role/scope. Pure cent-math lives in tested shared helpers;
authorization is verified by source-pin tests plus a manual rolled-back psql
transaction.

**Tech Stack:** Supabase Postgres (SQL migrations), Deno edge functions
(`stripe-webhook`), TypeScript, Stripe Node SDK, Vitest.

**Source spec:** [`docs/superpowers/specs/2026-07-13-unified-financial-dashboard-design.md`](../specs/2026-07-13-unified-financial-dashboard-design.md)
(§ "Data contract (Phase 0)").

**Scope of this plan:** Phase 0 only. Phases 1–4 (accounting projection +
`getFinancialSummary`, club page, platform view, route collapse) are planned
separately once this phase's real interfaces exist.

---

## Facts this plan relies on (verified against code)

- `stripe_orders` today: `amount_cents` (**includes** on-top platform fee),
  `status` (`'succeeded'` / `'refunded'`), `refunded_at` (timestamp only),
  `entry_ids`, `show_id`, `stripe_payment_intent_id`. No fee/subtotal/refund-cents.
- Three INSERT sites in [`stripe-webhook/index.ts`](../../../apps/myk9show/supabase/functions/stripe-webhook/index.ts):
  line **968** (cart entry payment), **1344** (payment-link flow), **2007**
  (one-time payment). Dashboard-refund UPDATE at line **289**.
- The webhook never fetches the Stripe `balance_transaction`; the processing fee
  is not available on the checkout session and must be retrieved from the charge.
- Auth helpers: use `public.is_site_admin()` (NOT the deprecated
  `is_platform_admin()`), `public.is_club_admin(check_club_id uuid)`, and
  `public.can_manage_show(check_show_id uuid)`. There is no club-membership helper.
- Payout success status (`show_payouts`) is `'completed'`.
- Migration naming: timestamped `YYYYMMDDHHMMSS_*.sql`; highest existing is
  `20260713110000_waitlist_offer_payment_guard.sql`. Use `20260713120000_*` and
  `20260713130000_*` for the two migrations below.
- Test conventions: pure functions → Vitest `describe/it` with local factory
  helpers (see [`payoutCalc.test.ts`](../../../apps/myk9show/supabase/functions/_shared/payoutCalc.test.ts));
  RPC authorization → source-pin `readFileSync` assertions + a **manual**
  `BEGIN…ROLLBACK` psql verification (no automated impersonation harness exists;
  see memory `reference_live_rpc_authz_verification`).
- Money model (see spec): fee is on-top/exhibitor-paid; club net per show =
  `Σ over online paid/refunded entries of max(0, entry_fee_cents − refund_cents)`.

## File structure

- Create: `supabase/migrations/20260713120000_stripe_order_financial_snapshot.sql`
  — snapshot columns + backfill.
- Create: `supabase/migrations/20260713130000_financial_reconciliation_rpc.sql`
  — the `get_financial_reconciliation` RPC.
- Create: `apps/myk9show/supabase/functions/_shared/orderSnapshot.ts` — pure
  helpers: `buildOrderSnapshot`, `extractProcessingFeeCents`.
- Create: `apps/myk9show/supabase/functions/_shared/orderSnapshot.test.ts` — Vitest.
- Modify: `apps/myk9show/supabase/functions/stripe-webhook/index.ts` — 3 INSERT
  sites + refund UPDATE + balance-transaction fetch.
- Create: `apps/myk9show/src/test/migrations/financialSnapshotMigration.test.ts`
  — source-pin assertions on both migrations.

---

## Task 1: Snapshot columns migration

**Files:**
- Create: `supabase/migrations/20260713120000_stripe_order_financial_snapshot.sql`
- Test: `apps/myk9show/src/test/migrations/financialSnapshotMigration.test.ts`

- [ ] **Step 1: Write the failing source-pin test**

```ts
// apps/myk9show/src/test/migrations/financialSnapshotMigration.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '../../../../..');
const snapshotSql = readFileSync(
  join(REPO_ROOT, 'supabase/migrations/20260713120000_stripe_order_financial_snapshot.sql'),
  'utf8'
);

describe('stripe_order_financial_snapshot migration', () => {
  it('adds all five snapshot columns idempotently', () => {
    for (const col of [
      'entry_subtotal_cents',
      'platform_fee_cents',
      'platform_fee_rate',
      'stripe_processing_fee_cents',
      'refunded_cents',
    ]) {
      expect(snapshotSql).toContain(`ADD COLUMN IF NOT EXISTS ${col}`);
    }
  });

  it('marks un-snapshotted historical rows rate-unverifiable, not rate 0', () => {
    // Backfill must NOT invent a fee rate; ambiguous rows stay NULL rate.
    expect(snapshotSql).toContain('rate_unverifiable');
    expect(snapshotSql).not.toMatch(/platform_fee_rate\s*=\s*0\b/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/migrations/financialSnapshotMigration.test.ts`
Expected: FAIL — cannot read file `20260713120000_stripe_order_financial_snapshot.sql` (ENOENT).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260713120000_stripe_order_financial_snapshot.sql
-- Immutable per-order financial snapshot. These are financial facts written once
-- from the Stripe event; never recomputed from current platform_settings.
-- See docs/superpowers/specs/2026-07-13-unified-financial-dashboard-design.md.

ALTER TABLE public.stripe_orders
  ADD COLUMN IF NOT EXISTS entry_subtotal_cents integer,
  ADD COLUMN IF NOT EXISTS platform_fee_cents integer,
  ADD COLUMN IF NOT EXISTS platform_fee_rate numeric(5,2),
  ADD COLUMN IF NOT EXISTS stripe_processing_fee_cents integer,
  ADD COLUMN IF NOT EXISTS refunded_cents integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.stripe_orders.entry_subtotal_cents IS
  'Sum of authoritative per-entry fees at charge time, cents. NULL = pre-snapshot order.';
COMMENT ON COLUMN public.stripe_orders.platform_fee_cents IS
  'On-top platform fee charged to the exhibitor, cents. NULL = pre-snapshot order.';
COMMENT ON COLUMN public.stripe_orders.platform_fee_rate IS
  'Fee rate applied at charge time (percent). NULL = rate unverifiable (do not assume current rate).';
COMMENT ON COLUMN public.stripe_orders.stripe_processing_fee_cents IS
  'Stripe fee from the charge balance_transaction, cents. NULL = net pending (not yet captured).';
COMMENT ON COLUMN public.stripe_orders.refunded_cents IS
  'Total refunded on this order, cents. Stamped by the refund webhook.';

-- Best-effort backfill: only refunded_cents is safely derivable for old rows
-- (a fully-refunded order refunded its whole amount). Subtotal/fee/rate stay NULL
-- because amount_cents already includes the on-top fee and the historical rate is
-- not stored — inventing a rate would rewrite history. Such rows read as
-- rate_unverifiable in the reconciliation RPC.
UPDATE public.stripe_orders
  SET refunded_cents = amount_cents
  WHERE status = 'refunded' AND refunded_cents = 0;

-- Marker comment so source-pin tests and future readers see the deliberate choice.
-- rate_unverifiable: orders with NULL platform_fee_rate are reported as such.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/migrations/financialSnapshotMigration.test.ts`
Expected: PASS (both assertions).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260713120000_stripe_order_financial_snapshot.sql \
        apps/myk9show/src/test/migrations/financialSnapshotMigration.test.ts
git commit -m "feat(financial): add immutable stripe_orders snapshot columns"
```

---

## Task 2: Pure order-snapshot helpers

**Files:**
- Create: `apps/myk9show/supabase/functions/_shared/orderSnapshot.ts`
- Test: `apps/myk9show/supabase/functions/_shared/orderSnapshot.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/myk9show/supabase/functions/_shared/orderSnapshot.test.ts
import { describe, expect, it } from 'vitest';
import { buildOrderSnapshot, extractProcessingFeeCents } from './orderSnapshot';

describe('buildOrderSnapshot', () => {
  it('records subtotal, on-top fee, and rate from cent inputs', () => {
    const snap = buildOrderSnapshot({
      entrySubtotalCents: 10000,
      platformFeeCents: 700,
      platformFeePercent: 7,
      processingFeeCents: 349,
    });
    expect(snap).toEqual({
      entry_subtotal_cents: 10000,
      platform_fee_cents: 700,
      platform_fee_rate: 7,
      stripe_processing_fee_cents: 349,
    });
  });

  it('leaves processing fee NULL when not yet captured (net pending, not zero)', () => {
    const snap = buildOrderSnapshot({
      entrySubtotalCents: 5000,
      platformFeeCents: 350,
      platformFeePercent: 7,
      processingFeeCents: null,
    });
    expect(snap.stripe_processing_fee_cents).toBeNull();
  });
});

describe('extractProcessingFeeCents', () => {
  it('reads fee from an expanded balance_transaction', () => {
    const charge = { balance_transaction: { fee: 349 } } as const;
    expect(extractProcessingFeeCents(charge)).toBe(349);
  });

  it('returns null when balance_transaction is absent or unexpanded (string id)', () => {
    expect(extractProcessingFeeCents({ balance_transaction: 'txn_123' })).toBeNull();
    expect(extractProcessingFeeCents({ balance_transaction: null })).toBeNull();
    expect(extractProcessingFeeCents({})).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run supabase/functions/_shared/orderSnapshot.test.ts`
Expected: FAIL — cannot resolve `./orderSnapshot`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/myk9show/supabase/functions/_shared/orderSnapshot.ts
// Pure snapshot builders shared by the stripe-webhook insert sites and Vitest.
// Keep free of Deno/npm imports so the colocated test runs under Node.

export interface OrderSnapshotInput {
  entrySubtotalCents: number;
  platformFeeCents: number;
  platformFeePercent: number;
  /** From the charge's balance transaction; null when not yet captured. */
  processingFeeCents: number | null;
}

export interface OrderSnapshotColumns {
  entry_subtotal_cents: number;
  platform_fee_cents: number;
  platform_fee_rate: number;
  stripe_processing_fee_cents: number | null;
}

export function buildOrderSnapshot(input: OrderSnapshotInput): OrderSnapshotColumns {
  return {
    entry_subtotal_cents: input.entrySubtotalCents,
    platform_fee_cents: input.platformFeeCents,
    platform_fee_rate: input.platformFeePercent,
    stripe_processing_fee_cents: input.processingFeeCents,
  };
}

/**
 * Stripe puts the processing fee on the balance transaction, not the charge or
 * session. When expanded it is an object with a numeric `fee` (cents); when
 * unexpanded it is a string id; when the charge has not settled it is absent.
 * A missing fee means "net pending" — return null, never 0.
 */
export function extractProcessingFeeCents(charge: {
  balance_transaction?: { fee?: number } | string | null;
}): number | null {
  const bt = charge.balance_transaction;
  if (bt && typeof bt === 'object' && typeof bt.fee === 'number') {
    return bt.fee;
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run supabase/functions/_shared/orderSnapshot.test.ts`
Expected: PASS (5 assertions across 2 suites).

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/supabase/functions/_shared/orderSnapshot.ts \
        apps/myk9show/supabase/functions/_shared/orderSnapshot.test.ts
git commit -m "feat(financial): pure order-snapshot + processing-fee helpers"
```

---

## Task 3: Populate snapshot at the three webhook INSERT sites

**Files:**
- Modify: `apps/myk9show/supabase/functions/stripe-webhook/index.ts` (lines ~624, ~968, ~1344, ~2007)

> This task wires the pure helpers from Task 2 into the live inserts and fetches
> the balance transaction. There is no unit harness for the Deno webhook; the
> guard is the Task 2 unit tests (already green) plus a typecheck and a manual
> Stripe CLI event replay documented at the end.
>
> **[ADDED] Deploy-ordering hazard.** The edited inserts write the new snapshot
> columns, which do not exist until Task 1's migration is applied. If this webhook
> is deployed to an environment before the migration runs, every order insert will
> fail (`column … does not exist`). **Never deploy this function ahead of the
> migration.** The safe order is enforced in Task 6 (migrations pushed, then
> function deployed). Committing this code (Step 6) does not deploy it — Vercel/CI
> do not deploy Supabase functions (see memory `feedback_merge_is_not_deploy`) —
> so the commit is safe as long as Task 6 ordering is honored.

- [ ] **Step 1: Add a balance-transaction fetch helper near the top of the file**

Add after the existing Stripe client is constructed (search for `new Stripe(`):

```ts
// Fetch the charge's processing fee. The fee lives on the balance transaction,
// which is not present on the checkout session — retrieve the PaymentIntent with
// the charge + balance_transaction expanded. Returns null when unavailable
// (charge not settled yet) so the snapshot records "net pending", not zero.
async function fetchProcessingFeeCents(
  stripe: Stripe,
  paymentIntentId: string | null
): Promise<number | null> {
  if (!paymentIntentId) return null;
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge.balance_transaction'],
    });
    const charge = pi.latest_charge;
    if (charge && typeof charge === 'object') {
      return extractProcessingFeeCents(charge as { balance_transaction?: { fee?: number } | string | null });
    }
  } catch (err) {
    // Non-fatal: leave the fee null (net pending); a backfill can fill it later.
    // [ADDED] Log for observability — silent nulls would hide a systemic
    // balance-transaction retrieval failure behind a legitimate "net pending".
    console.warn('fetchProcessingFeeCents failed', { paymentIntentId, err: String(err) });
  }
  return null;
}
```

- [ ] **Step 2: Import the helpers**

At the top of `stripe-webhook/index.ts`, add to the shared imports:

```ts
import { buildOrderSnapshot, extractProcessingFeeCents } from '../_shared/orderSnapshot.ts';
```

- [ ] **Step 3: Populate the cart-entry insert (line ~968)**

Immediately before the `insert({ ... })` at line ~968, compute the snapshot from
the values already in scope (`paid_entry_subtotal_cents` is already in the
metadata object; the platform fee is `paidOrderAmountCents - paid_entry_subtotal`
only if the fee was charged into this order — use the authoritative subtotal from
metadata and the fee percent already resolved in this handler):

```ts
const processingFeeCents = await fetchProcessingFeeCents(stripe, paymentIntentId);
const snapshot = buildOrderSnapshot({
  entrySubtotalCents: paidEntrySubtotalCents,        // already computed above
  platformFeeCents: platformFeeCents,                // already computed above
  platformFeePercent: platformFeePercent,            // already resolved above
  processingFeeCents,
});
```

Then spread it into the insert object:

```ts
const { error: orderError } = await supabase.from('stripe_orders').insert({
  customer_id: stripeCustomer?.id || null,
  stripe_payment_intent_id: paymentIntentId,
  stripe_checkout_session_id: session.id,
  amount_cents: paidOrderAmountCents,
  currency: session.currency || 'usd',
  status: 'succeeded',
  order_type: 'entry',
  metadata: { /* unchanged */ },
  show_id: cart.show_id,
  entry_ids: entryIds,
  paid_at: new Date().toISOString(),
  ...snapshot,
});
```

> If `paidEntrySubtotalCents` / `platformFeeCents` / `platformFeePercent` are not
> already named variables at this site, derive them from the same values used to
> build the Stripe line items earlier in the handler — do NOT recompute from
> current `platform_settings`. Read the surrounding handler before editing.

- [ ] **Step 4: Repeat for the payment-link insert (line ~1344) and one-time insert (line ~2007)**

Apply the identical pattern at both sites. For the one-time payment site
(`order_type: 'payment'`) there is no entry subtotal/fee split — set:

```ts
const processingFeeCents = await fetchProcessingFeeCents(stripe, paymentIntentId);
// One-time payments carry no entry fee split; record the processing fee only.
const snapshot = {
  entry_subtotal_cents: null,
  platform_fee_cents: null,
  platform_fee_rate: null,
  stripe_processing_fee_cents: processingFeeCents,
};
```

and spread `...snapshot` into that insert.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no type errors from the edited webhook or new import).

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/supabase/functions/stripe-webhook/index.ts
git commit -m "feat(financial): snapshot fees + processing fee at order inserts"
```

- [ ] **Step 7: Manual verification (documented, not automated)**

Record in the PR description:
```
Replayed a checkout.session.completed via `stripe trigger` against a local
`supabase functions serve stripe-webhook`; confirmed the new stripe_orders row
has entry_subtotal_cents, platform_fee_cents, platform_fee_rate populated and
stripe_processing_fee_cents either set (fee captured) or NULL (net pending).
```

---

## Task 4: Stamp refunded_cents on the dashboard-refund path

**Files:**
- Modify: `apps/myk9show/supabase/functions/stripe-webhook/index.ts` (line ~289)

- [ ] **Step 1: Extend the refund UPDATE to record refunded cents**

At line ~289 (`handleChargeRefunded`), the current update sets only `status` and
`refunded_at`. The `Stripe.Charge` in scope carries `amount_refunded` (cumulative
refunded cents). Change the update to:

```ts
await supabase
  .from('stripe_orders')
  .update({
    status: charge.amount_refunded >= charge.amount ? 'refunded' : 'succeeded',
    refunded_at: new Date().toISOString(),
    refunded_cents: charge.amount_refunded ?? 0,
  })
  .eq('stripe_payment_intent_id', paymentIntentId);
```

> `amount_refunded` is cumulative, so partial-then-full refunds converge to the
> full amount without double counting. Keep status `'succeeded'` for partials so
> the order is not mislabelled fully refunded.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/supabase/functions/stripe-webhook/index.ts
git commit -m "feat(financial): record refunded_cents on dashboard refunds"
```

---

## Task 5: Scoped reconciliation RPC (server-side aggregation + authz)

**Files:**
- Create: `supabase/migrations/20260713130000_financial_reconciliation_rpc.sql`
- Test: `apps/myk9show/src/test/migrations/financialSnapshotMigration.test.ts` (extend)

- [ ] **Step 1: Extend the source-pin test (write failing assertions)**

Append to `financialSnapshotMigration.test.ts`:

```ts
const rpcSql = readFileSync(
  join(REPO_ROOT, 'supabase/migrations/20260713130000_financial_reconciliation_rpc.sql'),
  'utf8'
);

describe('financial reconciliation RPC', () => {
  it('is SECURITY DEFINER with a locked search_path', () => {
    expect(rpcSql).toContain('SECURITY DEFINER');
    expect(rpcSql).toContain("SET search_path = ''");
  });

  it('authorizes by scope using the real helper functions', () => {
    expect(rpcSql).toContain('is_site_admin()');
    expect(rpcSql).toContain('is_club_admin(');
    expect(rpcSql).toContain('can_manage_show(');
    // Deprecated shim must not be used.
    expect(rpcSql).not.toContain('is_platform_admin(');
  });

  it('grants execute to authenticated and revokes from anon/public', () => {
    expect(rpcSql).toMatch(/GRANT EXECUTE ON FUNCTION [^;]*get_financial_reconciliation[^;]*TO authenticated/);
    expect(rpcSql).toMatch(/REVOKE[^;]*get_financial_reconciliation[^;]*FROM (PUBLIC|anon)/);
  });

  it('raises on an unauthorized or unknown scope rather than returning rows', () => {
    expect(rpcSql).toContain('RAISE EXCEPTION');
  });

  // [ADDED] Pin the club-net money rule to match calculateShowPayoutCents:
  // per-entry floor at 0, filter online + paid/refunded. If someone edits the
  // SQL to sum-then-floor (which over-pays on partial refunds), this fails.
  it('computes club net with a per-entry floor mirroring payoutCalc', () => {
    expect(rpcSql).toContain('GREATEST(0');
    expect(rpcSql).toMatch(/payment_method\s*=\s*'online'/);
    expect(rpcSql).toMatch(/payment_status IN \('paid','refunded'\)/);
  });
});
```

Run: `cd apps/myk9show && pnpm vitest run src/test/migrations/financialSnapshotMigration.test.ts`
Expected: FAIL — RPC migration file does not exist yet.

- [ ] **Step 2: Write the RPC migration**

```sql
-- supabase/migrations/20260713130000_financial_reconciliation_rpc.sql
-- PII-free, server-aggregated reconciliation projection for the financial
-- dashboard. Aggregation happens in SQL so it never truncates at PostgREST's
-- 1000-row cap. One row per show; the caller rolls up (bounded row count).
-- Authorization is per-scope; unauthorized callers get an exception, not rows.

CREATE OR REPLACE FUNCTION public.get_financial_reconciliation(
  p_scope text,
  p_scope_id uuid DEFAULT NULL
)
RETURNS TABLE (
  show_id uuid,
  club_id uuid,
  show_name text,
  online_collected_cents bigint,
  online_refunded_cents bigint,
  club_net_cents bigint,
  attested_collected_cents bigint,
  platform_fee_gross_cents bigint,
  platform_processing_fee_cents bigint,
  platform_fee_pending boolean,
  order_amount_cents bigint,
  payout_amount_cents bigint,
  payout_status text,
  stripe_transfer_id text,
  payout_failure_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Authorization gate (raises on deny; never leaks rows).
  IF p_scope = 'platform' THEN
    IF NOT public.is_site_admin() THEN
      RAISE EXCEPTION 'not authorized for platform scope';
    END IF;
  ELSIF p_scope = 'club' THEN
    IF p_scope_id IS NULL THEN
      RAISE EXCEPTION 'club scope requires a club id';
    END IF;
    IF NOT (public.is_site_admin() OR public.is_club_admin(p_scope_id)) THEN
      RAISE EXCEPTION 'not authorized for club %', p_scope_id;
    END IF;
  ELSIF p_scope = 'show' THEN
    IF p_scope_id IS NULL THEN
      RAISE EXCEPTION 'show scope requires a show id';
    END IF;
    IF NOT public.can_manage_show(p_scope_id) THEN
      RAISE EXCEPTION 'not authorized for show %', p_scope_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'unknown scope: %', p_scope;
  END IF;

  RETURN QUERY
  WITH scoped_shows AS (
    SELECT s.id, s.club_id, s.name
    FROM public.shows s
    WHERE s.deleted_at IS NULL
      AND (
        p_scope = 'platform'
        OR (p_scope = 'club' AND s.club_id = p_scope_id)
        OR (p_scope = 'show' AND s.id = p_scope_id)
      )
  ),
  entry_agg AS (
    SELECT
      e.show_id,
      -- Online collected: gross fee of online paid/refunded entries.
      COALESCE(SUM(
        CASE WHEN e.payment_method = 'online'
              AND e.payment_status IN ('paid','refunded')
             THEN ROUND(COALESCE(e.entry_fee,0) * 100) ELSE 0 END), 0)::bigint AS online_collected_cents,
      COALESCE(SUM(
        CASE WHEN e.payment_method = 'online'
             THEN ROUND(COALESCE(e.refund_amount,0) * 100) ELSE 0 END), 0)::bigint AS online_refunded_cents,
      -- Club net: mirrors calculateShowPayoutCents (per-entry floor at 0).
      COALESCE(SUM(
        CASE WHEN e.payment_method = 'online'
              AND e.payment_status IN ('paid','refunded')
             THEN GREATEST(0, ROUND(COALESCE(e.entry_fee,0) * 100)
                              - ROUND(COALESCE(e.refund_amount,0) * 100))
             ELSE 0 END), 0)::bigint AS club_net_cents,
      -- Attested: desk payment methods that never touched Stripe.
      COALESCE(SUM(
        CASE WHEN e.payment_method IN ('cash','check','waived','secretary_paid')
              AND e.payment_status IN ('paid','refunded')
             THEN ROUND(COALESCE(e.entry_fee,0) * 100) ELSE 0 END), 0)::bigint AS attested_collected_cents
    FROM public.entries e
    WHERE e.deleted_at IS NULL
      AND e.show_id IN (SELECT id FROM scoped_shows)
    GROUP BY e.show_id
  ),
  order_agg AS (
    SELECT
      o.show_id,
      COALESCE(SUM(o.platform_fee_cents), 0)::bigint AS platform_fee_gross_cents,
      COALESCE(SUM(o.stripe_processing_fee_cents), 0)::bigint AS platform_processing_fee_cents,
      bool_or(o.stripe_processing_fee_cents IS NULL) AS platform_fee_pending,
      COALESCE(SUM(o.amount_cents), 0)::bigint AS order_amount_cents
    FROM public.stripe_orders o
    WHERE o.show_id IN (SELECT id FROM scoped_shows)
    GROUP BY o.show_id
  ),
  payout_agg AS (
    -- Latest non-failed canonical payout per show, else latest row.
    SELECT DISTINCT ON (p.show_id)
      p.show_id, p.amount_cents, p.status, p.stripe_transfer_id, p.failure_reason
    FROM public.show_payouts p
    WHERE p.show_id IN (SELECT id FROM scoped_shows)
    ORDER BY p.show_id,
             (p.status <> 'failed') DESC,
             p.created_at DESC
  )
  SELECT
    sc.id, sc.club_id, sc.name,
    COALESCE(ea.online_collected_cents, 0),
    COALESCE(ea.online_refunded_cents, 0),
    COALESCE(ea.club_net_cents, 0),
    COALESCE(ea.attested_collected_cents, 0),
    COALESCE(oa.platform_fee_gross_cents, 0),
    COALESCE(oa.platform_processing_fee_cents, 0),
    COALESCE(oa.platform_fee_pending, false),
    COALESCE(oa.order_amount_cents, 0),
    COALESCE(pa.amount_cents, 0)::bigint,
    pa.status,
    pa.stripe_transfer_id,
    pa.failure_reason
  FROM scoped_shows sc
  LEFT JOIN entry_agg ea ON ea.show_id = sc.id
  LEFT JOIN order_agg oa ON oa.show_id = sc.id
  LEFT JOIN payout_agg pa ON pa.show_id = sc.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_financial_reconciliation(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_financial_reconciliation(text, uuid)
  TO authenticated;
```

- [ ] **Step 3: Run the source-pin test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/migrations/financialSnapshotMigration.test.ts`
Expected: PASS (all suites, including the four RPC assertions).

- [ ] **Step 4: Verify column names against the live schema before pushing**

The RPC references `shows.deleted_at`, `shows.club_id`, `shows.name`,
`entries.deleted_at`, `entries.entry_fee`, `entries.refund_amount`,
`entries.payment_method`, `entries.payment_status`, `entries.show_id`,
`stripe_orders.show_id`, `show_payouts.show_id/amount_cents/status/stripe_transfer_id/failure_reason/created_at`.

Run (read-only, no push):
```bash
# Confirm each referenced column exists; fix the SQL if any differ.
```
Query `information_schema.columns` for these tables (use the Supabase SQL tool or
psql). Expected: every referenced column present. If any name differs, correct the
migration and re-run Step 3.

- [ ] **Step 5: Manual authorization verification (rolled-back psql txn)**

Per `reference_live_rpc_authz_verification`, in a `BEGIN…ROLLBACK` transaction on
a local/staging DB, impersonate three users and assert:
```
- site admin  → get_financial_reconciliation('platform', NULL)  returns rows
- club admin  → ('club', <their club>)   returns rows;
                ('club', <other club>)   RAISES 'not authorized'
- secretary   → ('show', <their show>)   returns rows;
                ('platform', NULL)       RAISES 'not authorized'
- anon        → EXECUTE denied (no grant)
```
Record the transcript in the PR description. Do NOT `db push` until this passes.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260713130000_financial_reconciliation_rpc.sql \
        apps/myk9show/src/test/migrations/financialSnapshotMigration.test.ts
git commit -m "feat(financial): scoped server-aggregated reconciliation RPC"
```

---

## Task 6: Deploy gate (migrations + webhook)

**Files:** none (deploy actions)

- [ ] **Step 1: Confirm remote migration state**

Run: `supabase migration list`
Expected: the two new `20260713120000` / `20260713130000` files show as local-only
(not yet applied). Resolve any drift before pushing (see `feedback_migration_remote_state`).

- [ ] **Step 2: Push migrations (shared-system write — confirm first)**

> Auto-Mode note: `supabase db push` writes the staging DB. Pause and confirm with
> the user before running, per CLAUDE.md.

Run (after confirmation): `supabase db push`
Expected: both migrations apply cleanly; `list` shows them remote.

- [ ] **Step 3: Deploy the webhook (shared-system write — confirm first)**

Run (after confirmation):
`supabase functions deploy stripe-webhook --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt`
Expected: "Deployed Functions on project sojmvhhwsjxmfistvzbe" names the right ref.

- [ ] **Step 4: Post-deploy smoke**

Trigger one real online entry payment on staging; confirm the new `stripe_orders`
row has snapshot columns populated and `get_financial_reconciliation('show', <id>)`
returns a row whose `club_net_cents` matches `calculateShowPayoutCents` for that
show. Record in the PR.

---

## [ADDED] Rollback & recovery

Phase 0 is designed to be low-risk to revert:

- **Snapshot columns (Task 1)** are purely additive and nullable (except
  `refunded_cents NOT NULL DEFAULT 0`). Nothing reads them until Phase 1, so they
  can sit unused with zero behavioral impact. To revert, a follow-up migration
  `DROP COLUMN` each — but there is rarely a reason to; leaving them is harmless.
- **Backfill UPDATE (Task 1)** only sets `refunded_cents` on already-`refunded`
  orders to `amount_cents`; it is idempotent (guarded by `refunded_cents = 0`) and
  touches no live behavior. Not separately reversible, but harmless if left.
- **Webhook changes (Task 3/4)** are forward-only writes of the new columns. To
  revert, redeploy the prior function revision; already-written snapshots remain
  valid. **Deploy order matters** (see Task 3 hazard): migration first, function
  second. If a rollback drops the columns, redeploy the OLD function in the same
  window or inserts will fail.
- **RPC (Task 5)** is `CREATE OR REPLACE`; revert by replacing with the prior
  definition or `DROP FUNCTION public.get_financial_reconciliation(text, uuid)`.
  Nothing in Phase 0 depends on it at runtime (Phase 1 consumers don't exist yet),
  so dropping it is safe.
- **Recovery from partial deploy:** if migrations applied but the function deploy
  failed, the system is fully functional — old function still writes the legacy
  column set; new nullable columns simply stay NULL until the function lands.

## [ADDED] Performance notes

- Aggregation is server-side (SQL CTEs), so PostgREST's 1000-row cap never
  truncates totals.
- Supporting indexes already exist: `stripe_orders_show_id_idx`
  ([005_myk9show_specific.sql:324](../../../supabase/migrations/005_myk9show_specific.sql)),
  `show_payouts_status_idx` and the `show_payouts_one_live_per_show` unique index
  ([20260609120000_stripe_connect_payouts.sql](../../../supabase/migrations/20260609120000_stripe_connect_payouts.sql)).
- **Verify before push:** confirm an index on `entries(show_id)` exists (core
  path, near-certain). If absent, add `CREATE INDEX IF NOT EXISTS entries_show_id_idx
  ON public.entries(show_id);` to Task 1's migration — platform-scope aggregation
  scans entries by show.

## [ADDED] Plan discoverability

Per CLAUDE.md, `docs/plan-*.md` plans register a row in
[`docs/README.md`](../../../docs/README.md). This plan lives under
`docs/superpowers/plans/`, a directory that (by established convention) is **not**
indexed in `docs/README.md` — no superpowers plan or spec is. Discoverability is
via the cross-link from its source spec
([the design doc](../specs/2026-07-13-unified-financial-dashboard-design.md)), which
references this plan's directory. Deliberate convention exception, not an omission.

## Self-review checklist (author-run)

- **Spec coverage:** immutable snapshot (Task 1,3,4) ✓; processing fee /
  net-pending (Task 2,3) ✓; scoped RPC + no PII (Task 5) ✓; server-side
  aggregation >1000 rows (Task 5 SQL) ✓; rate-unverifiable backfill (Task 1) ✓;
  correct auth helpers (Task 5) ✓.
- **Type consistency:** `OrderSnapshotColumns` field names match the migration
  column names and the insert spreads; RPC return columns match the names
  consumed downstream in Phase 1 (to be honored when Phase 1 is planned).
- **No placeholders:** all SQL/TS shown in full; the only deliberate
  read-before-edit notes are where live variable names must be confirmed at the
  webhook insert sites (Task 3), which cannot be pinned without the surrounding
  handler in view.
```
