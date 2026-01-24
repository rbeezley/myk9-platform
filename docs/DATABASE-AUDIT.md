# Database Audit Report

**Audited against:** supabase-postgres-best-practices v2.0.0
**Date:** January 2026
**Project:** myk9-platform

---

## Summary

| Category | Score | Issues |
|----------|-------|--------|
| Query Performance | 8/10 | Missing composite indexes |
| Connection Management | 9/10 | Handled by Supabase |
| Security & RLS | 6/10 | Performance issues in policies |
| Schema Design | 9/10 | Good practices overall |
| Migrations | 8/10 | No rollback documentation |
| Supabase Patterns | 9/10 | Good auth trigger, storage policies |

---

## Critical Issues (Fix Now)

### 1. RLS Policy Performance - Function Called Per Row

**Location:** [006_rls_policies.sql](../supabase/migrations/006_rls_policies.sql)

**Issue:** The `has_role()` function is used in policies without subquery wrapping, causing it to be evaluated for every row.

```sql
-- CURRENT (slow - has_role called per row):
CREATE POLICY "admins_select_all_profiles" ON exhibitor_profiles
  FOR SELECT USING (has_role('platform_admin'));

-- RECOMMENDED (cached - called once):
CREATE POLICY "admins_select_all_profiles" ON exhibitor_profiles
  FOR SELECT USING ((SELECT has_role('platform_admin')));
```

**Affected policies:** ~20+ policies using `has_role()` without subquery wrapper

**Fix priority:** HIGH - Affects all authenticated queries

---

### 2. Missing `FORCE ROW LEVEL SECURITY` on Tables

**Location:** [006_rls_policies.sql](../supabase/migrations/006_rls_policies.sql)

**Issue:** Tables have `ENABLE ROW LEVEL SECURITY` but not `FORCE ROW LEVEL SECURITY`. This means the table owner (postgres) can bypass RLS.

```sql
-- CURRENT:
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

-- RECOMMENDED (for sensitive tables):
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubs FORCE ROW LEVEL SECURITY;
```

**Affected tables:** All 56 tables with RLS enabled

**Note:** Only critical for tables with sensitive data accessed by service role functions that should still respect RLS.

---

### 3. Overly Permissive RLS Policies

**Location:** [006_rls_policies.sql:103-146](../supabase/migrations/006_rls_policies.sql)

**Issue:** Core entities (clubs, people, dogs, shows) allow ANY authenticated user to INSERT/UPDATE/DELETE. This is a security risk.

```sql
-- CURRENT (too permissive):
CREATE POLICY "clubs_insert" ON clubs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clubs_update" ON clubs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "clubs_delete" ON clubs FOR DELETE TO authenticated USING (true);

-- RECOMMENDED (role-based):
CREATE POLICY "clubs_insert" ON clubs FOR INSERT
  WITH CHECK ((SELECT has_role('club_admin')) OR (SELECT has_role('platform_admin')));
```

**Affected tables:** clubs, people, dogs, dog_registrations, shows, trials, classes, entries

**Fix priority:** HIGH - Any authenticated user can modify critical data

---

## High Priority Issues

### 4. Missing Composite Indexes for Common Queries

**Issue:** Several query patterns would benefit from composite indexes.

```sql
-- Entries by class + status (common scoring query)
CREATE INDEX entries_class_status_idx ON entries(class_id, entry_status);

-- Entries by show + status (show management)
CREATE INDEX entries_show_status_idx ON entries(show_id, entry_status);

-- Waitlist by class + status (already has partial index, but full version useful)
CREATE INDEX waitlist_class_status_idx ON waitlist_entries(class_id, status);

-- People by license_key + name (multi-tenant search)
CREATE INDEX people_license_name_idx ON people(license_key, last_name, first_name);
```

---

### 5. RLS Policies Using Subqueries Without Index Support

**Location:** [009_online_entry_system.sql:410-480](../supabase/migrations/009_online_entry_system.sql)

**Issue:** Entry cart policies use nested subqueries joining multiple tables.

```sql
-- CURRENT (multiple joins, potentially slow):
CREATE POLICY "users_select_own_cart_items" ON entry_cart_items
  FOR SELECT USING (
    cart_id IN (
      SELECT ec.id FROM entry_carts ec
      JOIN exhibitor_profiles ep ON ep.id = ec.exhibitor_id
      WHERE ep.auth_user_id = auth.uid()
    )
  );
```

**Recommendation:** Create a security definer helper function:

```sql
CREATE OR REPLACE FUNCTION get_user_cart_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT ec.id FROM entry_carts ec
  JOIN exhibitor_profiles ep ON ep.id = ec.exhibitor_id
  WHERE ep.auth_user_id = (SELECT auth.uid())
$$;

-- Simpler policy:
CREATE POLICY "users_select_own_cart_items" ON entry_cart_items
  FOR SELECT USING (cart_id IN (SELECT get_user_cart_ids()));
```

---

### 6. `get_license_key()` Function Missing `STABLE` Marker

**Location:** [006_rls_policies.sql:86-96](../supabase/migrations/006_rls_policies.sql)

**Issue:** Function is called in RLS but without `STABLE` marker, preventing query optimization.

