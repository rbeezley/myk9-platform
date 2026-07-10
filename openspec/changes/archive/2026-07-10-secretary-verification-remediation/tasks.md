## 1. Show Desk action coherence (D1 + D2)

- [x] 1.1 Compare the query shapes of `['secretary-show-entries', showId]` (ShowWorkbenchShowDeskPage.tsx, ShowDetailsPage.tsx) and `queryKeys.showEntries(showId)`; unify both pages on the canonical key, or add invalidation + optimistic patch of `['secretary-show-entries', showId]` to `useShowMapActionExecutor.ts` if shapes are incompatible.
- [x] 1.2 Add/extend unit tests proving a Show Desk action (check-in, scratch, move-up) patches or invalidates the query the Show Desk page reads.
- [x] 1.3 Extend `scratchShowMapEntry` in `showMapActionMutations.ts` to capture and return the entry's previous status/check-in/notes; add `undoShowMapScratch` restoring them via replicated writes.
- [x] 1.4 Surface a toast undo action for scratch/no-show in `useShowMapActionExecutor.ts`, mirroring `undoLastMoveUp`.
- [x] 1.5 Unit tests for `undoShowMapScratch` and the executor's scratch-undo wiring.

## 2. Judge assignment replication (D3)

- [x] 2.1 Route `persistShowJudgeAssignments`, `upsertClassJudgeAssignment`, and `reassignClassJudge` (`src/services/database/judges/reads.ts`) through `ReplicatedJudgeAssignmentsTable`, preserving exported signatures; extend the wrapper if a needed operation is missing.
- [x] 2.2 Unit tests for all three functions asserting writes go through the replicated table (no `untypedFrom('judge_assignments')` writes remain).

## 3. Results un-release (D4)

- [x] 3.1 Add `useUnreleaseResults` mutation clearing `resultsReleasedAt`/`resultsReleasedBy` per class via the same replicated write pattern as `useReleaseResults` (`Promise.allSettled`, partial-failure surfacing).
- [x] 3.2 Add a "Hide results" action to `BulkOperationsBar.tsx`, offered only when released classes are selected, with a confirmation dialog noting already-viewed pages won't retroactively refresh.
- [x] 3.3 Unit tests: mutation payload, released-only gating, partial-failure retry.

## 4. Check payment recording (D5)

- [x] 4.1 Write the assertion-first regression test in `show-registrations/reads.test.ts` asserting `updateEnrollmentPaymentStatus` writes `check_number` for check payments; run it red.
- [x] 4.2 Add an optional `checkNumber` parameter to `updateEnrollmentPaymentStatus` writing `check_number` alongside `payment_reference`; keep non-check updates from touching `check_number`.
- [x] 4.3 Thread `checkNumber` from `EnrollmentCard.tsx` and `EnrollmentPartialPaymentDialog.tsx` through `handleEnrollmentPaymentChange` (`useEntryManagementActions.ts`); run the test green.

## 5. Outstanding balance visibility (D6)

- [x] 5.1 Add an "Outstanding" stat card to `EntryStatsCards.tsx` reusing `financialReportTotals` outstanding logic (extract a shared helper if needed).
- [x] 5.2 Unit tests: outstanding total matches Financial Report computation; fully settled show reads zero.

## 6. Cleanups

- [x] 6.1 Clone fidelity: copy `hidesUsed`/`distractionsUsed`/`itemsUsed`/`timeLimit1`-`3` in `CloneFromShowCombobox.tsx` customizations; add test cases.
- [x] 6.2 S8.2 parity: add a refund-status parity test between secretary (`EntryStatusLine`) and exhibitor (`ExhibitorPaymentsPage`) computations; remove the dead `viewer="exhibitor"` branch if confirmed unused.
- [x] 6.3 Add UKC and ASCA trial+class seed blocks to `supabase/seed-demo.sql`; add a registry-driven `ClassSelectionStep` test for UKC/ASCA.

## 7. Docs and tracking

- [x] 7.1 Update `docs/roles/secretary-responsibility-coverage.md` row statuses/evidence from the verification sweep (including S4.1 upgrade, S1.4 reword to run-order-only, S2.6/S5.5/S6.5 remediation links).
- [x] 7.2 Add the AKC results recipient verification gate (`send-results/index.ts` recipient) to `OPEN-TODOS.md` as a launch blocker; note remaining manual gates (print hardware, offline/reconnect rehearsal).
- [x] 7.3 Archive the merged `show-email-sequence` change (PR #1202) via the archive workflow. (Archived 2026-07-09; delta synced to `openspec/specs/show-lifecycle-emails/spec.md`.)

## 8. Verification and merge gate

- [x] 8.1 Run focused vitest suites for every touched area from `apps/myk9show`; all green.
- [x] 8.2 Run `pnpm typecheck` and `pnpm lint`; fix any fallout.
- [x] 8.3 Open PR, pass CI and code review, merge; update tasks and coverage matrix after merge. (PR #1242 merged 2026-07-10; review findings fixed pre-merge.)
