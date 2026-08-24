# Unified Financial Dashboard — Design

> **Status:** Complete — the design shipped via MYK9-54: snapshot columns in `supabase/migrations/20260717122000_stripe_order_snapshots.sql`, reconciliation RPCs in `20260717130000_financial_reconciliation_rpc.sql`, client projection in `apps/myk9show/src/features/financial/`. Archived 2026-08-24 from the never-merged `feat/unified-financial-dashboard` branch, which held the only copy of these documents.

## Purpose

Give the platform owner (site admin) and clubs a single, role-aware place to
account for **every penny** of online and offline money — entry fees, platform
fees, refunds, and payouts — so that financial disputes between the platform and
clubs (and between clubs and exhibitors) can be resolved from an authoritative,
reconcilable record.

The driving job is **auditability**, not a revenue chart: every figure must tie
back to a source, and where money moved through Stripe, the dashboard must prove
it agrees with Stripe.

> **Revision note (2026-07-13):** This design was revised after a source-grounded
> review found seven material gaps in the first draft (wrong money model, orders
> RLS blocking club/secretary reads, fee-book lifecycle exclusions, conflated
> reconciliation states, un-snapshotted historical fees/refunds, unbounded
> pagination, and a redundant route). The corrections are folded in below; the
> money model and data contract are now derived from code, not assumption.

## The money model (derived from code — read this first)

Everything downstream depends on getting this exactly right.

**Platform fee is charged ON TOP; the exhibitor pays it.**
[`entryPaymentLink.ts:83`](../../../apps/myk9show/supabase/functions/_shared/entryPaymentLink.ts) adds
the platform fee as a separate Stripe line item on top of the entry-fee subtotal.
So for an online checkout:

```
exhibitor pays  = Σ(authoritative entry fees)            [subtotal]
                + platformFee(subtotal, rate)            [fee, on top]
```

**The club receives entry fees minus per-entry refunds — never the fee.**
[`payoutCalc.ts:24`](../../../apps/myk9show/supabase/functions/_shared/payoutCalc.ts):

```
club payout (per show) = Σ over entries WHERE payment_method = 'online'
                            AND payment_status IN ('paid','refunded')
                         of max(0, entry_fee_cents − refund_amount_cents)
```

Deductions key on `refund_amount` (service-role-guarded), **not** `payment_status`,
so a forged status flip cannot shrink a payout. Desk payments (cash / check /
waived / secretary_paid) never ran through Stripe and never enter a transfer.

**Platform income is the fee — and gross ≠ net.**

```
platform gross fee income = Σ platform fees charged
platform net income       = gross fees
                            − Stripe processing fees   [stored per charge]
                            − refunded platform fees
                            − disputes / chargebacks
```

The dashboard MUST distinguish **gross platform fees** (what we billed) from **net
income** (what we keep after Stripe costs and reversals). Conflating them
overstates platform earnings. **Stripe processing fees are captured per charge**
from the Stripe **balance transaction** (`balance_transaction.fee`) at charge
time and stored on the order snapshot — net income is computed from stored
per-charge fees, never estimated.

**Three distinct parties, three distinct figures — never conflate:**

| Figure | Whose money | Source of truth |
|---|---|---|
| Entry fees (gross → collected → refunded → net to club) | Club's revenue | `entries` (fee book / accounting projection) |
| Platform fee (gross billed → net kept) | Platform's income | per-order fee snapshot (see Data Contract) |
| Payout / transfer | Money moved club-ward | `show_payouts` |

## Goals

- One role-aware dashboard, filterable by scope: **platform → club → show**.
- App records shown up front; a **Stripe reconciliation proof layer** underneath.
- Offline money (check / cash / waived) included but badged **attested**
  (human-recorded) vs online money badged **verified** (Stripe-backed).
- A club treasurer can reconcile net-per-show against their Stripe **transfers**
  (Tier 2) with a 1:1 match on `stripe_transfer_id`.
- Platform **gross fee income and net income** — currently computed nowhere —
  surfaced, distinctly.
- **Every financially active record** appears, regardless of entry lifecycle
  status (a paid-then-withdrawn entry and its refund must be visible).

## Non-goals (YAGNI)

