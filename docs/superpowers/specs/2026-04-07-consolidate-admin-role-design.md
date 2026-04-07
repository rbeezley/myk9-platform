# Consolidate site_admin / platform_admin Into One Role

**Date:** 2026-04-07
**Status:** Approved

## Problem

Two names exist for the same concept: `platform_admin` (legacy) and `site_admin` (modern). Migration 047 papered over the split by making `is_platform_admin()` accept both role names. The frontend uses `site_admin` exclusively. The migration history has 47 files referencing `platform_admin` — mostly immutable historical artifacts — and 86 live RLS policies that call `is_platform_admin()`.

The naming confusion causes new code to inconsistently pick one name or the other, and the dual-name shim in `is_platform_admin()` is a silent source of future bugs.

## Goals

- Establish `site_admin` as the single canonical role name
- Establish `is_site_admin()` as the canonical RLS helper function for new code
- Remove the `'platform_admin'` fallback from the auth check
- Keep backward compatibility for the 86 existing RLS policies (no policy recreation)

## Decision

**Wrapper approach** over full policy recreation. The 86 policies are not broken — they work correctly. Recreating all 86 to eliminate a deprecated function name introduces high surface area for subtle policy bugs. Instead:

- Create `is_site_admin()` as the real implementation
- Update `is_platform_admin()` to a thin deprecated wrapper calling `is_site_admin()`
- All existing policies continue to work unchanged
- All new code uses `is_site_admin()`

## Migration: `124_rename_is_platform_admin_to_is_site_admin.sql`

### Step 1 — Create canonical function

```sql
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
```

Key change from `is_platform_admin()`: checks only `'site_admin'`, not `IN ('platform_admin', 'site_admin')`.

### Step 2 — Update deprecated wrapper

```sql
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  -- DEPRECATED: Use is_site_admin() for all new code.
  SELECT public.is_site_admin();
$$;

COMMENT ON FUNCTION public.is_platform_admin() IS
  'DEPRECATED — delegates to is_site_admin(). Use is_site_admin() in all new RLS policies.';
```

### Step 3 — Safety cleanup

Remove any lingering `platform_admin` role and orphaned `user_roles` rows (idempotent):

```sql
DELETE FROM public.user_roles
WHERE role_id IN (SELECT id FROM public.roles WHERE name = 'platform_admin');

DELETE FROM public.roles WHERE name = 'platform_admin';
```

Migration 066 already performed this cleanup. These statements are defensive no-ops if that migration ran correctly.

## Frontend

No changes needed. The frontend already uses `site_admin` exclusively:

- `UserRole.SITE_ADMIN = 'site_admin'` in `auth-types.ts`
- `ROLES.SITE_ADMIN: 'site_admin'` in `rbacService.ts`
- `hasRole('site_admin')` in `useRBAC.ts`

The frontend checks role name strings, not DB function calls. The migration doesn't change the `site_admin` role name.

## Convention Going Forward

All new RLS policies must use `is_site_admin()`, not `is_platform_admin()`. The deprecated wrapper will be removed in a future cleanup migration once all 86 existing policies have naturally cycled through rewrites.

## Testing

**No unit tests required** — no new TS functions, hooks, or components.

**Migration idempotency:** `supabase db push` on a clean DB must complete without errors. The `DELETE FROM roles` is safe even if the row doesn't exist.

**Staging smoke test after `supabase db push`:**

1. Log in as `site_admin` user (`beezley@cox.net`)
2. Confirm admin-only pages (User Management, Admin dashboard) still load
3. From Supabase SQL editor: `SELECT is_site_admin()` → `true`
4. From Supabase SQL editor: `SELECT is_platform_admin()` → `true` (wrapper still works)
5. From Supabase SQL editor: `SELECT * FROM roles WHERE name = 'platform_admin'` → 0 rows

**Regression:** The existing RBAC test suite (`rbac-simple.test.ts`) exercises `site_admin` role checks and will catch any regression in auth context.
