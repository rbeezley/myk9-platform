# Mail-In Enrollment Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unblock the registration wizard's mail-in flow end-to-end by (a) routing the enrollment write to the dog's owner instead of the wizard user, (b) opening RLS so secretaries can enroll on behalf of exhibitors, and (c) recognizing club-scoped secretary roles in the show-official RBAC helpers.

**Architecture:** One additive Supabase migration (broaden two `is_show_*` helpers + three new `enrollments` RLS policies, all `OR`-paths so existing self-service still works). One pure helper in front-end code (`selectedDogsOwner`) drives a multi-owner-cart validation block in the wizard. The wizard then passes the dog-owner's `people.id` (not `auth.user.id`) through the existing `createShowRegistration` and `confirmRegistration` paths. No schema changes, no RPC signature changes.

**Tech Stack:** Supabase (Postgres + RLS + SECURITY DEFINER functions), TypeScript / React 19 (myK9Show), Zustand (registration store), Vitest (unit), Playwright (e2e).

**Spec:** [`docs/plans/2026-04-26-mailin-enrollment-fix.md`](2026-04-26-mailin-enrollment-fix.md)

**Worktree / branch:** `/Users/richardbeezley/AI Projects/myk9-platform/.claude/worktrees/mailin-enrollment-fix` on `claude/mailin-enrollment-fix` (already pushed).

---

## File Map

**Create:**

- `supabase/migrations/163_mailin_enrollment_rls_and_club_secretary.sql` — broadens `is_show_secretary` + `is_show_official`, adds three `enrollments_*_show_official` RLS policies.
- `apps/myk9show/src/pages/RegistrationWizardPage/selectedDogsOwner.ts` — pure helper computing the unique owner across selected dogs.
- `apps/myk9show/src/pages/RegistrationWizardPage/selectedDogsOwner.test.ts` — vitest unit tests for the helper.

**Modify:**

- `apps/myk9show/src/types/show-registration-types.ts` — add `handlerId?: string` field to `ShowRegistration`.
- `apps/myk9show/src/store/showRegistrationStore.ts` — `createRegistration` accepts and stores `handlerId`; `confirmRegistration` reads `reg.handlerId` (falling back to `reg.userId` for legacy local-storage rehydration) for the DB lookup + enrollment write.
- `apps/myk9show/src/pages/RegistrationWizardPage.tsx` — compute `enrollmentHandlerId` from selected dogs, render multi-owner validation error inside the dog-selection step (block Next), pass `enrollmentHandlerId` to `createRegistration`, `submitShowEntries`, and the non-credit-card `createShowRegistration` direct call.
- `apps/myk9show/src/test/e2e/entities/registrationUI.spec.ts` — un-`fixme` the three blocked tests; add one new `wizard blocks multi-owner cart` test.

**Out of plan (manual gate after Task 1):**

- `cd supabase && source .env && supabase db push --password "$SUPABASE_DB_PASSWORD"` against the linked Supabase project. The plan does NOT execute this — auto mode forbids unconfirmed shared-system writes, and the user must approve the SQL diff first.

---

## Phase 1 — Migration (build, then human gate)

### Task 1: Migration 163 — broaden helpers + add enrollment RLS

**Files:**

- Create: `supabase/migrations/163_mailin_enrollment_rls_and_club_secretary.sql`

- [ ] **Step 1: Confirm next migration number is 163**

Run: `ls supabase/migrations | tail -5`
Expected: `162_dogs_update_align_with_insert_policy.sql` is the latest. Next is `163`.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/163_mailin_enrollment_rls_and_club_secretary.sql` with this content:

```sql
-- Migration 163: Mail-in enrollment RLS + club-scoped secretary recognition
--
-- Three independent fixes that together unblock the registration wizard's
-- mail-in flow (see docs/plans/2026-04-26-mailin-enrollment-fix.md):
--
--   1. Broaden is_show_secretary(check_show_id) to recognize a secretary role
--      granted at the club level (ur.show_id IS NULL, ur.club_id matches the
--      show's club_id).
--   2. Same broadening for is_show_official(check_show_id), covering
--      secretary / chairman / steward club-scoped roles.
--   3. Add three "show official" RLS policies on enrollments (INSERT/UPDATE/
--      SELECT) so secretaries and club admins can enroll exhibitors on behalf
--      of mail-in submissions. Existing self-service policies stay in place.
--
-- Both helpers continue to query user_roles.auth_user_id directly (denormalized
-- in migration 156) — no people-table join, no RLS recursion risk.

-- ============================================================================
-- 1. Broaden is_show_secretary
-- ============================================================================

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

-- ============================================================================
-- 2. Broaden is_show_official
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_show_official(check_show_id UUID)
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
        OR (r.name IN ('secretary', 'chairman', 'steward') AND ur.show_id = check_show_id)
        OR (
          r.name IN ('secretary', 'chairman', 'steward')
          AND ur.show_id IS NULL
          AND ur.club_id = (SELECT club_id FROM public.shows WHERE id = check_show_id)
        )
      )
  );
$$;

-- ============================================================================
-- 3. Show-official RLS policies on enrollments
-- ============================================================================

CREATE POLICY enrollments_insert_show_official ON public.enrollments
  FOR INSERT
  WITH CHECK (
    public.is_site_admin()
    OR public.is_show_official(show_id)
  );

CREATE POLICY enrollments_update_show_official ON public.enrollments
  FOR UPDATE
  USING (
    public.is_site_admin()
    OR public.is_show_official(show_id)
  );

