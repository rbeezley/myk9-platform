## Tracking

[MYK9-54](https://linear.app/myk9-platform/issue/MYK9-54/unify-role-aware-financial-dashboard-and-stripe-reconciliation)

## Why

Financial information is split across the show-scoped Financial Report, club payment
and payout surfaces, and the site-admin payout ledger. None gives a role-appropriate,
auditable view from entry fees through refunds, platform fees, and club transfers, so
clubs and the platform cannot reliably resolve money questions from one record.

This supports fall 2026 launch readiness by making the money path explainable before
real clubs depend on it, while consolidating existing financial surfaces instead of
adding parallel workflows.

## What Changes

- Add a source-grounded financial data contract that snapshots historical Stripe
  amounts and exposes a server-authorized, server-aggregated reconciliation projection.
- Add a cent-based accounting projection that includes every financially active entry,
  including paid-then-withdrawn entries and refunds, separately from the printable
  show closeout report.
- Add one role-aware financial summary model with platform, club, and show scopes.
- Enrich the existing `/club-admin/payments` surface with club-level financial
  reconciliation, transfer identifiers, settlement states, and Stripe link-outs.
- Enrich the existing `/admin/payouts` surface with gross platform-fee income, net
  income, transfer liability, and actionable reconciliation mismatches.
- Add a canonical `/financial` route only after the shared service is proven, then
  redirect overlapping legacy financial entry points into it.
- Preserve the existing show-scoped Financial Report and its closeout behavior while
  wiring it to the shared source layer where parity is demonstrated.

### Duplication decision

This does not justify separate site, club, and show dashboards. The scopes share one
financial model and differ only by authorization and aggregation. Existing club and
site surfaces are enriched first; the final `/financial` route removes overlap. A
new exhibitor dashboard is not justified: `/exhibitor/payments` remains the existing
exhibitor payment surface, and reusable components may be adopted there later.

## Capabilities

### New Capabilities

- `financial-reconciliation`: Source-grounded financial snapshots, accounting
  projections, role-authorized scope aggregation, and independent charge-verification
  and payout-settlement states.
- `role-aware-financial-dashboard`: Platform, club, and show financial views,
  reconciliation actions and drill-downs, existing-surface enrichment, and the final
  canonical route.

### Modified Capabilities

- None. The existing `secretary-show-financial-totals` requirements remain the
  contract for the printable show closeout report; this change adds the broader
  accounting/reconciliation layer without redefining those totals.

## Impact

- Supabase migrations and the Stripe webhook for immutable order snapshots and refund
  amounts.
- A scoped, PII-free reconciliation RPC or security-barrier projection with explicit
  authorization and server-side aggregation beyond PostgREST row limits.
- Shared TypeScript financial summary, accounting projection, badge, and route logic.
- Existing `/club-admin/payments`, `/admin/payouts`, and show Financial Report
  composition; eventual `/financial` routing and redirects.
- Tests for snapshot immutability, authorization, aggregation, accounting math,
  reconciliation states, route defaults, and regression-safe existing workflows.
