# MYK9-1071 — Offline edits for dog registrations and people

> **Status:** Active

Owner decision 2026-10-09: option (a) for both tables. Each table gets a real `sync()` and a queued UPDATE with OCC. Precedent: MYK9-1067 (#2855) and MYK9-1070 (#2858). Phase 1 is this design. **Phase 2 needs a migration (§3), so the owner must approve the `db push`.**

## 1. Facts (live DB, read-only, 2026-10-09)

|                            | `dog_registrations`                                                | `people`                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Rows (live)                | 76 (72 on live dogs)                                               | 58 (56 not deleted)                                                                                                                       |
| `version` column / trigger | **none**                                                           | **none**                                                                                                                                  |
| `updated_at` trigger       | yes                                                                | yes                                                                                                                                       |
| SELECT RLS                 | `EXISTS (dogs d WHERE d.id = dog_id)`, so it follows `dogs_select` | `deleted_at IS NULL AND (auth_user_id = auth.uid() OR can_read_dog_directory())`                                                          |
| UPDATE RLS                 | owner/co-owner of the dog, site admin, or `has_role('secretary')`  | self, `can_manage_show_person(id)`, or site admin                                                                                         |
| Grants                     | authenticated `arwd`; column `is_primary` `arw`                    | authenticated `arwd`; anon column `r` on id, names, email                                                                                 |
| Guards                     | `sync_dog_registration_deleted_marker` (on `dog_id`)               | `people_guard_identity_columns`, `people_enforce_sign_in_email` (MK002), `people_protect_status`, soft-delete block, creation attribution |
| Deletion                   | hard DELETE                                                        | soft delete (RLS then hides the row)                                                                                                      |
| Realtime                   | not published                                                      | not published                                                                                                                             |

The provider syncs every table with `syncScopeId = ''` (App.tsx), so the dogs replica already holds every dog RLS shows this user. That is the parity rule the two new syncs follow: **unscoped, RLS decides**. A full sync is affordable: tens of rows today, and a few thousand rows at launch scale still fit in one keyset-paged download.

Today's people save goes through `update_person_details` (MYK9-664). It is SECURITY DEFINER, restates `people_update`, writes `people` and `people_private` in one transaction, and only accepts 10 columns: `first_name, last_name, email, phone, street_address, city, state, zip_code, country, profile_image`. It has no OCC, and it returns `NULL` (not an error) when `p_require_unlinked` loses the race.

**Correction to the issue:** `useUserStoreCompat` is not used in production; only two tests import it. The live direct people writes are `UserDetailsView`'s profile save (`useUpdateUserMutation` → `UserService.update` → `updateUser`) and `useUpdatePerson` (own profile, `AccountPage`). There are also more registration writers than `syncDogRegistrations` (see §5).

## 2. Sync design

**`ReplicatedDogRegistrationsTable.sync()`** works like `ReplicatedDogsTable.sync`. It uses `syncReplicatedTable` with an incremental `updated_at` cursor and no scope filter. Select list (explicit, no `*`): `id, dog_id, organization, registration_number, registration_date, verified, created_at, updated_at, registered_name, breed, variety, status, application_number, submission_date, certificate, is_primary, version`. That is every column the online `select('*')` reads use, minus `dog_deleted_at`. The local row type gains `variety, registrationDate, applicationNumber, submissionDate, certificate`. `isPrimary` is already on it. Because deletion is a hard DELETE and dog soft-delete hides a dog's registrations, `reconcileDeleted()` runs the dogs keyset-paged `select('id')` reconcile. `getRowRefetchAdapter` reads the same columns `.in('id', ids)`.

**`ReplicatedShowDeskPeopleTable.sync()`** (rename to `ReplicatedPeopleTable`; the show-desk `createPerson` stays as a method). Select `PEOPLE_MAPPER_COLUMNS + ', version'`. That reuses the SA-008 allowlist, so `peopleJuniorHandlerPiiContract` stays green. It also needs `.is('deleted_at', null)` and `reconcileDeleted()` for tombstones, the same as dogs. The local row gains `country, profileImage, authUserId, createdAt, updatedAt`. `authUserId` and `email` are replicated so the sign-in-email decision can run offline (§4). `people_private` (date of birth, junior numbers) is **not** replicated.

**Conflict resolution** for both tables is the dogs rule: the server copy wins, and dirty rows go through the existing `reconcileDirtyRemoteRow` and same-field conflict surfacing. Today both tables have `resolveConflict` return `local` unconditionally, so that has to change.

## 3. Versioning / OCC: migration required (owner push approval)

Neither table has `version`. Sketch (one migration, odd timestamp checked against `origin/main` and the ledger):

```sql
ALTER TABLE public.dog_registrations ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE public.people            ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TRIGGER dog_registrations_version_increment BEFORE UPDATE ON public.dog_registrations
  FOR EACH ROW EXECUTE FUNCTION public.increment_replication_version();
CREATE TRIGGER people_version_increment BEFORE UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.increment_replication_version();
-- Versioned people save for the queue. Wraps, never restates, update_person_details.
CREATE FUNCTION public.update_person_details_versioned(
  p_person_id uuid, p_people jsonb, p_private jsonb, p_expected_version integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ ...
  -- SELECT version ... FOR UPDATE (row lock held for the inner call);
  -- mismatch -> RAISE '... version conflict' ERRCODE '40001', DETAIL = current version;
  -- v_row := public.update_person_details(p_person_id, p_people, p_private, p_people ? 'email');
  -- v_row IS NULL -> RAISE ERRCODE '42501' (sign-in email locked; permanent);
  -- RETURN (v_row ->> 'version')::int;
REVOKE ALL ON FUNCTION public.update_person_details_versioned(uuid,jsonb,jsonb,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_person_details_versioned(uuid,jsonb,jsonb,integer) TO authenticated;
```

Neither table needs a new grant: the table-level authenticated `arwd` covers reading `version`, and the trigger overwrites any client-sent value. anon gets no column grant on `version`, which is correct. Five views depend on these tables. Adding a column does not change them, but a later rebuild of any `x.*` view would pick it up (LESSON select-star). Verify after the push with the `pg_class.relacl` / `pg_attribute.attacl` queries.

**Package change (small, `@myk9/replication`):** an RPC-routed UPDATE with explicit `args` freezes its OCC argument at queue time, and `rebaseQueuedMutation` only advances `mutation.serverVersion`. The fix is to add `rpc.versionArg?: string`. `executeMutation` then sets `args[versionArg] = mutation.serverVersion ?? null` when it sends. Without this, a rebased people write would re-conflict until it is parked.

## 4. UPDATE paths

**Registrations:** a direct table UPDATE through the standard full-row OCC path (`.eq('version', serverVersion)`), exactly like dogs. `updateRegistration(id, patch)` writes the local row dirty and queues the UPDATE. A dedicated `rebuildUpdatePayload` sends only `REGISTRATION_UPDATE_COLUMNS`: `organization, registration_number, registered_name, breed, variety, status, registration_date, updated_at`. It never sends `dog_id` (that would fire the marker trigger), `created_at`, `verified` or `is_primary` (primary choice is not edited on these paths).

**People:** a delta UPDATE routed through `update_person_details_versioned`, with `versionArg: 'p_expected_version'`. The allowlist is **one declared constant**, `PERSON_QUEUED_UPDATE_COLUMNS`, in `peopleColumns.ts`. It holds the 10 `v_editable` names, minus `email` if decision D2 = online-only. The queue function builds `p_people` only from keys in that constant and throws on any other key. A test parses `v_editable` out of the latest migration that defines `update_person_details` and asserts the constant is a subset (LESSON replace-function-latest: the test must find the latest definition, not a fixed file). `p_private` passes the date-of-birth and junior-number patch through unchanged, and nothing about it is stored in the replica. Status writes stay on their own site-admin path.

**Email:** offline, the client cannot run `checkSignInEmailChange`, which is a network read and fails closed. The pure `decideSignInEmailChange` can run against the replica's `authUserId`/`email`: unchanged means drop the key, linked means refuse locally. The server still holds `has_entries` / `has_roles` locks (`people_guard_identity_columns`, 42501) that the client cannot see, and a show-desk person nearly always has entries. **D2 (recommended): email edits stay online-only.** The field says "Reconnect to change an email address". The alternative is to queue the change and accept a likely refusal.

**OCC conflict:** registrations work like dogs. The token rebases, a same-field change surfaces the conflict toast, and the row refetch adapter covers MYK9-771. People get last-write-wins on the edited fields only (delta), and the RPC parking cap applies.

**Permanent refusal (42501 / 22023 / 23xxx)** goes to `failed_mutations` with the persistent Retry/Discard toast, as it does today. Following MYK9-1031, the local row must not keep claiming a refused value. **D3 (recommended):** for these two tables, a non-retryable failure, and any Discard, _re-pulls_ the row: `fetchRowsById` through the refetch adapter, then replace the row whenever no **pending** mutation names it. The row is never hand-healed. This needs a small table-level hook on the provider's `replication:sync-failed` / discard. The same gap exists for dogs (MYK9-1067). File it as a follow-up rather than widening this change.

**Cold replica (MYK9-1067 rule):** generalise `useDogReplicaForEdit` into `useReplicaRowForEdit(tableName, lookup, message)`. Warm → the row. Cold → `await replicationSync.syncTable(table)`, then look again. Still missing → tell the user and queue nothing. There is no single-row hydration.

## 5. Callers and readers

| Path                                                                 | Change                                                                                                                                                            |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `syncDogRegistrations` (`dogStoreCompatHelpers.ts`)                  | Read from the replica (cold rule), queued UPDATE for a matching org, existing queued `createRegistrationsForDog` for a new org                                    |
| `DogRegistrationDialogs` edit / add                                  | Queued UPDATE / queued INSERT (**D4**: include add)                                                                                                               |
| `useInlineDogRegistration` (add-entry) create                        | Queued INSERT (**D4**)                                                                                                                                            |
| `DogRegistrationDialogs` delete                                      | **Stays online.** Follow-up issue for a queued DELETE                                                                                                             |
| `UserDetailsView` profile save (line ~220)                           | Queued people UPDATE                                                                                                                                              |
| `useUpdatePerson` (own profile, AccountPage)                         | Queued people UPDATE (image upload itself stays online)                                                                                                           |
| `UserDetailsView` status, admin `UserTable`, `useBulkAccountActions` | Stay online: site-admin, `people_protect_status`                                                                                                                  |
| `useShowDetailsStepActions` (show wizard)                            | Stays online: the wizard creates a show online                                                                                                                    |
| `useUserStoreCompat`                                                 | **D5: delete** (dead; tests only) instead of rewiring                                                                                                             |
| Reader `loadDogRegistrations`                                        | Replica-first when warm (`lastFullSyncAt`), with server fallback when cold. A dirty local row always wins over the server copy (today the server copy wins by id) |
| Reader `useRegistrationsDatabase` by-dog / Registrations tab         | Patch cached rows after a queued write (like `patchCachedDogRows`) and invalidate                                                                                 |
| Reader `loadOwnersMap` (dog roster owner)                            | People replica-first when warm                                                                                                                                    |
| Readers `getAllUsers` / `useRoleBasedPeople` / person detail         | Stay PostgREST: they join `judge_qualifications` and role labels, which are not replicated. Patch cached rows and invalidate after a queued edit                  |
| `useAKCSubmissionData`, `useEntryFormData`, `useReportDogOptions`    | Stay online (export/report reads). Note `useEntryFormData` in a follow-up                                                                                         |

Stale comments that call the registrations sync a "NO-OP" (`dogRegistrationHydration.ts`, `dogs/reads.ts`) get rewritten in the same change.

## 6. Identity coupling

- The people replica is **never** an identity source. `personId` stays with `usePersonIdentity` and its offline-durable store (LESSON offline-identity-pairing). For an exhibitor, the replica holds only their own row (RLS). People rows are keyed by `people.id`, never `auth.uid()`.
- Own-row edits: `people_update` admits `auth_user_id = auth.uid()`. The own sign-in email is already read-only in the UI, and the unchanged-email key is dropped before queueing.
- Mutation owner isolation (existing) ties a queued edit to the signed-in account. Check that sign-out clears the people replica the way it clears dogs.
- A secretary can _read_ every person (directory) but can only _update_ people with entries in shows they manage. The edit affordance is unchanged; a refusal is handled by D3.

## 7. Risks and non-goals

Risks: the migration plus a new SECURITY DEFINER function sets the review floor at `independent` (Codex). Re-pull-on-refusal touches provider failure handling. Making `loadDogRegistrations` replica-first changes a read that has been heavily reviewed (MYK9-90), so its tests must keep the "present-and-empty is authoritative" rule.
Not doing: a queued registration DELETE, `is_primary` editing, replicating `people_private`, changing admin/status/wizard paths, Realtime publication, or the dogs re-pull gap (follow-up).

## 8. Testing phase

1. **Red first:** an offline `syncDogRegistrations` edit and an offline `UserDetailsView` save each assert that `queueMutation('UPDATE', …)` is called. Both fail today because the writes are direct.
2. Table units: sync select list (no `*`, exact columns), unscoped fetch, `reconcileDeleted` paging/abort, mapper round-trip, `rebuildUpdatePayload` ⊆ allowlist, `resolveConflict` server-wins.
3. Allowlist: `PERSON_QUEUED_UPDATE_COLUMNS` ⊆ `v_editable` parsed from the latest migration. An unknown key throws before anything is queued. Break the constant and watch the test go red.
4. Package: `versionArg` injects the _current_ `serverVersion` after a rebase. A 40001 with DETAIL becomes an `OccRejectionError`.
5. Cold replica: a missing row triggers `syncTable`, then lookup. Still missing → notification and nothing queued. No single-row write.
6. Refusal: a non-retryable failure or a Discard re-pulls the row. A row with a pending mutation is not replaced.
7. Readers: a dirty local registration beats the server copy; cold falls back to the server; owner/person cache patches render on the real prop shape (LESSON last-hop-drop).
8. SQL contract tests (CI-only) for the versioned RPC: version conflict 40001, NULL → 42501, authz parity with `update_person_details`. Run `src/test/database/` locally before the push. Shuffled vitest run, `pnpm typecheck`, `qa:code-quality-ratchet`.
9. Browser walk on staging after the push: edit a registration and a person offline, reconnect, confirm upload and server state.

## Decisions (owner, 2026-10-09)

- **D1 approved, as two PRs.** PR 1 is the migration only: `20261009214700_myk9_1071_registration_people_versions.sql` plus its behavioral SQL test, and this plan. PR 2 is the app code and the `rpc.versionArg` package change, after the migration is pushed.
- **D2: email edits are online-only.** `update_person_details_versioned` refuses an `email` key with 22023, so the queue cannot carry one. The UI keeps email edits on the online path.
- **D3: re-pull refused rows.** A non-retryable refusal, or a Discard, re-pulls the row for these two tables. The same gap in dogs is a follow-up.
- **D4: registration add and edit are queued; delete stays online.** The coordinator files the follow-up issue for a queued delete.
- **D5: delete the dead `useUserStoreCompat`** (in PR 2).

As built in PR 1, the wrapper signature is `update_person_details_versioned(p_person_id uuid, p_expected_version integer, p_people jsonb DEFAULT '{}', p_private jsonb DEFAULT '{}') RETURNS integer`. It runs the authorization check before the version check, so a refused caller never sees the version in a 40001 DETAIL. A NULL expected version means no precondition, the same as the table path when no `serverVersion` is set.
