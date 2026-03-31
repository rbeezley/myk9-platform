# Harden Volunteer Scheduling RLS Policies — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken volunteer RLS write policies by reusing `can_manage_show()` for show-scoped, DRY, correct authorization.

**Architecture:** Single new migration drops the 3 broken `FOR ALL` policies from migration 095, creates a `volunteer_show_id()` helper for resolving show context from class assignments, and recreates 3 policies using `can_manage_show()`. No application code changes needed — this is purely database-level.

**Tech Stack:** PostgreSQL, Supabase RLS

**Spec:** `docs/superpowers/specs/2026-03-31-harden-volunteer-rls-design.md`

---

### Task 1: Write the migration

**Files:**

- Create: `supabase/migrations/100_harden_volunteer_rls.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- =============================================================================
-- Migration 100: Harden volunteer scheduling RLS policies
--
-- Fixes from migration 095:
-- 1. CRITICAL: Policies used user_roles.user_id = auth.uid(), but user_roles.user_id
--    references people(id), not auth.users(id). Policies never matched any user.
-- 2. No show scoping — secretary for Show A could manage volunteers for Show B.
-- 3. 6x duplicated inline subqueries with redundant WITH CHECK clauses.
-- 4. Missing expires_at check on role assignments.
-- 5. Missing club_admin access.
--
-- Fix: Reuse existing can_manage_show(show_id) which correctly checks
-- is_club_admin(club_id) OR is_trial_secretary(club_id) OR is_platform_admin()
-- with proper people join, is_active, and expires_at checks.
-- =============================================================================

-- [ADDED] Dependency guard: verify can_manage_show() exists before proceeding.
-- If this fails, migration 038 was not applied — stop and investigate.
DO $$ BEGIN
  PERFORM can_manage_show(NULL);
EXCEPTION WHEN undefined_function THEN
  RAISE EXCEPTION 'DEPENDENCY MISSING: can_manage_show() from migration 038 must exist before applying this migration';
END $$;

-- 1. Helper: resolve show_id from a volunteer record
--    Needed because volunteer_class_assignments has no show_id column.
CREATE OR REPLACE FUNCTION volunteer_show_id(vol_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT show_id FROM public.volunteers WHERE id = vol_id;
$$;

-- 2. Drop broken write policies from migration 095
DROP POLICY IF EXISTS "Secretary can manage volunteers" ON volunteers;
DROP POLICY IF EXISTS "Secretary can manage class assignments" ON volunteer_class_assignments;
DROP POLICY IF EXISTS "Secretary can manage general assignments" ON volunteer_general_assignments;

-- 3. Recreate with can_manage_show() — show-scoped, correct auth, DRY
--    No WITH CHECK needed: Postgres uses USING as fallback for FOR ALL policies.

CREATE POLICY "Show managers can manage volunteers"
  ON volunteers FOR ALL TO authenticated
  USING ((SELECT can_manage_show(show_id)));

CREATE POLICY "Show managers can manage class assignments"
  ON volunteer_class_assignments FOR ALL TO authenticated
  USING ((SELECT can_manage_show(volunteer_show_id(volunteer_id))));

CREATE POLICY "Show managers can manage general assignments"
  ON volunteer_general_assignments FOR ALL TO authenticated
  USING ((SELECT can_manage_show(show_id)));
```

- [ ] **Step 2: Verify the migration parses correctly**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && npx supabase db lint --level warning 2>&1 | head -20`

If `supabase db lint` is not available, verify syntax with:

```bash
grep -c 'CREATE POLICY\|DROP POLICY\|CREATE OR REPLACE FUNCTION' supabase/migrations/100_harden_volunteer_rls.sql
```

Expected: 4 (1 function + 3 DROP + 3 CREATE = 7, but grep counts lines not statements — expect 7 matching lines)

- [ ] **Step 3: Commit the migration**

```bash
git add supabase/migrations/100_harden_volunteer_rls.sql
git commit -m "fix(rls): harden volunteer scheduling policies

Reuse can_manage_show() to fix 5 issues in migration 095:
- auth.uid() identity bug (user_roles.user_id is people.id)
- no show scoping (secretary could manage any show's volunteers)
- 6x duplicated inline subqueries
- missing expires_at check
- missing club_admin access"
```

---

### Task 2: Verify policies work [ADDED]

**Files:** None (SQL verification queries)

- [ ] **Step 1: Verify the function and policies exist**

After pushing the migration (or in local Supabase), run these verification queries:

```sql
-- Verify volunteer_show_id function exists
SELECT proname, prosecdef FROM pg_proc WHERE proname = 'volunteer_show_id';
-- Expected: volunteer_show_id | true (SECURITY DEFINER)

-- Verify old policies are gone
SELECT policyname FROM pg_policies
WHERE tablename IN ('volunteers', 'volunteer_class_assignments', 'volunteer_general_assignments')
  AND policyname LIKE 'Secretary can manage%';
-- Expected: 0 rows

-- Verify new policies exist
SELECT tablename, policyname FROM pg_policies
WHERE tablename IN ('volunteers', 'volunteer_class_assignments', 'volunteer_general_assignments')
  AND policyname LIKE 'Show managers%';
-- Expected: 3 rows (one per table)
```

- [ ] **Step 2: Verify show scoping works**

```sql
-- Verify can_manage_show(NULL) returns false for non-admins
-- (tests the NULL show_id edge case)
SELECT can_manage_show(NULL);
-- Expected: false (unless logged in as platform admin)
```

Manual smoke test in the app: as a secretary for a specific show, verify you can create/edit volunteers for that show but not for another show.

---

### Task 3: Update TO-DOS.md

**Files:**

- Modify: `TO-DOS.md`

- [ ] **Step 1: Mark the two volunteer RLS items as done**

In the `## Harden Volunteer Scheduling RLS Policies - 2026-03-30 18:20` section, change both `- **` items to `- [x] **` and append ` — Done (migration 100).` to each line.

- [ ] **Step 2: Commit the TODO update**

```bash
git add TO-DOS.md
git commit -m "docs: mark volunteer RLS hardening as done in TO-DOS.md"
```

---

### Task 4: Push migration to hosted Supabase

**Files:** None (remote operation)

- [ ] **Step 1: Push the migration**

Follow the process in the reference memory for Supabase DB Push — use the IPv4 session pooler with credentials from `.env`.

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform" && npx supabase db push
```

- [ ] **Step 2: Verify the new function and policies exist**

```bash
npx supabase db lint --level warning 2>&1 | head -20
```

Or verify manually in the Supabase dashboard under Authentication > Policies for the three volunteer tables.
