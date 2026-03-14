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

**Removed roles:** `trial_secretary`, `platform_admin`, `handler`, `gate_steward`.

**Mapped roles:** `admin` → `site_admin`.

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
3. **Migrates existing data** — for each `people` row with a non-empty `roles` array, insert corresponding `user_roles` rows. Skip duplicates. Map `admin` → `site_admin`. Ignore roles not in the final list (e.g., `handler`, `gate_steward`).
4. **Drops the column** — `ALTER TABLE people DROP COLUMN roles`.
5. **Updates `get_admin_user_list()` RPC** — currently returns `p.roles` in its SELECT and checks `'site_admin' = ANY(people.roles)`. Rewrite to join `user_roles` + `roles` instead, returning an aggregated role array via subquery. Update admin authorization check to use `user_roles` join.

Note: `custom_access_token_hook()` only checks `people.status`, not `people.roles` — no changes needed there.

### 2. Auth & Signup Flows

**AuthContext simplification:**

- Remove the 4-priority fallback chain:
  - Priority 1: Database RBAC via `rbacService` (keep)
  - Priority 2: Legacy RBAC via `useUserRoleNames` hook (remove — redundant with Priority 1)
  - Priority 3: `people.roles` column (remove)
  - Priority 4: Default exhibitor (keep as fallback)
- Simplify to: database RBAC → default exhibitor.
- Add a `ROLE_PRIORITY` constant defining the hierarchy.
- Primary role determined by highest-priority active role from `user_roles`.

**Email signup (`useAuth.ts`):**

- Remove `roles: ['exhibitor']` from the `people` insert.
- After creating the `people` record, look up the `exhibitor` role UUID from the `roles` table and insert a `user_roles` row.
- If the `user_roles` insert fails, log the error but don't block signup — the default-exhibitor fallback in AuthContext handles it.

**Google OAuth (`useAuth.createOAuthPeopleRecord`):**

- Same — remove `roles` from `people` insert, add `user_roles` insert for `exhibitor` with the same lookup + fallback pattern.

**Admin user creation (`CreateUserDialog`):**

- Replace hardcoded role checkboxes with a dynamic list fetched from the `roles` table.
- On submit, insert `user_roles` rows for each selected role instead of setting `people.roles`.

### 3. UI & Badge Display

**Two kinds of `roles` in the codebase:**

1. **AuthContext roles** (`userWithRoles.roles`) — already populated from RBAC system via `rbacService`. These continue working after migration. Files using this pattern (e.g., `permissionValidation.ts`, `AnnouncementsCard.tsx`, `NotificationCenter.tsx`) need no changes.

2. **People/User model roles** (`person.roles` / `user.roles`) — come from the `people.roles` column. These break after migration and must be updated.

**Approach for User model:** Keep a `roles` field on the `User` interface, but populate it via a join to `user_roles` + `roles` instead of from the `people.roles` column. This minimizes UI component changes — badge rendering code stays the same, only the data source changes.

**User list queries:**

- `get_admin_user_list()` RPC — return role names via subquery/join (handled in migration).
- `getUsersByRole()` — rewrite from `.contains('roles', [role])` to a filter via `user_roles` join.
- Remove `roles` from all `people` insert/update queries.
- Remove role-related mapping in `userMappers.ts`.

**Edge functions:**

- `admin-delete-user` — remove `people.roles` fallback check. Rely solely on `user_roles` + `is_active` check (already exists).
- `ImpersonationService` — switch from `people.roles` read to `user_roles` query.

**Note on `PersonnelManager`:** This component uses `person.roles` as an array of objects with `{ type, level, elements }` shape — a different data model entirely (show personnel assignments, not user roles). Not affected by this migration.

### 4. Type Cleanup

**Database types:**

- Regenerate Supabase types after migration — `roles` column disappears from `people` Row/Insert/Update automatically.
- Both `packages/supabase/src/types/database.types.ts` and `packages/supabase/src/database.types.ts` need regeneration.

**App types:**

- `user-types.ts` — remove the `UserRole` type alias (`'exhibitor' | 'handler' | 'judge' | ...`). Update all imports to use the `UserRole` enum from `auth-types.ts` (e.g., `CreateUserDialog.tsx` imports `UserRole as UserRoleType` from `user-types.ts`).
- `auth-types.ts` — update the `UserRole` enum to match the 7 final roles. Remove: `HANDLER`, `GATE_STEWARD`, `ADMIN`. Add: `CHAIRMAN`, `STEWARD` (if not present). Remove corresponding entries from `DEFAULT_ROLE_PERMISSIONS`.
- Remove any `roles?: string[]` fields from user insert/update interfaces. Keep `roles` on read interfaces (populated via join).

