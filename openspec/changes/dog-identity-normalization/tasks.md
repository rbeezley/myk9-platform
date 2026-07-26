# Tasks

Source: 2026-07-24 exhibitor audit + product-owner clarifications on MYK9-88. Sibling change: `exhibitor-ux-remediation` owns the exhibitor-facing UX half.

**Order matters.** Sections 1–3 are additive and independently shippable. Sections 4–6 are the breaking half and require the shared-system approval gate before `db push`. Do not start section 6 until section 2's helpers own every breed read.

> **Status (2026-07-26).** Sections 4 and 5 are now implemented on top of 0–3. Their two migrations are **written but NOT pushed** — `supabase db push` was not run, and it needs the shared-system approval gate before these DROP COLUMN / SET NOT NULL statements touch staging. Unlike sections 0–3, **this code is not safe to deploy against the un-migrated schema**: §5.3 stops sending `dogs.name`, which is still `NOT NULL` until `20260727110000` is applied. Sections 6, 7 and 9 remain untouched; section 6 is still blocked on deferred task 2.3.
>
> **Status (2026-07-25).** Sections 0–3 are done, plus the parts of section 8 that cover them. Sections 4–7 and 9 are untouched. Task 2.3 (the ~258 display-only `.breed` read sites) is deliberately deferred — it gates section 6, not section 3's correctness fix. **The section-1 migration is written but NOT pushed**; `supabase db push` was not run and needs the shared-system approval gate. Nothing in sections 0–3 selects `is_primary` from the database, so this code is safe to run against the un-migrated schema.

## 0. Pre-flight

- [x] 0.1 Re-run the verification queries and record the numbers in this file before changing anything. **Re-verified against the live database 2026-07-25** (`sojmvhhwsjxmfistvzbe`); the shape of the finding is unchanged, the counts have drifted slightly upward:

  | Query                                                      | 2026-07-24 | 2026-07-25 |
  | ---------------------------------------------------------- | ---------- | ---------- |
  | Dogs (not deleted)                                         | 15         | **16**     |
  | With `akc_number` / `ukc_number` / `other_registry_number` | 0 / 0 / 0  | **0/0/0**  |
  | With `call_name`                                           | 15         | 16         |
  | Where `name = call_name`                                   | 13         | 14         |
  | `dog_registrations` rows                                   | 8          | **10**     |
  | …across dogs / organizations                               | 6 / 4      | 7 / 4      |
  | Registrations with number / registered name / breed        | 8 / 7 / 7  | 10 / 9 / 9 |
  | Dogs registered with more than one organization            | 1          | **2**      |

  Two findings the earlier pass did not record:
  1. **`dog_registrations.organization` is free text and has already drifted** — the live values are `AKC` (1 row), `AKC (American Kennel Club)` (6), `UKC (United Kennel Club)` (2), `Other` (1). The AKC submission's existing registered-name lookup used `.eq('organization', 'AKC')`, so it matched **1 of 7** AKC registrations. Fixed by normalizing in `resolveDogIdentity.ts` instead of filtering in PostgREST.
  2. **Two dogs carry a stored `"Mixed Breed"` placeholder**, and one of them (`Codex Maple`) carries it on the `dog_registrations` row, not just on `dogs`. Section 6 / task 8.2.3 must clean both locations, not only `dogs.breed`.

- [x] 0.2 Confirm no reader of the flat registry columns exists outside app source. **Answer to design open question 3: nothing outside app source reads them.** Evidence:
  - `supabase/functions/` (23 functions) and `apps/myk9show/supabase/functions/` (12): **zero** matches for `akc_number` / `ukc_number` / `other_registry`.
  - Applied-database sweep, not migration text: `information_schema.views` where the definition matches those names → **zero rows**. `pg_get_functiondef` over every `public` function → exactly one hit, `create_show_managed_dog`, and it **writes** them, never reads them. It has no application callers (the only repo reference is the generated `database.types.ts`).
  - App source hits are confined to the three readers fixed in section 3, their tests, and the generated types.

  Section 4 therefore has no external blocker. Its only remaining work is dropping `p_akc_number` / `p_ukc_number` from `create_show_managed_dog` in the same migration as the column drop.

