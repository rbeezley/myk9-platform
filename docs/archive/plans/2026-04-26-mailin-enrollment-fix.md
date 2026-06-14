# Mail-In Enrollment Fix — Design Spec

**Date:** 2026-04-26
**Status:** Draft, awaiting user review
**Author:** Phase 2 Secretary Walk follow-up (PR #96 left this as a `test.fixme` cluster)

## Background

The Phase 2 secretary walk (PR #96) left the registration wizard's mail-in flow blocked. A secretary picking a non-owned dog and submitting hits three independent bugs that compound:

1. **Wrong identity passed to the enrollment write.** [`RegistrationWizardPage`](apps/myk9show/src/pages/RegistrationWizardPage.tsx) calls [`createShowRegistration(showId, userId)`](apps/myk9show/src/services/database/queries/showRegistrationQueries.ts:17) (and [`confirmRegistration` via the Zustand store](apps/myk9show/src/store/showRegistrationStore.ts:388)) with `userId = auth.user.id`. `enrollments.handler_id REFERENCES people(id)`, so the FK lookup fails — `auth.users.id` is not a `people.id`. The existing `enrollments_insert_own` policy compares against `(SELECT id FROM people WHERE auth_user_id = auth.uid())`, so the insert is rejected with `42501 — new row violates row-level security policy`.

2. **No "secretary acts on behalf of exhibitor" pathway.** Even if the wizard passed a valid `people.id`, the existing RLS only lets a user enroll themselves. There is no policy permitting a secretary or club admin to insert an enrollment under another person's `handler_id`. The mail-in workflow is the secretary's primary job; the schema and RLS need to recognize it.

3. **Club-scoped secretary roles aren't recognized as show officials.** `is_show_secretary(check_show_id)` and `is_show_official(check_show_id)` only match show-scoped `secretary` rows. A secretary granted at the **club** level (`role=secretary, club_id=X, show_id=NULL`) is not treated as an official for any show in club X — even though club scoping exists exactly to delegate authority across all of a club's shows. The seeded `secretary@myk9t.com` user is club-scoped, so `submit_show_entries`'s `v_is_official` check evaluates false for them, and `secretary_paid` / `waived` payment methods are rejected by the RPC. This is on the critical path because the wizard's only meaningful mail-in payment methods (`secretary_paid`, `check`, `waived`) all flow through that gate.

This spec covers all three. The exhibitor self-service flow continues to work unchanged.

## Goals

- A secretary (show-scoped or club-scoped) can register mail-in entries end-to-end through the wizard.
- The enrollment row is filed under the **dog's owner**, not the wizard user. Reports, confirmation emails, and the MK9-XXXXXX number all attribute correctly.
- The exhibitor self-service path works exactly as before — no behavior change for users registering their own dogs.
- The three `test.fixme` blocks in [`registrationUI.spec.ts`](apps/myk9show/src/test/e2e/entities/registrationUI.spec.ts) become passing tests.

## Non-Goals

- **Bulk multi-form entry.** Each wizard run still produces one submission. A future redesign for typing many forms in a row is out of scope.
- **Multi-owner carts.** A single wizard run will explicitly disallow dogs from different owners. Splitting into N enrollments + N RPC calls is more code, more failure modes, and not how secretaries process mail (one paper form = one dog = one exhibitor's check). We block it in the UI instead.
- **Refactoring `is_club_admin` or `is_site_admin`.** Only the show-secretary / show-official helpers grow a club-scoped branch. Club-admin and site-admin recognition stays as-is.

## Design Decisions

### 1. Schema — no changes

`enrollments` keeps its `UNIQUE (show_id, handler_id)` invariant. Three forms from the same exhibitor for the same show roll up into **one enrollment** (1 confirmation #) with N entry rows attached — either via one wizard run with multi-dog selection, or via sequential wizard runs that detect the existing enrollment via [`getRegistrationByShowAndHandler`](apps/myk9show/src/services/database/queries/showRegistrationQueries.ts:71) and add onto it.

**Rationale:** the Stripe webhook trigger ([migration 132](supabase/migrations/132_wire_enrollment_on_payment.sql)) does `ON CONFLICT (show_id, handler_id) DO UPDATE` — relaxing the unique constraint would corrupt the payment-success path. The send-registration-email flow keys off one enrollment per exhibitor. Financial Report groups by `entries.handler` text, not by `enrollments.handler_id`, so per-exhibitor enrollment shape is downstream-safe.

### 2. RLS — three new policies on `enrollments`

```sql
CREATE POLICY enrollments_insert_show_official ON public.enrollments
  FOR INSERT WITH CHECK (
    public.is_site_admin()
    OR public.is_show_official(show_id)
  );

CREATE POLICY enrollments_update_show_official ON public.enrollments
  FOR UPDATE USING (
    public.is_site_admin()
    OR public.is_show_official(show_id)
  );

CREATE POLICY enrollments_select_show_official ON public.enrollments
  FOR SELECT USING (
    public.is_site_admin()
    OR public.is_show_official(show_id)
  );
```

Existing `enrollments_*_own` and `enrollments_*_admin` policies (from migration 054) stay untouched. RLS is permissive by default — adding these as `OR` paths broadens access without revoking the self-service path.

### 3. Broaden `is_show_secretary` / `is_show_official`

A `secretary` (or `chairman`/`steward` for `is_show_official`) granted at the **club** level for the show's club is recognized as an official for that show:

```sql
CREATE OR REPLACE FUNCTION public.is_show_secretary(check_show_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = auth.uid()
      AND ur.is_active
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      AND (
        r.name = 'site_admin'
        OR (r.name = 'secretary' AND ur.show_id = check_show_id)
        OR (
          r.name = 'secretary'
          AND ur.show_id IS NULL
          AND ur.club_id = (SELECT club_id FROM public.shows WHERE id = check_show_id)
        )
      )
  );
$$;
```

`is_show_official` mirrors the same shape with `r.name IN ('secretary', 'chairman', 'steward')` in both the show-scoped and club-scoped branches.

**Rationale:** club scoping is meant to delegate authority over all the club's shows. Today's helpers don't honor it — that's a bug, not a deliberate restriction. The migration uses `auth_user_id` directly (denormalized in [migration 156](supabase/migrations/156_denormalize_auth_user_id_into_user_roles.sql)) so it doesn't reintroduce the people-table recursion that 154/155 fought.

### 4. RPC — no change to `submit_show_entries`

The RPC's `v_is_official` already calls `is_show_secretary(p_show_id)` and `is_club_admin(v_show_club_id)`. Once `is_show_secretary` recognizes club-scoped roles, the RPC unblocks for free.

### 5. Wizard code

**[`RegistrationWizardPage.tsx`](apps/myk9show/src/pages/RegistrationWizardPage.tsx)** — derive an `enrollmentHandlerId` from the selected dogs:

- Compute the unique set of `dog.ownerId` across `selectedDogs`. Memoize.
- If the set has zero elements (no dogs picked yet) — defer to the existing dog-selection validation; nothing to enforce yet.
- If the set has one element — that's the enrollment handler.
- If the set has more than one — set a wizard-level validation error rendered inside the dog-selection step: _"This wizard processes one exhibitor's entries at a time. The selected dogs belong to multiple owners. Please remove all but one owner's dogs before continuing."_ Disable Next.

Pass `enrollmentHandlerId` (instead of `userId`) to:

- `createRegistration(showId, enrollmentHandlerId)` in the local Zustand store — adds a `handlerId` field on the local `Registration` shape.
- `confirmRegistration` — uses the stored `reg.handlerId` (not `reg.userId`) for the existing `getRegistrationByShowAndHandler(reg.showId, reg.handlerId)` add-on lookup and the `createShowRegistration(reg.showId, reg.handlerId, ...)` fall-through.
- The direct `createShowRegistration(showId, enrollmentHandlerId, ...)` call in the wizard's non-credit-card payment branch.

The existing `userId` (currently `auth.user.id`, set by `useAuthContext`) stays exactly as today for:

- `useDraftPersistence(showId, userId, ...)` — drafts are scoped to the wizard user (the secretary's identity), not the exhibitor being entered. PR #75 already fixed cross-user draft leakage; we don't perturb that key.
- Any logging / telemetry attribution.

**[`showRegistrationQueries.ts`](apps/myk9show/src/services/database/queries/showRegistrationQueries.ts)** — no signature change. `createShowRegistration(showId, handlerId, ...)` already takes a `handlerId` param shaped as `people.id`. Just gets a different value from the caller.

**[`showRegistrationStore.ts`](apps/myk9show/src/store/showRegistrationStore.ts)** — the local `Registration` shape adds a `handlerId` field separate from `userId`. `confirmRegistration` and `createRegistration` accept and store both. Existing exhibitor flow naturally has `userId === handlerId` (they own the dogs they're entering) — no behavior change.

**Pure helper:** extract `selectedDogsOwner(dogs, selectedDogIds): { ok: true; ownerId: string } | { ok: false; owners: string[] }` to its own module. Unit-tested in isolation. The wizard renders the multi-owner error from the `{ ok: false }` shape.

### 6. Tests

- **New unit test** for `selectedDogsOwner` covering: empty selection, single-owner-single-dog, single-owner-multi-dog, multi-owner-multi-dog, dog with `ownerId = null` (treat as multi-owner failure since we can't enroll under no one).
- **Re-enable** the three `test.fixme` blocks in [`registrationUI.spec.ts`](apps/myk9show/src/test/e2e/entities/registrationUI.spec.ts) — happy path through to the entries-management list and the DB fee-verification check. Run via `cd apps/myk9show && pnpm test:e2e registrationUI.spec.ts`.
- **New e2e test** in the same file: search for "Bravo", select it, also select a dog owned by a different person, assert the validation error renders and Next stays disabled. Then deselect the second dog, assert the error clears and Next is enabled.
- **Manual RLS verification** documented in the migration body: a curl block that signs in as the seeded secretary, attempts an `INSERT INTO enrollments` for the June 2026 show under a non-self `handler_id`, expects a 201 (was 42501 before). Same insert as a regular exhibitor for someone else's dog should still fail.

### 7. Migration shape

File: `supabase/migrations/163_mailin_enrollment_rls_and_club_secretary.sql`. One migration, three sections:

```sql
-- Section 1: broaden is_show_secretary
CREATE OR REPLACE FUNCTION public.is_show_secretary(check_show_id UUID) ...

-- Section 2: broaden is_show_official
CREATE OR REPLACE FUNCTION public.is_show_official(check_show_id UUID) ...

-- Section 3: add show-official RLS policies on enrollments
CREATE POLICY enrollments_insert_show_official ON public.enrollments ...
CREATE POLICY enrollments_update_show_official ON public.enrollments ...
CREATE POLICY enrollments_select_show_official ON public.enrollments ...

NOTIFY pgrst, 'reload schema';
```

**Rollback** (commented at the bottom of the migration file for reference):

```sql
-- DROP POLICY enrollments_insert_show_official ON public.enrollments;
-- DROP POLICY enrollments_update_show_official ON public.enrollments;
-- DROP POLICY enrollments_select_show_official ON public.enrollments;
-- Then re-CREATE OR REPLACE the helpers from migration 099 to restore the
-- show-only-scoped behavior. The DROPs are safe — no FKs, no cascades.
```

## Rollout

1. Land migration file in the PR. Do not push to the linked Supabase project automatically.
2. PR description includes the explicit `supabase db push` command and the curl-based RLS verification snippet.
3. After human approval, push the migration: `cd supabase && source .env && supabase db push --password "$SUPABASE_DB_PASSWORD"`.
4. Merge the PR. The frontend changes are forward-compatible — they assume the new RLS but degrade gracefully (the existing `42501` error path already surfaces a notification).

## Risks & Open Questions

- **Blast radius of broadening `is_show_secretary`/`is_show_official`.** Audited call sites: [`judge_assignments` RLS (mig 143)](supabase/migrations/143_scope_judge_assignments_rls.sql), [`grant_show_official` RPC (mig 144)](supabase/migrations/144_grant_show_official_rpc.sql), [`submit_show_entries` (mig 151)](supabase/migrations/151_submit_show_entries_rpc.sql). All three are operations a club-secretary plausibly should be able to perform for any show in their club. If a future call site needs strict show-scoped behavior, it should call a new `is_strictly_show_scoped_secretary(check_show_id)` helper rather than re-narrowing this one.
- **Add-on flow with mismatched handler.** If a secretary processes form A from exhibitor X, then opens the wizard again and starts form B for exhibitor Y, the second wizard run computes `enrollmentHandlerId = Y.people.id` and creates a separate enrollment — correct. The existing `getRegistrationByShowAndHandler(showId, X.people.id)` path is reached only when the second submission is _also_ for X, which is the desired add-on merging.
- **Stripe webhook handler.** Migration 132's trigger upserts on `(show_id, handler_id)`. With this fix in place, the secretary-created enrollments and the exhibitor-paid Stripe enrollments key on the same `handler_id` (= the exhibitor's `people.id`), so a paid Stripe order from exhibitor X will correctly merge with a secretary-created enrollment for X. No change to the trigger needed.

## Related Work

- PR #96 (Phase 2 secretary walk + Secretary Payment role gate) shipped the Playwright spec scaffolding and the role-based fallback in `PermissionGuard`.
- The TO-DOs spawn task `2026-04-26 Phase 2 Secretary Walk — Findings` tracks the broader walk; this fix unblocks the next walk (`/qa-feature entries as secretary`).
