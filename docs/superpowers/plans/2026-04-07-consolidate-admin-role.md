# Consolidate Admin Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dual `platform_admin`/`site_admin` shim with a single canonical `is_site_admin()` function, making `is_platform_admin()` a deprecated wrapper.

**Architecture:** One migration (`124_rename_is_platform_admin_to_is_site_admin.sql`) creates `is_site_admin()`, replaces the body of `is_platform_admin()` with a one-line delegate, and defensively deletes any lingering `platform_admin` role rows. No frontend changes — the frontend already uses `site_admin` exclusively.

**Tech Stack:** PostgreSQL (Supabase), SQL migrations only.

---

## File Map

| Action | Path                                                                    |
| ------ | ----------------------------------------------------------------------- |
| Create | `supabase/migrations/124_rename_is_platform_admin_to_is_site_admin.sql` |

---

### Task 1: Write migration 124

**Files:**

- Create: `supabase/migrations/124_rename_is_platform_admin_to_is_site_admin.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/124_rename_is_platform_admin_to_is_site_admin.sql` with this exact content:

```sql
-- Migration 124: Establish is_site_admin() as canonical admin helper
--
-- Context: Migration 047 created is_platform_admin() accepting both 'platform_admin'
-- and 'site_admin' role names as a compatibility shim. 86 RLS policies call
-- is_platform_admin(). Rather than recreating all 86 policies, we:
--   1. Create is_site_admin() as the real implementation (site_admin only)
--   2. Replace is_platform_admin() with a deprecated wrapper calling is_site_admin()
--   3. Defensively clean up any lingering platform_admin role rows
--
-- Convention: All new RLS policies must use is_site_admin(). The deprecated
-- wrapper will be removed in a future migration once old policies cycle through rewrites.

-- Step 1: Create canonical function
CREATE OR REPLACE FUNCTION public.is_site_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND r.name = 'site_admin'
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;

-- Step 2: Replace is_platform_admin() with a deprecated wrapper
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT public.is_site_admin();
$$;

COMMENT ON FUNCTION public.is_platform_admin() IS
  'DEPRECATED — delegates to is_site_admin(). Use is_site_admin() in all new RLS policies.';

-- Step 3: Defensive cleanup — remove platform_admin role if it still exists.
-- Migration 066 already performed this; these are no-ops if that ran correctly.
DELETE FROM public.user_roles
WHERE role_id IN (SELECT id FROM public.roles WHERE name = 'platform_admin');

DELETE FROM public.roles WHERE name = 'platform_admin';
```

- [ ] **Step 2: Verify the file exists and has the right name**

```bash
ls supabase/migrations/124_rename_is_platform_admin_to_is_site_admin.sql
```

Expected: file listed with no error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/124_rename_is_platform_admin_to_is_site_admin.sql
git commit -m "feat: add is_site_admin() and deprecate is_platform_admin() (migration 124)"
```

---

### Task 2: Push migration and smoke test

**Files:** (none — DB push only)

- [ ] **Step 1: Push migration to staging**

From the repo root, run:

```bash
pnpm dlx supabase db push
```

If prompted for a password, check `supabase/.env` for `SUPABASE_DB_PASSWORD`. See the `db-push` skill if the push fails.

Expected output: migration `124_rename_is_platform_admin_to_is_site_admin` applied successfully, no errors.

- [ ] **Step 2: Verify is_site_admin() works**

In the Supabase SQL editor (project `sojmvhhwsjxmfistvzbe`), logged in as `beezley@cox.net`:

```sql
SELECT is_site_admin();
```

Expected: `true`

- [ ] **Step 3: Verify wrapper still works**

```sql
SELECT is_platform_admin();
```

Expected: `true`

- [ ] **Step 4: Verify platform_admin role is gone** [EXPANDED]

```sql
SELECT * FROM roles WHERE name = 'platform_admin';
```

Expected: 0 rows returned.

- [ ] **Step 4b: Verify no user lost access due to the DELETE** [ADDED]

```sql
SELECT count(*) FROM public.user_roles
WHERE role_id IN (SELECT id FROM public.roles WHERE name = 'platform_admin');
```

Expected: 0 rows (the subquery returns no role IDs because `platform_admin` was just deleted, so the count is 0). If this returns > 0 before you run the migration, it means real admins had `platform_admin` role and would have lost access. Recovery in that case: `INSERT INTO user_roles (user_id, role_id, ...) SELECT ur.user_id, (SELECT id FROM roles WHERE name = 'site_admin'), ... FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.name = 'platform_admin'` — then re-run the migration.

- [ ] **Step 5: Verify admin pages still load**

Log in to the staging app (`myk9-platform-myk9show.vercel.app`) as `beezley@cox.net` and confirm these pages load without errors:

- User Management (`/admin/users`)
- Admin dashboard (`/admin`)

- [ ] **Step 6: Run existing RBAC tests**

```bash
cd apps/myk9show && npx vitest run src/test/rbac/rbac-simple.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit smoke test completion (no code change — just update TO-DOS.md)**

Mark the "Remove duplicate admin role" todo as done in `TO-DOS.md`, then commit:

```bash
git add TO-DOS.md
git commit -m "docs: mark consolidate admin role todo as done"
```
