# Harden Volunteer Scheduling RLS Policies

**Date:** 2026-03-31
**Status:** Design approved

## Problem

Migration 095 added RLS write policies for volunteer tables (`volunteers`, `volunteer_class_assignments`, `volunteer_general_assignments`). These policies have four issues:

1. **`auth.uid()` identity bug** — Policies compare `user_roles.user_id = auth.uid()`, but `user_roles.user_id` references `people(id)`, not `auth.users(id)`. All existing helper functions correctly join through `people.auth_user_id`. The current policies never match any user — volunteer write operations are silently blocked by RLS.

2. **No show scoping** — A secretary assigned to Show A can manage volunteers for Show B. Fine for single-club usage but breaks multi-tenancy.

3. **6x duplication** — The same `EXISTS (SELECT 1 FROM user_roles JOIN roles ...)` subquery is copied six times (USING + WITH CHECK for each of three tables). The `WITH CHECK` clauses are redundant — Postgres uses `USING` when `WITH CHECK` is omitted for `FOR ALL` policies.

4. **Missing `expires_at` check** — All existing helper functions check `(ur.expires_at IS NULL OR ur.expires_at > NOW())`. Migration 095 omits this, allowing expired role assignments to grant access.

5. **Missing `club_admin` access** — Club admins should be able to manage volunteers for their club's shows but are not included in the current check.

## Solution: Reuse `can_manage_show()`

`can_manage_show(show_id)` (migration 038) already exists and checks:

- `is_club_admin(club_id)` — club-scoped
- `is_trial_secretary(club_id)` — club-scoped
- `is_platform_admin()` — global

All three sub-functions correctly join through `people.auth_user_id`, check `is_active`, and check `expires_at`. The function resolves `show_id → club_id` via the `shows` table.

### New helper function

```sql
volunteer_show_id(vol_id UUID) RETURNS UUID
-- SECURITY DEFINER STABLE
-- Returns volunteers.show_id for a given volunteer ID.
-- Needed because volunteer_class_assignments has no show_id column.
```

### Replacement policies

| Table                           | Policy    | Body                                                       |
| ------------------------------- | --------- | ---------------------------------------------------------- |
| `volunteers`                    | `FOR ALL` | `USING (can_manage_show(show_id))`                         |
| `volunteer_class_assignments`   | `FOR ALL` | `USING (can_manage_show(volunteer_show_id(volunteer_id)))` |
| `volunteer_general_assignments` | `FOR ALL` | `USING (can_manage_show(show_id))`                         |

No `WITH CHECK` clause — Postgres falls back to `USING` for `FOR ALL` policies when `WITH CHECK` is omitted.

Three existing SELECT policies (authenticated users can view) remain unchanged.

### Edge case: `volunteers.show_id IS NULL`

Migration 095 added `show_id` as nullable for legacy myK9Q rows. When `show_id` is NULL, `can_manage_show(NULL)` returns false — only `is_platform_admin()` passes. This is correct: unscoped volunteer records should not be editable by show-scoped secretaries.

## Migration

New file: `supabase/migrations/100_harden_volunteer_rls.sql`

1. Create `volunteer_show_id()` helper function
2. Drop three existing write policies
3. Create three replacement policies using `can_manage_show()`

## Testing

- Verify `volunteer_show_id()` returns correct `show_id` for a volunteer
- Verify secretary for Show A **can** manage volunteers for Show A
- Verify secretary for Show A **cannot** manage volunteers for Show B
- Verify club admin **can** manage volunteers for their club's shows
- Verify site admin **can** manage volunteers globally
- Verify expired roles are rejected
- Verify deactivated roles are rejected
- Verify NULL `show_id` volunteers are only editable by platform admin

## Files changed

- `supabase/migrations/100_harden_volunteer_rls.sql` (new)
- `TO-DOS.md` (mark items 10+11 complete)
