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

- [ ] 3.1 Add the club-scoped summary to the existing `/club-admin/payments` surface instead of creating `/club-admin/financial`.
- [ ] 3.2 Add per-show net, copyable `stripe_transfer_id`, settlement badge, charge-verification badge, and Stripe link-out components with accessible labels and calm error/unavailable states.
- [ ] 3.3 Add club scope-gating, component, onboarding return-path, and no-duplicate-checkout regression tests.
- [ ] 3.4 Verify club-admin UX against `docs/INTENT.md` and confirm the offline/unavailable state never claims Stripe verification.

## 4. Platform financial workflow

- [x] 4.1 Add platform-scope online collected, gross platform-fee income, net platform income, outstanding transfer liability, and mismatch attention data to `/admin/payouts`.
- [x] 4.2 Add seeded-drift tests for failed transfers, unrecorded refunds, and missing processing fees; confirm normal pending/self-healing states are not falsely red.
- [x] 4.3 Add site-admin role/authorization and gross-versus-net presentation tests with source/formula labels.

## 5. Canonical route consolidation (gated — see design.md go/no-go checkpoint)

- [ ] 5.0 STOP: run the go/no-go checkpoint with the operator. If the enriched surfaces from sections 3–4 already answer the money questions, skip 5.1–5.4, record the no-go decision in MYK9-54, and proceed to section 6.
- [ ] 5.1 Add the role-aware `/financial` route and scope selector using the shared summary service; default platform, club, or show scope from role and context.
- [ ] 5.2 Add redirects from legacy financial entry points and preserve supported deep-link query/context and Stripe onboarding return paths.
- [ ] 5.3 Add route, role-default, redirect, accessibility, and exhibitor single-payment-workflow tests; do not add a new exhibitor dashboard.
- [ ] 5.4 Re-walk the existing secretary, club-admin, site-admin, and exhibitor payment journeys and record evidence for the launch-readiness gate.

## 6. Verification and shipment

- [ ] 6.1 Run focused unit/component/database tests for each changed package and `pnpm typecheck` for the monorepo blast radius.
- [ ] 6.2 Run `npx openspec validate "unified-financial-dashboard"` and resolve all artifact/spec coverage findings.
- [ ] 6.3 Review the diff for scope creep, RLS/PII exposure, direct online reads in offline core paths, duplicated surfaces, and intent regressions.
- [ ] 6.4 Update the linked Linear issue and launch-readiness tracking with completed evidence, known operator gates, and intentional non-goals.
- [ ] 6.5 Open the implementation PR with the OpenSpec change linked, run CI and focused review, and resolve all blocking findings.
- [ ] 6.6 Merge only after required checks and shared-system/operator gates are accepted; then archive the OpenSpec change with the PR evidence.
