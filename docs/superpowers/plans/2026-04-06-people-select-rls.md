# People SELECT RLS Restriction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict `people` table SELECT to own-record-or-privileged-role, closing the PII exposure gap.

**Architecture:** Single migration replaces the permissive `people_select` policy. Regular users see only their own row; secretaries and admins see all (admins including soft-deleted).

**Tech Stack:** PostgreSQL RLS policy, existing helper functions (`is_trial_secretary()`, `is_platform_admin()`).

**Spec:** `docs/superpowers/specs/2026-04-06-people-select-rls-design.md`

---

### Task 1: Write the migration

**Files:**

- Create: `supabase/migrations/119_restrict_people_select_rls.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Migration 119: Restrict people SELECT to own-record or privileged role
--
-- Closes the PII exposure gap: previously any authenticated user could read
-- all people rows (email, phone, address) via the Supabase REST API.
-- Now regular users see only their own record. Secretaries and platform
-- admins retain full visibility (admins including soft-deleted rows).
--
-- Impact analysis: all people queries from non-privileged users go through
-- AuthContext (own auth_user_id) or useProfileForm (own record). Secretary
-- features (volunteer search, entry management, user admin) are covered by
-- is_trial_secretary(). CSV export uses get_entries_for_export RPC
-- (SECURITY DEFINER, bypasses RLS). TV/spectator views use entries.handler
-- text field, not the people table.
--
-- Edge case: people rows with NULL auth_user_id become invisible to regular
-- users (only secretary/admin can see them). This is correct — such rows are
-- system-created or orphaned and should not be exposed to regular users.
--
-- Performance: is_trial_secretary() and is_platform_admin() are STABLE
-- SECURITY DEFINER functions — Postgres caches their result per-statement.
-- The auth_user_id comparison uses the existing index on people(auth_user_id).
--
-- Rollback: DROP POLICY "people_select" ON people; then re-create the
-- permissive policy from migration 111:
--   CREATE POLICY "people_select" ON people FOR SELECT TO authenticated
--     USING (deleted_at IS NULL OR (SELECT is_platform_admin()));

DROP POLICY IF EXISTS "people_select" ON people;

CREATE POLICY "people_select" ON people
  FOR SELECT TO authenticated
  USING (
    (
      auth_user_id = (SELECT auth.uid())
      OR (SELECT is_trial_secretary())
      OR (SELECT is_platform_admin())
    )
    AND (
      deleted_at IS NULL
      OR (SELECT is_platform_admin())
    )
  );
```

- [ ] **Step 2: Verify migration SQL is valid**

Run: `cd supabase && grep -c 'CREATE POLICY' migrations/119_restrict_people_select_rls.sql`
Expected: `1`

- [ ] **Step 3: Commit migration**

```bash
git add supabase/migrations/119_restrict_people_select_rls.sql
git commit -m "feat: restrict people SELECT RLS to own-record or privileged role

Closes PII exposure gap where any authenticated user could read all
people rows (email, phone, address) via Supabase REST API."
```

---

### Task 2: Verify existing tests still pass

**Files:**

- Read: `apps/myk9show/src/test/auth/useAuth.test.ts`
- Read: `apps/myk9show/src/hooks/queries/__tests__/volunteerQueries.test.tsx`

The app tests mock Supabase, so they test application logic rather than RLS. They should pass unchanged — this step confirms no import/type breakage.

- [ ] **Step 1: Run myK9Show unit tests**

Run: `cd apps/myk9show && pnpm test`
Expected: All tests pass. No test touches the actual RLS policy (tests use mocked Supabase client).

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No type errors (migration is SQL-only, no TypeScript changes).

---

### Task 3: Push migration to Supabase

- [ ] **Step 1: Push the migration**

Run: `cd supabase && npx supabase db push --password "$(grep SUPABASE_DB_PASSWORD .env | cut -d= -f2)"`
Expected: Migration 119 applied successfully.

- [ ] **Step 2: Verify the policy is active**

Run: `cd supabase && npx supabase db push --dry-run --password "$(grep SUPABASE_DB_PASSWORD .env | cut -d= -f2)"`
Expected: No pending migrations (119 already applied).

- [ ] **Step 3: Smoke-test RLS in the app** `[ADDED]`

Open the staging app, log in as a regular (non-secretary) user. Open browser devtools Network tab. Run this in the console to attempt reading another user's data:

```js
const { data, error } = await window.__supabase.from('people').select('id, email, phone').limit(5);
console.log('rows returned:', data?.length, data);
```

Expected: Only 1 row returned (the logged-in user's own record). If more than 1 row is returned, the policy did not apply — check migration status.

Then log in as a secretary user and repeat. Expected: Multiple rows returned (all non-deleted people).

- [ ] **Step 4: Rollback instructions (keep for reference, do not execute)** `[ADDED]`

If the policy breaks a production flow, run this SQL to revert to the previous permissive policy:

```sql
DROP POLICY IF EXISTS "people_select" ON people;
CREATE POLICY "people_select" ON people
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR (SELECT is_platform_admin()));
```

---

### Task 4: Update harden backlog

**Files:**

- Modify: `/Users/richardbeezley/.claude/projects/-Users-richardbeezley-AI-Projects-myk9-platform/memory/project_harden_backlog.md`

- [ ] **Step 1: Move the RLS gap from "Open" to "Completed"**

Move the "Open RLS Gap" section to the "Completed" section with today's date, noting:

- Migration 119 restricts `people` SELECT to own-record, secretary, or platform admin
- `entries` SELECT left open (semi-public data displayed on TV boards)
- `get_entries_for_export` RPC already secured (migration 113)

- [ ] **Step 2: Commit plan doc**

```bash
git add docs/superpowers/plans/2026-04-06-people-select-rls.md
git commit -m "docs: add people SELECT RLS implementation plan"
```