```sql
-- CURRENT:
CREATE OR REPLACE FUNCTION get_license_key()
RETURNS TEXT AS $$
...
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RECOMMENDED:
CREATE OR REPLACE FUNCTION get_license_key()
RETURNS TEXT AS $$
...
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

---

## Medium Priority Issues

### 7. No `search_path` Set on Security Definer Functions

**Location:** Multiple migrations

**Issue:** Security definer functions should set `search_path = ''` to prevent search path injection.

```sql
-- CURRENT:
CREATE OR REPLACE FUNCTION public.has_role(role_name TEXT, scope_club_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
...
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RECOMMENDED:
CREATE OR REPLACE FUNCTION public.has_role(role_name TEXT, scope_club_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
...
$$;
```

**Affected functions:**
- `get_license_key()`
- `has_role()`
- `handle_new_user()`
- `get_user_permissions()`
- `check_class_availability()`
- `add_to_waitlist()`

---

### 8. Missing Indexes on Soft Delete Columns

**Location:** Various tables with `deleted_at`

**Issue:** Tables with soft delete have `deleted_at` column but no partial index for active records.

```sql
-- Recommended partial indexes for common queries:
CREATE INDEX entries_active_class_idx ON entries(class_id) WHERE deleted_at IS NULL;
CREATE INDEX shows_active_club_idx ON shows(club_id) WHERE deleted_at IS NULL;
CREATE INDEX dogs_active_owner_idx ON dogs(owner_id) WHERE deleted_at IS NULL;
```

---

### 9. No Migration Rollback Documentation

**Issue:** Migrations don't include rollback procedures.

**Recommendation:** Add rollback comments to each migration:

```sql
-- ROLLBACK:
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS public.handle_new_user();
-- DROP TABLE IF EXISTS exhibitor_profiles;
-- etc.
```

---

## Positive Findings

### Auth Trigger Implementation

**Location:** [009_online_entry_system.sql:298-346](../supabase/migrations/009_online_entry_system.sql)

The auth trigger follows best practices:
- Uses `SECURITY DEFINER` for elevated privileges
- Creates person, exhibitor_profile, and role assignment atomically
- Handles metadata from signup form

### Storage Policies

**Location:** [013_create_images_storage_bucket.sql](../supabase/migrations/013_create_images_storage_bucket.sql)

Storage policies are well-structured:
- Folder-based isolation using `auth.uid()`
- Separate policies for INSERT, UPDATE, DELETE
- Public read access correctly configured
- File size and MIME type limits set

### Advisory Locks for Waitlist

**Location:** [009_online_entry_system.sql:263-288](../supabase/migrations/009_online_entry_system.sql)

Uses `pg_advisory_xact_lock` correctly to prevent race conditions when assigning waitlist positions.

### Foreign Key Indexes

All foreign key columns have corresponding indexes, preventing slow CASCADE operations.

### Data Types

Using appropriate types:
- `UUID` for primary keys
- `TIMESTAMPTZ` for timestamps (with timezone)
- `NUMERIC` for decimal values (entry fees)
- `TEXT[]` for arrays (roles)

---

## Recommended Actions

### Immediate (This Week) - COMPLETED

1. ~~**Fix RLS policy performance**~~ - Done in Migration 015
2. ~~**Restrict core entity policies**~~ - Done in Migration 016
3. ~~**Add `STABLE` to `get_license_key()`**~~ - Done in Migration 015

### Short Term (This Month) - COMPLETED

4. ~~**Add composite indexes**~~ - Done in Migration 015
5. ~~**Add `SET search_path = ''`**~~ - Done in Migration 015
6. ~~**Create helper functions**~~ - Done in Migration 016 (`is_platform_admin()`, `is_club_admin()`, etc.)

### Long Term

7. ~~**Add partial indexes**~~ - Done in Migration 015
8. **Document rollback procedures** for each migration
9. **Consider `FORCE ROW LEVEL SECURITY`** for sensitive tables

---

## Migrations Created

### Migration 015: RLS Performance Fixes
- Added `STABLE` and `SET search_path = ''` to all security definer functions
- Added composite indexes for common queries
- Added partial indexes for soft-deleted records

### Migration 016: Fix Permissive RLS Policies
- Created cached helper functions: `is_platform_admin()`, `is_club_admin()`, `is_trial_secretary()`, `get_my_person_id()`
- Replaced "any authenticated user can do anything" policies with role-based access
- Proper ownership checks for dogs, people, entries

---

## Original Migration Recommendation (For Reference)

```sql
-- =============================================================================
-- Migration 015: RLS Performance and Security Fixes
-- =============================================================================

-- Fix 1: Add STABLE to get_license_key
CREATE OR REPLACE FUNCTION get_license_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN COALESCE(
    current_setting('request.headers', true)::json->>'x-license-key',
    current_setting('app.license_key', true),
    NULL
  );
END;
$$;

-- Fix 2: Add search_path to has_role
CREATE OR REPLACE FUNCTION public.has_role(role_name TEXT, scope_club_id UUID DEFAULT NULL)
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
      AND r.name = role_name
      AND (scope_club_id IS NULL OR ur.club_id = scope_club_id OR ur.club_id IS NULL)
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;

-- Fix 3: Composite indexes
CREATE INDEX IF NOT EXISTS entries_class_status_idx ON entries(class_id, entry_status);
CREATE INDEX IF NOT EXISTS entries_show_status_idx ON entries(show_id, entry_status);

-- Fix 4: Partial indexes for soft delete
CREATE INDEX IF NOT EXISTS entries_active_class_idx ON entries(class_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS shows_active_club_idx ON shows(club_id) WHERE deleted_at IS NULL;
```

---

*Generated using supabase-postgres-best-practices v2.0.0*