**Tests:**

- `apps/myk9show/src/test/security/PermissionValidation.test.ts` — sets `.roles` arrays directly
- `apps/myk9show/src/test/quick-user-integration.test.ts`
- `apps/myk9show/src/test/store/peopleStore.test.tsx`
- `apps/myk9show/src/test/services/database/queries/userQueries.test.ts`
- `apps/myk9show/src/test/pages/SignUpPage.test.tsx`
- Any other test files mocking `people.roles` or user fixtures with `roles` array

**Acceptance criteria for migration:** After running, every `people` row that had a non-empty `roles` array should have at least one corresponding `user_roles` row.

## Files Affected

### Database

- New migration (066 or next): seed roles, migrate data, drop column, update RPCs

### Auth & Signup

- `apps/myk9show/src/context/AuthContext.tsx` — simplify fallback chain, add priority logic
- `apps/myk9show/src/hooks/useAuth.ts` — signup flows write to `user_roles`

### Admin

- `apps/myk9show/src/components/admin/users/CreateUserDialog.tsx` — dynamic roles, write to `user_roles`

### UI — People/User model roles (must update)

- `apps/myk9show/src/components/users/browse/PeopleTableView.tsx` — badges from `user_roles`
- `apps/myk9show/src/components/users/browse/PeopleListView.tsx` — badges from `user_roles`
- `apps/myk9show/src/components/users/browse/PeopleGridView.tsx` — badges from `user_roles`
- `apps/myk9show/src/components/users/UserTable.tsx` — sorts by roles
- `apps/myk9show/src/components/users/UserDetails/UserDetailsView.tsx` — reads `person.roles`
- `apps/myk9show/src/components/users/UserDetails/HeroProfileCard.tsx` — displays role badges
- `apps/myk9show/src/components/users/UserDetails/userDetailsTypes.ts` — maps `person.roles`
- `apps/myk9show/src/components/admin/users/UserDetailsDialog.tsx` — reads `user.roles`
- `apps/myk9show/src/components/admin/users/UserTable/index.tsx` — sorts by `roles[0]`
- `apps/myk9show/src/components/admin/PermissionTestChecklist.tsx` — reads `userWithRoles.roles`
- `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.sections.tsx` — displays role badges
- `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.helpers.ts` — filters by `person.roles?.includes('judge')`
- `apps/myk9show/src/components/panels/entities/ClubCreationPanel.tsx` — displays role badges
- `apps/myk9show/src/components/panels/entities/JudgeCreationPanel/index.tsx` — checks `person.roles?.includes('judge')`
- `apps/myk9show/src/services/database/queries/userQueries.ts` — remove `roles` references
- `apps/myk9show/src/services/mappers/userMappers.ts` — remove role mapping
- `apps/myk9show/src/hooks/queries/useUsersQuery.ts` — remove role mapping
- `apps/myk9show/src/hooks/queries/useUsersDatabase.ts` — uses `getUsersByRole`
- `apps/myk9show/src/hooks/useUsers.ts` — writes `roles: person.roles`
- `apps/myk9show/src/hooks/useRegistrationPermissions.ts` — reads roles
- `apps/myk9show/src/store/userStore.ts` — maps `userData.roles`
- `apps/myk9show/src/utils/unified-shows-config.ts` — reads `user.roles`
- `apps/myk9show/src/utils/show-management-tracking.ts` — reads `user.roles`
- `apps/myk9show/src/utils/show-relationships.ts` — reads `user.roles`

### Edge Functions

- `supabase/functions/admin-delete-user/index.ts` — remove `people.roles` fallback
- `apps/myk9show/src/services/ImpersonationService.ts` — switch to `user_roles`

### Types

- `packages/supabase/src/types/database.types.ts` — regenerate
- `packages/supabase/src/database.types.ts` — regenerate
- `apps/myk9show/src/types/auth-types.ts` — update UserRole enum
- `apps/myk9show/src/types/user-types.ts` — remove UserRole type alias, update imports

### Not Affected

- `apps/myk9show/src/components/templates/secretary/PersonnelManager.tsx` — uses a different `roles` shape (show personnel, not user roles)
- Files reading `userWithRoles.roles` from AuthContext — already RBAC-driven
