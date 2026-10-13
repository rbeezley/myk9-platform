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
   - A local id missing from the server is removed, **unless** a pending or failed mutation names the row, **or** the row was written locally after the pass began (snapshot of local ids and revisions taken before the first page), **or** a pending or failed mutation named it when the pass began (PR 3, MYK9-1129 item b: an upload acknowledgement marks a queued add synced without moving its revision, while the id set may predate the INSERT; the next pass decides it). That closes the reconcile-versus-upload race. A dirty row is kept, except a `_pendingDelete` row nothing names any more: its DELETE uploaded, the confirmation was missed, and the server agrees it is gone.
   - **Deletion fence (PR 3, MYK9-1129 item a).** Each sync pass opens a `RegistrationDeletionFence`; a delete this device sees confirmed while a pass runs is recorded, and the table refuses to store that id. The refusal is asked inside the replica write's own IndexedDB transaction, just before the put (`ReplicatedTable.acceptsRemoteRow`, a hook in `@myk9/replication` that `batchSet` and `batchSetChunked` call; every download stores through them), so a confirmation that lands between the server read and the write still holds (Codex round 2: a filter before the async store left that gap). A pass that starts after the delete stores whatever the server shows, so a delete the server did not apply comes back.
   - **Placeholders (found while building PR 2).** An offline dog create writes its registrations to the replica as clean `_localOnly` rows with device ids, and uploads them inside `create_dog_with_registrations`, which inserts server rows with **server-generated** ids. The two never match by id, so the ID pass never removes a placeholder on the basis of the server id set. After the downloads of each sync are stored, one IndexedDB transaction removes a placeholder (with no queued work of its own) only by content: when its **server twin** is in the replica: a clean server row with the same dog and the same `created_at` compared as an instant (the device stamps each registration's `created_at`, the RPC payload carries it and the RPC stores it, so the two are identical), or, for a placeholder with no usable `created_at`, the same normalised organization and number. The readers hide a placeholder from a server read by the same rule (`hasServerTwin`), or when it is an **orphan** (its dog is gone from the dogs replica and no pending or failed `dogs` mutation names that dog). Otherwise it stays, including after its dog uploaded but before the server's copies arrived. Two Codex rounds each found a window in the earlier timing-based guard (dog dirty, local-only or queued), so it was replaced by this rule. `addDogOfflineFirst` still writes and queues the dog before its placeholders.
   - **Placeholder siblings (PR 3, MYK9-1129 item c).** When `create_dog_with_registrations` finds one of the create's registrations on an existing dog, it returns that dog and inserts **none** of the create's registrations. The upload remaps the placeholders' `dogId`; each placeholder also carries `_placeholderOf`, the dog id the create wrote it for, which does not move. Once any placeholder of a remapped create (`dogId !== _placeholderOf`) resolves, all of them are resolved (`resolvedPlaceholderIds`), in the sync cleanup and in both readers. A twin may be a row this device is deleting: its placeholder stands for the same registration, so it is not shown in the deleted row's place, and the confirmed delete removes it.
   - A row is a placeholder when it is `_localOnly` without `_queuedAdd`. A queued add (§3) is `_localOnly` with `_queuedAdd`: it uploads under its own id, and is never matched by content.
   - **Server-backed rule (Codex round 3).** A server row with a queued add's id proves the add landed, even when its INSERT acknowledgement was lost. Whenever the changes pass, the ID pass or a server-first read sees one, `markServerBacked` clears `_localOnly` and `_queuedAdd` together (`asServerBacked`, the one definition). It changes only the flags, never the OCC token: a token ahead of the data it stands for let a full-row write overwrite another device's change (Codex final round); the token arrives with the data in a download. The row is then an ordinary server-backed row; its still-queued INSERT replays as a primary-key duplicate. The add's clean seed carries neither flag, so a sync's three-way merge cannot drop one without the other.

At 10,000 registrations a changes pass moves a handful of rows, and the ID pass about 400 KB, the same cost dogs already pay. The first sync on a fresh device downloads every row once, as dogs do.

**Conflicts:** the dogs rule. A clean row takes the server copy (`resolveConflict` returns remote, replacing today's return-local). A dirty row goes through `reconcileDirtyRemoteRow`: different-field changes merge, a same-field change raises the existing Take theirs / Keep mine toast. `rebuildUpdatePayload` is overridden so a rebase rebuilds the allowlisted payload (§3).

**Sync cadence:** with the other replicated tables (sign-in, reconnect, the regular cycle). Sign-out clears it the way it clears dogs.

### 2. Readers

**Server first, with a labelled offline copy (revised while building PR 2).**

- `useRegistrationsByDogQuery` (`['registrations','dog',dogId]`, the Registrations section and Manage registrations panel) and `loadDogRegistrations` (dogs reads: list, detail, edit panel, add-entry dog options) read PostgREST first. A successful read is merged with **only** this device's unsent work (`getUnsentWorkForDogs`: dirty rows and `_localOnly` rows), never clean cached copies, which may be rows the server no longer returns. One rule merges them, `mergeUnsentWork` (PR 3, MYK9-1129 item 5): every unsent row that is not a placeholder (an edit or an add) **wins** over the server row with the same id; a `_pendingDelete` row hides the server row it deletes; a queued add shows, including a re-add of a registration whose old row is being deleted (new id, same organization and number); a placeholder shows until it is resolved. `registrationsReadComplete` reflects the server read, and a successful empty read is "no registrations" (MYK9-90).
- Per dog for a batched read (`loadDogRegistrations`, Codex round 5): the dogs of a batch the server could not be reached for answer from the device copy, clean rows included; the dogs of answered batches keep the server's rows with the unsent overlay; the result is incomplete whenever a batch failed.
- When the PostgREST read fails (offline, network error), the device copy answers: every registration the replica holds for the dog. It is marked `source: 'device'` and `registrationsReadComplete: false`, never authoritative. The Registrations section shows "Offline copy. It may be out of date." above it, and "No registrations saved on this device" when it is empty. If the device cannot be read either, the read is an error.
- `useRegistrationsByDogQuery` keeps `networkMode: 'always'`, so offline it runs and falls back instead of sitting paused. The dog reads (`useDogsQuery`, `useDogQuery`, `useDogsByOwnerQuery`) run with `networkMode: 'offlineFirst'`, so the refresh an offline registration save triggers runs instead of pausing until reconnect (Codex final round).

**Why not "replica alone when warm".** PR 2 first served the replica alone once a trust record said it was complete for the signed-in account. Four Codex review rounds each found another way the record could vouch for rows it should not (account switch, quota eviction, failed hydration, failed mirror, database recovery, a placeholder pruned mid-pass, a hydration racing a mirrored delete, offline `getSession()` retries), so the owner set a hard stop and the trust design was dropped. The account boundary for offline device copies (a device shared between accounts) is MYK9-1126.

**Stay on PostgREST:** the all-registrations, organization, search, statistics and validate queries; `useAKCSubmissionData`, `useEntryFormData`, `useReportDogOptions`. Offline, the duplicate-number validate check is skipped; the server's rule catches a real duplicate at upload, which surfaces through Retry/Discard.

**Direct writes in PR 2 (found while building it).** Until PR 3 queued them, add, edit and delete went straight to PostgREST and each successful write was mirrored into the replica. PR 3 deleted those writes and their mirrors. The one direct write left is the online `create_dog_with_registrations` call in `addDog`, still mirrored by `mirrorServerDogRegistrations`.

**One refresh rule.** `ReplicationSyncProvider` subscribes once to `replicatedDogRegistrationsTable` (`subscribe(cb, { emitCurrent: false, onError })`). On any change, and on a change the device then cannot read back, it cancels and then invalidates `['registrations','dog']`, `['dogs']` and the owner-dogs keys, so a read already in flight cannot land after the change it predates. Every source of change reaches the screens through this listener, because every one of them changes the replica: local add/edit/delete, sync, upload complete, Take theirs, Keep mine and Discard. No path patches a React Query cache by hand.

### 3. Writes

Adds and deletes follow `ReplicatedDogsTable.updateDog`: write the local row dirty, then queue. **Edits are online-only** (below).

- **Add:** `addRegistration(draft)` (a form's columns: organization, number, registered name, breed, variety, status, registration date, application number, submission date, certificate; never `verified` or `is_primary`). It writes the row `_localOnly` and `_queuedAdd` under a new id and queues an INSERT carrying those columns; `createRegistrationsForDog` shares the same path. A re-add also waits for any queued DELETE of a registration with the same organization and number (any dog, normalised: `pendingDeletesOfNumber`), or the live org/number unique index refuses it. When the dog's own create is still queued, the INSERT `dependsOn` it (`replicatedDogsTable.getPendingMutationIdsForRow(dogId)`; the RPC's dog-id remap rewrites the queued INSERT's `dog_id` if the create merges onto an existing dog).
- **Edit: online-only (narrowed, owner decision after the review cap).** Six Codex review rounds on PR 3a each found a concurrency P1 in the offline edit path (full-row writes over newer server fields, a token ahead of its data, a download landing mid-edit, queued deltas rebased with historical values, a revert racing an in-flight UPDATE, a reconcile not bumping the local revision). The owner set a hard cap, and the PR was narrowed: an edit of a server-backed registration goes straight to the server (`useUpdateRegistrationMutation`, the direct `updateRegistration` service, mirrored into the replica, `networkMode: 'always'` from MYK9-1125). It is refused before anything is written (`services/database/registrations/editGuard.ts`) when the device is offline ("Reconnect to save registration changes.") or when the row still has unsent work on this device: an add whose INSERT has not been confirmed, a delete waiting to upload, or a refused write awaiting Retry or Discard ("This registration is still saving. Try again in a moment."). Offline adds and deletes stay queued as below. The change-set rule, the recompute-on-reconcile overrides and the package's operation-filtered discard were deleted; the table keeps main's `rebuildUpdatePayload`.
- **Delete (MYK9-1075):** `deleteRegistration(id)`. The row stays in the replica marked `_pendingDelete`, hidden from every reader, and a DELETE is queued with no version check: the person deleting means it. The ID pass keeps the marked row while a mutation names it. Upload success removes it: the upload pass names every uploaded mutation in its `replication:upload-complete` event, and the table (listening from `setMutationManager`) removes each confirmed row that nothing else names, with its placeholder twin, and records it in the deletion fence (§1). If that confirmation is missed, the next ID pass that finds the id gone removes it. Deleting a row whose INSERT is still queued (or refused) discards the INSERT and removes the row, sending nothing; an INSERT already in flight may still land, and the next sync then brings it back to delete again. No package change was needed.
- **Cold replica (plan §1):** a write whose row is not on the device reads it by id into the replica first when online; offline, or when that read fails, it is refused with "Reconnect to load this dog's registrations" (`FriendlySaveError`, shown by the panel) and nothing is queued. A placeholder (it travels inside its dog's queued create) cannot be edited or deleted: "This registration is still being saved with its dog. Reconnect, then try again."
- The three mutations (`useCreate/Update/DeleteRegistrationMutation`) run with `networkMode: 'always'`: a queued add or delete never sits paused offline, and an edit is refused at once instead of pausing.

**Callers rewired:**

1. `useRegistrationFormSaves` (Manage registrations panel, `DogRegistrationDialogs` add; edit is the online-only path above) and the `DogRegistrationDialogs` delete.
2. `useInlineDogRegistration` (add-entry inline add).
3. `syncDogRegistrations` (the registration fields saved with Edit dog). Online, the candidates are the server read's rows plus this device's unsent work, never a cached copy the server no longer returns; an organization whose fields changed is edited online (refused while it has unsent work), a new one is added through the queue. When the server cannot be read, any registration change is refused ("Reconnect to save registration changes", nothing written), and the dog's own fields still save. Fields the form did not change are not a change. No sync-coverage signal is used. Offline adds go through Manage registrations' explicit Add.

The panel closes on save online or offline. Offline, the existing unsent-changes indicator shows the waiting write. A permanent refusal (42501, 23505 and others) reaches the existing Retry/Discard toast. Deleted as unused: the direct `createRegistration`, `updateRegistration`, `deleteRegistration`, `getAllRegistrations`, their replica mirrors, `removeDeletedOnServer`, and the `useRegistrationManagement`, `useRegistrationsQuery` and `usePrefetchRegistration` hooks.

### 4. Discard reverts the row (package, MYK9-1076)

- **Record the revision.** `PendingMutation` gains `rowRevision?: number`. `ReplicatedTable.queueMutation` stamps it from the row's local `version` when it queues.
- **Opt-in per table.** `ReplicatedTable` gains `protected revertsOnDiscard = false`; `dogs` (PR 1) and `dog_registrations` (PR 3) set it to true, and both register a row refetch adapter for the online step. Ringside and entries tables keep today's behaviour.
- **On `discardFailedMutation` for an UPDATE or DELETE on an opted-in table, revert only when both hold:**
  1. the row's current `version` equals the discarded mutation's `rowRevision`, so nothing newer was written locally, including a set not yet queued (the write-before-queue window, 1076 round 3); and
  2. no other pending or failed mutation names the row (sibling failed edits, 1076 round 1).
- **The revert:** for an UPDATE, restore `baseData` as the row data, clear dirty, `syncStatus` and any conflict mark, keep the server token; for a DELETE, clear `_pendingDelete`. Then, when online, `requestRowRefetch` so a newer server value shows at once; offline, the next sync brings it. The revert is local, so it works offline.
- **Fallback:** with conflict surfacing off there is no `baseData`; Discard then refetches the row when online, and offline the row stays until the next sync.
- **Retry is unchanged.** Nothing re-pulls automatically on a refusal, so Retry and Discard never fight, and Retry never needs a rebased payload.

### 5. People: a clear offline refusal

`updateUser` (`services/database/users/reads.ts`) checks connectivity first and, offline, throws `PERSON_EDIT_NEEDS_CONNECTION` ("Reconnect to save changes"). `friendlySaveError` treats it as an authored refusal, so the panel stays open and shows it instead of the generic "Couldn't save… Try again". The person-save mutations run with `networkMode: 'always'` so the refusal shows instead of a silently paused save. Covers `UserDetailsView`, own profile (`useUpdatePerson`) and the show wizard. Offline person create is unchanged. The MYK9-1071 branch (`claude/myk9-1071-offline-edits-app`, commits listed in MYK9-1090) has a reviewed version of this to port.

## Delivery

| PR  | Contents                                                                                                                                                                                                                   | Closes          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | `rowRevision`, `revertsOnDiscard`, the guarded revert, dogs opted in                                                                                                                                                       | MYK9-1076       |
| 2   | Registrations sync (both passes, guarded prune, conflict rules, refetch adapter), server-first readers with a labelled offline device copy, the single refresh listener. Writes still go direct, mirrored into the replica | —               |
| 3a  | Queued add, edit and delete, the three caller groups, the `_pendingDelete` marker, registrations opted into the revert, readers showing unsent work, the MYK9-1129 races (a, b, c)                                         | MYK9-1075, 1090 |
| 3b  | The people offline refusal (§5), a separate PR                                                                                                                                                                             | —               |

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
- ID pass: a server-only id is fetched by id; a server-dropped id is removed; rows named by pending or failed mutations, and rows written after the pass began, survive; the page cap skips pruning; a placeholder is never pruned by the id set, and is removed only when its server twin is present or it is an orphan (dog gone, nothing queued).
- `resolveConflict` takes remote; a dirty row same-field change raises the conflict.
- Readers: online, server rows plus only unsent device work (a clean cached copy the server no longer returns does not appear), and present-and-empty stays authoritative; server unreachable, the device copy marked `source: 'device'` and never complete, offline without pausing; the section shows the offline note and the empty offline copy message.
- The listener invalidates the reader keys on a local write, a sync, an upload, Take theirs, Keep mine and Discard (render the real Registrations section, LESSON last-hop-drop).

**PR 3a (writes)** — a real MutationManager over fake IndexedDB with a recording upload client (`registrationQueueHarness.ts`), so "queued", "sent" and "refused" are read off the queue.

- Offline, Add and Delete in the real Manage registrations panel and dialogs queue their write and make no PostgREST write; Edit is refused, the form keeps its edit and nothing is written (`ManageRegistrationsPanel.queued.test.tsx`, LESSON last-hop-drop). The add-entry inline add queues offline. Edit dog (`dogStoreCompatHelpers.test.ts`): online, a changed organization is edited on the server with only what changed and a new one is added through the queue; a stale cached row is not a candidate; an unconfirmed add is refused; offline, any registration change is refused with nothing written, and an unchanged form is no change.
- Online-only edits (`registrationEditOnlineOnly.test.tsx`): online, the edit goes to the direct update and queues nothing; offline it is refused with nothing written or queued; an edit of an add not yet confirmed is refused even online. Mutation checks: the offline refusal, the unsent-work refusal and Edit dog's offline refusal each broke their tests.
- Delete: hidden at once (device copy and server merge), no version check, survives an ID pass while queued, removed on the upload's confirmation, removed by an ID pass when the confirmation was missed; delete of an unsent add cancels the INSERT and sends nothing.
- Discard: a refused delete, discarded, puts the row back.
- Add queues an INSERT with the form's columns; on an offline-created dog it depends on the dog's create.
- Readers: a pending delete hides the server row; a re-add shows (`registrationsUnsentWork.test.tsx`).
- A roster read keeps the device copies (clean rows included) for the dogs of an unreachable batch (`loadDogRegistrations.test.ts`).
- A re-add waits for the queued DELETE of the same organization and number (`ReplicatedDogRegistrationsTable.writes.test.ts`); the dog detail and owner's dogs reads refresh offline after a registration save (`useDogsDatabase.offline.test.tsx`, `networkMode: 'offlineFirst'`).
- MYK9-1129 (`ReplicatedDogRegistrationsTable.races.test.ts`): a: a delete confirmed while the ID pass fetches the row, or between the server read and the replica write (ID-pass hydration and changes pass), is not stored back, and a later pass stores it; the package test refuses a row the table rejects after `batchSet` was called; b: an add acknowledged mid-pass is not pruned; c: siblings of a merged create are removed and hidden by both readers, while a sibling of an unmerged create waits for its own copy.
- Mutation checks: each guard was broken in turn (the fence filter, the queued-at-start set, the sibling rule, delete-hides, `revertsOnDiscard`, the unsent-add cancel, `dependsOn`, the confirm listener, the offline cold refusal, the stuck-delete prune, the panel's delete mutation) and its test went red.

**PR 3b (people)**

- Offline person save shows "Reconnect to save changes" and the panel stays open.

**Walk after PR 3 deploys** (production, built-in browser pane, network cut with browser offline mode): add and delete a registration on a test dog offline, and see an offline edit refused; edit it online; reconnect and confirm the add, delete and edit reached the server by SQL; force a refusal and Discard it, confirm the row reverts; edit a person offline and see the refusal. Soft-delete the walk records afterwards, as with MYK9-1081.
