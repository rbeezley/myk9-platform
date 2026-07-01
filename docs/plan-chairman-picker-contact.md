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

### Phase 1 — Picker UX (reduce duplicate-creation pressure)
- [ ] Distinguish *loading* from *empty* in `GroupedSearchablePopover` (and `OfficialPicker`): show "Loading people…" while `useUserStore` is fetching, so the picker never dead-ends at "Add new" prematurely.
- [ ] Surface obvious candidates in "Suggested" so search is not the only path.
- [ ] **Symmetric exclusion**: pass an `excludePersonIds` prop to `OfficialPicker`; chairman excludes `secretary[0]`, secretary excludes `chairman[0]`. Apply the exclusion in `groupPeopleForOfficial` (filter before splitting).
- [ ] Tests: loading≠empty; excluded person absent from both groups; excluding an id that isn't selected is a no-op.

### Phase 2 — Create form (all fields required + dedup)
- [ ] Add a **phone** input to `OfficialPicker`'s create form; make first/last/email/phone all required (`canSave` gates on all four).
- [ ] Thread `phone` through `handleCreateOfficialPerson` → `createUser` (people.phone column).
- [ ] **Dedup guard**: before insert, match on name + email against loaded `people`; if a match exists, select it instead of creating a duplicate. Surface a subtle "Selected existing person" affordance.
- [ ] Tests: phone required; createUser called with phone; dedup reuses existing id; no-match still creates.

### Phase 3 — Premium/reports surfacing (chairman contact) + steward removal

**Resolution site pinned:** `supabase/functions/generate-premium/index.ts` is the sole source of truth. It resolves the secretary from `user_roles → people` (name + email; phone hardcoded null) at ~L88-107 and assembles `officials.{chairman,steward} = null` at ~L247. The client `publishPremium.tsx` renders the PDF from the edge function's JSON — no client-side resolution. **This means Phase 3 requires editing AND deploying `generate-premium` (gated shared-system step — confirm before deploy).**

- [ ] Extend premium `officials.chairman` from `string | null` to `{ name; email; phone } | null` (mirror the existing `secretary` object shape) in `premium-types.ts` (the shape shared between the edge fn output and the PDF bodies).
- [ ] **Remove `officials.steward`** from `premium-types.ts` (display-only; the steward *grant* path in `saveShowAtomicOnline`/`grant_show_official` stays intact — steward is still a real show role).
- [ ] In `generate-premium/index.ts`: add a chairman resolution query mirroring the secretary one (`user_roles` join `people`, `roles.name = 'chairman'`, `is_active`), selecting `first_name, last_name, email, phone`; assemble `officials.chairman = { name, email, phone }`; drop the `steward` field.
- [ ] Update PDF bodies (`StandardBody` L106/116-120, `PosterBody` L51/113-114, `FieldGuideBody` L54/132-136, `GazetteBody` L52/82): render chairman name + email + phone; remove all `officials.steward` references and fix `hasOfficials` guards.
- [ ] Verify the AKC Trial Chairman report (`akcTrialChairmanReport.ts`) still resolves the chair name.
- [ ] Update every premium test fixture that sets `officials.steward` / `officials.chairman: string` (the `__tests__` matrix: `AKCPremiumTemplate`, `UKCPremiumTemplate`, `PosterStyle`, `GazetteFieldGuideStyle`, `magazineHeritage`, `allStylesMatrix`, `bodyContractInvariants`, `AtAGlancePanel`, `minimumDataFixture`, `renderTimeBenchmark`, `PremiumContentEditor`, `logPremiumGeneration`).
- [ ] **Deploy (gated):** `supabase functions deploy generate-premium` — confirm with owner first.

### Phase 4 — Regression
- [ ] `pnpm typecheck` + `pnpm lint` clean.
- [ ] App vitest green (esp. premium `__tests__` matrix + wizard officials specs).
- [ ] Update the e2e `show-wizard-officials.spec.ts` for the new exclusion + create-form shape.

## Notes
- Premium resolution site pinned (see Phase 3). Requires an edge-function deploy — gated.