- [x] 0.3 Confirm how `dogs` flows through `@myk9/replication`. `packages/replication` has no per-column `dogs` mapper — it stores rows generically and only special-cases `dogs` for optimistic-id row sync (`mutation-row-sync.ts`). `dog_registrations` is separately replicated (`replicatedDogRegistrationsTable`) and `getDogById` already merges the replicated registrations with the PostgREST embed. **Sections 0–3 add no column to `dogs` and remove none, so no mapper/fallback pair needed changing.** The dual-path obligation lands with sections 4–6.

## 1. Primary registration flag

- [x] 1.1 Migration written: [`supabase/migrations/20260726120000_add_dog_registration_is_primary.sql`](../../../supabase/migrations/20260726120000_add_dog_registration_is_primary.sql) — `is_primary boolean NOT NULL DEFAULT false`, partial unique index `dog_registrations_one_primary_per_dog`, explicit column `GRANT`s to `authenticated`/`service_role` and an explicit `REVOKE` for `anon`. `dog_registrations` is an existing table whose applied ACL (`pg_class.relacl`, checked 2026-07-25) grants nothing to `anon`, so the project's `ALTER DEFAULT PRIVILEGES` trap — which fires on newly **created** tables — does not apply; the explicit revoke records the intent anyway. **NOT PUSHED — `supabase db push` was not run. Pending the shared-system approval gate.**
- [x] 1.2 Backfill included in the same migration: earliest `created_at` per dog (NULLS LAST, id as tiebreak) is marked primary, which satisfies the partial unique index.
- [x] 1.3 **Decision: owner-settable, with an earliest-created default** (design open question 1, resolved as design.md assumed). Rationale: the multi-organization case is live and now growing (1 → 2 dogs in one day), the registered names on those rows differ substantially, and only the owner knows which registration represents the dog on generic surfaces. The default makes the choice optional, so no one is forced to answer it. The resolvers already fall back to earliest-created, so an unset flag is never an error.
      **The `AddEditRegistrationDialog` control is deliberately deferred** to the PR that pushes the migration — a UI writing `is_primary` against a database without the column would fail at runtime. No new page; the control belongs on the existing dialog.

## 2. Resolution helpers (no behavior change yet)

- [x] 2.1 `resolveDogIdentityForOrganization` in [`resolveDogIdentity.ts`](../../../apps/myk9show/src/features/dogs/identity/resolveDogIdentity.ts) — organization-scoped, returns registered name, breed, variety, and registration number, **no cross-organization fallback**, unit-tested including the "UKC-only dog asked for AKC returns nothing" case.
- [x] 2.2 `resolveDogIdentity` — primary first, earliest-created fallback, empty identity for an unregistered dog. Pure, order-independent, non-mutating, tested.
- [ ] 2.3 Migrate the ~258 `.breed` read sites to the resolvers while `dogs.breed` still exists. **NOT DONE — deliberately deferred.** The three paperwork/search readers are migrated (section 3); the display-only bulk is a separate reviewable batch and is the prerequisite for section 6, not for section 3's correctness fix.
- [ ] 2.4 Migrate registered-name reads to the resolvers. **Partially done** — the entry blank and AKC submission now read registered name from the registration. The remaining display-only sites move with 2.3.

## 3. Paperwork and search — the correctness fix

