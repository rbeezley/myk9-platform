# Plan: Show Chairman Picker — Reliable Reuse, Contact Capture, Premium Surfacing

> **Status:** Active

Source: [`docs/audits/2026-07-01-show-creation-wizard-ux.md`](audits/2026-07-01-show-creation-wizard-ux.md) §Findings.1 ("Show Chairman picker surfaces no people"). Investigated 2026-07-01.

## What the investigation actually found (audit hypothesis corrected)

The audit's literal claim — "chairman picker surfaces no people" — **does not reproduce against real data**, and its root-cause hypothesis ("two different lookups that don't agree") is **wrong**:

- Both the Show Chairman and Show Secretary fields are the **same** `OfficialPicker` reading the **identical** `people` array from `useUserStore()`; only the `suggestedRoles` prop differs. There is no data seam between them.
- The `people_select` RLS (`deleted_at IS NULL AND (auth_user_id = auth.uid() OR is_show_manager())`) lets any active secretary see all people, because `is_show_manager()` → `is_trial_secretary()` returns true for any active `secretary` role (club-agnostic). Both seeded secretary accounts qualify. The dev DB has 20 people including several "Test …" records.
- The empty result the audit saw was almost certainly the **scripted-automation artifact** its own calibration caveat warned about (chairman is the first field rendered; an automated run can open it before `loadPeople()` resolves, or synthetic typing never registers).

**But the audit surfaced real weaknesses worth fixing**, and a design conversation (2026-07-01) reframed the fix.

## Architectural constraint that settles the design

Officials are **not** stored as a name or JSON blob on the show. They are **`user_roles` grants to a person**, scoped to the show:

- `saveShowAtomicOnline.ts` maps `show.officials.chairman` person ids → `user_roles` rows `(user_id, role = CHAIRMAN, show_id)`.
- `useShowOfficials` reads officials back by querying `user_roles` for `role IN (secretary, chairman, steward)`.

**Consequence:** free-text chairman names are architecturally impossible — there is nothing to grant a role to without a person row. The chairman **must** be a `people` record. This also means the chairman's `email` and `phone` (people already has a `phone` column) are available for the premium; they simply aren't surfaced yet.

## Decisions (confirmed with product owner, 2026-07-01)

1. Chairman is a **person record** (not free text). ✅ enforced by architecture.
2. Inline "Add new" create form captures **first name, last name, email, phone — all required** (phone is new).
3. **Symmetric exclusion**: the selected Secretary is hidden from the Chairman options AND the selected Chairman is hidden from the Secretary options (they cannot be the same person).
4. **Surface chairman contact on the premium/reports** — in scope now.
5. **Remove Steward from the premium entirely** (type + all PDF bodies + fixtures).

## Phases

### Phase 1 — Picker UX (reduce duplicate-creation pressure) — DONE (commit `f0c905ffc`)
- [x] Distinguish *loading* from *empty* in `GroupedSearchablePopover` (and `OfficialPicker`): show "Loading people…" while `useUserStore` is fetching, so the picker never dead-ends at "Add new" prematurely.
- [x] Surface obvious candidates in "Suggested" — satisfied by the existing role-based `suggested` group (CHAIRMAN/CLUB_ADMIN) + the new exclusion; the logged-in secretary is now *excluded* from the chairman list, not suggested.
- [x] **Symmetric exclusion**: `excludePersonIds` prop on `OfficialPicker`; chairman excludes `secretary[0]`, secretary excludes `chairman[0]`; applied in `groupPeopleForOfficial` before splitting.
- [x] Tests: loading≠empty; excluded person absent from both groups; excluding an unselected id is a no-op.

### Phase 2 — Create form (all fields required + dedup) — DONE (commit `f0c905ffc`)
- [x] Added a **phone** input to `OfficialPicker`'s create form; first/last/email/phone all required (`canSave` gates on all four).
- [x] Threaded `phone` through `handleCreateOfficialPerson` → `createUser` (people.phone column; no migration).
- [x] **Dedup guard**: `handleCreateOfficialPerson` reuses an existing person when email matches (case-insensitive) instead of inserting a duplicate.
- [x] Tests: phone required; createUser called with phone; dedup reuses existing id; no-match still creates.

### Phase 3 — Premium/reports surfacing (chairman contact) + steward removal

**Resolution site pinned:** `supabase/functions/generate-premium/index.ts` is the sole source of truth. It resolves the secretary from `user_roles → people` (name + email; phone hardcoded null) at ~L88-107 and assembles `officials.{chairman,steward} = null` at ~L247. The client `publishPremium.tsx` renders the PDF from the edge function's JSON — no client-side resolution. **This means Phase 3 requires editing AND deploying `generate-premium` (gated shared-system step — confirm before deploy).**

- [x] Extended premium `officials.chairman` to `{ name; email; phone } | null` in `premium-types.ts`.
- [x] **Removed `officials.steward`** from the premium type (grant path untouched — steward is still a real show role).
- [x] `generate-premium/index.ts`: added a chairman resolution query mirroring the secretary one (selecting `first_name, last_name, email, phone`); assembles `officials.chairman = { name, email, phone } | null`; dropped `steward`.
- [x] Updated PDF bodies (`StandardBody`, `PosterBody`, `FieldGuideBody`, `GazetteBody`): render chairman name + email + phone; removed all `officials.steward` references and fixed `hasOfficials` guards.
- [x] AKC Trial Chairman report is unaffected — it builds `trialChair` from `ReportProps`, not from premium `officials.chairman`.
- [x] Updated `ShowEditPremiumTab` preview builder + every premium test fixture (12 files).
- [ ] **Deploy (gated):** `supabase functions deploy generate-premium` — confirm with owner first. **Until deployed, staging/prod premiums keep printing `chairman: null` (steward already absent from the new type).**

### Phase 4 — Regression
- [x] App `tsc -p tsconfig.app.json` clean; `eslint --max-warnings 0` clean on all changed files.
- [x] App vitest green: premium suite (287 passed / 9 skipped) + wizard officials specs (35 passed).
- [x] Updated the e2e `show-wizard-officials.spec.ts`: new test asserts the chairman "Add new" form requires name/email/phone and stays disabled until phone is filled (lint-clean; not run here — e2e needs a live server).
- [ ] Deno type-check the edge function (deno not installed locally; will run at `supabase functions deploy`).

## Notes
- Premium resolution site pinned (see Phase 3). Requires an edge-function deploy — gated.
