# Offline edits to existing dog registrations (MYK9-1090, MYK9-1076, MYK9-1075)

> **Status:** Active

Owner-approved design, 2026-10-12. It supersedes the abandoned app half of [`archive/plan-myk9-1071-offline-registrations-people.md`](archive/plan-myk9-1071-offline-registrations-people.md), whose review rounds are the background for every rule below.

## Goal and scope

**Who it is for:** a secretary at a show with poor signal, fixing an existing dog's registration (number, registered name, breed) from the dog page's Manage registrations panel, or adding one inside the add-entry flow. An exhibitor editing their own dog's registrations gets the same behaviour, because it is the same code.

**In scope**

- Offline add, edit and delete of registrations on an existing dog.
- Discard of a failed dog or registration edit puts the device's row back (MYK9-1076).
- A clear offline refusal when someone edits an existing person.

**Not in scope (owner decision, 2026-10-12)**

- Offline edits to existing people or `people_private`. Person reads join `judge_qualifications` and role labels, which are not replicated. `people.version` and `update_person_details_versioned` stay on the server unused.
- Ringside and entries Discard behaviour.
- Registration organization, search, statistics, validate, AKC-export and report reads.
- Editing `is_primary`.

**Why this shape:** MYK9-1071 (#2873, four Codex rounds) and MYK9-1076 (#2912, three rounds) each failed the same way. Registration screens read PostgREST through React Query while writes went to the replica, so every write, resolve and discard path needed its own cache patch, and each round found one that was missed. Here the replica is the only source those screens read, and one listener refreshes them, so there is no per-path patching to miss.

## Facts (main @ 5aff0b6ea, live DB 2026-10-12)

- `dog_registrations`: 77 rows (72 on live dogs). `version` column and `dog_registrations_version_increment` trigger are already pushed (MYK9-1071 PR 1). Deletion is a hard DELETE; a dog soft delete stamps `dog_deleted_at` and RLS hides the row. SELECT RLS follows `dogs_select`, so a secretary sees every dog's registrations.
- **No migration is needed.** Nothing in this plan requires `supabase db push`.
- `ReplicatedDogRegistrationsTable.sync()` is a no-op. `createRegistrationsForDog` (queued INSERT) has no callers; `createLocalRegistrationsForDog` (clean set) is used by offline dog create.
- Every registration write on an existing dog goes direct to PostgREST: `services/database/registrations/reads.ts` (`createRegistration`, `updateRegistration`, `deleteRegistration`) via `useRegistrationsDatabase.ts` mutations, `useInlineDogRegistration`, and `syncDogRegistrations` in `dogStoreCompatHelpers.ts`.
- Package `discardFailedMutation` deletes the record and calls `removeOrphanedLocalOnlyRow`, which only removes a `_localOnly` INSERT row. A discarded UPDATE leaves the row dirty with the refused data.
- `PendingMutation` has no record of the local row revision it was made from. `ReplicatedRow.version` is a local counter bumped on every `set`.
- `upload-complete` invalidates `[tableName]`, which matches none of the registration read keys.
- React Query's default `networkMode: 'online'` pauses queries offline, and a paused query renders as an empty list (memory: query states that read as "nothing").
- Dogs already run an id-only keyset pass over every visible dog on each sync (`ReplicatedDogsTable.reconcileDeleted`, pages of 1000).

## Design

### 1. The registrations replica

**Sync: two passes, both cheap at scale.**

1. **Changes pass.** Incremental `syncReplicatedTable` with an `(updated_at, id)` keyset cursor and no scope filter (RLS decides, the same parity rule as dogs). Explicit select list, never `*`: `id, dog_id, organization, registration_number, registration_date, verified, created_at, updated_at, registered_name, breed, variety, status, application_number, submission_date, certificate, is_primary, version`. The local row type gains the columns it lacks.
2. **ID pass.** A keyset-paged `select('id')` over every visible registration, the same shape as dogs' `reconcileDeleted`, bounded by a page cap that skips pruning when exceeded.
   - A server id missing locally is fetched by id through the row refetch adapter. That closes the coverage gap: a registration that becomes visible without an `updated_at` change, for example when its dog gains a co-owner.
   - A local id missing from the server is removed, **unless** a pending or failed mutation names the row, **or** the row was written locally after the pass began (snapshot of local ids and revisions taken before the first page). That closes the reconcile-versus-upload race.

At 10,000 registrations a changes pass moves a handful of rows, and the ID pass about 400 KB, the same cost dogs already pay. The first sync on a fresh device downloads every row once, as dogs do.

**Conflicts:** the dogs rule. A clean row takes the server copy (`resolveConflict` returns remote, replacing today's return-local). A dirty row goes through `reconcileDirtyRemoteRow`: different-field changes merge, a same-field change raises the existing Take theirs / Keep mine toast. `rebuildUpdatePayload` is overridden so a rebase rebuilds the allowlisted payload (§3).

**Cold replica:** generalise `useDogReplicaForEdit` into `useReplicaRowsForEdit`. A warm replica answers at once. A cold one runs `replicationSync.syncTable('dog_registrations')` and looks again. Still missing while offline: "Reconnect to load this dog's registrations", and nothing is queued.

**Sync cadence:** with the other replicated tables (sign-in, reconnect, the regular cycle). Sign-out clears it the way it clears dogs.

### 2. Readers

**Switch to the replica:**

- `useRegistrationsByDogQuery` (`['registrations','dog',dogId]`): the Registrations section and Manage registrations panel.
- `loadDogRegistrations` (inside dogs reads: list, detail, edit panel, add-entry dog options): replica alone when warm, PostgREST when cold, keeping the "present-and-empty is authoritative" rule from MYK9-90.

Both queries set `networkMode: 'always'` because their query functions never touch the network when warm.

**Stay on PostgREST:** the all-registrations, organization, search, statistics and validate queries; `useAKCSubmissionData`, `useEntryFormData`, `useReportDogOptions`. Offline, the duplicate-number validate check is skipped; the server's rule catches a real duplicate at upload, which surfaces through Retry/Discard.

**One refresh rule.** `ReplicationSyncProvider` subscribes once to `replicatedDogRegistrationsTable` (`subscribe(cb, { emitCurrent: false })`). On any change it invalidates `['registrations','dog']`, `['dogs']` and the owner-dogs keys. Every source of change reaches the screens through this listener, because every one of them changes the replica: local add/edit/delete, sync, upload complete, Take theirs, Keep mine and Discard. No path patches a React Query cache by hand.

### 3. Writes

All three follow `ReplicatedDogsTable.updateDog`: write the local row dirty, then queue.

- **Add:** `createRegistrationsForDog` (already queues an INSERT). When the dog's own create is still queued, the INSERT `dependsOn` it via `getPendingMutationIdsForDog`.
- **Edit:** new `updateRegistration(id, patch)`. Full-row OCC UPDATE (`.eq('version', serverVersion)`), payload built only from `REGISTRATION_UPDATE_COLUMNS`: `organization, registration_number, registered_name, breed, variety, status, registration_date, updated_at`. Never `dog_id` (fires the deleted-marker trigger), `verified`, `is_primary` or `created_at`. A key outside the constant throws before anything is queued.
- **Delete (MYK9-1075):** new `deleteRegistration(id)`. The row stays in the replica marked `_pendingDelete`, hidden from every reader, and a DELETE is queued with no version check: the person deleting means it. The ID pass keeps the marked row because a mutation names it. Upload success removes it. Deleting a row whose INSERT is still queued cancels the INSERT and removes the row, sending nothing.

**Callers rewired:**

1. `useRegistrationFormSaves` (Manage registrations panel, `DogRegistrationDialogs` add/edit) and the `DogRegistrationDialogs` delete.
2. `useInlineDogRegistration` (add-entry inline add).
3. `syncDogRegistrations` (the registration fields saved with Edit dog): reads the dog's rows from the replica, edits a matching organization, adds a new one.

The panel closes on save online or offline. Offline, the existing unsent-changes indicator shows the waiting write. A permanent refusal (42501, 23505 and others) reaches the existing Retry/Discard toast. The `useRegistrationsDatabase` direct mutations lose their last callers on these paths; delete whatever ends up unused.

### 4. Discard reverts the row (package, MYK9-1076)

- **Record the revision.** `PendingMutation` gains `rowRevision?: number`. `ReplicatedTable.queueMutation` stamps it from the row's local `version` when it queues.
- **Opt-in per table.** `ReplicatedTable` gains `protected revertsOnDiscard = false`; `dogs` and `dog_registrations` set it to true. Ringside and entries tables keep today's behaviour.
- **On `discardFailedMutation` for an UPDATE or DELETE on an opted-in table, revert only when both hold:**
  1. the row's current `version` equals the discarded mutation's `rowRevision`, so nothing newer was written locally, including a set not yet queued (the write-before-queue window, 1076 round 3); and
  2. no other pending or failed mutation names the row (sibling failed edits, 1076 round 1).
- **The revert:** for an UPDATE, restore `baseData` as the row data, clear dirty, `syncStatus` and any conflict mark, keep the server token; for a DELETE, clear `_pendingDelete`. Then, when online, `requestRowRefetch` so a newer server value shows at once; offline, the next sync brings it. The revert is local, so it works offline.
- **Fallback:** with conflict surfacing off there is no `baseData`; Discard then refetches the row when online, and offline the row stays until the next sync.
- **Retry is unchanged.** Nothing re-pulls automatically on a refusal, so Retry and Discard never fight, and Retry never needs a rebased payload.

### 5. People: a clear offline refusal

`updateUser` (`services/database/users/reads.ts`) checks connectivity first and, offline, throws `PERSON_EDIT_NEEDS_CONNECTION` ("Reconnect to save changes"). `friendlySaveError` treats it as an authored refusal, so the panel stays open and shows it instead of the generic "Couldn't save… Try again". The person-save mutations run with `networkMode: 'always'` so the refusal shows instead of a silently paused save. Covers `UserDetailsView`, own profile (`useUpdatePerson`) and the show wizard. Offline person create is unchanged. The MYK9-1071 branch (`claude/myk9-1071-offline-edits-app`, commits listed in MYK9-1090) has a reviewed version of this to port.

## Delivery: three PRs

| PR  | Contents                                                                                                                                                                                           | Closes          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | `rowRevision`, `revertsOnDiscard`, the guarded revert, dogs opted in                                                                                                                               | MYK9-1076       |
| 2   | Registrations sync (both passes, guarded prune, conflict rules, refetch adapter), the two readers on the replica with `networkMode: 'always'`, the single refresh listener. Writes still go direct | —               |
| 3   | Queued add, edit and delete, the three caller groups, the `_pendingDelete` marker, registrations opted into the revert, the people offline refusal                                                 | MYK9-1075, 1090 |

No `db push`. Each PR's production evidence needs a Deploy myK9Show run (owner go-ahead). Expected review floor: `independent` (Codex) for PR 1 at least, because it changes `@myk9/replication`; run `pnpm qa:review-tier --base origin/main` per PR.

## Testing phase

Each test is written red before the code that turns it green. Every PR also runs: a shuffled full app suite (`pnpm vitest run --sequence.shuffle`, six runs if module-scope state is added), `pnpm typecheck`, `pnpm qa:code-quality-ratchet`, and a package rebuild before app tests.

**PR 1 (package)**

- Discard of a refused UPDATE restores `baseData` and clears dirty, offline.
- A newer queued edit blocks the revert; a newer `set` with no queued mutation blocks it (write-before-queue).
- A sibling failed mutation on the same row blocks it.
- Discard of a failed DELETE un-hides the row.
- A table without `revertsOnDiscard` is unchanged (dirty row kept).
- No `baseData`: online refetch, offline no change.
- Mutation check: break the revision comparison and watch the write-before-queue test go red.

**PR 2 (replica and readers)**

- Changes pass select list is exact (no `*`) and unscoped; cursor is `(updated_at, id)`.
- ID pass: a server-only id is fetched by id; a server-dropped id is removed; rows named by pending or failed mutations, and rows written after the pass began, survive; the page cap skips pruning.
- `resolveConflict` takes remote; a dirty row same-field change raises the conflict.
- Readers return replica rows offline (`fetchStatus` not `paused`); cold falls back to PostgREST; present-and-empty stays authoritative.
- The listener invalidates the reader keys on a local write, a sync, an upload, Take theirs, Keep mine and Discard (render the real Registrations section, LESSON last-hop-drop).

**PR 3 (writes and people)**

- Red first: offline save from each caller group asserts `queueMutation(...)` and no PostgREST call.
- Edit payload keys are a subset of `REGISTRATION_UPDATE_COLUMNS`; an unknown key throws before queueing.
- Delete: row hidden at once, survives an ID pass, removed on upload; delete of an unsent add cancels the INSERT and sends nothing.
- Add on an offline-created dog depends on the dog's INSERT.
- Offline person save shows "Reconnect to save changes" and the panel stays open.

**Walk after PR 3 deploys** (production, built-in browser pane, network cut with browser offline mode): edit, add and delete a registration on a test dog offline; reconnect and confirm all three reached the server by SQL; force a refusal and Discard it, confirm the row reverts; edit a person offline and see the refusal. Soft-delete the walk records afterwards, as with MYK9-1081.
