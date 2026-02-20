# myK9Show CRUD Audit Report

**Date:** 2026-02-19
**Total issues fixed:** 65
**Validation:** typecheck, build, lint all pass

---

## People/Users (9 issues fixed)

### Issues Found & Fixed
1. **[UserDetailsView.tsx:120] Address silently dropped on every update** — `userData.streetAddress` vs `userData.address` mismatch; address always set to empty string
2. **[UserDetailsPage.tsx:143] Address silently dropped on create** — Same root cause as above
3. **[useUsers.ts:50] Address dropped in useUpdatePerson hook** — Only mapped `person.streetAddress`, ignoring `person.address`
4. **[useUsersQuery.ts:36] mapUserToDbUpdate didn't handle streetAddress** — Only mapped one of the two field names
5. **[UserDetailsView.tsx + UserManagementPage + UserListPage] Missing success/error notifications** — All CRUD flows had no user feedback
6. **[UserEditPanel.tsx:472] Form labels showed required asterisks for optional fields** — Phone, address fields marked required but validation says optional
7. **[userStore.ts:296] Legacy methods don't sync `people` array** — 6 methods updated only `users`, causing state divergence
8. **[userStore.ts:346] `reset()` doesn't clear `people` array** — Stale data after reset
9. **[Multiple files] User imported from dog-types instead of user-types** — Confusing import paths fixed in 5 files

### Flagged for Dogfooding
- Photo upload stores base64 in local state, may not persist to DB
- 3 duplicate hook files providing user CRUD (`useUsers`, `useUsersDatabase`, `useUsersQuery`)
- `UserListPage.tsx` may be dead code (not routed to)
- `PersonEditDialog.tsx` may be dead code
- `useRoleBasedData.ts` has hardcoded email-to-person mapping (dev scaffolding)
- Delete dialog says "cannot be undone" but DB uses soft-delete

---

## Dogs (10 issues fixed)

### Issues Found & Fixed
1. **[dogQueries.ts:66] Wrong table name `dog_registration` (singular)** — Should be `dog_registrations`; join silently returned null
2. **[dogQueries.ts:67] Wrong table name `health_record` (singular)** — Should be `health_records`
3. **[dogQueries.ts:68-80] Wrong table names `entry`, `class`, `show` in joins** — Changed to `entries`, `classes`, `shows`
4. **[dogQueries.ts:228] Sets non-existent `updated_by` column** — Would cause Supabase error on every soft delete
5. **[dogQueries.ts:437] References non-existent `dogs_deleted_by_fkey`** — Would cause every `getDeletedDogs` call to fail
6. **[dogMappers.ts:91] Health records mapper read wrong key** — Expected singular `health_record` as nested JSON, but DB returns `health_records` as flat array with `record_type` discriminator
7. **[useDogStoreCompat.ts:62] `addDog` didn't sync registrations after creation** — Registrations silently lost
8. **[AddDogPanel/index.tsx:74] Missing `callName` in DogInput** — `call_name` column always null
9. **[AddDogPanel/index.tsx:84] `registeredName` dropped from registration mapping** — All registrations silently discarded
10. **[DogEditPanel.tsx:153] Gender defaulted to 'male' when unset** — Should omit field instead

### Flagged for Dogfooding
- Duplicate `DogInput` type in `dog-types.ts` and `dogStore.ts`
- 5 dead code files (legacy hooks, services, unused dialogs)
- ExhibitorProfilePage has separate dog CRUD flow bypassing dogStore
- Photo upload stores base64 data URLs instead of uploaded file URLs
- `useRoleBasedData.ts` hardcodes email-to-person mappings

---

## Clubs (13 issues fixed)

