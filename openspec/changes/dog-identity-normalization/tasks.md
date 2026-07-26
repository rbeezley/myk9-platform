# Tasks

Source: 2026-07-24 exhibitor audit + product-owner clarifications on MYK9-88. Sibling change: `exhibitor-ux-remediation` owns the exhibitor-facing UX half.

**Order matters.** Sections 1–3 are additive and independently shippable. Sections 4–6 are the breaking half and require the shared-system approval gate before `db push`. Do not start section 6 until section 2's helpers own every breed read.

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
- [x] 3.3 Dog search ([`reads.ts`](../../../apps/myk9show/src/services/database/dogs/reads.ts) `searchAllDogs`) resolves matching `dog_id`s from `dog_registrations.registration_number` / `registered_name` and folds them into the `dogs` query as an id list. PostgREST cannot OR a parent-column filter against an embedded-table filter in one request, hence the two-step. `akc_number.ilike` is removed. The pre-query's error is **thrown, not swallowed** — silently downgrading a backend failure to "no registration matches" would make it indistinguishable from "no such dog".
- [x] 3.4 Missing registration is surfaced, not silently blank: `EntryBlankDog.missingRegistration` is `true` when a dog was supplied but holds no registration with the sanctioning organization. Blank mode (no dog) stays `false`. **It reaches a user**: [`MissingRegistrationNotice.tsx`](../../../apps/myk9show/src/features/heritage/entry-blank/MissingRegistrationNotice.tsx) renders a `role="alert"` warning above the download control in **all eight** entry-blank buttons (heritage, gazette, magazine, poster, banner, monogram, fieldGuide, headline). Download is deliberately not blocked — a secretary may want the partly-filled form for an exhibitor to complete by hand; the requirement is that nobody mails it unknowingly.
- [x] 3.5 **Verified against real rows.** [`liveDogIdentity.regression.test.ts`](../../../apps/myk9show/src/features/dogs/identity/__tests__/liveDogIdentity.regression.test.ts) drives the resolver and `buildEntryBlankProps` with `dog_registrations` rows copied verbatim from the live database — the real multi-organization dog "Ziva" (AKC `DN61191906`, UKC `P935-254`, Other `BH-44740`). The entry blank prints `DN61191906`, not blank and not the UKC number. The search fix was verified by running the two-step query's SQL equivalent against the live database: searching `DN6119` returns Ziva, where the old `dogs.akc_number` filter returned nothing.

## 4. Drop the dead flat registry columns

- [ ] 4.1 Confirm 0.2 is answered and nothing outside app source reads them.
- [ ] 4.2 Migration: drop `dogs.akc_number`, `ukc_number`, `other_registry`, `other_registry_number`. They are `NULL` for every row, so no backfill is needed.
- [ ] 4.3 Remove their TypeScript types and any remaining references.

## 5. Call name becomes the required identifier

- [ ] 5.1 Migration: backfill `dogs.call_name` from `dogs.name` where null, then `SET NOT NULL` on `call_name`.
- [ ] 5.2 Migration: make `dogs.name` nullable and update its column comment — it is a legacy alias, **not** a registered name.
- [ ] 5.3 Stop writing the call name into `dogs.name` in [`AddDogPanel/index.tsx`](../../../apps/myk9show/src/components/panels/edit/AddDogPanel/index.tsx) and in `create_dog_with_registrations`.
- [ ] 5.4 Record how many readers of `dogs.name` remain, to inform whether it is dropped later (design open question 2).

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
- [x] 8.1.3 Earliest-created-is-primary fallback covered in the resolver tests. The *database* half of the invariant (at most one primary per dog) is the partial unique index in the unpushed migration and cannot be proven until it is applied.

### 8.2 Data and migration verification

- [ ] 8.2.1 Post-migration query proving no dog lost identity data: every dog still has a call name, and every registration retains its number, registered name, and breed.
- [ ] 8.2.2 Confirm the flat registry columns were `NULL` for every row immediately before being dropped.
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
- [x] 8.4.3 Colocated + grepped callers run green: entry-blank across all eight document themes and their buttons, `useAKCSubmissionData.test.ts`, `dogQueries.test.ts`, `ResultsSubmissionPage.test.tsx`, `RegistrationWorkflow/**`, `MissingRegistrationNotice.test.tsx`, and the identity tests. **113 files / 978 tests, all passing** after the review fixes. The two new regression tests (entry-trial registry selection, search error propagation) were verified non-vacuous by temporarily reverting each fix and confirming both fail.
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
