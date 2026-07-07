# Offline Show Desk Late Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a secretary at a no-connectivity show create a new exhibitor, create a new dog, select classes, record payment, and save day-of entry rows locally from the existing late-entry wizard.

**Architecture:** Keep the existing show desk route and registration wizard. Add a narrow show-desk local people table/helper, add dependency-aware dog/entry queue helpers, make the create-new exhibitor/dog flow local-first in late-entry secretary mode, and route late-entry non-card submission through replicated day-of entry creation instead of online enrollment RPCs. Registrations are persisted as pending local metadata so Phase 2 can attach them after reconnect.

**Tech Stack:** TypeScript, React, Vitest, IndexedDB replication via `@myk9/replication`, existing shadcn/ui components, Supabase PostGREST upload through `MutationManager`.

## Global Constraints

- Work in `/Users/richardbeezley/AI Projects/myk9-platform/.worktrees/codex-offline-show-desk-late-entry` on branch `codex/offline-show-desk-late-entry`.
- Do not add a new page, sheet, or parallel registration surface.
- Preserve existing online exhibitor registration behavior outside secretary late-entry mode.
- No online card checkout while offline; late-entry offline submission supports staff-recorded payment methods only.
- Keep normal offline language calm: `Saved on this device`, `Finishing save`, `Needs attention`.
- Include registrations in persistence shape, but server attach and duplicate registry resolution may remain Phase 2.
- Every implementation task includes focused tests before it is complete.

---

## File Structure

- `apps/myk9show/src/services/replication/ReplicatedShowDeskPeopleTable.ts` — app-local queue table for show-desk-created people rows; no broad people-directory sync.
- `apps/myk9show/src/services/replication/ReplicatedDogsTable.ts` — add create-with-id/dependency support and pending mutation lookup for dog rows.
- `packages/replication/src/MutationManager.ts` and `packages/replication/src/core/ReplicatedTable.ts` — expose a narrow read API for pending mutations by table/row so entry inserts can depend on a locally-created dog.
- `apps/myk9show/src/services/replication/PendingDogRegistrationIntents.ts` — small IndexedDB/local persistence helper for registration payloads keyed by dog id.
- `apps/myk9show/src/components/shows/RegistrationWorkflow/CreateExhibitorDialog.tsx` — use local-first person creation when requested.
- `apps/myk9show/src/components/panels/edit/AddDogPanel/index.tsx` — use local-first dog creation when requested and preserve pending registration payloads.
- `apps/myk9show/src/components/shows/RegistrationWorkflow/QuickCreateFlow.tsx` — pass local-first mode through exhibitor and dog creation.
- `apps/myk9show/src/components/shows/RegistrationWorkflow/DogSelectionStepEnhanced.tsx` and `WorkflowStepContent.tsx` — enable local-first creation only for secretary late-entry mode.
- `apps/myk9show/src/features/registration/submitOfflineLateEntry.ts` — create replicated day-of entries from the wizard's selected dogs/classes/payment data.
- `apps/myk9show/src/pages/RegistrationWizardPage/submitPaymentStep.ts` — route secretary late-entry non-card submission to `submitOfflineLateEntry`.
- `OPEN-TODOS.md` — move the item out of Post-Fall into launch priority tracking.

---

## Task 1: Expose Pending Mutation Lookup

**Files:**
- Modify: `packages/replication/src/MutationManager.ts`
- Modify: `packages/replication/src/core/ReplicatedTable.ts`
- Test: `packages/replication/src/MutationManager.test.ts`

**Interfaces:**
- Produces: `MutationManager.getPendingMutationsForRow(tableName: string, rowId: string): Promise<PendingMutation[]>`
- Produces: `ReplicatedTable.getPendingMutationIdsForRow(rowId: string): Promise<string[]>`

- [ ] **Step 1: Write failing MutationManager test**

Add a test that queues two mutations, calls `getPendingMutationsForRow('dogs', 'dog-1')`, and expects only the dog mutation id.

- [ ] **Step 2: Implement `getPendingMutationsForRow`**

Read `REPLICATION_STORES.PENDING_MUTATIONS`, filter by `tableName` and `rowId`, and return timestamp/sequence sorted pending mutations.

- [ ] **Step 3: Add ReplicatedTable wrapper**