- [x] 3.1 [`useAKCSubmissionData.ts`](../../../apps/myk9show/src/hooks/queries/useAKCSubmissionData.ts) now resolves `registrationNumber`, `dogRegisteredName`, and `breed` from the AKC `dog_registrations` row. It also selects `id` and `created_at`, the resolver's tiebreak fields: `UNIQUE (dog_id, organization)` is an exact-string constraint (verified against the applied schema), so a dog may hold both an `AKC` and an `AKC (American Kennel Club)` row; both normalize to AKC, and without the ordering fields the comparator would tie and the submitted number could vary between runs. `is_primary` is deliberately not selected while its migration is unpushed — `created_at` then `id` is deterministic on its own and agrees with what the backfill will mark. `dogs.akc_number` is no longer selected, and the hardcoded `breed: 'Unknown'` placeholder is gone (an unregistered dog contributes `''`, never a guess). The `.eq('organization', 'AKC')` filter was replaced with in-TypeScript normalization, which is what makes the 6 long-spelling rows visible.
- [x] 3.2 [`buildEntryBlankProps.ts`](../../../apps/myk9show/src/features/heritage/entry-blank/buildEntryBlankProps.ts) now takes `dog.registrations` and resolves §I registered name, breed, variety, and registration number from the registration for **the registry of the trial this entry is for** — `trials.find(t => t.id === entry.trial_id)`, falling back to `trials[0]` only in blank mode. Keying off `trials[0]` would leak another organization's number onto a form when a show mixes registries across trials. No cross-organization fallback. `dog.akc_number` and `dog.breed` are no longer read.
- [x] 3.3 Dog search ([`reads.ts`](../../../apps/myk9show/src/services/database/dogs/reads.ts) `searchAllDogs`) resolves matching `dog_id`s from `dog_registrations.registration_number` / `registered_name` and folds them into the `dogs` query as an id list. PostgREST cannot OR a parent-column filter against an embedded-table filter in one request, hence the two-step. `akc_number.ilike` is removed. The pre-query's error is **thrown, not swallowed** — silently downgrading a backend failure to "no registration matches" would make it indistinguishable from "no such dog". `searchAllDogs` catches that throw and resolves with `{ data: [], error }` rather than rejecting, so its sole application caller, [`DogSelectionStepEnhanced.tsx`](../../../apps/myk9show/src/components/shows/RegistrationWorkflow/DogSelectionStepEnhanced.tsx), now **reads `error`** and renders a `role="alert"` failure state. The alert sits outside the results/empty-state branch on purpose: locally-owned dogs can still match while the server search is down, and that case looks healthiest while being silently incomplete. The empty-state text no longer says "No dogs match your search" when the search failed.
- [x] 3.4 Missing registration is surfaced, not silently blank: `EntryBlankDog.missingRegistration` is `true` when a dog was supplied but holds no registration with the sanctioning organization. Blank mode (no dog) stays `false`. **It reaches a user**: [`MissingRegistrationNotice.tsx`](../../../apps/myk9show/src/features/heritage/entry-blank/MissingRegistrationNotice.tsx) renders a `role="alert"` warning above the download control in **all eight** entry-blank buttons (heritage, gazette, magazine, poster, banner, monogram, fieldGuide, headline). Download is deliberately not blocked — a secretary may want the partly-filled form for an exhibitor to complete by hand; the requirement is that nobody mails it unknowingly.
- [x] 3.5 **Verified against real rows.** [`liveDogIdentity.regression.test.ts`](../../../apps/myk9show/src/features/dogs/identity/__tests__/liveDogIdentity.regression.test.ts) drives the resolver and `buildEntryBlankProps` with `dog_registrations` rows copied verbatim from the live database — the real multi-organization dog "Ziva" (AKC `DN61191906`, UKC `P935-254`, Other `BH-44740`). The entry blank prints `DN61191906`, not blank and not the UKC number. The search fix was verified by running the two-step query's SQL equivalent against the live database: searching `DN6119` returns Ziva, where the old `dogs.akc_number` filter returned nothing.

## 4. Drop the dead flat registry columns

> **Both migrations in sections 4 and 5 are written but NOT pushed.** `supabase db push` was deliberately not run: these DROP COLUMN / SET NOT NULL statements hit a shared staging database and need the shared-system approval gate. **The application code in this section must not deploy ahead of the migrations** — §5.3 stops sending `dogs.name`, and the pre-migration column is still `NOT NULL`.

