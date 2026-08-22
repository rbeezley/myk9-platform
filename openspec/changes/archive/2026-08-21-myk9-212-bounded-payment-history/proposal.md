## Why

The original request was `start batch 1`. MYK9-212 is Batch 1's payment-query lane: the exhibitor ledger currently reads every lifetime Stripe order and sends every related entry ID through one growing follow-up request. Bounding those reads before launch keeps a long-tenured exhibitor's money surface reliable without hiding history.

## What Changes

- Page Stripe-order reads in stable, explicit server ranges so all-time history remains complete without an unbounded request.
- Scope a selected calendar year with UTC instants derived from the browser's local-year boundaries.
- Page/chunk order metadata, refund lookups, and entry-detail lookups so no request or `IN` list grows without a ceiling.
- Preserve the existing My Payments page, all-time default, year selector, totals, receipt links, and payment handoffs.
- Add focused coverage for pagination, stable tie ordering, refund-year inclusion, local-year boundaries, and genuine all-time completeness.

## Capabilities

### New Capabilities

- `exhibitor-payment-history`: Defines complete but request-bounded payment-history retrieval and calendar-year consistency for the existing My Payments surface.

### Modified Capabilities

None.

## Impact

- Affects `paymentYearFilter.ts`, `useMyPayments.ts`, `ExhibitorPaymentsPage.tsx`, and their focused tests.
- Changes read/query shape only; no schema, RLS, Stripe write, checkout, refund, or payment-status behavior changes.
- Supports fall 2026 launch readiness by preventing lifetime account history from creating oversized PostgREST requests on a money surface.
- This does not duplicate an existing surface. The canonical My Payments page remains the only exhibitor ledger; a link cannot solve its underlying query-growth problem.
- Non-goals: no pagination UI, truncation, new receipt surface, new payment workflow, or historical-data migration.
