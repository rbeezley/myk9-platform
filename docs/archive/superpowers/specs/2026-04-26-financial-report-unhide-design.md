# Financial Report — unhide design

**Date:** 2026-04-26
**Author:** /qa-feature follow-up
**Closes:** TO-DOs.md "Phase 2 Secretary Walk — Findings (2026-04-22) — Financial reconciliation report not built (Phase 4)"

## Background

A `/qa-feature shows as secretary` walk on 2026-04-26 logged the financial reconciliation report as missing because it did not appear in the secretary's report-type dropdown at `/secretary/reports`. The diagnosis was wrong: the component, registry entry, and unit tests already exist, dating from 2026-04-11. The dropdown's `ReportControlsBar` filters reports to two of the four `ReportCategory` values, silently hiding `financial` and `statistics` reports — five reports total.

| Hidden report      | Category     |
| ------------------ | ------------ |
| Financial Report   | `financial`  |
| Show Entry Counts  | `statistics` |
| Trial Entry Counts | `statistics` |
| Breed Entry Counts | `statistics` |
| Judge Entry Counts | `statistics` |

## What this delivers

A two-`SelectGroup` extension to [`ReportControlsBar.tsx`](../../../apps/myk9show/src/pages/secretary/ReportsPage/ReportControlsBar.tsx) so the dropdown renders all four categories. No data-layer, schema, or component changes.

## Architecture

```
ReportControlsBar
└── Report-type Select
    ├── SelectGroup "Operational"   (existing)
    ├── SelectGroup "Organization"  (existing)
    ├── SelectGroup "Financial"     (new)
    └── SelectGroup "Statistics"    (new)
```

Order chosen so the most-used categories stay at the top.

## Files touched

1. **`apps/myk9show/src/pages/secretary/ReportsPage/ReportControlsBar.tsx`** — add two derived const lists (`financialReports`, `statisticsReports`) and two new `SelectGroup` blocks below the existing Organization group.

2. **`apps/myk9show/src/pages/secretary/ReportsPage/__tests__/ReportControlsBar.test.tsx`** — add render assertions that the dropdown contains each of the five previously-hidden report names under correctly-labeled groups.

3. **`apps/myk9show/src/test/e2e/entities/reportsUI.spec.ts`** (new) — Playwright e2e as secretary: navigate to `/secretary/reports`, the seed show is auto-selected, change the report dropdown to "Financial Report", assert the report header renders. If the seed show has no fee-bearing accepted entries, fall back to asserting the empty-state — either path proves reachability. Sign-in helpers follow the existing pattern from `clubsUI.spec.ts` / `dogsUI.spec.ts` / `peopleUI.spec.ts` / `showsUI.spec.ts`.

4. **`TO-DOs.md`** — mark the finding closed (v1) with a note that column extension (`Fee Due / Fee Paid / Balance`, classes column) remains an open product question, deferred until a real user signals the need.

## Out of scope

- Adding `Fee Due / Fee Paid / Balance` columns. The existing report shows `Dog | Armband | Payment Method | Fee` per row, grouped by handler with subtotal + grand total. Whether to break out fees-due vs. fees-paid is a product question better answered after real-user testing in Phase 3.
- Adding a `Classes` column listing each entry's classes per row.
- Verifying or extending the partial-payments schema.
- Touching the existing `FinancialReport.tsx` component or its 7 unit tests.
- Email or CSV export.

## Testing

- Existing 7 `FinancialReport.test.tsx` cases stay green (untouched).
- New component test asserts the five previously-hidden reports are now in the dropdown.
- New e2e asserts the Financial Report is reachable from the seed show.

## Risks

Negligible. The only behavioral change is dropdown visibility; all hidden reports were `enabled: true` and built — they were unreachable, not undefined.