### Issues Found & Fixed
1. **[clubMappers.ts:9-27] Insert mapper sent non-existent columns** — `club_number`, `founded`, `club_type`, `member_ids` don't exist in DB
2. **[clubMappers.ts:33-68] Update mapper sent phantom columns + buggy address** — Same non-existent columns, partial address broke combined string
3. **[clubMappers.ts:73-124] DB-to-Club mapper accessed non-existent columns via unsafe casts** — Always returned undefined
4. **[clubMappers.ts:159-180] `mapClubToUpdate` sent phantom columns** — Same pattern
5. **[ClubsPage.tsx:181] Create flow used wrong ID** — Client-side ID didn't match DB-generated UUID; navigation broke after creation
6. **[ClubsPage.tsx:181] No success/error feedback after creation** — Silent success/failure
7. **[ClubEditPanel.tsx:534] Panel title hardcoded "Edit Club" in create mode** — Added dynamic title
8. **[useClubDetailsState.ts:183] No success toast after editing** — Silent success
9. **[MemberList.tsx:97] "View Details" button was a no-op** — Only console.log; now navigates to `/users/:id`
10. **[MemberList.tsx:103] Member removal had no confirmation dialog** — Added DeleteConfirmationDialog
11. **[MemberList.tsx:34] Member removal had no feedback** — Added success/error toasts
12. **[AddMemberDialog.tsx:57] Add member had no error feedback** — Added notifications
13. **[ClubCreationPanel.tsx:49] Country default 'United States' vs 'US'** — Inconsistent with rest of app

### Flagged for Dogfooding
- Two parallel data paths (offline-first vs React Query); only one is used
- Shows data always empty in offline-first path (hardcoded empty arrays)
- `memberIds` not persisted to DB (client-only, lost on cache clear)
- `ClubAdminService` uses mock data only
- Club header actions have no RBAC gating

---

## Shows (6 issues fixed)

### Issues Found & Fixed
1. **[showMappers.ts:74,189] DB mapper used wrong field names for trials/judges** — Expected `trial`/`judge_assignment` (singular) but query returns `trials`/`judge_assignments` (plural); all trials and judges silently dropped
2. **[showMappers.ts:29-36] Insert mapper sent non-existent columns** — `events`, `source`, `club_name`, `club_address`, `club_email` don't exist in DB
3. **[showMappers.ts:58-68] Update mapper sent non-existent columns** — Same phantom fields with double-cast masking type error
4. **[ShowDetailsPage.tsx:379] Edit save callback discarded all changes** — `onSave` ignored the data argument, just closed the panel
5. **[DeleteShowDialog.tsx:23] Delete used synchronous legacy method** — `removeShowCascading` only updated Zustand; deleted shows reappeared after sync
6. **[ShowDetailsPage.tsx:69] Trial delete used legacy method** — Same pattern; fixed to use async `deleteTrial`

### Flagged for Dogfooding
- Dual data layer (Zustand store vs React Query) with potential sync gaps
- Dead mock file `useShowsQuery.ts` with broken mock delete
- Statistics are hardcoded approximations (classes = trials * 8)
- ShowCreationWizard generates client-side IDs that may not match DB UUIDs
- Entry close date validation may be too strict (no day-of-show entries)

---

## Trials (10 issues fixed)

### Issues Found & Fixed
1. **[TrialDetailsMain.tsx:205] "Duplicate Trial" was wired to `onEdit`** — Mislabeled button; changed to "Edit Trial"
2. **[AddTrialDialog.tsx:59] No validation before submit; no form reset** — Added required field guards, disabled state, and reset
3. **[AddTrialDialog.tsx:62] Date format inconsistency** — Saved display format `MMMM d, yyyy` instead of data format `yyyy-MM-dd`; broke sorting
4. **[EditTrialDialog.tsx:54] Trial ID stored as `number` instead of `string`** — `parseInt` on UUID → NaN; broke entire edit flow
5. **[TrialDetailsPage.tsx:474 + ShowDetailsPage.tsx:365] Edit save was dead-coded** — Checked `trialData.id` which was never set; clicking Save did nothing
6. **[ShowDetailsPage.tsx:182 + TrialDetailsPage.tsx:242] Delete used legacy `removeTrial`** — In-memory only; deleted trials reappeared on reload
7. **[trialMappers.ts:37-44] Mapper ignored time fields** — `planned_start_time`, `actual_start_time`, `actual_end_time` never mapped
8. **[TrialsTab.tsx:82] Navigation lost show context** — Navigated to `/trials/:id` instead of `/shows/:showId/trials/:id`
9. **[TrialsList.tsx:48,90] Imports at bottom of file + missing show context** — Moved imports, fixed navigation
10. **[TrialHeader.tsx:31] Cancelled status used wrong CSS class** — `apple-show-status-completed` instead of `apple-show-status-cancelled`

### Flagged for Dogfooding
- Stub dialog components are dead code
- `trial.type` vs `trial.name` used interchangeably for display
- No toast feedback after CRUD operations on both detail pages
- Statistics use hardcoded judge count and fake qualified rate
- `EditTrialDialog` component appears unused (pages use `TrialEditPanel`)