- **No exhibitor dashboard rebuild.** `/exhibitor/payments` stays as-is;
  components are built reusable for later adoption, but not rebuilt now.
- **No bank-level reconciliation** (Stripe transfer → club bank deposit). Platform
  liability ends at a *successful* (`completed`) transfer to the club's connected
  account; the transfer→bank hop is between the club and Stripe. Link out to
  Stripe for that hop. (Deferred; revisit only if treasurers ask for bank-line
  matching.)
- **No collapse of the deliberately-triplicated fee math.**
  `_shared/platformFee.ts`, `store/cartStore.helpers.ts`, and
  `_shared/payoutCalc.ts` pin each other via colocated tests and stay separate.
- **No reuse of the printable fee book for accounting.** It stays the operational
  report; accounting gets its own projection (see below).

## Key decisions

| Question | Decision |
|---|---|
| One dashboard for all scopes? | Yes; scope filter platform/club/show. Exhibitor separate. |
| Source of truth for "every penny"? | Layered — app records primary, Stripe reconciliation as proof. |
| Offline treatment? | In scope, badged "attested" vs online "verified". |
| Bank-level reconciliation? | Link out to Stripe (Tier 2 transfer-level in-app only). |
| Rollout? | Data contract first (Phase 0), then plumbing, then enrich existing surfaces, then collapse to one route. |

## Data contract (Phase 0 — prerequisite for any reconciliation claim)

The current schema **cannot yet prove historical fees and refunds**. Three gaps,
each a Phase 0 deliverable:

1. **Immutable per-order financial snapshot.** `stripe_orders` today has only
   `amount_cents` (which *includes* the on-top fee), `status`, and `refunded_at`
   (a timestamp). It stores no entry subtotal, no platform-fee amount, no fee
   rate, and no refunded cents. Applying *today's* `platform_fee_percent` to a
   historical order rewrites history when the rate changes. **Persist, at charge
   time, per order/payment event:** charged entry subtotal (cents), platform fee
   (cents), fee rate applied, **Stripe processing fee (cents) from the charge's
   balance transaction**, and refunded amount (cents, updated by the refund
   webhook). The processing fee requires the webhook to fetch/expand the charge's
   `balance_transaction` (the fee is not on the checkout session), so capture may
   land slightly after `paid_at` — store it when available and treat a missing
   processing fee as "net pending" rather than zero. These are immutable financial
   facts, written once from the Stripe event — never recomputed from current
   settings. Backfill best-effort for existing orders and mark un-snapshotted
   orders as "rate unverifiable" rather than silently applying the current rate.

2. **Scoped reconciliation RPC/view.** `stripe_orders` RLS
   ([migration 023:126](../../../supabase/migrations/023_tighten_rls_and_add_test_helpers.sql))
   permits reads only by the paying customer or a platform admin — so a club admin
   or secretary joining `stripe_orders` sees **zero** rows and every legitimate
   online payment appears unreconciled. Provide a `SECURITY DEFINER` RPC (or
   security-barrier view) that returns a **safe reconciliation projection**
   (amounts in cents, status, transfer id, counts — **no customer PII**) for shows
   the caller is authorized to manage: `is_platform_admin()` for platform scope,
   club membership for club scope, `can_manage_show()` for show scope. Verify the
   authorization function names against current definitions before use.

3. **Server-side aggregation.** PostgREST caps responses at 1,000 rows; the
   existing payout ledger paginates for exactly this reason
   ([usePlatformPayoutLedger.ts:27](../../../apps/myk9show/src/features/payments/usePlatformPayoutLedger.ts)).
   A client that "loads all entries" silently understates platform/club totals.
   **Totals MUST be computed server-side** (SQL SUM in the RPC/view) for
   platform and club scope; any row-level list (entries, orders, payouts, alerts)
   MUST paginate to completion. Show scope may aggregate client-side (bounded).

## Architecture

Two existing engines are reused; new work joins them, adds the accounting
projection, and makes totals scope-aware.

### Reused

