## Context

See `proposal.md` for motivation. The normal online-card route is `submitPaymentStep` → `submitRegistrationCartCheckout` → `/cart` → `CartPage.handleCheckout` → `createEntryCheckoutSession`. The cart page derives its visible state from `buildCartFulfillmentView` and, since PR #1700 (`f1de06424`, 2026-08-20), performs a fresh capacity query immediately before checkout. The four MYK9-226 events occurred on August 18, before that submit-time refresh shipped.

The server remains authoritative and race-safe: both paid-cart processing and `submit_show_entries` use `evaluate_entry_capacity`, which returns `denied` when the class or judge day is full and `allow_waitlist` is not true. The webhook's make-whole refund is the last safety net after a charge, not the desired normal flow.

## Goals / Non-Goals

**Goals:**

- Exercise the actual `/cart` page orchestration with a fresh response showing zero judge-day spots and `allow_waitlist = false`.
- Record a hosted browser attempt through real wizard and cart hydration before claiming issue closure.
- Prove neither `checkoutWithWaitlist` nor `createEntryCheckoutSession` is called.
- Explain the August incidents using source history rather than speculation.
- Preserve the outcome as repeatable, non-charging evidence.

**Non-Goals:**

- No real Stripe Checkout session or shared database fixture.
- No weakening of the server refund fallback or operator alert.
- No new page, dialog, or alternate payment flow.
- No offline/replication changes; checkout is intentionally online-only.

## Decisions

### Use the page-level Vitest seam as the first reproduction, not the closure gate

`CartPage.splitCheckout.test.tsx` renders the page orchestration while replacing database and Stripe boundaries with deterministic spies. It can assert the exact harmful symptom—whether the Stripe session creator is called—without a charge or shared row, but it cannot satisfy Linear's requested “real flow” evidence by itself. Hosted proof must use actual wizard/cart hydration and stop before Stripe; if that requires a disposable shared cart fixture, obtain shared-database mutation approval and clean up the fixture.

**[ADDED] Source-parity check:** verify that the client and server both count the same active entry statuses, both limit judge assignments to confirmed class assignments, both apply per-class and judge-day limits, and both interpret a missing/NULL `allow_waitlist` as false. A passing UI test is insufficient if those predicates have drifted.

### Distinguish the historical bug from current behavior by commit time

Ranked hypotheses:

1. **Historical stale-capacity snapshot:** the August 18 carts used a render-time capacity result that became stale before checkout. Prediction: the events predate the submit-time `refetchCapacity` change, and current page tests stop Stripe after a fresh zero-capacity response.
2. **QA bypassed the normal page:** a script or direct Edge Function call created Stripe sessions without `/cart`. Prediction: current UI tests pass, but direct server calls can still exercise the refund safety net.
3. **Client/server assignment mismatch remains:** the capacity query omits a judge-day relationship the server sees. Prediction: source inventory would show different confirmed-assignment or active-entry predicates.
4. **`allow_waitlist` is lost while hydrating the cart:** prediction: a no-waitlist item reaches the split with `undefined` and is treated as payable.

Source evidence favors hypothesis 1: PR #1700 added the submit-time refresh on August 20; current code treats any value other than literal `true` as no-waitlist; and the page-level test with fresh zero capacity blocks both submission and Stripe. The hosted real-flow gate remains open, and the refund alert must remain severe.

### Do not change alert severity

The alert identifies a paid cart that produced no service. Test-mode filtering can be considered separately if repeated intentional QA causes noise, but downgrading the underlying event would hide a launch-critical production signal.

## Risks / Trade-offs

- **Page-level mocks do not prove a particular hosted build.** → Pin the decisive commit and run source-level, helper, component, and page tests from current `origin/main`; do not claim a staging data replay.
- **A caller can bypass `/cart` and invoke checkout directly.** → Retain server-authoritative denial, full refund, and error alert as defense in depth; treat unauthorized/direct QA as a separate harness concern.
- **A future client/server semantic drift could reappear.** → Keep the exact no-waitlist and submit-time-refresh assertions in the focused test set.
- **The monorepo-root Vitest config does not resolve the app's `@/` alias.** → Run the reproduction from `apps/myk9show`; record the initial root-command configuration failure separately from the valid app-scoped result.

## Migration Plan

No deployment or rollback is required because current `main` already contains the fix. Commit only the OpenSpec investigation record locally; external tracking and archival wait for coordinator approval.