Add a protected/public helper that returns ids from the MutationManager lookup for the current table name. It must return `[]` when no manager is attached.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @myk9/replication test -- --run src/MutationManager.test.ts
```

Expected: the new pending lookup test and existing MutationManager tests pass.

---

## Task 2: Add Show-Desk People Queue

**Files:**
- Create: `apps/myk9show/src/services/replication/ReplicatedShowDeskPeopleTable.ts`
- Modify: `apps/myk9show/src/services/replication/index.ts`
- Modify: `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`
- Test: `apps/myk9show/src/services/replication/__tests__/ReplicatedShowDeskPeopleTable.test.ts`

**Interfaces:**
- Produces: `replicatedShowDeskPeopleTable.createPerson(person: ShowDeskPersonInput): Promise<ReplicatedShowDeskPerson>`
- Produces: `replicatedShowDeskPeopleTable.lastMutationId: string | null`

- [ ] **Step 1: Write table test**

Test that `createPerson()` stores a local row with `_syncStatus: 'pending'`, queues an `INSERT` for table `people`, and preserves a caller-supplied client id.

- [ ] **Step 2: Implement table**

Create an app-local `ReplicatedTable<ReplicatedShowDeskPerson>` wrapper with:

- table name `people`
- no-op `sync()` returning success
- `toSupabaseRow()` mapping first/last/email/phone/address/status fields
- `createPerson()` that calls `set(id, row, true)` then `queueMutation('INSERT', id, payload)`

- [ ] **Step 3: Wire MutationManager**

Add the table to `ReplicationSyncProvider` so it receives the shared MutationManager. Keep sync no-op to avoid broad people replication.

- [ ] **Step 4: Verify**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/services/replication/__tests__/ReplicatedShowDeskPeopleTable.test.ts
```

Expected: the new table tests pass.

---

## Task 3: Add Dependency-Aware Dog Create And Pending Registrations

**Files:**
- Modify: `apps/myk9show/src/services/replication/ReplicatedDogsTable.ts`
- Create: `apps/myk9show/src/services/replication/PendingDogRegistrationIntents.ts`
- Modify: `apps/myk9show/src/hooks/useDogStoreCompat.ts`
- Test: `apps/myk9show/src/services/replication/__tests__/ReplicatedDogsTable.test.ts`
- Test: `apps/myk9show/src/services/replication/__tests__/PendingDogRegistrationIntents.test.ts`
- Test: `apps/myk9show/src/hooks/__tests__/useDogStoreCompat.test.ts`

**Interfaces:**
- Produces: `ReplicatedDogsTable.createDogWithId(dog: ReplicatedDog, options?: { dependsOn?: string[] }): Promise<ReplicatedDog>`
- Produces: `useDogStoreCompat().addDogOfflineFirst(dogData: DogInput, options?: { dependsOn?: string[] }): Promise<Dog>`
- Produces: `savePendingDogRegistrationIntents(dogId: string, registrations: DogInput['registrations']): Promise<void>`

- [ ] **Step 1: Write failing dog table test**

Test that `createDogWithId()` preserves the supplied dog id, queues an `INSERT`, and forwards `dependsOn` to the queued mutation.

- [ ] **Step 2: Implement `createDogWithId()`**

Refactor existing `createDog()` to call `createDogWithId()` with a generated id. Keep existing public behavior unchanged.

- [ ] **Step 3: Write pending registration persistence tests**

Test saving, reading, and clearing pending registration intents for a dog id. Include organization, number, breed/type, and status.

- [ ] **Step 4: Implement pending registration helper**

Use IndexedDB through the existing replication database manager if practical; otherwise use a small app-level IndexedDB helper. The helper must not require network.

- [ ] **Step 5: Add `addDogOfflineFirst()`**

In `useDogStoreCompat`, add a separate method that:

- maps `DogInput` to `ReplicatedDog`
- calls `replicatedDogsTable.createDogWithId()`
- saves pending registration intents when present
- invalidates dog queries
- returns a local `Dog`

Do not remove the existing online `addDog()` path in this task.

- [ ] **Step 6: Verify**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/services/replication/__tests__/ReplicatedDogsTable.test.ts src/services/replication/__tests__/PendingDogRegistrationIntents.test.ts src/hooks/__tests__/useDogStoreCompat.test.ts
```

Expected: new and existing focused tests pass.

---

## Task 4: Make Quick Create Local-First In Secretary Late-Entry Mode

**Files:**
- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/CreateExhibitorDialog.tsx`
- Modify: `apps/myk9show/src/components/panels/edit/AddDogPanel/index.tsx`
- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/QuickCreateFlow.tsx`
- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/DogSelectionStepEnhanced.tsx`
- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/WorkflowStepContent.tsx`
- Modify: `apps/myk9show/src/pages/RegistrationWizardPage.tsx`
- Test: `apps/myk9show/src/components/shows/RegistrationWorkflow/__tests__/QuickCreateFlow.test.tsx`
- Test: `apps/myk9show/src/components/shows/RegistrationWorkflow/__tests__/CreateExhibitorDialog.test.tsx`

**Interfaces:**
- Consumes: `replicatedShowDeskPeopleTable.createPerson()`
- Consumes: `addDogOfflineFirst()`
- Produces: `offlineFirst?: boolean` prop through late-entry create dialogs

- [ ] **Step 1: Add failing dialog tests**

Test that `CreateExhibitorDialog` with `offlineFirst` calls `replicatedShowDeskPeopleTable.createPerson()` instead of direct `createUser()`, returns a `User`, and shows no error when Supabase is unavailable.

- [ ] **Step 2: Add failing quick-create test**

Test that secretary late-entry quick create passes `offlineFirst` through exhibitor and dog creation.

- [ ] **Step 3: Implement local-first exhibitor create**

Add `offlineFirst?: boolean`. In offline-first mode, create the exhibitor through the show-desk people table and return a mapped `User` with exhibitor role. Keep the existing direct `createUser()` path for normal modes.

- [ ] **Step 4: Implement local-first dog create prop**

Add `offlineFirst?: boolean` to `AddDogPanel`. Use `addDogOfflineFirst()` when true and `addDog()` otherwise.

- [ ] **Step 5: Pass mode from wizard**

Pass `isLateEntryMode` into `WorkflowStepContent`, then into `DogSelectionStepEnhanced`, then into `QuickCreateFlow` / creation dialogs as `offlineFirst={isLateEntryMode}` for secretary/admin modes.

- [ ] **Step 6: Verify**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/components/shows/RegistrationWorkflow/__tests__/QuickCreateFlow.test.tsx src/components/shows/RegistrationWorkflow/__tests__/CreateExhibitorDialog.test.tsx
```