- **Printable fee book** —
  [`calculateFinancialReportTotals`](../../../apps/myk9show/src/components/reports/financialReportTotals.ts).
  Kept **only** for the operational/printable report. It intentionally excludes
  withdrawn / scratched / rejected / not-accepted / missing-info entries
  (`EXCLUDED_CURRENT_STATUSES`), so it cannot represent "every penny." Do not
  reuse it for accounting.
- **Payout math** —
  [`payoutCalc.ts`](../../../apps/myk9show/supabase/functions/_shared/payoutCalc.ts) /
  [`payoutLedger.ts`](../../../apps/myk9show/src/features/payments/payoutLedger.ts) and the
  treasurer badge resolver
  [`payoutBadge.ts`](../../../apps/myk9show/src/features/payments/payoutBadge.ts). Reused
  as-is for settlement state.

### New

- **Cent-based accounting projection.** A projection (server-side) that includes
  **every financially active record** — any entry that was charged, paid,
  refunded, or waived — *regardless of entry lifecycle status*. Integer cents
  throughout. This is the "every penny" ledger a paid-then-withdrawn entry and
  its refund live in. Separate from the printable fee book.

- **`getFinancialSummary(scope, scopeId)`** — orchestrates: authorized scope
  resolution → server-side aggregated entry accounting → per-order fee snapshots
  (gross/net platform fee) → `show_payouts` settlement state → drift feed. Returns
  a consistent shape for platform/club/show. Reads via the Phase 0 RPC/view, never
  raw `stripe_orders`.

## Two independent status axes

Charge verification and club settlement are **separate facts** and get separate
statuses. (The first draft conflated them.)

**Charge / verification state** (per entry or order):
- 🟢 **Verified** — online entry with a matching order snapshot whose amounts tie
  out.
- 🔵 **Attested** — check / cash / waived. Human-recorded, no Stripe trace by
  nature. Counted, but badged self-reported.
- 🔴 **Mismatch** — online money with no order snapshot, amounts that don't tie,
  or a refund present in Stripe the app didn't record (surfaced from
  `operator_alerts`, which the `stripe-webhook` already raises on drift).

**Payout / settlement state** (per show) — reuse
[`resolvePayoutBadge`](../../../apps/myk9show/src/features/payments/payoutBadge.ts) verbatim;
do **not** invent new labels:
- **Paid** (`status = 'completed'` — the real success value, not "succeeded")
- **Sending** (`processing`)
- **Scheduled** (`pending` + payouts enabled) — normal, **not** red
- **Waiting for account** (`pending` + not enabled)
- **Retrying** (`failed` + self-healing marker) — **not** red
- **Needs attention** (`failed`, genuine) — the only red state

Proof of discharge = a **`completed`** transfer with a matchable
`stripe_transfer_id`. Genuine-failed and stuck states surface as action items;
`Scheduled`/`Retrying` are informational.

## Club-treasurer reconciliation (the "every penny" bridge)

Separate charges + transfers means exhibitor charges live on the *platform's*
Stripe account, so a club **never sees gross entry fees in their own Stripe** —
only the net transfer received.

| Reconcile… | Against… | Support |
|---|---|---|
| Gross → net entry fees | The dashboard itself | Dashboard is the **sole** authoritative view of this math. |
| Net-per-show ↔ Stripe transfer | Club's Stripe dashboard | **Tier 2, in-app:** copyable `stripe_transfer_id` + amount + `completed` status + date for 1:1 match. |
| Stripe transfer ↔ bank deposit | Club's bank statement | **Tier 3, link-out:** deep link to the club's Stripe payouts page; not reconciled in-app. |

The dashboard is the club's **primary financial record**; Stripe confirms the last
hop. Transfer id + settlement badge being first-class in the UI *is* the bridge.

## Phased rollout

Each phase is independently shippable and ends with tests green. Phase 0 is a hard
prerequisite: no reconciliation claim is trustworthy until the data contract
exists.

### Phase 0 — Data contract

Immutable per-order financial snapshot columns/writes; refund webhook stamps
refunded cents; scoped reconciliation RPC/view with authorization; server-side
aggregation functions. Migration includes explicit GRANTs; pre-query any
referenced rows.

- **Gate:** snapshot immutability test (rate change does not alter historical
  order figures); RPC authorization test (platform/club/show callers see exactly
  their scope, non-managers see nothing, no PII columns returned); aggregation
  test proving totals are correct beyond 1,000 rows.

