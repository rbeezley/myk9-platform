## 1. Source-grounded data contract

- [x] 1.1 Confirm the current `stripe_orders`, `show_payouts`, `operator_alerts`, authorization helpers, and Stripe webhook insert/refund paths against the live repository schema and record the verified column/function names.
- [x] 1.2 Write failing source-pin and behavior tests for immutable order snapshots, charge-time fee values, balance-transaction processing fees, and refunded cents.
- [x] 1.3 Add the migration for immutable snapshot fields, indexes, explicit grants, and any compatibility/backfill markers; keep the migration reversible and do not rewrite historical facts from current settings.
- [x] 1.4 Implement pure TypeScript helpers for snapshot normalization and cent-based platform gross/net calculations; add unit tests for rounding, missing processing fees, refunds, and fee-rate changes.
- [x] 1.5 Populate snapshots at every Stripe order creation path and update only refunded cents in the refund path; add handler-level tests for duplicate delivery and delayed balance-transaction data.
- [x] 1.6 Add the PII-free scoped reconciliation RPC or security-barrier projection with server-side aggregation, explicit authorization, and complete pagination for detail rows.
- [x] 1.7 Add authorization, no-PII, and greater-than-1000-row aggregation tests for platform, club, show, and unauthorized callers.
- [x] 1.8 Run local migration/source-pin/type checks and document the shared-system approval gate for any staging migration or function deployment.

## 2. Accounting projection and shared service

- [x] 2.1 Implement the cent-based accounting projection for every financially active entry, including paid-then-withdrawn, refunded, waived, cash, and check records.
- [x] 2.2 Implement `getFinancialSummary(scope, scopeId)` on the scoped projection without raw client reads that bypass RLS; return separate entry accounting, platform income, charge-verification, and payout-settlement data.
- [x] 2.3 Add tests for `Verified`, `Attested`, `Mismatch`, pending-net, and payout settlement states using the existing payout badge vocabulary.
- [x] 2.4 Add a show-level parity test proving overlapping totals match the existing printable Financial Report before changing its data source.
- [x] 2.5 Wire the existing Financial Report page/hook layer to the shared source only after parity tests pass; keep the renderer synchronous and pure.

## 3. Club financial workflow

- [x] 3.1 Add the club-scoped summary to the existing `/club-admin/payments` surface instead of creating `/club-admin/financial`.
- [x] 3.2 Add per-show net, copyable `stripe_transfer_id`, settlement badge, charge-verification badge, and Stripe link-out components with accessible labels and calm error/unavailable states.
- [x] 3.3 Add club scope-gating, component, onboarding return-path, and no-duplicate-checkout regression tests.
- [x] 3.4 Verify club-admin UX against `docs/INTENT.md` and confirm the offline/unavailable state never claims Stripe verification.

## 4. Platform financial workflow

- [x] 4.1 Add platform-scope online collected, gross platform-fee income, net platform income, outstanding transfer liability, and mismatch attention data to `/admin/payouts`.
- [x] 4.2 Add seeded-drift tests for failed transfers, unrecorded refunds, and missing processing fees; confirm normal pending/self-healing states are not falsely red.
- [x] 4.3 Add site-admin role/authorization and gross-versus-net presentation tests with source/formula labels.

## 5. Canonical route consolidation (gated — see design.md go/no-go checkpoint)

- [x] 5.0 GO/NO-GO = **NO-GO** (operator decision, 2026-07-17). The enriched `/club-admin/payments` and `/admin/payouts` surfaces answer the club and platform money questions in-place; the scopes are role-separated (club sees club, admin sees platform), not overlapping, so a new `/financial` route would fragment rather than consolidate — against the "consolidate, don't duplicate / one concern, one page" phase. Canonical-route requirement is dropped from the spec sync. 5.1–5.4 skipped; proceed to section 6.
- [~] 5.1 SKIPPED (no-go): canonical `/financial` route not built.
- [~] 5.2 SKIPPED (no-go): no legacy redirects needed — existing routes remain canonical.
- [~] 5.3 SKIPPED (no-go): no new route to test; `/exhibitor/payments` stays the single exhibitor payment surface.
- [~] 5.4 SKIPPED (no-go): no route consolidation to re-walk; enriched-surface journeys covered by §3/§4 component tests.

## 6. Verification and shipment

- [x] 6.1 Run focused unit/component/database tests for each changed package and `pnpm typecheck` for the monorepo blast radius.
- [x] 6.2 Run `npx openspec validate "unified-financial-dashboard"` and resolve all artifact/spec coverage findings.
- [x] 6.3 Review the diff for scope creep, RLS/PII exposure, direct online reads in offline core paths, duplicated surfaces, and intent regressions.
- [ ] 6.4 Update the linked Linear issue and launch-readiness tracking with completed evidence, known operator gates, and intentional non-goals.
- [ ] 6.5 Open the implementation PR with the OpenSpec change linked, run CI and focused review, and resolve all blocking findings.
- [ ] 6.6 Merge only after required checks and shared-system/operator gates are accepted; then archive the OpenSpec change with the PR evidence.

## 7. MYK9-63 pre-merge refund-ledger follow-ups

- [x] 7.1 Add failing executable Postgres assertions for non-succeeded fully refunded orders, terminal audit-row immutability, and reconciliation inclusion of refund-bearing orders outside the normal succeeded/refunded status pair.
- [x] 7.2 Make `refunded_at` follow the derived order status, preserve terminal failed-row amount/kind/state on stale booking, and replace the unreachable multi-order tie-break with the `stripe_payment_intent_id` uniqueness contract.
- [x] 7.3 Add a behavior-tested Stripe refund-status decision: book only `succeeded`, defer `pending`/`requires_action`, and terminally fail `failed`/`canceled` from both charge reconciliation and `refund.updated`/`refund.failed` delivery.
- [x] 7.4 Drain every `stripe.refunds.list` page with `has_more` and `starting_after`; cover multi-page, exact-boundary, API-failure, and invalid empty-page responses without guessing from cumulative charge totals.
- [x] 7.5 Update `getShowPaymentSummary` to subtract and report partial refunds from the stored refund columns while preserving legacy fully-refunded fallback behavior; add value-sensitive unit assertions.
- [x] 7.6 Remove or narrow refund-ledger source/mirror tests whose assertions are superseded by executable SQL and behavior coverage; retain only contracts that cannot be imported or executed safely.
- [x] 7.7 Record the operator-gated Stripe destination requirement for `refund.updated`; do not mutate the destination or deploy the webhook/migrations without confirmation.
- [ ] 7.8 Run the financial SQL harness, focused refund/payment tests, edge-function type checks, monorepo typecheck/lint, and OpenSpec validation; review the diff for money, authz, migration re-runnability, and deployment-order regressions.
  - Completed locally: SQL harness, 725 focused tests, monorepo typecheck/lint, OpenSpec validation, diff/migration review.
  - Remaining evidence: direct Deno edge-function type check (Deno is not installed in this workspace) or the equivalent CI edge bundle after push.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: MYK9-63 changes payment webhooks, a money-table migration, reconciliation totals, and audit-history semantics before either migration is deployed.