Expected: create dialogs pass in both offline-first and existing online modes.

---

## Task 5: Add Offline Late-Entry Submission

**Files:**
- Create: `apps/myk9show/src/features/registration/submitOfflineLateEntry.ts`
- Modify: `apps/myk9show/src/pages/RegistrationWizardPage/submitPaymentStep.ts`
- Test: `apps/myk9show/src/features/registration/submitOfflineLateEntry.test.ts`
- Test: `apps/myk9show/src/pages/RegistrationWizardPage/submitPaymentStep.test.ts`

**Interfaces:**
- Produces: `submitOfflineLateEntry(params): Promise<{ armbandAssignments: ArmbandAssignment[]; entryIds: string[] }>`
- Consumes: `replicatedEntriesTable.createEntry(entry, dependencyMutationId)`
- Consumes: pending dog mutation lookup from Task 1

- [ ] **Step 1: Write failing offline submit test**

Create one selected dog, two class selections, cash payment, and a pending dog mutation. Assert that replicated entry creation is called once per selected class, entries are `confirmed`, `isDayOfShow: true`, payment is recorded, and entry creation depends on the dog mutation id.

- [ ] **Step 2: Implement `submitOfflineLateEntry()`**

Map wizard `classSelections`, `handlerAssignments`, `classes`, and `showFeeInfo` into replicated day-of entry rows. Reuse the local armband assignment logic from `createDayOfEntry` or extract it to a shared helper.

- [ ] **Step 3: Route late-entry payment submit**

In `submitPaymentStep`, before `submitShowRegistration`, route staff late-entry non-card payment to `submitOfflineLateEntry()`. On success:

- set armband assignments
- clear cart
- trigger sync
- mark payment step complete
- advance to confirmation

Keep existing `credit_card` guard and existing normal registration path unchanged.

- [ ] **Step 4: Verify**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/features/registration/submitOfflineLateEntry.test.ts src/pages/RegistrationWizardPage/submitPaymentStep.test.ts
```

Expected: offline late-entry tests pass; existing close-date and card-guard tests stay green.

---

## Task 6: Tracking, UX Copy, And Focused Regression

**Files:**
- Modify: `OPEN-TODOS.md`
- Add or modify a focused wizard/service regression test under existing test folders.

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: launch-priority tracking entry and final focused test evidence.

- [ ] **Step 1: Move todo tracking**

Move `Queue-based Offline Dog Create` out of Post-Fall and into launch-priority tracking as `Offline show-desk late entry capture`.

- [ ] **Step 2: Add end-to-end service regression**

Add a focused test proving the launch use case: with Supabase user/dog/enrollment/entry RPC calls unavailable, secretary late-entry mode can create local exhibitor, local dog, and replicated day-of entries.

- [ ] **Step 3: Run focused verification**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/components/shows/RegistrationWorkflow/__tests__/QuickCreateFlow.test.tsx src/components/shows/RegistrationWorkflow/__tests__/CreateExhibitorDialog.test.tsx src/features/registration/submitOfflineLateEntry.test.ts src/pages/RegistrationWizardPage/submitPaymentStep.test.ts src/hooks/__tests__/useDogStoreCompat.test.ts
pnpm --filter @myk9/replication test -- --run src/MutationManager.test.ts
pnpm typecheck
```

Expected: focused tests and typecheck pass. If a suite hangs for more than 60 seconds, stop and report the hang per repo instructions.

---

## Execution Recommendation

Use inline execution for Task 1 through Task 5 in this worktree because the work is tightly coupled across replication, wizard creation, and payment submission. Request a review checkpoint after Task 5 before broader UX polish or Phase 2 registration attach work.