- [x] 4.1 Confirmed. The 0.2 sweep was **re-run independently against the applied database on 2026-07-26**, not trusted:
  - `information_schema.views` where the definition matches `/akc_number|ukc_number|other_registry/` → **0 rows**.
  - `pg_get_functiondef` over every `public` function (`prokind in ('f','p')`) → **1 hit**, `public.create_show_managed_dog`; it **writes** `akc_number` / `ukc_number` and never reads them, and has no application caller.
  - `pg_indexes` on `public` → **1 hit**, `dogs_akc_number_idx` (the performance advisor already reported it unused).
  - `pg_constraint` on `public.dogs` and `pg_policies` → **0 rows** each.
  - `supabase/functions/` and `apps/myk9show/supabase/functions/` → **0 matches**.
  - Repo-wide source grep → only `packages/supabase/src/types/database.types.ts` (generated), archived advisor JSON under `docs/audits/`, and explanatory comments/tests written by section 3. The `akcNumber` hits in `features/organization-forms/` are AKC **PDF AcroForm field names**, unrelated to the columns.
  - `public.dogs` column ACLs grant `anon` SELECT on `id` / `name` / `call_name` / `breed` / `image_url` only — none of the dropped columns carried a grant, so nothing needs restoring after the drop.
- [x] 4.2 [`20260727100000_drop_dog_flat_registry_columns.sql`](../../../supabase/migrations/20260727100000_drop_dog_flat_registry_columns.sql) — drops `dogs_akc_number_idx`, then `akc_number` / `ukc_number` / `other_registry` / `other_registry_number`. No backfill: see 8.2.2. The same migration **replaces `create_show_managed_dog`** without `p_akc_number` / `p_ukc_number` (a `DROP` + `CREATE`, since the parameter list changes), reproducing its prior ACL exactly. The parameters are removed rather than accepted-and-ignored — silently discarding a registration number a caller supplied would be worse than a signature change.
- [x] 4.3 Types and references removed: the four columns are gone from all five `dogs`-shaped blocks in `database.types.ts` (table `Row` / `Insert` / `Update`, plus the `get_deleted_dogs` and `restore_dog` setof returns), and `p_akc_number` / `p_ukc_number` are gone from the `create_show_managed_dog` args. Repo grep for the column names now returns **0 hits** outside archived audit JSON and explanatory comments.

## 5. Call name becomes the required identifier

- [x] 5.1 [`20260727110000_dog_call_name_required.sql`](../../../supabase/migrations/20260727110000_dog_call_name_required.sql) — backfills `call_name` from `name` where null, then `SET NOT NULL`. The backfill is a no-op against today's data (see 8.2.1) and is kept only so the statement cannot abort mid-migration if the data drifts before it is pushed.
- [x] 5.1a `packages/supabase/src/types/database.types.ts` regenerated for the constraint: `call_name` is `string` on `Row` and the two SETOF returns, **required** on `Insert`, and `string` (non-null) on `Update`. This is not cosmetic — it is what made the invalid late-entry payload a compile error instead of a runtime `23502`, and it surfaced two further write paths plus six stale test fixtures. `pnpm --filter @myk9/supabase build` was re-run before typechecking (stale `dist/index.d.ts` otherwise reports false failures).
- [x] 5.2 Same migration: `dogs.name` `DROP NOT NULL`, plus column comments on **both** `name` (legacy alias, explicitly _not_ a registered name, candidate for a later `DROP`) and `call_name` (the required identifier).
- [x] 5.3 The call name is no longer copied into `dogs.name`:
  - `create_dog_with_registrations` writes `NULLIF(btrim(p_dog->>'name'), '')` and derives `call_name` from the caller's `call_name`, falling back to `name` only so a caller written against the old shape still produces a valid row; a create with neither raises an explicit `22023` rather than a bare `23502`.
  - [`AddDogPanel/index.tsx`](../../../apps/myk9show/src/components/panels/edit/AddDogPanel/index.tsx) no longer sets `name: formData.callName`.
  - The write is also stopped at the **mapper layer**, which is what actually covers every writer: `mapDogInputToInsert` sends `name: null`, `mapDogInputToUpdate` omits `name` entirely, and `ReplicatedDogsTable.toSupabaseRow` omits it too. Without that, an edit-and-save on any surface would have re-copied the call name into the legacy column.
  - The safe direction (`name` → `call_name`) is kept where a legacy caller supplied only one name, because `call_name` is now `NOT NULL`.
