# Plan — Phase D Late-Entry Workflow

**Date:** 2026-05-18
**Status:** In progress.
**Parent plan:** [`docs/plan-show-day-sequencing.md`](plan-show-day-sequencing.md)

## Goal

Make late entries feel calm at the secretary table: a walk-in can be found, entered, paid, and reflected in the show-day tree without leaving the show workbench.

This preserves the Trial Secretary intent from [`docs/INTENT.md`](INTENT.md): the flow should feel like "That was easy," even when the desk is busy.

## Current Inventory

- `DayOfEntryDialog` already creates day-of entries for an existing dog and supports class selection, handler name, cash/check/waived payment, jump height, and notes.
- `createDayOfEntry` already assigns the next armband and writes one confirmed entry per selected class.
- The dialog currently lives only in the legacy Day-of Operations page, while the active IA sends secretaries to `/secretary/shows/:showId?phase=today`.
- The current dialog does not create a brand-new exhibitor/person or dog. That remains a required follow-up for true walk-ins.

## PR Slices

### PR 1 — Workbench entry point

**Status:** Shipped 2026-05-18 in [PR #232](https://github.com/rbeezley/myk9-platform/pull/232).

Deliverables:

- Add a compact Late Entry action surface to the Today phase of `ShowWorkbenchPage`.
- Reuse `DayOfEntryDialog` and the existing `getClassesWithCapacity` service.
- Refresh show entries and class capacity after a successful creation.
- Keep the action visible but clearly disabled while class capacity is loading or unavailable.

Tests:

- Component test for the new Today action loading/open/success behavior.
- Workbench integration test proving the Today phase exposes the operational late-entry action.

### PR 2 — New exhibitor + dog path

**Status:** Current slice.

Deliverables:

- Add a secretary-safe path from the late-entry dialog to create or select a person and dog when the search has no match.
- Prefer reusing existing mail-in registration components or services rather than building a second person/dog model.
- Ensure created person/dog records are compatible with offline-first replicated reads.

Tests:

- Dialog test for no-result create flow.
- Service/hook test proving created person/dog IDs are passed to the entry create payload.

### PR 3 — Payment and reconciliation

Deliverables:

- Make collected late-entry fees visible in Wrap-up reconciliation.
- Preserve cash/check/waived payment method on the entry or associated payment record using the canonical schema.
- Avoid Stripe refund/payment automation unless the payment lane is deliberately expanded.

Tests:

- Reconciliation selector test.
- Wrap-up page test for late-entry totals.

### PR 4 — Show-day walk

Deliverables:

- Add or extend a secretary golden-path walk for a late entry: open Today, add late entry, confirm tree/count refresh.
- Capture any remaining UX friction before closing the OPEN-TODOS item.

Tests:

- Focused E2E or maintained regression probe.

## Testing Phase

Do not mark the late-entry workflow complete until:

- New components/hooks have unit tests.
- The workbench integration test proves the Today phase exposes the flow.
- Touched test files pass with `pnpm --dir apps/myk9show exec vitest run ...`.
- Production TypeScript passes for the show app.
- `OPEN-TODOS.md` and this plan reflect the shipped PR numbers.

## Open Risks

- `createDayOfEntry` is a legacy online-only direct Supabase path. It should be hardened or replaced before treating late entries as fully offline-capable.
- The current service passes `userId` into the `handler_id` column. Before expanding the flow, verify whether that column expects an auth user ID or a `people.id`.
- New exhibitor/new dog creation is not included in PR 1, so the main OPEN-TODOS item remains open until PR 2 ships.