### Phase 1 — Accounting projection + service, minimal UI change

Build the cent-based accounting projection and `getFinancialSummary` on the
Phase 0 RPC. Wire it **above** the renderer: the async query lives in the
page/hook layer; the printable
[`FinancialReport`](../../../apps/myk9show/src/components/reports/FinancialReport.tsx)
stays a **synchronous pure projection fed props** (it is a static-render
component — an async service cannot be wired into it directly).

- **Gate — parity test:** for a show with only clean online+paid entries, the
  accounting projection's collected/refunded/net figures reconcile with the
  printable fee book (they diverge only on lifecycle-excluded rows, which is the
  point). Snapshot-based platform-fee totals match recomputation for
  same-rate orders.

### Phase 2 — Enrich the existing club Payments page

Add the treasurer financial view to the **existing** `/club-admin/payments`
(which already owns Stripe onboarding + payout history) — do **not** create
`/club-admin/financial`. Preserve the Stripe onboarding return path and its
intent-protected flow. Surface per-show net, copyable `stripe_transfer_id`,
`resolvePayoutBadge` settlement badges, verified/attested/mismatch charge badges,
and a Stripe link-out.

- **Gate:** RLS/RPC scope test (club admin sees only their club); onboarding
  return-path regression test. Components built reusable.

### Phase 3 — Platform view (enrich `/admin/payouts`)

Platform-scope rollup: total online collected, **gross platform fees and net
income** (distinct), outstanding transfer liability, and the 🔴 mismatch feed from
`operator_alerts`.

- **Gate:** seeded-drift test (failed genuine transfer, unrecorded refund) surface
  as 🔴, not swallowed; gross-vs-net income test (net = gross − stored per-charge
  processing fee − refunded fees); "net pending" shown where a processing fee has
  not yet been captured.

### Phase 4 — Collapse to one canonical route (`/financial`)

Make `/financial` canonical and role-aware with the scope selector; **immediately
redirect** `/club-admin/payments` (financial portion) and `/admin/payouts` to it;
delete the overlap. Reaches the "one dashboard" end state safely on the proven
service.

- **Gate:** redirect + role-default tests; old deep links resolve; onboarding
  return path still lands correctly.

## Testing strategy

- **Phase 0:** snapshot immutability, RPC authorization + no-PII, >1000-row
  aggregation correctness, migration GRANT/RLS checks.
- **Phase 1:** accounting-projection unit tests (every-penny incl. withdrawn +
  refunds, integer cents), parity where applicable, async-in-hook / pure-renderer
  separation.
- **Phase 2:** scope-gating, onboarding return-path regression, badge-state
  components.
- **Phase 3:** seeded-drift reconciliation, gross-vs-net platform income.
- **Phase 4:** route-collapse redirects, role defaults.
- Never break the colocated tests pinning the triplicated fee math or
  `payoutCalc`/`payoutBadge`.

## Data sources (reference)

- Entry accounting: `entries` (`entry_fee` DECIMAL dollars, `discount_amount`,
  `comped`, `payment_status`, `payment_method`, `refund_amount` DECIMAL dollars
  service-role-guarded, `entry_status`).
- Per-order snapshot (Phase 0, new): entry subtotal cents, platform fee cents,
  fee rate, Stripe processing fee cents (from `balance_transaction.fee`), refunded
  cents — on `stripe_orders` or a linked event table.
- Existing order fields: `stripe_orders` (`amount_cents` incl. fee,
  `stripe_payment_intent_id`, `status`, `refunded_at`, `entry_ids`, `show_id`).
- Payouts / transfers: `show_payouts` (`amount_cents`, `status` [`completed`
  = success], `stripe_transfer_id`, `failure_reason`, `completed_at`).
- Platform fee rate: `platform_settings.platform_fee_percent` (singleton,
  default 7, max 20) — for *new* charges only; historical uses the snapshot.
- Connect status: `club_stripe_accounts` (`stripe_account_id`,
  `onboarding_complete`, `payouts_enabled`).
- Drift signal: `operator_alerts` (raised by `stripe-webhook`).