- [x] 5.4 **`dogs.name` reader inventory (design open question 2).** Non-test app-source reads of a dog's `.name`: **121** across **75 files**. Of those, **69** already prefer the call name at the site (`call_name ?? name`, `callName || name`, or `getDogDisplayName`). The remaining **~48** read the alias alone.
      **None of them break**, because the fallback is applied at the two mapper boundaries instead of at 121 call sites: `mapDatabaseToDog` and `ReplicatedDogsTable.rowToDog` both resolve `name` to `name ?? call_name ?? ''`, so `Dog.name` / `ReplicatedDog.name` are never blank. Raw PostgREST rows that bypass those mappers were fixed individually — `armbands/reads.ts`, `entries/secretary.ts`, `entries/admin.ts` (two selects gained `call_name`), `useAKCSubmissionData`, `useEntryEligibility`, `useEntryManagementData`, `classMappers`, `DeletedEntitiesTab`, `WaitlistTable`, `WaitlistActionDialog`, `useWaitlistManagementData`, `MoveUpRequestsTab`, `PullManagementTab`, `late-entry-dog`.
      DB-level surface still naming the column: **21** `from('dogs')` call sites and **36** `dogs` embeds.
      Three deliberate readers remain, and they are the argument for **keeping** `name` for now rather than dropping it: the waitlist table and the move-up / pull request lists render it in parentheses _only when it differs from the call name_, which is the one place a legacy registered name is still visible. Two more (`features/heritage/email/buildConfirmationProps.ts`, `features/magazine/email/buildConfirmationProps.ts`) still map it to `dogRegisteredName`; those now emit `null` for a new dog, which is **correct** — the registered name belongs to a registration — and they move to the resolver with deferred task 2.4.
      **Recommendation:** drop `dogs.name` once 2.4 lands and the three parenthetical readers are removed. Nothing depends on it for a displayed name today.

## 6. Remove breed from the dog record

- [ ] 6.1 Confirm section 2's resolvers own every breed read.
- [ ] 6.2 Migration: make `dogs.breed` nullable; stop writing the `"Mixed Breed"` placeholder.
- [ ] 6.3 Migration: drop `dogs.breed`.
- [ ] 6.4 Update `create_dog_with_registrations` and the duplicate-identity guard (`20260707120000_prevent_duplicate_dog_identities.sql`) so matching reads registration-scoped values — see section 7.

## 7. Duplicate-identity guard

- [ ] 7.1 Update the guard's normalization and matching to read registered name, breed, and registration number from `dog_registrations`, and call name / sex / date of birth from `dogs`.
- [ ] 7.2 Ensure a dog with no registration still matches on dog-level attributes, and that a missing breed is not treated as a mismatch.
- [ ] 7.3 Prove the guard still catches the duplicates it caught before — a silent regression here would only surface when two dogs collide at a show.

## 8. Testing — no section is complete until its tests pass

### 8.1 Unit tests

- [x] 8.1.1 Organization-scoped resolver — covered in [`resolveDogIdentity.test.ts`](../../../apps/myk9show/src/features/dogs/identity/__tests__/resolveDogIdentity.test.ts).
- [x] 8.1.2 Generic resolver — covered, including order-independence and "unchanged by adding a non-primary registration".
- [x] 8.1.3 Earliest-created-is-primary fallback covered in the resolver tests. The _database_ half of the invariant (at most one primary per dog) is the partial unique index in the unpushed migration and cannot be proven until it is applied.

### 8.2 Data and migration verification

