# Plan — Phase D Show-Day Reconciliation

**Date:** 2026-05-18
**Status:** In progress.
**Parent plan:** [`docs/plan-show-day-sequencing.md`](plan-show-day-sequencing.md)

## Goal

Make Wrap-up answer the desk question: "What money and pulled dogs do I still need to reconcile before I close the show?"

This continues the Trial Secretary intent from [`docs/INTENT.md`](INTENT.md): after the show should feel like "That went smoothly," not like hunting across reports.

## PR 1 — Broaden Wrap-up Reconciliation

**Status:** Shipped 2026-05-18 in PR #236.

Deliverables:

- Rename the late-entry-only reconciliation surface to a show-day reconciliation surface.
- Keep late-entry cash/check/waived totals.
- Add pulled/no-show counts from `entry_status` and `check_in_status`.
- Add manual refund review totals for paid pulled entries, plus already-refunded totals from `payment_status`.
- Update the Phase D trackers so late entry is closed and reconciliation reflects the remaining scope.

Tests:

- Summary tests for late-entry totals, pulled/no-show counts, refund-review totals, and refunded totals.
- Component test for the Wrap-up reconciliation card.
- Show workbench integration test proving Wrap-up renders the expanded reconciliation surface.

## PR 2 — Entry Totals Closeout

**Status:** Current slice.

Deliverables:

- Add total entry count to the Wrap-up reconciliation card.
- Keep day-of entry count visible under the total so the secretary can still verify desk additions.
- Mark the OPEN-TODOS end-of-day reconciliation item complete once entries, no-shows, refunds, and collected fees are all represented.

Tests:

- Summary test for total entries.
- Component test for the entry total tile.
- Show workbench integration test proving Wrap-up renders the entry total.

## Out of Scope

- Stripe refund automation.
- New refund mutation UI.
- Server-backed audit trails for checklist completion.
