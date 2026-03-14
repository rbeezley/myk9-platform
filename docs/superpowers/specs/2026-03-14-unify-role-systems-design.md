# Unify Role Systems — Deprecate `people.roles` in Favor of `user_roles`

**Date:** 2026-03-14
**Status:** Approved

## Problem

Two disconnected role systems exist:

1. **Legacy:** `people.roles` — a text array column. Written during user creation, read by UI badges and as a fallback in AuthContext.
2. **Modern:** `user_roles` table — full RBAC with scoped roles, soft-deactivation (`is_active`), expiration, and 57 granular permissions via RPC functions.

They are not synced. Users can have RBAC roles but show no badges, or vice versa. Admin user creation writes to `people.roles` only. Role management pages write to `user_roles` only.

## Decision

Remove `people.roles` entirely in one shot (pre-production, no real user data to protect). Migrate all role logic to `user_roles`.

## Final Roles

Seven roles in the `roles` table:

| Role         | Description                                                   |
| ------------ | ------------------------------------------------------------- |
| `site_admin` | Full platform access                                          |
| `secretary`  | Show secretary; manages shows, entries, registrations         |
| `judge`      | Views assignments, submits results                            |
| `club_admin` | Manages their club's profile, shows, members (scoped to club) |
| `chairman`   | Named role for future use; minimal platform permissions       |
| `steward`    | Ring steward at shows                                         |
| `exhibitor`  | Default role; enters shows                                    |

**Removed roles:** `trial_secretary`, `platform_admin`, `handler`.

## Role Priority Hierarchy

For determining which dashboard a multi-role user lands on:

```
site_admin > secretary > judge > club_admin > chairman > steward > exhibitor
```

Permissions remain additive (union of all active roles). Priority only affects default UI routing.

## Design

### 1. Database Migration

A single migration that:

1. **Seeds missing roles** — add `chairman` and `steward` to the `roles` table.
2. **Removes unused roles** — delete `trial_secretary` and `platform_admin` from `roles` (CASCADE removes their `role_permissions` and `user_roles` rows).
3. **Migrates existing data** — for each `people` row with a non-empty `roles` array, insert corresponding `user_roles` rows. Skip duplicates. Map `admin` → `site_admin`. Ignore roles not in the final list (e.g., `handler`).
4. **Drops the column** — `ALTER TABLE people DROP COLUMN roles`.
5. **Updates RPC functions** — `get_admin_user_list()` and `custom_access_token_hook()` currently reference `people.roles` for admin checks. Rewrite to join `user_roles` + `roles` instead.

### 2. Auth & Signup Flows

**AuthContext simplification:**

- Remove the 3-priority fallback chain (database RBAC → legacy RBAC → `people.roles` → default exhibitor).
- Replace with: database RBAC → default exhibitor.
- Add a `ROLE_PRIORITY` constant defining the hierarchy.
- Primary role determined by highest-priority active role from `user_roles`.

**Email signup (SignUpPage / useAuth):**

- Remove `roles: ['exhibitor']` from the `people` insert.
- After creating the `people` record, insert a `user_roles` row linking the user to the `exhibitor` role.

**Google OAuth (useAuth.createOAuthPeopleRecord):**

- Same — remove `roles` from `people` insert, add `user_roles` insert for `exhibitor`.

**Admin user creation (CreateUserDialog):**

- Replace hardcoded role checkboxes with a dynamic list fetched from the `roles` table.
- On submit, insert `user_roles` rows for each selected role instead of setting `people.roles`.

### 3. UI & Badge Display

**PeopleTableView role badges:**

- Change from reading `person.roles` text array to querying role data from `user_roles` + `roles`.
- The user list query (RPC or Supabase select) should include role data via join to avoid N+1 queries.

**User queries:**

- `getUsersByRole()` — rewrite from `.contains('roles', [role])` on `people` to a filter via `user_roles` join.
- Remove `roles` from all `people` select/insert/update queries.
- Remove role-related mapping in `userMappers.ts`.

**Edge functions:**

- `admin-delete-user` — remove `people.roles` fallback check. Rely solely on `user_roles` + `is_active` check (already exists).
- `ImpersonationService` — switch from `people.roles` read to `user_roles` query.

### 4. Type Cleanup

**Database types (database.types.ts):**

- Regenerate Supabase types after migration — `roles` column disappears from `people` Row/Insert/Update automatically.

**App types:**

- `user-types.ts` — remove the `UserRole` type alias (`'exhibitor' | 'handler' | 'judge' | ...`). Role values come from the `roles` table now.
- `auth-types.ts` — keep the `UserRole` enum for priority hierarchy logic. Align with the 7 roles: remove `handler`, add `chairman` and `steward`.
- Remove any `roles?: string[]` fields from user interfaces/DTOs.

**Tests:**

- Update tests that mock `people.roles` to use `user_roles` instead.
- Update test factories/fixtures that set `roles` on people records.

## Files Affected

### Database

- New migration (066 or next): seed roles, migrate data, drop column, update RPCs
- `supabase/migrations/063_add_people_status_and_auth_hook.sql` — RPCs updated via new migration

### Auth & Signup

- `apps/myk9show/src/context/AuthContext.tsx` — simplify fallback chain, add priority logic
- `apps/myk9show/src/hooks/useAuth.ts` — signup flows write to `user_roles`
- `apps/myk9show/src/pages/SignUpPage.tsx` — remove `roles` from people insert

### Admin

- `apps/myk9show/src/components/admin/users/CreateUserDialog.tsx` — dynamic roles, write to `user_roles`

### UI

- `apps/myk9show/src/components/users/browse/PeopleTableView.tsx` — badges from `user_roles`
- `apps/myk9show/src/services/database/queries/userQueries.ts` — remove `roles` references
- `apps/myk9show/src/services/mappers/userMappers.ts` — remove role mapping
- `apps/myk9show/src/hooks/queries/useUsersQuery.ts` — remove role mapping

### Edge Functions

- `supabase/functions/admin-delete-user/index.ts` — remove `people.roles` fallback
- `apps/myk9show/src/services/ImpersonationService.ts` — switch to `user_roles`

### Types

- `packages/supabase/src/types/database.types.ts` — regenerate
- `apps/myk9show/src/types/auth-types.ts` — update UserRole enum
- `apps/myk9show/src/types/user-types.ts` — remove UserRole type alias

### Tests

- Any test files mocking `people.roles` or user fixtures with `roles` array