- [x] 8.2.1 **Pre-migration verification, run against the applied database (`sojmvhhwsjxmfistvzbe`) on 2026-07-26 immediately before writing the §5 migration.** The `SET NOT NULL` cannot fail: there is nothing to backfill.

  ```sql
  select count(*)                                                  as total_dogs,
         count(*) filter (where call_name is null)                 as null_call_name,
         count(*) filter (where call_name is null and name is null) as null_call_name_and_name,
         count(*) filter (where name is null)                      as null_name
    from public.dogs;
  -- total_dogs 19 | null_call_name 0 | null_call_name_and_name 0 | null_name 0
  ```

  Every one of the 19 rows already has a call name (0 need the backfill), and every row still has a legacy `name`, so nothing loses a displayed identity when `name` becomes nullable. The post-migration half of this task (that every registration retains its number, registered name, and breed) cannot be run until the migrations are pushed — `dog_registrations` is untouched by both files, so no registration column is at risk.

- [x] 8.2.4 **`public.dogs` write-path inventory — every path supplies a non-null `call_name`.** Added after Codex review of `ac6c64052` found two post-migration breakages that the green suite could not see, because nothing fires until `SET NOT NULL` applies. Regenerating `database.types.ts` (making `call_name` required on `Insert`, non-null on `Row`) turned most of this from a grep into a typecheck.

  | #   | Write path                                                                                                 | Supplies `call_name`                                                                                                        | Enforced by                                    |
  | --- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
  | 1   | `dogs/reads.ts` `createDog` → `.from('dogs').insert()`                                                     | caller-supplied `DbDogInsert`                                                                                               | **typecheck** (`call_name: string`, required)  |
  | 2   | `dogs/reads.ts` `updateDog` → `.from('dogs').update()`                                                     | caller-supplied `DbDogUpdate`                                                                                               | **typecheck** (`call_name?: string`, non-null) |
  | 3   | `mapDogInputToInsert` (feeds 1 via `useCreateDogMutation`)                                                 | `callName` → `name` fallback; **throws** if neither                                                                         | unit test                                      |
  | 4   | `mapDogInputToUpdate` (feeds 2)                                                                            | omits the key when blank — an update may change the call name, never clear it                                               | unit test                                      |
  | 5   | `late-entry-dog.ts` `createDayOfEntryDog` → 1                                                              | **FIXED** — was sending `call_name: null` whenever the optional `dogCallName` was omitted; now falls back to `dogName`      | typecheck + unit test                          |
  | 6   | `ReplicatedDogsTable.toSupabaseRow` (queued INSERT/UPDATE **and** `rebuildUpdatePayload`, i.e. every sync) | **FIXED** — was sending `call_name: dog.callName ?? null`; now falls back to the derived `name` and omits rather than nulls | unit test only                                 |
  | 7   | `create_dog_with_registrations` RPC                                                                        | derives from `call_name` → `name`; raises `22023` if neither                                                                | migration                                      |
  | 8   | `create_show_managed_dog` RPC                                                                              | derives from `p_call_name` → `p_name`; raises `22023` if neither                                                            | migration                                      |
  | 9   | Edge functions                                                                                             | **none** — all 35 only ever read `dogs`; zero inserts or updates                                                            | grep                                           |

  **A third `call_name: null` sender did turn up**, as predicted: row 6. It is the most dangerous of the three and the only one no type could catch — `toSupabaseRow` returns `Record<string, unknown>`, and its failure mode is a _queued offline mutation_ that fails at the database long after the user was told the dog was saved. Rows 3 and 4 were also hardened; only rows 5 and 6 were live defects.

