## Why

Secretary responsibility S8.3 requires producing show-level financial totals for the club. The current Reports surface already has a show-scoped Financial Report, but it treats `paymentStatus` as accepted/waitlisted entry state and only prints a fee grand total. That is not enough closeout evidence for a club treasurer or show chair.

This supports fall 2026 launch readiness by turning the existing printable Reports path into reliable club closeout evidence without adding another financial page.

## What Changes

- Correct the Financial Report data model so entry status and payment status are separate fields.
- Add show-level totals for gross fees, discounts, waived/comped amounts, collected payments, refunds, outstanding balance, and net retained.
- Add payment-method and trial-level breakdowns so clubs can reconcile cash, checks, online payments, and waived entries.
- Keep the report on `/shows/:showId/reports?report=financial-report` instead of creating a new page.
- Add focused tests for payment normalization, financial totals, report rendering, and report-data mapping.
- Update secretary tracking docs when the row reaches remediation complete.

This does not duplicate an existing page. The existing Reports page is the canonical print/export surface; Entry Management remains the place to change payment state.

## Capabilities

### New Capabilities

- `secretary-show-financial-totals`: Covers printable show-level financial closeout totals on the existing Reports surface.

### Modified Capabilities

- None.

## Impact

- Affected app code: `apps/myk9show/src/components/reports/FinancialReport.tsx`, `apps/myk9show/src/pages/secretary/ReportsPage/reportDataMapping.ts`, and `apps/myk9show/src/lib/reports/types.ts`.
- Affected tests: Financial Report and Reports-page mapping tests.
- Affected docs: secretary responsibility verification and coverage docs after implementation.
- No database migrations, shared-system writes, or new app routes.