---

## Classes (9 issues fixed)

### Issues Found & Fixed
1. **[EditEntryDialog.tsx:155] Edit Entry save discarded all form data** — Passed empty `{}` to onSave; rewrote to collect via FormData
2. **[ClassDetailsPage/index.tsx:115] `handleSaveEntryEdit` only logged, never persisted** — Added `updateEntry()` call with error handling
3. **[ClassDetailsPage/index.tsx:72] `handleConfirmDeleteClass` didn't await async delete** — Added await + try/catch + toasts
4. **[ClassDetailsPage/index.tsx:100] `handleConfirmDeleteEntry` didn't await async delete** — Same fix
5. **[ClassDetailsPage/index.tsx:108] `handleSaveClassEdit` didn't await async update** — Same fix
6. **[ClassDetailsPage/index.tsx:122] `handleStatusChange` didn't await async update** — Same fix
7. **[classMappers.ts:118] Update mapper dropped `status` field** — Status changes silently lost
8. **[classMappers.ts:78] Insert mapper dropped `status`, `section`, `classNumber`** — Fields never written to DB
9. **[AddClassDialog.tsx:70] Missing success/error toasts on creation** — Silent success/failure

### Flagged for Dogfooding
- ClassCreationPage wizard only writes to local Zustand, not Supabase
- ClassManagementPage uses `window.confirm()` instead of proper dialog
- Two disconnected class stores (`classStore` vs `classCreationStore`)
- `deleted_by_user` join may need FK verification
- EditClassDialog bypasses validation in "full" mode

---

## Entries (8 issues fixed)

### Issues Found & Fixed
1. **[entryMappers.ts:57] Insert mapper sent `status` instead of `entry_status`** — Wrong DB column name
2. **[entryMappers.ts:199,210] Read mapper read `dbEntry.status` instead of `entry_status`** — Status never loaded correctly
3. **[entry-query-mutations.ts:168] `updateEntryStatus` overwrote `special_requests`** — Destroyed exhibitor data with status reason
4. **[entry-store-helpers.ts:74] `entryToReplicated` sent phantom `status` field** — Changed to `entryStatus`/`entry_status`
5. **[ReplicatedEntriesTable.ts:296] `updateEntryStatus` set orphaned `status` property** — Status updates silently lost through replicated table
6. **[useMyEntriesData.ts:105] References non-existent `class_entry` join** — Every entry displayed with zero classes; restructured to use actual row data
7. **[useMyEntriesData.ts:241] `updateEntryCheckIn` never persisted to DB** — Added database call with error handling
8. **[ClassDetailsPage/index.tsx:138] Missing `userId` parameter on `updateEntry`** — Required third argument not passed

### Flagged for Dogfooding
- `entry_status_history` never joined in queries (status history never loaded)
- Two separate `useEntryStore` definitions with naming collision
- `deleteEntryLegacy` is synchronous-only (deletion lost on refresh)
- Registration workflow is local-only (simulates delay, no real API call)
- MyEntriesPage shows one card per dog-per-class (may want grouped by show)
- Entry edit competition data may not persist to correct DB table

---

## Dogfooding Checklist

### High Priority (verify first)
- [ ] Create a person, verify address is saved correctly
- [ ] Create a dog with registrations, verify registrations appear after reload
- [ ] Create a club, verify it appears in the list with correct ID
- [ ] Create a show via wizard, verify it appears in Browse Shows
- [ ] Add a trial to a show, verify edit saves and delete persists across reload
- [ ] Add a class to a trial, verify status changes persist
- [ ] Register a dog in a class (verify registration workflow end-to-end)
- [ ] Check in an entry, verify check-in status persists

### Medium Priority
- [ ] Edit a person's address, verify it saves (not wiped)
- [ ] Edit a dog's health records, verify they display correctly
- [ ] Browse shows with filters (discipline, date, status)
- [ ] View trial details within show context (breadcrumbs work)
- [ ] View My Entries page, verify classes display per entry
- [ ] Delete entities and verify they stay deleted after reload

### Lower Priority (known limitations)
- [ ] Verify club member data persists (currently local-only)
- [ ] Verify photo uploads persist beyond session
- [ ] Test with real Supabase data (not just local state)
- [ ] Test role-based access (secretary vs exhibitor views)
- [ ] Verify show statistics show real data (currently hardcoded)