- [x] 8.2.5 **Call-name write lifecycle, and where validation sits.** Rounds 1 and 2 of review both produced the same class of defect, so the third pass fixed the cause rather than the instances: `call_name` is a required identifier whose validation was scattered across two mappers, a replication payload builder and two Postgres functions — each seeing the value at a _different point in the write lifecycle_. A whitespace-only name fell through the gaps, because `min(1)` on an untrimmed string is not validating.

  | Stage                | Online (`addDog`)                                   | Offline-first (`addDogOfflineFirst`) |
  | -------------------- | --------------------------------------------------- | ------------------------------------ |
  | validate + normalise | `addDogSchema` / `dogFormSchema` — `.trim().min(1)` | same schema                          |
  | resolve or reject    | `resolveRequiredCallName` (throws)                  | `resolveRequiredCallName` (throws)   |
  | last line of defence | —                                                   | `assertQueueableCallName` (throws)   |
  | **local persist**    | `replicatedDogsTable.set`                           | `this.set`                           |
  | queue / network      | RPC or `createMutation`                             | `queueMutation`                      |
  | constraint           | `dogs.call_name NOT NULL`                           | same, whenever sync next runs        |

  **Every reject now happens above the local-persist row.** Previously normalisation happened _below_ it: on the online path `mapDogInputToInsert` threw from outside `addDog`'s rollback `try`, leaving a ghost row in IndexedDB; on the offline-first path `toSupabaseRow` trimmed `"   "` to empty and omitted the column, reporting the dog saved while queuing an INSERT that could never succeed — the show-day late-entry desk on a flaky connection, with no rollback and no user left to correct it.

  The single root fix is `.trim()` before `.min(1)` at the form. The mapper and replication guards are defence in depth, placed at the two points of no return. The rule itself now lives in one function, `resolveRequiredCallName`.

  **Invariant, stated explicitly: there is no path on which a dog row is written to IndexedDB or queued for sync before its `call_name` is known valid.** Audited by enumerating every caller of `replicatedDogsTable.set` / `createDogWithId` / `createDogWithRegistrationsRpc` / `updateDog` and every internal `this.set` / `this.queueMutation`. The create paths are guarded above. The update paths cannot violate the constraint at all — the row already exists (so the column is non-null by definition), `mapDogInputToUpdate` and `mapPartialDogInputToReplicated` both _skip_ a blank rather than clearing it, and `toSupabaseRow` omits the column rather than nulling it.

- [x] 8.2.6 **Divergence audit of the two update mappers.** `mapDogInputToUpdate` (Supabase) and `mapPartialDogInputToReplicated` (IndexedDB) are fed from the same `Partial<DogInput>` and write to two stores. Three divergences were found across three review rounds — null-vs-omit, clear-vs-skip, trim-vs-no-trim — so the pair was audited field by field rather than waiting for a fourth.

  | Field                                                                                     | Supabase                                  | IndexedDB                                               | Verdict                                                                                                                       |
  | ----------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
  | `callName`                                                                                | _was_ untrimmed                           | _was_ trimmed                                           | **FIXED** — normalised once above both by `normalizeDogInputForWrite`; neither mapper trims any more, so they cannot disagree |
  | `name`                                                                                    | not written (§5.3)                        | kept                                                    | **Intentional** — the DB column is a retired legacy alias, the local field is a display alias                                 |
  | `breed`, `color`, `microchipNumber`, `imageUrl`, `birthDate`, `ownerId`, `spayedNeutered` | `\|\| null`                               | `\|\| undefined`                                        | **Equivalent** — null is absent in a DB patch, undefined is absent in a local merge                                           |
  | `status` / `deceased` / `deceasedDate`                                                    | writes all three                          | **writes nothing**                                      | **DIVERGENT, out of scope** — see below                                                                                       |
  | `weight`, `height`                                                                        | `x ? String(x) : null` — `0` becomes null | `x != null ? String(x) : undefined` — `0` becomes `"0"` | **DIVERGENT for `0`, out of scope**                                                                                           |
  | `sex`                                                                                     | writes `''` through                       | `\|\| undefined`                                        | **DIVERGENT for `''`, out of scope**                                                                                          |

  **Answer to the question asked: yes, there is a fourth — `status`.** `mapDogToDogInput` includes `status`, and `UserDetailsTabs` calls `updateDog` with it, so marking a dog retired or deceased reaches Supabase while the local replicated row keeps its old status until a refetch overwrites it. It is user-visible and genuine, but it has nothing to do with dog identity and fixing it here would widen an already-large change; raised separately rather than folded in. The `weight`/`height` `0` and `sex` `''` cases are real but only reachable with values that are already meaningless for a dog.

