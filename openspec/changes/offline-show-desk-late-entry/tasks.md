## 1. Queue Foundation

- [x] 1.1 Add a focused failing test for pending mutation lookup by table and row id in `packages/replication/src/MutationManager.test.ts`.
- [x] 1.2 Implement `MutationManager.getPendingMutationsForRow(tableName, rowId)` with stable pending-mutation ordering.
- [x] 1.3 Add `ReplicatedTable.getPendingMutationIdsForRow(rowId)` as a narrow wrapper over the mutation manager.
- [x] 1.4 Verify queue foundation with `pnpm --filter @myk9/replication test -- --run src/MutationManager.test.ts`.

## 2. Show-Desk Local People Queue

- [x] 2.1 Add tests for preserving caller-supplied ids, local pending state, and queued `people` inserts in `ReplicatedShowDeskPeopleTable`.
- [x] 2.2 Implement `apps/myk9show/src/services/replication/ReplicatedShowDeskPeopleTable.ts` as a narrow local people queue with no broad people-directory sync.
- [x] 2.3 Export the table and wire it to the shared `MutationManager` in `ReplicationSyncProvider`.
- [x] 2.4 Verify the people queue with `cd apps/myk9show && pnpm exec vitest run src/services/replication/__tests__/ReplicatedShowDeskPeopleTable.test.ts`.

## 3. Offline Dog And Registration Persistence

- [x] 3.1 Add tests proving `ReplicatedDogsTable.createDogWithId()` preserves a supplied dog id, queues an insert, and forwards dependencies.
- [x] 3.2 Implement dependency-aware `createDogWithId()` and keep existing `createDog()` behavior by delegating to it.
- [x] 3.3 Add tests for saving, reading, and clearing pending dog registration intents by dog id.
- [x] 3.4 Implement `PendingDogRegistrationIntents` as local persistence that stores registration organization, number/breed/type, and sync status without network.
- [x] 3.5 Add `useDogStoreCompat().addDogOfflineFirst()` that creates a replicated local dog, saves pending registration intents, invalidates dog queries, and leaves existing `addDog()` behavior unchanged.
- [x] 3.6 Verify dog and registration persistence with `cd apps/myk9show && pnpm exec vitest run src/services/replication/__tests__/ReplicatedDogsTable.test.ts src/services/replication/__tests__/PendingDogRegistrationIntents.test.ts src/hooks/__tests__/useDogStoreCompat.test.ts`.

## 4. Late-Entry Quick Create Routing

- [x] 4.1 Add tests proving `CreateExhibitorDialog` uses the local show-desk people queue when `offlineFirst` is enabled and preserves the existing online `createUser()` path when it is not.
- [x] 4.2 Add tests proving secretary/admin late-entry quick create passes offline-first mode through exhibitor and dog creation.
- [x] 4.3 Add `offlineFirst?: boolean` to `CreateExhibitorDialog` and map local show-desk people rows back to the existing `User` shape.
- [x] 4.4 Add `offlineFirst?: boolean` to `AddDogPanel` and call `addDogOfflineFirst()` only when requested.
- [x] 4.5 Pass secretary/admin late-entry mode through `RegistrationWizardPage`, `WorkflowStepContent`, `DogSelectionStepEnhanced`, and `QuickCreateFlow` without adding a new UI surface.
- [x] 4.6 Verify quick-create routing with `cd apps/myk9show && pnpm exec vitest run src/components/shows/RegistrationWorkflow/__tests__/QuickCreateFlow.test.tsx src/components/shows/RegistrationWorkflow/__tests__/CreateExhibitorDialog.test.tsx`.

## 5. Offline Late-Entry Submission

- [x] 5.1 Add tests for `submitOfflineLateEntry()` with one dog, multiple selected classes, staff-recorded payment, local armband assignment, confirmed day-of entries, and entry dependencies on the pending dog mutation.
- [x] 5.2 Implement `apps/myk9show/src/features/registration/submitOfflineLateEntry.ts` using replicated day-of entry creation and existing local assignment behavior.
- [x] 5.3 Add tests proving offline local save succeeds when Supabase/user/dog creation calls are unavailable and leaves queued rows visible instead of deleting local work.
- [x] 5.4 Add tests proving `submitPaymentStep` routes secretary/admin late-entry non-card payment to `submitOfflineLateEntry()` and preserves existing normal and card-guard behavior.
- [x] 5.5 Route only secretary/admin late-entry non-card submissions through the offline helper; leave normal registration and card checkout on the existing path.
- [x] 5.6 Verify offline submission with `cd apps/myk9show && pnpm exec vitest run src/features/registration/submitOfflineLateEntry.test.ts src/pages/RegistrationWizardPage/submitPaymentStep.test.ts`.

## 6. Verification, Tracking, And Ship Gate

- [x] 6.1 Update `OPEN-TODOS.md` so Queue-based Offline Dog Create is tracked as pulled-forward launch-readiness work.
- [x] 6.2 Run OpenSpec validation with `pnpm openspec validate --changes offline-show-desk-late-entry`.
- [x] 6.3 Run a focused TypeScript check for touched packages/apps, at minimum `pnpm --filter @myk9/replication typecheck` and the relevant myK9Show typecheck command available in the repo.
- [x] 6.4 Run implementation verification with the OpenSpec verify-change process and fix critical findings.
- [ ] 6.5 Commit implementation changes and open a PR with `Tracked in openspec change: offline-show-desk-late-entry` in the body.
- [ ] 6.6 Wait for CI/review and merge before archiving the OpenSpec change.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This touches offline replication, entry submission, and secretary show-day workflow, so it needs focused tests, type checks, OpenSpec verification, CI, review, and merge evidence before archive.