CREATE POLICY enrollments_select_show_official ON public.enrollments
  FOR SELECT
  USING (
    public.is_site_admin()
    OR public.is_show_official(show_id)
  );

-- ============================================================================
-- Reload PostgREST schema cache so new policies + functions take effect
-- ============================================================================

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- POST-DEPLOY VERIFICATION (run as the seeded secretary user)
-- ============================================================================
-- Spec requires the manual RLS verification block to live IN the migration
-- body so it stays alongside the SQL it's verifying. Run these curls after
-- `supabase db push` lands. Replace SUPABASE_URL / ANON if reusing in another
-- environment.
--
-- 1. is_show_secretary should now return true for a club-scoped secretary
--    on a show belonging to their club:
--
--      SUPABASE_URL="https://sojmvhhwsjxmfistvzbe.supabase.co"
--      ANON="<anon-key-from-apps/myk9show/.env>"
--      TOKEN=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
--        -H "apikey: $ANON" -H "Content-Type: application/json" \
--        -d '{"email":"secretary@myk9t.com","password":"testpass123"}' \
--        | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
--      curl -s "$SUPABASE_URL/rest/v1/rpc/is_show_secretary" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
--        -H "Content-Type: application/json" \
--        -d '{"check_show_id":"4584f257-19b5-4016-aae6-5e7827b769cb"}'
--      Expected: true   (was: false before this migration)
--
-- 2. enrollments INSERT under handler_id of someone other than the secretary
--    themselves should now succeed (mail-in path):
--
--      curl -s -X POST "$SUPABASE_URL/rest/v1/enrollments" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
--        -H "Content-Type: application/json" \
--        -H "Prefer: return=representation" \
--        -d '{"show_id":"4584f257-19b5-4016-aae6-5e7827b769cb",
--             "handler_id":"<some-other-people-id>"}'
--      Expected: 201 with the new row     (was: 42501 RLS denial)
--      Cleanup the test row afterwards via DELETE.
--
-- 3. Negative test — sign in as a regular exhibitor and attempt the same
--    INSERT for someone else's handler_id. Expected: still 42501 (the
--    self-service _own policy doesn't satisfy the WITH CHECK, and the
--    new _show_official policy fails is_show_official() for a non-official).

-- ============================================================================
-- ROLLBACK (commented; safe — DROPs have no FKs / cascades)
-- ============================================================================
-- DROP POLICY IF EXISTS enrollments_insert_show_official ON public.enrollments;
-- DROP POLICY IF EXISTS enrollments_update_show_official ON public.enrollments;
-- DROP POLICY IF EXISTS enrollments_select_show_official ON public.enrollments;
-- Then re-CREATE OR REPLACE the helpers from migration 099 to restore the
-- show-only-scoped behavior.
```

- [ ] **Step 3: Verify the file parses (no shell apply)**

Run: `head -1 supabase/migrations/163_mailin_enrollment_rls_and_club_secretary.sql && wc -l supabase/migrations/163_mailin_enrollment_rls_and_club_secretary.sql`
Expected: First line is `-- Migration 163: ...`, line count > 50.

- [ ] **Step 4: Commit the migration file**

```bash
git add supabase/migrations/163_mailin_enrollment_rls_and_club_secretary.sql
git commit -m "$(cat <<'EOF'
feat(db): mig 163 — mail-in enrollment RLS + club-scoped secretary

