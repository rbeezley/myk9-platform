## Why

The secretary responsibility verification sweep (`openspec/changes/secretary-responsibility-verification`, `docs/roles/secretary-responsibility-verification-plan.md`) audited all 44 coverage rows against current code and found six concrete, agent-fixable code defects that block fall 2026 launch readiness. This change remediates them in one focused batch so the coverage matrix rows can move to verified states driven by code evidence.

## What Changes

- **D1 (S5.5):** `useShowMapActionExecutor.ts` invalidates several query keys after check-in/scratch/move-up/approve actions but never `['secretary-show-entries', showId]` — the literal key `ShowWorkbenchShowDeskPage.tsx` uses for its own entries query. Show Desk counts, People roster, and incident-log pickers go stale after actions taken on the same page. Fix: unify on one canonical query key or add the missing invalidation + optimistic patch.
- **D2 (S5.2/S9.4):** scratch/no-show has no undo affordance, unlike move-up's toast-based `undoLastMoveUp`. Fix: capture previous status/check-in/notes before the scratch write and offer a toast undo mirroring the move-up pattern.
- **D3 (S1.3):** `persistShowJudgeAssignments`, `upsertClassJudgeAssignment`, and `reassignClassJudge` in `src/services/database/judges/reads.ts:280-345` write via raw `untypedFrom('judge_assignments')`, bypassing `ReplicatedJudgeAssignmentsTable`. Callers (`ClassDetailsPage`, `ClassManagementPage`) are reachable show-day, so offline judge reassignment is silently lost. Fix: route writes through the replicated table.
- **D4 (S6.5):** results release is one-way — no mutation or UI clears `results_released_at`, so a secretary cannot pull released results back while correcting a mistake. Fix: add an un-release mutation and a `BulkOperationsBar` action for currently-released classes, with explicit confirmation.
- **D5 (S2.6):** the post-creation payment dialogs pass check numbers as a generic `reference`, and `updateEnrollmentPaymentStatus` writes only `payment_reference`, never `enrollments.check_number`. Checks recorded via "mark as paid"/partial payment leave `check_number` NULL. Fix: thread a dedicated `checkNumber` parameter through to the update, with an assertion-first regression test.
- **D6 (S8.1):** Entry Management shows payment badges but no dollar amounts — no outstanding-balance stat card or column, so a secretary reconciling accepted entries must leave for the Financial Report. Fix: add an Outstanding stat card reusing `financialReportTotals` logic.
- **Cleanups:** clone-show fidelity (copy `hidesUsed`/`distractionsUsed`/`itemsUsed`/`timeLimit1-3` customizations); S8.2 refund-status parity test between secretary and exhibitor views plus removal of the dead `viewer="exhibitor"` branch if unused; UKC/ASCA seed blocks in `supabase/seed-demo.sql`; coverage-matrix status updates; `OPEN-TODOS.md` entry for the AKC results recipient verification gate; archive the merged `show-email-sequence` change.

## Capabilities

### New Capabilities

- `show-desk-action-coherence`: Show Desk actions keep same-page entry data fresh (cache invalidation) and scratch/no-show actions are undoable like move-ups.
- `judge-assignment-offline-writes`: Judge assignment writes go through the replication layer so show-day reassignment survives offline.
- `results-unrelease`: A secretary can pull released class results back to held-for-review while correcting a mistake.
- `secretary-check-payment-recording`: Check numbers recorded through payment-update flows persist to `enrollments.check_number`.
- `entry-management-outstanding-balance`: Entry Management surfaces outstanding-balance dollars for reconciliation without leaving the page.

### Modified Capabilities

- None.

## Impact

- `apps/myk9show/src/features/show-map/useShowMapActionExecutor.ts`, `showMapActionMutations.ts`, `ShowWorkbenchShowDeskPage.tsx` (D1/D2)
- `apps/myk9show/src/services/database/judges/reads.ts`, `src/services/replication/ReplicatedJudgeAssignmentsTable.ts` (D3)
- `apps/myk9show/src/hooks/mutations/useReleaseResults.ts`, `src/pages/secretary/ResultsControlPage/BulkOperationsBar.tsx` (D4)
- `apps/myk9show/src/services/database/show-registrations/reads.ts`, `src/hooks/useEntryManagementActions.ts`, `src/components/entries/EnrollmentCard.tsx`, `EnrollmentPartialPaymentDialog.tsx` (D5)
- `apps/myk9show/src/components/entries/management/EntryStatsCards.tsx` (D6)
- `apps/myk9show/src/components/shows/wizard/steps/CloneFromShowCombobox.tsx`, `supabase/seed-demo.sql`, docs (`docs/roles/secretary-responsibility-coverage.md`, `OPEN-TODOS.md`) (cleanups)
- No database schema changes; no new routes or pages.
