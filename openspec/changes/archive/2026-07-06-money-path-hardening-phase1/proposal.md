## Why

The fall 2026 launch gate cannot allow payouts to transfer platform funds for entry fees
that were never collected through Stripe. The July money-path audit found two high-severity
amount-integrity gaps: `submit_show_entries` drops the requested `payment_method`, and
`entries.payment_status` can be flipped to payout-eligible values without a guard.

This supports launch readiness by closing the routine secretary mail-in/check workflow that can
misclassify desk payments as online payments and feed the nightly payout calculation.

## What Changes

- Treat the already-merged `20260704210000_persist_payment_method_submit_entries.sql` migration
  as the MP-01 baseline: it persists `payment_method = p_payment_method` for offline
  `submit_show_entries` rows and has source-level contract coverage.
- Add a database guard on `entries.payment_status` changes that blocks non-`service_role`
  writers from marking online entries `paid` or `refunded`.
- Preserve staff ability to mark desk-paid methods (`cash`, `check`, `waived`,
  `secretary_paid`) as paid where existing authorization permits it.
- Preserve the legitimate Stripe/webhook path by keeping a `service_role` bypass for paid/refund
  transitions.
- Add assertion-first regression coverage for the new trigger behavior and keep the existing RPC
  persistence contract in the focused test set.
- Document the pre-go-live backfill/audit query for existing online/no-intent rows without doing
  a blanket data rewrite.

Non-goals:

- This does not implement MP-03 payment-link duplicate delivery, MP-04 mode-scoped Stripe IDs,
  or later money-path findings; those remain separate phases/PRs.
- This does not add a new UI surface. Duplication question: no existing page is duplicated; this
  is schema/RPC integrity work under existing entry submission and payment workflows, so a link
  cannot solve it.
- This does not execute shared staging/prod database pushes without the required confirmation.
- This does not perform the human row-by-row backfill decision; it only provides the closing audit
  query and any safe migration code needed for future rows.

## Capabilities

### New Capabilities

- `entry-payment-integrity`: Entry creation and payment-status mutation rules that keep payout
  inputs aligned with how entry fees were actually collected.

### Modified Capabilities

- None.

## Impact

- Supabase migrations redefining `submit_show_entries` and adding a payment-status transition
  trigger on `public.entries`.
- Database/source tests under `apps/myk9show/src/test/database` or the closest existing harness.
- Potential focused TypeScript test updates if existing entry submission/payment helpers need
  fixtures adjusted to assert `payment_method`.
- Operational handoff docs: `docs/plan-money-path-hardening.md`, `docs/operations/go-live-runbook.md`,
  or `OPEN-TODOS.md` only if this phase is fully shipped and verified.