Three additive changes unblocking the registration wizard's mail-in
flow:

  1. is_show_secretary now recognizes a secretary role granted at the
     club level (show_id IS NULL, club_id matches the show's club).
  2. is_show_official mirrors the same broadening for secretary /
     chairman / steward roles.
  3. Three new RLS policies on enrollments (INSERT/UPDATE/SELECT) gate
     to is_site_admin() OR is_show_official(show_id). Existing
     self-service _own policies stay untouched.

Push gate is manual — see docs/plans/2026-04-26-mailin-enrollment-fix-plan.md
Phase 1.5 for the verification curls and the supabase db push command.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 1.5: HUMAN GATE — push migration 163 to staging

**This step is intentionally NOT automated.** Auto Mode forbids `supabase db push` to a linked project without explicit confirmation.

- [ ] **Step 1: Show user the migration diff and ask for go-ahead**

Tell the user:

> Ready to push migration 163 to the linked Supabase staging project (`sojmvhhwsjxmfistvzbe`). The migration is additive only:
>
> - `CREATE OR REPLACE` of two existing helpers (`is_show_secretary`, `is_show_official`) — adds a club-scoped branch.
> - Three new `enrollments_*_show_official` RLS policies (`OR` paths alongside the existing `_own` and `_admin` policies).
>
> No DDL drops, no data migration, idempotent. Reply `push it` to run `supabase db push` against staging, or any other reply to hold.

Wait for the explicit "push it" response.

- [ ] **Step 2: On approval, push the migration**

Run from the worktree (which is the linked one):

```bash
cd /Users/richardbeezley/AI\ Projects/myk9-platform/.claude/worktrees/mailin-enrollment-fix/supabase
source .env
supabase db push --password "$SUPABASE_DB_PASSWORD"
```

Expected: `Applying migration 163_mailin_enrollment_rls_and_club_secretary.sql...` + `Finished supabase db push.` No errors.

- [ ] **Step 3: Smoke-test the broadened helper from a fresh secretary session**

Run (replaces `<TOKEN>` with the secretary's access token from a fresh sign-in):

```bash
SUPABASE_URL="https://sojmvhhwsjxmfistvzbe.supabase.co"
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvam12aGh3c2p4bWZpc3R2emJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0NzQ2MTIsImV4cCI6MjA4MzA1MDYxMn0.pvp1GntQfar0aGdTDl4-4aFoEjQkdmK2kDvxLI6oxHA"
TOKEN=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"secretary@myk9t.com","password":"testpass123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Was returning false before mig 163 (club-scoped secretary not recognized).
curl -s "$SUPABASE_URL/rest/v1/rpc/is_show_secretary" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"check_show_id":"4584f257-19b5-4016-aae6-5e7827b769cb"}'
```

Expected: `true`

- [ ] **Step 4: Smoke-test the new enrollment INSERT policy**

```bash
# Insert under handler_id = dedd1ebc... (the secretary's own people.id, since
# they happen to own multiple seeded dogs). Was 42501 before mig 163.
curl -s -X POST "$SUPABASE_URL/rest/v1/enrollments" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"show_id":"4584f257-19b5-4016-aae6-5e7827b769cb","handler_id":"dedd1ebc-4b4b-42da-858f-06a23200a232"}'
```

Expected: 201 with the new row's JSON. Note its `id` for cleanup. If this fails with 42501, the policy didn't take effect — `NOTIFY pgrst, 'reload schema'` should have refreshed the cache, but a manual refresh via the Supabase dashboard may be needed.

- [ ] **Step 5: Clean up the smoke-test enrollment**

```bash
# Replace <ID> with the id returned above
curl -s -X DELETE "$SUPABASE_URL/rest/v1/enrollments?id=eq.<ID>" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"
```

Expected: empty response. (RLS allows the secretary to delete since they own the row via the new SELECT/UPDATE policy + existing service-role flows; if it errors, run from the SQL editor as service_role.)

---

## Phase 2 — Pure helper + unit tests (TDD)

### Task 2: `selectedDogsOwner` helper

**Files:**

- Create: `apps/myk9show/src/pages/RegistrationWizardPage/selectedDogsOwner.ts`
- Create: `apps/myk9show/src/pages/RegistrationWizardPage/selectedDogsOwner.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `apps/myk9show/src/pages/RegistrationWizardPage/selectedDogsOwner.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { Dog } from '@/types/dog-types';
import { selectedDogsOwner } from './selectedDogsOwner';

const makeDog = (id: string, ownerId: string | null): Dog =>
  ({
    id,
    ownerId: ownerId ?? undefined,
    name: id,
    callName: id,
  }) as unknown as Dog;

describe('selectedDogsOwner', () => {
  it('returns ok=false with empty owners when no dogs are selected', () => {
    const result = selectedDogsOwner([makeDog('d1', 'o1')], []);
    expect(result).toEqual({ ok: false, owners: [] });
  });

  it('returns ok=true with the owner id for a single owner / single dog', () => {
    const dogs = [makeDog('d1', 'o1')];
    expect(selectedDogsOwner(dogs, ['d1'])).toEqual({ ok: true, ownerId: 'o1' });
  });

  it('returns ok=true with the owner id when all selected dogs share an owner', () => {
    const dogs = [makeDog('d1', 'o1'), makeDog('d2', 'o1'), makeDog('d3', 'o1')];
    expect(selectedDogsOwner(dogs, ['d1', 'd2', 'd3'])).toEqual({
      ok: true,
      ownerId: 'o1',
    });
  });

  it('returns ok=false with the unique owners when selection spans multiple owners', () => {
    const dogs = [makeDog('d1', 'o1'), makeDog('d2', 'o2')];
    const result = selectedDogsOwner(dogs, ['d1', 'd2']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.owners.sort()).toEqual(['o1', 'o2']);
    }
  });

  it('treats a dog with no ownerId as a multi-owner failure (cannot enroll under no one)', () => {
    const dogs = [makeDog('d1', 'o1'), makeDog('d2', null)];
    const result = selectedDogsOwner(dogs, ['d1', 'd2']);
    expect(result.ok).toBe(false);
  });

  it('ignores selected ids that do not match any dog in the list', () => {
    const dogs = [makeDog('d1', 'o1')];
    expect(selectedDogsOwner(dogs, ['d1', 'd-missing'])).toEqual({
      ok: true,
      ownerId: 'o1',
    });
  });
});
```

- [ ] **Step 2: Run the tests — confirm they fail**

Run: `cd apps/myk9show && npx vitest run src/pages/RegistrationWizardPage/selectedDogsOwner.test.ts`
Expected: All 6 tests fail with `Cannot find module './selectedDogsOwner'`.

- [ ] **Step 3: Implement the helper**

Create `apps/myk9show/src/pages/RegistrationWizardPage/selectedDogsOwner.ts`:

```typescript
import type { Dog } from '@/types/dog-types';

export type SelectedDogsOwnerResult =
  | { ok: true; ownerId: string }
  | { ok: false; owners: string[] };

/**
 * Compute the unique owner across a set of selected dogs.
 *
 * Used by the registration wizard to decide whether a single submission
 * can proceed (one owner) or must be blocked with a validation error
 * (multiple owners or any selected dog with no ownerId — we can't file an
 * enrollment under no one).
 *
 * Returns `{ ok: true, ownerId }` when every selected dog shares the same
 * non-empty `ownerId`. Otherwise returns `{ ok: false, owners }` where
 * `owners` is the sorted unique set of resolved owner ids (excludes the
 * "missing ownerId" case from the list).
 *
 * Selected ids that do not resolve to any dog in the list are silently
 * ignored — the caller is responsible for keeping `selectedDogIds` in sync
 * with the dog list.
 */
export function selectedDogsOwner(dogs: Dog[], selectedDogIds: string[]): SelectedDogsOwnerResult {
  if (selectedDogIds.length === 0) {
    return { ok: false, owners: [] };
  }

  const dogById = new Map(dogs.map(d => [d.id, d]));
  const owners = new Set<string>();
  let hasOrphan = false;

  for (const id of selectedDogIds) {
    const dog = dogById.get(id);
    if (!dog) continue;
    if (!dog.ownerId) {
      hasOrphan = true;
      continue;
    }
    owners.add(dog.ownerId);
  }

  if (!hasOrphan && owners.size === 1) {
    return { ok: true, ownerId: [...owners][0]! };
  }

  return { ok: false, owners: [...owners].sort() };
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `cd apps/myk9show && npx vitest run src/pages/RegistrationWizardPage/selectedDogsOwner.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/RegistrationWizardPage/selectedDogsOwner.ts \
        apps/myk9show/src/pages/RegistrationWizardPage/selectedDogsOwner.test.ts
git commit -m "$(cat <<'EOF'
feat(registration): add selectedDogsOwner pure helper

Used by the wizard to detect whether the cart spans multiple exhibitors
and to derive the enrollment handler_id from the unique owner. Six unit
tests covering empty selection, single/multi dog single owner, multi-
owner, and the no-ownerId orphan case (treated as a multi-owner failure
since we cannot file an enrollment under no one).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Store changes (handler identity)

### Task 3: Add `handlerId` to `ShowRegistration` + thread it through the store

**Files:**

- Modify: `apps/myk9show/src/types/show-registration-types.ts` (around line 73 — add field)
- Modify: `apps/myk9show/src/store/showRegistrationStore.ts` (around lines 100–148 + 388–435 — accept/store handlerId, use it for enrollment writes)

- [ ] **Step 1: Add `handlerId` field to `ShowRegistration`**

In `apps/myk9show/src/types/show-registration-types.ts`, find the `ShowRegistration` interface and add `handlerId` immediately after `userId`:

```typescript
export interface ShowRegistration {
  id: string;
  showId: string;
  userId: string;
  /**
   * The exhibitor's people.id that the enrollment is filed under. For
   * exhibitor self-service this equals the dog owner's people.id (= the
   * caller's databaseUserId). For mail-in this is the dog owner's
   * people.id, which differs from the wizard caller (the secretary's
   * auth.user.id stays in `userId` for draft scoping and telemetry).
   * Optional for backward compat with persisted local-storage drafts that
   * predate this field — store actions fall back to `userId` when null.
   */
  handlerId?: string | undefined;
  registrationNumber?: string | undefined;
  // ... rest unchanged
```

- [ ] **Step 2: Update the store's `createRegistration` action signature + body**

In `apps/myk9show/src/store/showRegistrationStore.ts`, find the `createRegistration` interface entry (~line 95) and the implementation (~line 125). Update both:

Interface:

```typescript
createRegistration: (showId: string, userId: string, handlerId: string, createdByUserId?: string) =>
  ShowRegistration;
```

Implementation:

```typescript
createRegistration: (showId, userId, handlerId, createdByUserId) => {
  const registration: ShowRegistration = {
    id: `reg-${Date.now()}`,
    showId,
    userId,
    handlerId,
    status: 'draft',
    entryStatus: EntryStatus.PENDING,
    totalFees: 0,
    paymentStatus: PaymentStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    entries: [],
    statusHistory: [],
    createdByUserId: createdByUserId || userId,
    lastModifiedByUserId: createdByUserId || userId,
  };

  set(state => ({
    registrations: [...state.registrations, registration],
    currentRegistration: registration,
  }));

  return registration;
},
```

- [ ] **Step 3: Update `confirmRegistration` to use `reg.handlerId`**

In `apps/myk9show/src/store/showRegistrationStore.ts`, find `confirmRegistration` (~line 388). Replace the two enrollment-write call sites:

```typescript
confirmRegistration: async (registrationId, paymentReference, paymentDetails) => {
  const reg = get().registrations.find(r => r.id === registrationId);
  if (!reg) return { confirmationNumber: undefined, dbRegistrationId: undefined };

  // Fall back to userId for any draft persisted before the handlerId field existed.
  const handlerId = reg.handlerId ?? reg.userId;

  let confirmationNumber: string | undefined;
  let dbRegistrationId: string | undefined;
  try {
    const existing = await getRegistrationByShowAndHandler(reg.showId, handlerId);
    if (existing.data) {
      confirmationNumber = existing.data.confirmationNumber;
      dbRegistrationId = existing.data.id;
    } else {
      const result = await createShowRegistration(
        reg.showId,
        handlerId,
        paymentReference,
        paymentDetails
      );
      if (result.error) {
        logger.error('[confirmRegistration] Failed to create DB registration:', result.error);
      }
      confirmationNumber = result.data?.confirmationNumber;
      dbRegistrationId = result.data?.id;
    }
  } catch (err) {
    logger.error('[confirmRegistration] Error persisting registration:', err);
  }

  // ... rest of the function (status update, email invoke) unchanged
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: Clean. The new required `handlerId` param on `createRegistration` will surface as a compile error in `RegistrationWizardPage.tsx` (two call sites). Do NOT fix those yet — Task 4 owns those changes.

If you see errors anywhere OTHER than `RegistrationWizardPage.tsx`, fix them as part of this task — they're store consumers we missed.

- [ ] **Step 5: Run the existing store tests**

Run: `cd apps/myk9show && npx vitest run src/store/__tests__/showRegistrationStore.test.ts 2>/dev/null || cd apps/myk9show && npx vitest run -t "showRegistrationStore"`

If a test fails because it constructs a `ShowRegistration` literal without `handlerId`, that's expected — `handlerId` is optional on the type. If a test calls `createRegistration(showId, userId)` without the new third arg, update the test call to pass a sensible handlerId (e.g., reuse `userId`).

- [ ] **Step 6: DEFER commit until Task 4 Step 1 is also done** [EXPANDED — fixes GAP-F]

`createRegistration`'s third arg becomes required between Step 2 and Step 3, which causes a transient typecheck error in `RegistrationWizardPage.tsx` (the wizard's call sites pass only 2 args). CLAUDE.md forbids `--no-verify`, so we cannot commit broken code.

**Required execution order:**

1. Apply Task 3 Steps 1–5 (do NOT commit).
2. Jump to Task 4 Step 1 and apply ALL five sub-changes (do NOT commit).
3. Run `pnpm typecheck` from the worktree root — must be green.
4. Return here and run the bundled commit below.

Subagent-driven executors: treat Task 3 + Task 4 Step 1 as a single atomic unit and dispatch them together.

```bash
git add apps/myk9show/src/types/show-registration-types.ts \
        apps/myk9show/src/store/showRegistrationStore.ts \
        apps/myk9show/src/pages/RegistrationWizardPage.tsx
git commit -m "$(cat <<'EOF'
feat(registration): thread handlerId through wizard store + page

ShowRegistration grows an optional `handlerId` field that the store's
createRegistration action requires. confirmRegistration now uses
reg.handlerId (falling back to reg.userId for legacy drafts) for the
existing getRegistrationByShowAndHandler lookup and the
createShowRegistration fall-through write — so the enrollment is filed
under the dog's owner instead of the wizard user. The wizard now
computes the enrollment owner from the selected dogs, gates Next on a
single-owner cart, and resets the local registrationId when the
resolved owner changes mid-cart so a stale handlerId can't ship.

Multi-owner banner arrives in the next commit (Task 4 Step 3).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Then continue with Task 4 Step 2 (canProceed update) and Step 3 (banner) as their own subsequent commit.

---

### Task 3.5 [ADDED]: Unit-test the legacy-draft `handlerId ?? userId` fallback

**Files:**

- Create: `apps/myk9show/src/store/__tests__/showRegistrationStore.handlerIdFallback.test.ts`

This guards the backward-compat path in `confirmRegistration`. Without a test, a future refactor that drops `?? reg.userId` would silently regress any persisted localStorage draft created before this change.

- [ ] **Step 1: Write the failing test**

Create `apps/myk9show/src/store/__tests__/showRegistrationStore.handlerIdFallback.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';
import * as queries from '@/services/database/queries/showRegistrationQueries';
import { PaymentStatus, EntryStatus } from '@/types/show-registration-types';

vi.mock('@/services/database/queries/showRegistrationQueries', () => ({
  getRegistrationByShowAndHandler: vi.fn(),
  createShowRegistration: vi.fn(),
}));

describe('confirmRegistration — handlerId fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset persisted Zustand state between tests
    useShowRegistrationStore.setState({ registrations: [], currentRegistration: null });
  });

  it('uses reg.handlerId when present', async () => {
    (queries.getRegistrationByShowAndHandler as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: null,
    });
    (queries.createShowRegistration as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'db-1', confirmationNumber: 'MK9-000001' },
      error: null,
    });

    const reg = useShowRegistrationStore
      .getState()
      .createRegistration('show-1', 'auth-uid-secretary', 'people-id-exhibitor');
    await act(async () => {
      await useShowRegistrationStore.getState().confirmRegistration(reg.id, 'PAY-REF');
    });

    // The DB lookup + insert must be keyed by the dog owner's people.id, not
    // the wizard user's auth.user.id.
    expect(queries.getRegistrationByShowAndHandler).toHaveBeenCalledWith(
      'show-1',
      'people-id-exhibitor'
    );
    expect(queries.createShowRegistration).toHaveBeenCalledWith(
      'show-1',
      'people-id-exhibitor',
      'PAY-REF',
      undefined
    );
  });

  it('falls back to reg.userId when handlerId is undefined (legacy persisted draft)', async () => {
    (queries.getRegistrationByShowAndHandler as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: null,
    });
    (queries.createShowRegistration as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'db-2', confirmationNumber: 'MK9-000002' },
      error: null,
    });

    // Inject a registration as if it was rehydrated from localStorage WITHOUT
    // the new handlerId field. The store action must not crash, and must use
    // userId for the DB write.
    useShowRegistrationStore.setState({
      registrations: [
        {
          id: 'legacy-reg',
          showId: 'show-1',
          userId: 'legacy-people-id',
          status: 'draft',
          entryStatus: EntryStatus.PENDING,
          totalFees: 0,
          paymentStatus: PaymentStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date(),
          entries: [],
          statusHistory: [],
        },
      ],
      currentRegistration: null,
    });

    await act(async () => {
      await useShowRegistrationStore.getState().confirmRegistration('legacy-reg', 'PAY-REF');
    });

    expect(queries.getRegistrationByShowAndHandler).toHaveBeenCalledWith(
      'show-1',
      'legacy-people-id'
    );
  });
});
```

- [ ] **Step 2: Run the tests — confirm they fail (helper test would have already failed without the Task 3 changes)**

Run: `cd apps/myk9show && npx vitest run src/store/__tests__/showRegistrationStore.handlerIdFallback.test.ts`

Expected after Task 3 commit: both tests pass. If running before Task 3 lands, the first test fails because `createRegistration` doesn't accept `handlerId` yet.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/store/__tests__/showRegistrationStore.handlerIdFallback.test.ts
git commit -m "$(cat <<'EOF'
test(registration): cover handlerId path + legacy-draft fallback

Guards the two confirmRegistration paths added in the previous commit:
the new handlerId-keyed enrollment write, and the userId fallback for
persisted localStorage drafts created before the handlerId field
existed. Without these tests, a future refactor dropping the ?? clause
would silently re-introduce the wrong-attribution bug.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Wizard wiring + multi-owner block

### Task 4: Compute `enrollmentHandlerId` in the wizard, gate Next, wire writes

**Files:**

- Modify: `apps/myk9show/src/pages/RegistrationWizardPage.tsx`

- [ ] **Step 1: Wire `enrollmentHandlerId` through the existing call sites**

In `apps/myk9show/src/pages/RegistrationWizardPage.tsx`, locate:

1. The import block at the top — add:

   ```typescript
   import {
     selectedDogsOwner,
     type SelectedDogsOwnerResult,
   } from './RegistrationWizardPage/selectedDogsOwner';
   ```

2. After `currentWorkflowConfig` is derived (~line 97), add:

   ```typescript
   // Resolve the exhibitor that this submission is filed under. For
   // exhibitor self-service this equals the caller's own people.id (since
   // they only see dogs they own). For mail-in (advancedSearch=true) the
   // secretary may have selected dogs from a different exhibitor — that
   // exhibitor's people.id becomes the enrollment handler.
   const ownerResolution: SelectedDogsOwnerResult = useMemo(
     () => selectedDogsOwner(dogs, registrationData.selectedDogs),
     [dogs, registrationData.selectedDogs]
   );
   ```

3. In `handleDogSelectionChange` (~line 489) replace the `createRegistration(showId || '', userId)` call with the owner-resolved variant **plus an owner-change guard** [EXPANDED — fixes GAP-B]:

   ```typescript
   const handleDogSelectionChange = async (selectedDogs: string[]) => {
     setRegistrationData(prev => ({ ...prev, selectedDogs }));

     if (selectedDogs.length === 0 || isCreatingRegistration) {
       return;
     }

     // Defer registration creation until we have a single, resolvable owner.
     // selectedDogsOwner handles the empty case; here we additionally bail
     // when the cart spans multiple owners (canProceed will surface the error).
     const owner = selectedDogsOwner(dogs, selectedDogs);
     if (!owner.ok) return;

     // Owner-change guard: if the user replaces their selection with a
     // different exhibitor's dog(s), the existing registration's handlerId
     // is now stale. Reset it so a fresh registration is created under the
     // new owner. Without this, submission would file the entry under the
     // PREVIOUS exhibitor — silently re-introducing the wrong-attribution
     // bug we are fixing.
     if (registrationId) {
       const existing = useShowRegistrationStore.getState().getRegistration(registrationId);
       if (existing && existing.handlerId !== owner.ownerId) {
         setRegistrationId(undefined);
       } else {
         return;
       }
     }

     setIsCreatingRegistration(true);
     const reg = createRegistration(showId || '', userId, owner.ownerId);
     setRegistrationId(reg.id);
     setIsCreatingRegistration(false);
   };
   ```

4. Inside `handleDraftLoaded` (~line 511), replace the `createRegistration(showId, userId)` fallback with the same owner-resolved variant:

   ```typescript
   if (!registrationId && (draft.data.selectedDogs?.length ?? 0) > 0) {
     const owner = selectedDogsOwner(dogs, draft.data.selectedDogs ?? []);
     if (owner.ok) {
       const reg = createRegistration(showId, userId, owner.ownerId);
       setRegistrationId(reg.id);
     }
   }
   ```

5. In the `handleNext` payment branch, the non-credit-card path calls `createShowRegistration(showId, userId, ...)` (~line 376). Replace with [EXPANDED — fixes GAP-C: hard-fail instead of silent fallback]:

   ```typescript
   if (!ownerResolution.ok) {
     // canProceed() blocks Next on multi-owner carts; we should never
     // reach this submit branch with an unresolved owner. If we do, fail
     // loudly rather than fall back to userId — that would silently
     // re-introduce the wrong-attribution bug this PR fixes.
     throw new Error(
       'Internal: payment submit reached with unresolved enrollment owner. ' +
         'Selected dogs span multiple owners or have no owner set.'
     );
   }
   const result = await createShowRegistration(
     showId,
     ownerResolution.ownerId,
     paymentDetails?.paymentReference,
     paymentDetails
   );
   ```

   The throw is caught by `handleNext`'s existing `try/catch` (~line 457), which surfaces the message via `notifications.error(getErrorMessage(error))` and rolls back local state. The user sees a clear error instead of a silent wrong-attribution.

- [ ] **Step 2: Add multi-owner validation to `canProceed`**

Find `canProceed` (~line 293) and update the `'dog-selection'` case:

```typescript
case 'dog-selection':
  return registrationData.selectedDogs.length > 0 && ownerResolution.ok;