- [x] 8.2.2 **The flat registry columns are `NULL` for every row.** Same session, same connection:

  ```sql
  select count(*) from public.dogs
   where akc_number is not null or ukc_number is not null
      or other_registry is not null or other_registry_number is not null;
  -- 0
  ```

  0 of 19. The "always NULL" premise holds, so the drop destroys no data. (The 2026-07-25 pass recorded 16 dogs; the count has since drifted to 19 and the answer is unchanged.)

- [ ] 8.2.3 Confirm no dog is left with a stored `"Mixed Breed"` placeholder.

### 8.3 Regression tests

- [x] 8.3.1 **AKC submission and entry blank carry a real registration number** — `useAKCSubmissionData.test.ts` ("uses dog_registrations.registered_name…", extended to assert `registrationNumber` and `breed`), `buildEntryBlankProps.test.ts` ("carries the registration number and flags nothing missing"), and `liveDogIdentity.regression.test.ts` against verbatim live rows. Companion negative tests assert a UKC-only dog yields `null`/`''` on an AKC surface rather than a borrowed value.
- [x] 8.3.2 Dog search matches on registration number and registered name — `dogQueries.test.ts` › `searchAllDogs` now asserts the `dog_registrations` pre-query, the folded `id.in.(…)` filter, and that `akc_number` is no longer in the filter. Live-data SQL equivalent confirmed separately (see 3.5).
- [ ] 8.3.3 Duplicate-identity guard still blocks exact-registry duplicates and still suggests cross-organization candidates (section 7.3).
- [ ] 8.3.4 A dog created with no registration displays no breed anywhere and emits no substitute breed into any entry, entry blank, or submission payload.
- [ ] 8.3.5 Offline: a dog read through the replication path returns the same identity values as the online read, including for rows written under the old shape.

### 8.4 Repo checks

- [x] 8.4.1 `pnpm typecheck` — 26/26 tasks successful (app + `typecheck:tests`).
- [x] 8.4.2 `pnpm lint` — 14/14 tasks successful.
- [x] 8.4.3 Colocated + grepped callers run green: entry-blank across all eight document themes and their buttons, `useAKCSubmissionData.test.ts`, `dogQueries.test.ts`, `ResultsSubmissionPage.test.tsx`, `RegistrationWorkflow/**`, `MissingRegistrationNotice.test.tsx`, and the identity tests. **114 files / 981 tests, all passing** after both review rounds. Every new regression test was verified non-vacuous by temporarily reverting its fix and confirming failure: entry-trial registry selection, service-level search error propagation, and the caller-level search-failure alert (2 of its 3 cases fail without the fix; the success-path case correctly keeps passing). `pnpm typecheck --force` and `pnpm lint --force` both reported `Cached: 0`, so neither was a replayed turbo cache hit.
- [x] 8.4.4 Workspace packages rebuilt via `scripts/bootstrap-worktree.sh` before the test runs. No shared package was modified by sections 0–3.

### 8.5 Manual re-walk

- [ ] 8.5.1 Create a dog with no registration → confirm no breed appears anywhere and nothing claims one.
- [ ] 8.5.2 Add an AKC registration with a registered name and breed → confirm both appear on organization-scoped surfaces.
- [ ] 8.5.3 Add a second registration with a different organization, name, and breed → confirm generic surfaces still show the primary and do not flicker.
- [ ] 8.5.4 Produce an entry blank and an AKC submission → confirm the registration number is present.
- [ ] 8.5.5 Search by registration number → confirm the dog is found.

## 9. Close-out

- [ ] 9.1 Confirm `exhibitor-ux-remediation` (MYK9-88) tasks 2.1 / 2.3 / 2.9 are consistent with the final storage shape.
- [ ] 9.2 Update the Linear issue and archive this change.
- [ ] 9.3 Record in the audit report that finding #4 is resolved, with the evidence from 8.3.4.