```

- [ ] **Step 3: Render the multi-owner / orphan-owner error inside the dog-selection step** [EXPANDED — fixes GAP-A: distinct copy for orphan vs multi-owner]

In `WorkflowStepContent`'s render in `RegistrationWizardPage.tsx` (around line 642), surface the error above the step content. Add this block immediately before `<WorkflowStepContent ...>`:

```tsx
{
  currentStepId === 'dog-selection' &&
    registrationData.selectedDogs.length > 0 &&
    !ownerResolution.ok && (
      <div
        role="alert"
        className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        {ownerResolution.owners.length >= 2
          ? "This wizard processes one exhibitor's entries at a time. The selected dogs belong to multiple owners. Please remove all but one owner's dogs before continuing."
          : 'One or more selected dogs has no owner on file. An enrollment must be filed under an exhibitor — please add an owner to the dog (or remove it from the cart) before continuing.'}
      </div>
    );
}
```

`ownerResolution.owners` is the resolved unique-owners array from the helper. `length >= 2` = multi-owner. `length < 2` (= 0 or 1, paired with `ok: false`) = at least one selected dog has `ownerId == null`. The two cases get distinct, accurate copy.

- [ ] **Step 4: Run typecheck (now expected to be clean)**

Run: `pnpm typecheck`
Expected: Zero errors.

- [ ] **Step 5: Run lint**

Run: `pnpm lint --filter=@myk9/show`
Expected: Zero errors. If `useMemo` import is missing, add it (the file likely already imports it for other state).

- [ ] **Step 6: Run the existing wizard unit tests**

Run: `cd apps/myk9show && npx vitest run src/pages/__tests__/ src/components/shows/RegistrationWorkflow/__tests__/`
Expected: All pass. If a test calls `createRegistration` with the old 2-arg signature in a mock, update the mock.

- [ ] **Step 7: Commit (this also closes the typecheck gap from Task 3)**

Per Task 3 Step 6 — this commit bundles both the store/types changes and the wizard wiring so typecheck stays green at every commit.

```bash
# (Already covered by the commit at the end of Task 3 Step 6)
```

---

## Phase 5 — E2E coverage

### Task 5: Re-enable the three `test.fixme` blocks + add multi-owner block test

**Files:**

- Modify: `apps/myk9show/src/test/e2e/entities/registrationUI.spec.ts`

- [ ] **Step 1: Remove `test.fixme` from the three blocked tests**

In `apps/myk9show/src/test/e2e/entities/registrationUI.spec.ts`:

- Find the FIXME-prefixed block comment for the happy path (~around the `submits a 2-class mail-in entry with secretary_paid method` test) — remove the entire FIXME block comment, then replace `test.fixme(` with `test(`.
- Find the FIXME for `newly-created entries land on /secretary/entries?showId=...&tab=entries` — remove FIXME comment, change `test.fixme` to `test`.
- Find the FIXME for `DB query confirms entries carry non-zero entry_fee (PR #75 regression guard)` — remove FIXME comment, change `test.fixme` to `test`.

Also delete the file-header note "Open finding (test.fixme below): ..." paragraph and shorten the `Out of scope` list (the items there stay accurate).

- [ ] **Step 2: Add the multi-owner block test**

After the existing `Mail-in entry happy path` describe block, add:

```typescript
test.describe('Registration Wizard — Multi-owner cart guard', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('blocks Next when selected dogs span multiple owners', async ({ page }) => {
    await gotoRegistrationWizard(page);

    // Search for "Bravo" — owned by exhibitor X — and select.
    const search = page.getByPlaceholder(/Search all dogs/i);
    await search.fill('Bravo');
    await page.waitForResponse(
      resp =>
        resp.url().includes('/rest/v1/dogs') &&
        resp.request().method() === 'GET' &&
        resp.url().toLowerCase().includes('bravo'),
      { timeout: 10000 }
    );
    await page
      .locator('[role="checkbox"]')
      .filter({ hasNotText: /select all/i })
      .first()
      .click();

    // Now search for "Alpha 1" — owned by a different exhibitor — and add.
    await search.fill('Alpha');
    await page.waitForResponse(
      resp =>
        resp.url().includes('/rest/v1/dogs') &&
        resp.request().method() === 'GET' &&
        resp.url().toLowerCase().includes('alpha'),
      { timeout: 10000 }
    );
    await page
      .locator('[role="checkbox"]')
      .filter({ hasNotText: /select all/i })
      .first()
      .click();

    // Multi-owner banner appears, Next is disabled.
    await expect(
      page.getByText(/wizard processes one exhibitor.*entries at a time/i)
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^Next/ })).toBeDisabled();

    // Deselecting the second dog clears the error and re-enables Next.
    await page
      .locator('[role="checkbox"]')
      .filter({ hasNotText: /select all/i })
      .first()
      .click();
    await expect(
      page.getByText(/wizard processes one exhibitor.*entries at a time/i)
    ).not.toBeVisible();
    await expect(page.getByRole('button', { name: /^Next/ })).toBeEnabled();
  });
});
```

- [ ] **Step 3a: Ensure the dev server is running** [ADDED — fixes GAP-E]

The Playwright spec hits `http://localhost:5173`. From the worktree root:

```bash
curl -sf http://localhost:5173 >/dev/null && echo RUNNING || echo NOT_RUNNING
```

If `NOT_RUNNING`, start it in the background and wait for ready:

```bash
pnpm dev:show > /tmp/devshow.log 2>&1 &
until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done && echo READY
```

Expected: `READY` (within ~10s on a warm pnpm cache).

- [ ] **Step 3b: Run the e2e suite**

```bash
cd apps/myk9show && pnpm test:e2e src/test/e2e/entities/registrationUI.spec.ts --project=chromium --reporter=list
```

Expected: All tests pass. The previously-fixme'd tests should now exercise the secretary_paid flow end-to-end against the staging Supabase project (post-migration).

If a previously-fixme'd test fails:

- Check the network tab on the failed test (`test-results/.../trace.zip`) for the actual Supabase response.
- Most likely cause: migration 163 wasn't pushed (Task 1.5 was skipped). Stop and re-confirm with the user.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/test/e2e/entities/registrationUI.spec.ts
git commit -m "$(cat <<'EOF'
test(registration): re-enable mail-in happy path + add multi-owner guard

Mig 163 + the wizard's enrollmentHandlerId routing close the gap that
PR #96 left as test.fixme. The three previously-skipped tests now run
green end-to-end:

  - submits a 2-class mail-in entry with secretary_paid method
  - newly-created entries land on /secretary/entries
  - DB query confirms entries carry non-zero entry_fee

Adds one new test that asserts the wizard surfaces the multi-owner
error and disables Next when the cart spans multiple exhibitors,
clearing automatically when the second dog is removed.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6 — Verification + ship

### Task 6: Full-repo gates, then ship-pr

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: Zero errors.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: Zero errors. (Cached after the per-package runs above; ~10s.)

- [ ] **Step 3: Full vitest (both apps)**

Run:

```bash
cd apps/myk9show && pnpm vitest run --reporter=default
```

Expected: All green. Stop and report if any failure is in a file we touched (registration store, wizard, helper). Pre-existing PresenceService / PerformanceService flakes per MEMORY.md are OK to ignore — same policy as other recent PRs.

- [ ] **Step 4: Push the branch (commits already in place from prior tasks)**

```bash
git push
```

Expected: Updates `origin/claude/mailin-enrollment-fix`.

- [ ] **Step 5: Open PR + run /ship-pr**

Invoke the ship-pr skill. The skill handles: simplify, commit (already done — no-ops), PR open if needed, code-reviewer self-review, squash-merge from main repo, worktree cleanup.

PR title: `fix(registration): mail-in enrollment data model + RLS unblock`

PR body must include:

- A summary of the three bugs fixed.
- A "Migration deploy required" callout pointing at Task 1.5 (the user already ran the migration in Task 1.5; the callout is for any future replay against another environment).
- Links to the design spec and this plan.
- Confirmation that the three previously-fixme'd tests are now passing.

---

## Self-Review

Cross-checked the plan against the spec sections:

- **Spec §1 (Schema decision):** Plan's File Map calls out "no schema changes" and migration 163 contains no `ALTER TABLE` / `CREATE TABLE` for `enrollments`. ✓
- **Spec §2 (RLS — three new policies):** Task 1 Step 2 contains the exact SQL for all three (`enrollments_insert_show_official`, `enrollments_update_show_official`, `enrollments_select_show_official`). ✓
- **Spec §3 (Broaden helpers):** Task 1 Step 2 contains both `is_show_secretary` and `is_show_official` rewrites with the club-scoped branch. ✓
- **Spec §4 (No RPC change):** Plan does NOT touch `submit_show_entries` (mig 151). ✓
- **Spec §5 (Wizard code):** Tasks 3 + 4 cover all four bullet points (compute enrollmentHandlerId, multi-owner block, pass through createRegistration / confirmRegistration / createShowRegistration, leave userId untouched for drafts). ✓
- **Spec §6 (Tests):** Task 2 covers the `selectedDogsOwner` unit test (six cases including the orphan-owner case from the spec). Task 5 re-enables the three fixme'd tests and adds the multi-owner block test. The "Manual RLS verification" curl block from the spec is in Task 1.5 Step 4. ✓
- **Spec §7 (Migration shape):** Task 1 mirrors the spec's three-section structure plus the rollback comment. ✓
- **Rollout (spec):** Task 1.5 is the explicit human gate; Task 6 is the post-merge ship. ✓

**Type consistency:** `selectedDogsOwner` returns `SelectedDogsOwnerResult` — used identically in the helper, its tests, and the wizard. `createRegistration(showId, userId, handlerId, createdByUserId?)` — same signature in Task 3 Step 2 (interface + impl) and Task 4 Step 1 call sites. `ShowRegistration.handlerId?: string | undefined` matches across the type definition (Task 3 Step 1) and the store action (Task 3 Step 2).

**Placeholder scan:** No "TBD" / "TODO" / "implement later". Every code step has the exact code. Every test step has the exact `expect`.

**One open caveat — call out before execution:** `createRegistration`'s new `handlerId` arg becomes required between Task 3 Step 2 and Task 4 Step 1. Typecheck breaks transiently between those two steps. The plan handles this by re-ordering the commit (Task 3 Step 6 → after Task 4 Step 1) into a single bundled commit. Executors using subagent-driven-development should treat Tasks 3 and 4 as a single batch.

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-04-26-mailin-enrollment-fix-plan.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks.
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch with checkpoints.

Auto mode is active and the user delegated trust earlier ("I trust you / Option A / yes"). Default to Inline Execution unless the user requests otherwise. Human gate at Task 1.5 (migration push) is mandatory regardless of execution mode.
