# Unify Role Systems Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy `people.roles` text array column and migrate all role logic to the `user_roles` RBAC table, establishing a single source of truth for user roles.

**Architecture:** A database migration seeds missing roles, migrates existing `people.roles` data into `user_roles` rows, drops the column, and updates RPC functions. App code then switches all role reads/writes from `people.roles` to `user_roles` joins. The `User` interface keeps a `roles` field but populated via join instead of column.

**Tech Stack:** Supabase (Postgres migrations, RPC functions), TypeScript, React, Zustand, React Query, Vitest

**Spec:** `docs/superpowers/specs/2026-03-14-unify-role-systems-design.md`

---

## Chunk 1: Database Migration & Types

### Task 1: Write Database Migration

**Files:**

- Create: `supabase/migrations/066_unify_role_systems.sql`

This migration does everything in one transaction: seeds missing roles, removes unused roles, migrates data, drops the column, and updates the `get_admin_user_list()` RPC.

- [ ] **Step 1: Create the migration file**

```sql
-- 066_unify_role_systems.sql
-- Unify role systems: migrate people.roles → user_roles, then drop column

BEGIN;

-- 1. Seed missing roles
INSERT INTO roles (name, description, is_system)
VALUES
  ('chairman', 'Show chairman; named role for future use', TRUE),
  ('steward', 'Ring steward at shows', TRUE)
ON CONFLICT (name) DO NOTHING;

-- 2. Remove unused roles (CASCADE removes role_permissions + user_roles rows)
DELETE FROM roles WHERE name IN ('trial_secretary', 'platform_admin');

-- 3. Migrate existing people.roles data into user_roles
-- Map 'admin' → 'site_admin', skip unknown roles (handler, gate_steward, etc.)
-- Note: ON CONFLICT won't work for NULL club_id/show_id (NULL != NULL in Postgres),
-- so we use WHERE NOT EXISTS to prevent duplicates for global (unscoped) roles.
INSERT INTO user_roles (user_id, role_id, granted_at, is_active)
SELECT
  p.id,
  r.id,
  NOW(),
  TRUE
FROM people p,
  LATERAL unnest(p.roles) AS legacy_role
  JOIN roles r ON r.name = (
    CASE
      WHEN legacy_role = 'admin' THEN 'site_admin'
      ELSE legacy_role
    END
  )
WHERE p.roles IS NOT NULL
  AND array_length(p.roles, 1) > 0
  AND (
    CASE
      WHEN legacy_role = 'admin' THEN 'site_admin'
      ELSE legacy_role
    END
  ) IN ('site_admin', 'secretary', 'judge', 'club_admin', 'chairman', 'steward', 'exhibitor')
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = p.id
      AND ur.role_id = r.id
      AND ur.club_id IS NULL
      AND ur.show_id IS NULL
  );

-- 4. Drop the column
ALTER TABLE people DROP COLUMN roles;

-- 5. Replace get_admin_user_list() RPC to use user_roles instead of people.roles
CREATE OR REPLACE FUNCTION get_admin_user_list(show_deleted BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  status TEXT,
  roles TEXT[],
  profile_image TEXT,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_id UUID;
  caller_person_id UUID;
  is_admin BOOLEAN := FALSE;
BEGIN
  -- Get the calling user's auth ID
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Find the caller's person record
  SELECT p.id INTO caller_person_id
  FROM people p
  WHERE p.auth_user_id = caller_id;

  IF caller_person_id IS NULL THEN
    RAISE EXCEPTION 'Person record not found';
  END IF;

  -- Check if caller is site_admin via user_roles
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles rl ON rl.id = ur.role_id
    WHERE ur.user_id = caller_person_id
      AND rl.name = 'site_admin'
      AND ur.is_active = TRUE
  ) INTO is_admin;

  IF NOT is_admin THEN
    RAISE EXCEPTION 'Unauthorized: requires site_admin role';
  END IF;

  -- Return user list with roles aggregated from user_roles
  RETURN QUERY
  SELECT
    p.id,
    p.first_name,
    p.last_name,
    p.email,
    p.phone,
    p.status,
    COALESCE(
      (SELECT array_agg(rl.name ORDER BY rl.name)
       FROM user_roles ur
       JOIN roles rl ON rl.id = ur.role_id
       WHERE ur.user_id = p.id AND ur.is_active = TRUE),
      '{}'::TEXT[]
    ) AS roles,
    p.profile_image,
    p.deleted_at,
    p.deleted_by,
    p.created_at,
    p.updated_at,
    au.last_sign_in_at
  FROM people p
  LEFT JOIN auth.users au ON au.id = p.auth_user_id
  WHERE (show_deleted OR p.deleted_at IS NULL)
  ORDER BY p.last_name, p.first_name;
END;
$$;

COMMIT;
```

- [ ] **Step 2: Verify migration syntax locally**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && supabase db push --dry-run`
Expected: No SQL syntax errors

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/066_unify_role_systems.sql
git commit -m "feat(db): migration to unify role systems — migrate people.roles to user_roles and drop column"
```

---

### Task 2: Update TypeScript Types — auth-types.ts

**Files:**

- Modify: `apps/myk9show/src/types/auth-types.ts:6-27` (UserRole enum + hierarchy)

- [ ] **Step 1: Update UserRole enum**

Replace lines 6-16:

```typescript
export enum UserRole {
  EXHIBITOR = 'exhibitor',
  HANDLER = 'handler',
  JUDGE = 'judge',
  SECRETARY = 'secretary',
  STEWARD = 'steward',
  GATE_STEWARD = 'gate_steward',
  CLUB_ADMIN = 'club_admin',
  SITE_ADMIN = 'site_admin',
  ADMIN = 'admin',
}
```

With:

```typescript
export enum UserRole {
  SITE_ADMIN = 'site_admin',
  SECRETARY = 'secretary',
  JUDGE = 'judge',
  CLUB_ADMIN = 'club_admin',
  CHAIRMAN = 'chairman',
  STEWARD = 'steward',
  EXHIBITOR = 'exhibitor',
}
```

- [ ] **Step 2: Update USER_ROLE_HIERARCHY**

Replace lines 22-27:

```typescript
export const USER_ROLE_HIERARCHY: readonly UserRole[] = [
  UserRole.SITE_ADMIN,
  UserRole.CLUB_ADMIN,
  UserRole.SECRETARY,
  UserRole.EXHIBITOR,
];
```

With:

```typescript
export const USER_ROLE_HIERARCHY: readonly UserRole[] = [
  UserRole.SITE_ADMIN,
  UserRole.SECRETARY,
  UserRole.JUDGE,
  UserRole.CLUB_ADMIN,
  UserRole.CHAIRMAN,
  UserRole.STEWARD,
  UserRole.EXHIBITOR,
];
```

- [ ] **Step 3: Remove HANDLER, GATE_STEWARD, ADMIN from DEFAULT_ROLE_PERMISSIONS**

In the `DEFAULT_ROLE_PERMISSIONS` map (around lines 165-249), remove entries for `UserRole.HANDLER`, `UserRole.GATE_STEWARD`, and `UserRole.ADMIN`. Add entries for `UserRole.CHAIRMAN` (minimal permissions — same as EXHIBITOR) and `UserRole.STEWARD` (if not already present with appropriate permissions).

- [ ] **Step 4: Update MOCK_USERS if they reference removed roles**

Check lines 254-446 for any mock users using `HANDLER`, `GATE_STEWARD`, or `ADMIN` roles. Update to use valid roles from the new enum.

- [ ] **Step 5: Run typecheck to find all broken imports**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: Type errors in files that reference removed enum members (HANDLER, GATE_STEWARD, ADMIN). Note these — they'll be fixed in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/types/auth-types.ts
git commit -m "feat(types): update UserRole enum to final 7 roles with correct hierarchy"
```

---

### Task 3: Update TypeScript Types — user-types.ts

**Files:**

- Modify: `apps/myk9show/src/types/user-types.ts:102-109`

- [ ] **Step 1: Remove the legacy UserRole type alias**

Delete lines 102-109:

```typescript
export type UserRole =
  | 'exhibitor'
  | 'handler'
  | 'judge'
  | 'secretary'
  | 'steward'
  | 'admin'
  | 'chairman';
```

- [ ] **Step 2: Add re-export of UserRole from auth-types**

Add at the top of the file (or near the removed type):

```typescript
// Re-export UserRole from auth-types for backward compatibility of imports
export { UserRole } from '@/types/auth-types';
```

This prevents import breakage across 10+ files that import `UserRole` from `user-types.ts`.

- [ ] **Step 3: Update the User interface**

If the `User` interface has a `roles` field typed as the old `UserRole[]`, update it to use the enum:

```typescript
roles?: UserRole[];
```

Keep this field — it will be populated via join to `user_roles`, not from a column.

- [ ] **Step 4: Remove `roles` from any insert/update interfaces**

If there are `UserInsert` or `UserUpdate` interfaces with a `roles` field, remove them. Roles are no longer written to the `people` table.

- [ ] **Step 5: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: Fewer type errors than before. Note remaining ones.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/types/user-types.ts
git commit -m "refactor(types): remove legacy UserRole type alias, re-export from auth-types"
```

---

### Task 4: Regenerate Supabase Database Types

**Files:**

- Modify: `packages/supabase/src/types/database.types.ts`
- Modify: `packages/supabase/src/database.types.ts`

Note: These files are auto-generated. The `roles` column will disappear from `people` types after regeneration.

- [ ] **Step 1: Push migration to remote database**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && supabase db push`
Expected: Migration applies successfully.

- [ ] **Step 2: Regenerate types**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && supabase gen types typescript --project-id sojmvhhwsjxmfistvzbe > packages/supabase/src/types/database.types.ts`

Then copy/sync to the other location if they differ:
Run: `cp packages/supabase/src/types/database.types.ts packages/supabase/src/database.types.ts`

- [ ] **Step 3: Verify `roles` is gone from people types**

Search the generated file for `roles` in the `people` table section. It should not appear as a column.

Run: Search for `roles: string\[\]` in the `people` Row/Insert/Update sections of the generated types file.
Expected: No matches in the `people` table types.

- [ ] **Step 4: Run typecheck to see remaining breakage**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: Type errors in files that read `dbUser.roles` from people queries. This is expected — we fix these in Chunk 2.

- [ ] **Step 5: Commit**

```bash
git add packages/supabase/src/types/database.types.ts packages/supabase/src/database.types.ts
git commit -m "chore: regenerate Supabase types after dropping people.roles column"
```

---

## Chunk 2: Auth, Signup & Core Query Changes

### Task 5: Update AuthContext — Simplify Role Resolution

**Files:**

- Modify: `apps/myk9show/src/context/AuthContext.tsx:218-314`

- [ ] **Step 1: Read the current AuthContext file**

Read the full file to understand the current structure before editing.

- [ ] **Step 2: Remove Priority 2 and Priority 3 from role resolution**

In the `userWithRoles` computed value (around lines 218-314):

- Keep Priority 0 / 0.5 (mock users — dev only)
- Keep Priority 1 (database RBAC via `rbacService`) — this becomes the sole production path
- Remove Priority 2 (legacy RBAC via `useUserRoleNames`) — no longer needed since Priority 1 already reads `user_roles`
- Remove Priority 3 (`people.roles` column) — column no longer exists
- Keep Priority 4 (default exhibitor fallback)

- [ ] **Step 3: Add ROLE_PRIORITY helper for primary role determination**

Add a helper (import from `auth-types.ts` or define locally):

```typescript
import { USER_ROLE_HIERARCHY } from '@/types/auth-types';

function getPrimaryRole(roles: UserRole[]): UserRole {
  for (const role of USER_ROLE_HIERARCHY) {
    if (roles.includes(role)) return role;
  }
  return UserRole.EXHIBITOR;
}
```

Use this in the `userWithRoles` computation to set the primary role.

- [ ] **Step 4: Remove the `people.roles` select**

Find where AuthContext queries the `people` table (around line 151):

```typescript
.select('id, roles, first_name, last_name, email, status')
```

Remove `roles` from the select:

```typescript
.select('id, first_name, last_name, email, status')
```

- [ ] **Step 5: Clean up unused imports**

Remove `useUserRoleNames` import if it was only used for Priority 2. Remove any imports related to `people.roles` mapping.

- [ ] **Step 6: Simplify hasRole() function**

Update `hasRole()` (lines 319-329) to only check `rbacData.userRoles` with `is_active` filter. Remove the fallback to `userWithRoles.roles`.

- [ ] **Step 7: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: Should compile (may have errors in other files still).

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/context/AuthContext.tsx
git commit -m "refactor(auth): simplify AuthContext to single RBAC path, remove people.roles fallback"
```

---

### Task 6: Update Signup Flows — useAuth.ts

**Files:**

- Modify: `apps/myk9show/src/hooks/useAuth.ts`

- [ ] **Step 1: Read the full useAuth.ts file**

- [ ] **Step 2: Update createOAuthPeopleRecord()**

Around lines 22-70, find where it inserts into `people` with `roles: ['exhibitor']`. Remove the `roles` field from the insert.

After the `people` insert succeeds, add a `user_roles` insert:

```typescript
// Assign default exhibitor role via user_roles
const { data: exhibitorRole } = await supabase
  .from('roles')
  .select('id')
  .eq('name', 'exhibitor')
  .single();

if (exhibitorRole) {
  await supabase.from('user_roles').insert({
    user_id: personData.id, // the newly created person's ID
    role_id: exhibitorRole.id,
    granted_at: new Date().toISOString(),
  });
}
```

If the `user_roles` insert fails, log but don't block — AuthContext defaults to exhibitor.

- [ ] **Step 3: Update signUp()**

Around lines 119-162, find where it inserts into `people` with `roles: ['exhibitor']`. Remove the `roles` field.

Important: The current `signUp()` does NOT use `.select('id').single()` on the people insert, so there's no returned ID. Either:

- Add `.select('id').single()` to get the new person's ID, or
- Look up the person by `auth_user_id` after insert.

Then add the `user_roles` insert for exhibitor. If the `user_roles` insert fails, log the error but don't block signup — the AuthContext defaults to exhibitor.

- [ ] **Step 4: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/useAuth.ts
git commit -m "feat(auth): signup flows write exhibitor role to user_roles instead of people.roles"
```

---

### Task 7: Update Core Query & Mapper Files

**Files:**

- Modify: `apps/myk9show/src/services/database/queries/userQueries.ts`
- Modify: `apps/myk9show/src/services/mappers/userMappers.ts`
- Modify: `apps/myk9show/src/hooks/queries/useUsersQuery.ts`
- Modify: `apps/myk9show/src/hooks/useUsers.ts`
- Modify: `apps/myk9show/src/store/userStore.ts`

- [ ] **Step 1: Update userQueries.ts — getUsersByRole()**

Rewrite `getUsersByRole()` (lines 426-451) to query via `user_roles` join instead of `.contains('roles', [role])`:

```typescript
export const getUsersByRole = async (role: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('people')
      .select(
        `
        *,
        user_roles!inner (
          role:roles!inner (name)
        )
      `
      )
      .is('deleted_at', null)
      .eq('user_roles.roles.name', role)
      .eq('user_roles.is_active', true)
      .order('last_name', { ascending: true });

    const duration = Date.now() - startTime;
    logQuery('user', 'select_by_role', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'user', 'select_by_role');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'user', 'select_by_role');
    logQuery('user', 'select_by_role', duration, dbError.message);
    return { data: [], error: dbError };
  }
};
```

Note: The exact Supabase join syntax may vary — test and adjust. An alternative approach is an RPC function or a raw `.rpc()` call if the nested filter doesn't work.

- [ ] **Step 2: Update userQueries.ts — remove roles from createUser/updateUser**

In `createUser()` (line 89) and `updateUser()` (line 112): These functions accept `DbUserInsert` / `DbUserUpdate` types which are auto-generated. After type regeneration, `roles` is no longer in these types, so no code change needed here — the callers just stop passing `roles`.

- [ ] **Step 3: Update userMappers.ts — remove role mapping**

In `mapDatabaseToUser()` (lines 83-87): Remove the `roles` mapping from `dbUser.roles`. Instead, roles will come from a separate join or be populated by the caller.

In `mapUserInputToUpdate()` (lines 46-49): Remove the `roles` mapping block.

In `mapUserForList()` (line 248): Remove the `roles` mapping.

- [ ] **Step 4: Update useUsersQuery.ts — remove role mapping**

In `mapDbUserToUser()` (line 38): Remove `roles: (dbUser.roles as UserRole[]) || []`.

In `mapUserToDbUpdate()` (line 61): Remove `if (user.roles !== undefined) dbUpdate.roles = user.roles;`.

- [ ] **Step 5: Update useUsers.ts — remove roles from mutations**

In `useAddPerson` (line 36): Remove `roles: person.roles || []` from the insert data.

In `useUpdatePerson` (line 62): Remove `roles: person.roles || []` from the update data.

- [ ] **Step 6: Update userStore.ts — remove roles from UserInput and operations**

Remove `roles?: string[]` from the `UserInput` interface (line 26).

In `addUser` (line 126): Remove `roles: userData.roles || []`.

In `updateUser` (line 257): The `mapUserInputToUpdate` call will no longer include roles after Step 3.

- [ ] **Step 7: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: Should compile. Note any remaining errors.

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/services/database/queries/userQueries.ts \
        apps/myk9show/src/services/mappers/userMappers.ts \
        apps/myk9show/src/hooks/queries/useUsersQuery.ts \
        apps/myk9show/src/hooks/useUsers.ts \
        apps/myk9show/src/store/userStore.ts
git commit -m "refactor: remove people.roles from queries, mappers, hooks, and store"
```

---

### Task 8: Update Edge Functions & Services

**Files:**

- Modify: `supabase/functions/admin-delete-user/index.ts:81-105`
- Modify: `apps/myk9show/src/services/ImpersonationService.ts:296-310`

- [ ] **Step 1: Update admin-delete-user — remove legacy roles check**

The function first queries `people` with `.select('id, roles')` at line 81 — change this to `.select('id')` since the `roles` column no longer exists.

Then remove lines 90-92 (the `legacyRoles` check). The function already has the RBAC check at lines 94-105. Make the RBAC check the only path:

Replace the entire authorization section with just:

```typescript
// Check if caller is site_admin via RBAC
const { data: rbacRoles } = await supabase
  .from('user_roles')
  .select('role:roles(name)')
  .eq('user_id', callerPerson.id)
  .eq('is_active', true);

const isSiteAdmin =
  rbacRoles?.some((r: { role: { name: string } | null }) => r.role?.name === 'site_admin') ?? false;

if (!isSiteAdmin) {
  return new Response(JSON.stringify({ error: 'Unauthorized: requires site_admin role' }), {
    status: 403,
    headers: corsHeaders,
  });
}
```

- [ ] **Step 2: Update ImpersonationService — switch to user_roles query**

Replace lines 296-310 to query `user_roles` instead of `people.roles`:

```typescript
const { data: userRoles, error } = await supabase
  .from('user_roles')
  .select('role:roles(name)')
  .eq('user_id', personId) // need to look up person ID from auth user
  .eq('is_active', true);

if (error || !userRoles) {
  throw new Error('Unable to verify admin permissions');
}

const roles: string[] = userRoles
  .map((r: { role: { name: string } | null }) => r.role?.name ?? '')
  .filter(Boolean);
const hasAllowedRole = roles.some(role => this.config.allowedRoles.includes(role));
if (!hasAllowedRole) {
  throw new Error(`Impersonation requires one of: ${this.config.allowedRoles.join(', ')}`);
}
```

Note: Check how the service gets the person ID — it may need to first look up the person by `auth_user_id`.

- [ ] **Step 3: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/admin-delete-user/index.ts \
        apps/myk9show/src/services/ImpersonationService.ts
git commit -m "refactor: remove people.roles fallback from edge functions and ImpersonationService"
```

---

## Chunk 3: Admin UI & CreateUserDialog

### Task 9: Update CreateUserDialog — Dynamic Roles from DB

**Files:**

- Modify: `apps/myk9show/src/components/admin/users/CreateUserDialog.tsx`

- [ ] **Step 1: Read the full CreateUserDialog.tsx file**

- [ ] **Step 2: Replace AVAILABLE_ROLES with dynamic fetch**

Remove the hardcoded `AVAILABLE_ROLES` constant (lines 54-62). Add a React Query hook to fetch roles from the `roles` table:

```typescript
const { data: availableRoles = [] } = useQuery({
  queryKey: ['roles'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('roles')
      .select('id, name, description')
      .order('name');
    if (error) throw error;
    return data;
  },
});
```

- [ ] **Step 3: Update role checkboxes to use dynamic roles**

Replace the role checkbox rendering (lines 463-479) to use `availableRoles` instead of `AVAILABLE_ROLES`. Map `role.name` and `role.description` instead of `role.value` and `role.description`.

- [ ] **Step 4: Update form data type and submit handler**

Change `formData.roles` from `UserRoleType[]` to `string[]` (role names from DB).

In the submit handler (around line 193): Instead of passing `roles: formData.roles` to the people insert, insert `user_roles` rows after the person is created:

```typescript
// Create the person (without roles)
const { data: newPerson } = await createUserMutation.mutateAsync({
  ...userData, // no roles field
});

// Assign selected roles via user_roles (batch insert for atomicity)
if (newPerson?.id) {
  const roleInserts = formData.roles
    .map(roleName => {
      const role = availableRoles.find(r => r.name === roleName);
      return role
        ? { user_id: newPerson.id, role_id: role.id, granted_at: new Date().toISOString() }
        : null;
    })
    .filter(Boolean);

  if (roleInserts.length > 0) {
    await supabase.from('user_roles').insert(roleInserts);
  }
}
```

- [ ] **Step 5: Update the UserRoleType import**

Replace `import type { UserRole as UserRoleType } from '@/types/user-types'` with the enum from `auth-types` if still needed, or just use `string` for role names since they come from DB.

- [ ] **Step 6: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/components/admin/users/CreateUserDialog.tsx
git commit -m "feat(admin): CreateUserDialog fetches roles dynamically and writes to user_roles"
```

---

### Task 10: Update UserDetailsDialog — Dynamic Roles

**Files:**

- Modify: `apps/myk9show/src/components/admin/users/UserDetailsDialog.tsx`

- [ ] **Step 1: Read the full file**

- [ ] **Step 2: Apply the same pattern as CreateUserDialog**

Replace hardcoded roles with dynamic fetch from `roles` table. Update the form submit to write role changes to `user_roles` instead of `people.roles`. Use the same `useQuery` pattern for fetching available roles.

When saving, compare current `user_roles` with selected roles:

- New roles: insert into `user_roles`
- Removed roles: soft-deactivate (`is_active = false`) in `user_roles`

- [ ] **Step 3: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/admin/users/UserDetailsDialog.tsx
git commit -m "feat(admin): UserDetailsDialog uses dynamic roles and writes to user_roles"
```

---

## Chunk 4: UI Components — Badge Display & Role References

### Task 11: Update People Browse Views — Role Badges

**Files:**

- Modify: `apps/myk9show/src/components/users/browse/PeopleTableView.tsx`
- Modify: `apps/myk9show/src/components/users/browse/PeopleListView.tsx`
- Modify: `apps/myk9show/src/components/users/browse/PeopleGridView.tsx`

These components read `person.roles` for badge display. After migration, `roles` will be populated via the `get_admin_user_list()` RPC (which now aggregates from `user_roles`), so the `roles` field on the person object should still be a `string[]`.

- [ ] **Step 1: Verify data source**

Check how these components receive their data. If they get it from `get_admin_user_list()` RPC, the `roles` field is already populated by the updated RPC (Task 1). No component changes needed — just verify the data shape matches.

If they get data from a direct `people` table query, the query needs to be updated to include a `user_roles` join.

- [ ] **Step 2: Update any direct people queries that feed these views**

If the people browse views use a direct Supabase query (not the RPC), update it to include roles via join:

```typescript
const { data } = await supabase
  .from('people')
  .select(
    `
    *,
    user_roles (
      role:roles (name)
    )
  `
  )
  .is('deleted_at', null);

// Then map user_roles to a flat roles array:
const usersWithRoles = data?.map(person => ({
  ...person,
  roles: person.user_roles?.filter((ur: any) => ur.role).map((ur: any) => ur.role.name) ?? [],
}));
```

- [ ] **Step 3: Verify badge rendering still works**

The `getRoleBadges()` function in `PeopleTableView.tsx` (lines 23-39) takes `string[]` — this should work unchanged as long as the data source provides `roles` as a string array.

- [ ] **Step 4: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/users/browse/
git commit -m "refactor(ui): update people browse views to receive roles from user_roles join"
```

---

### Task 12: Update User Detail Components

**Files:**

- Modify: `apps/myk9show/src/components/users/UserTable.tsx`
- Modify: `apps/myk9show/src/components/users/UserDetails/UserDetailsView.tsx`
- Modify: `apps/myk9show/src/components/users/UserDetails/HeroProfileCard.tsx`
- Modify: `apps/myk9show/src/components/users/UserDetails/userDetailsTypes.ts`
- Modify: `apps/myk9show/src/components/admin/users/UserTable/index.tsx`

- [ ] **Step 1: Update userDetailsTypes.ts**

Remove `roles` from the form data type (line 17) and `buildFormData` (line 54) — roles are no longer editable through this interface (they're managed via the RBAC system).

- [ ] **Step 2: Update UserDetailsView.tsx**

- Line 156: Remove `roles` from the update mutation payload.
- Line 259: Keep the role display, but ensure it reads from the joined `roles` data (which should already be on the person object from the query).
- Lines 298-307: Keep the judge conditional rendering — it reads `person.roles?.includes('judge')` which still works if `roles` is populated from the join.

- [ ] **Step 3: Verify UserTable.tsx and admin UserTable/index.tsx**

These use `person.roles` for sorting (lines 64-75, 78-79). They should work unchanged if the data source populates `roles` correctly.

- [ ] **Step 4: Verify HeroProfileCard.tsx**

Lines 105-122: Renders role badges. Should work unchanged if `person.roles` is populated.

- [ ] **Step 5: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/users/UserTable.tsx \
        apps/myk9show/src/components/users/UserDetails/ \
        apps/myk9show/src/components/admin/users/UserTable/
git commit -m "refactor(ui): update user detail components for user_roles-based role data"
```

---

### Task 13: Update Show Wizard & Panel Components

**Files:**

- Modify: `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.sections.tsx`
- Modify: `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.helpers.ts`
- Modify: `apps/myk9show/src/components/panels/entities/ClubCreationPanel.tsx`
- Modify: `apps/myk9show/src/components/panels/entities/JudgeCreationPanel/index.tsx`

- [ ] **Step 1: Verify show wizard components**

`ShowDetailsStep.sections.tsx` (line 158-166) and `ShowDetailsStep.helpers.ts` (line 35) use `person.roles` for badge display and judge filtering. These will work if the person objects have `roles` populated from the `user_roles` join.

Check where these components get their person data. If from a query that selects `people.*`, update that query to include the `user_roles` join.

- [ ] **Step 2: Update JudgeCreationPanel**

Line 104: `if (!person.roles?.includes('judge')) return false;` — this needs the joined roles data.

Line 180: `roles: ['judge']` — this was writing to `people.roles`. Change this to insert a `user_roles` row instead:

```typescript
// After creating the person
if (newPerson?.id) {
  const { data: judgeRole } = await supabase
    .from('roles')
    .select('id')
    .eq('name', 'judge')
    .single();

  if (judgeRole) {
    await supabase.from('user_roles').insert({
      user_id: newPerson.id,
      role_id: judgeRole.id,
      granted_at: new Date().toISOString(),
    });
  }
}
```

- [ ] **Step 3: Verify ClubCreationPanel**

Lines 403-411: Renders role badges for person picker. Should work with joined `roles` data.

- [ ] **Step 4: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/wizard/steps/ \
        apps/myk9show/src/components/panels/entities/
git commit -m "refactor(ui): update show wizard and panel components for user_roles"
```

---

### Task 14: Update Utility Files & Hooks

**Files:**

- Modify: `apps/myk9show/src/utils/unified-shows-config.ts`
- Modify: `apps/myk9show/src/utils/show-management-tracking.ts`
- Modify: `apps/myk9show/src/utils/show-relationships.ts`
- Modify: `apps/myk9show/src/hooks/useRegistrationPermissions.ts`
- Modify: `apps/myk9show/src/hooks/queries/useUsersDatabase.ts`
- Modify: `apps/myk9show/src/components/admin/PermissionTestChecklist.tsx`

- [ ] **Step 1: Check if these files use AuthContext roles or people.roles**

These files reference `user.roles` or `userWithRoles.roles`. Determine which data source they use:

- If they read from `userWithRoles` (AuthContext) → already RBAC-driven, likely no changes needed.
- If they read from a `User` object fetched from `people` table → needs the join update.

- [ ] **Step 2: Update unified-shows-config.ts**

Lines 59-65 and throughout: `user.roles` — check where `user` comes from. If it's a `User` type from a people query, the `roles` field needs to come from the `user_roles` join. If it's from AuthContext, no change needed.

- [ ] **Step 3: Update show-management-tracking.ts**

Lines 111, 165: Same analysis — check data source.

- [ ] **Step 4: Update show-relationships.ts**

Lines 55, 90, 157: Same analysis.

- [ ] **Step 5: Update useRegistrationPermissions.ts**

Lines 48, 62, and throughout: Uses `userWithRoles.roles` — this is from AuthContext and is already RBAC-driven. Likely no changes needed.

- [ ] **Step 6: Update useUsersDatabase.ts**

Uses `getUsersByRole` — already updated in Task 7. Verify the import still works.

- [ ] **Step 7: Update PermissionTestChecklist.tsx**

Lines 124, 163: Uses `userWithRoles?.roles[0]` — from AuthContext, already RBAC-driven. Likely no changes.

- [ ] **Step 8: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: Zero type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/myk9show/src/utils/ \
        apps/myk9show/src/hooks/useRegistrationPermissions.ts \
        apps/myk9show/src/hooks/queries/useUsersDatabase.ts \
        apps/myk9show/src/components/admin/PermissionTestChecklist.tsx
git commit -m "refactor: update utility files and hooks for user_roles-based role data"
```

---

## Chunk 5: Tests & Final Verification

### Task 15: Update Test Files

Note: Ideally, test updates should be interleaved with their corresponding implementation tasks. If working sequentially, update tests as soon as the code they test changes. This task groups them for reference, but each test update should accompany its implementation commit.

**Files:**

- Modify: `apps/myk9show/src/test/services/database/queries/userQueries.test.ts`
- Modify: `apps/myk9show/src/test/security/PermissionValidation.test.ts`
- Modify: `apps/myk9show/src/test/quick-user-integration.test.ts`
- Verify: `apps/myk9show/src/test/store/peopleStore.test.tsx` — check for `roles` references, update if found
- Verify: `apps/myk9show/src/test/pages/SignUpPage.test.tsx` — signup flow changed, verify test still valid
- Modify: Any other test files with `roles` in people fixtures

- [ ] **Step 1: Update userQueries.test.ts**

Remove any mock data that includes `roles` in people objects. Update the `getUsersByRole` test to expect the new join-based query pattern.

- [ ] **Step 2: Update PermissionValidation.test.ts**

The `createMockUser` function (lines 56-67) creates `UserWithRoles` objects with `roles: [role]`. This is an AuthContext-shaped object — keep as-is since AuthContext still provides `roles`. But update any test that uses removed role values (`HANDLER`, `GATE_STEWARD`, `ADMIN`) to use valid roles.

- [ ] **Step 3: Update quick-user-integration.test.ts**

Read and update any `people.roles` references.

- [ ] **Step 3.5: Verify peopleStore.test.tsx and SignUpPage.test.tsx**

Read both files and check for `roles` references in the context of people inserts. Update if found, otherwise confirm no changes needed.

- [ ] **Step 4: Run the full test suite**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && pnpm test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/test/
git commit -m "test: update test fixtures for unified role system"
```

---

### Task 16: Full Verification & Cleanup

- [ ] **Step 1: Run typecheck across the monorepo**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: Zero errors.

- [ ] **Step 2: Run lint**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm lint`
Expected: Zero errors.

- [ ] **Step 3: Run full test suite**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && pnpm test`
Expected: All tests pass.

- [ ] **Step 4: Search for any remaining people.roles references**

Run: Search codebase for `\.roles` in the context of people/user objects (excluding `user_roles`, `userWithRoles.roles` from AuthContext, and `PersonnelManager`).

Expected: No remaining references to the legacy `people.roles` column.

- [ ] **Step 5: Search for removed enum values**

Run: Search for `HANDLER`, `GATE_STEWARD`, `ADMIN` (the enum member, not the string) across the codebase.

Expected: No remaining references.

- [ ] **Step 6: Update TO-DOS.md**

Mark the "Unify role systems" todo as complete:

```markdown
- [x] **Unify role systems — deprecate `people.roles` in favor of `user_roles` table** — Done: ...
```

- [ ] **Step 7: Final commit**

```bash
git add TO-DOS.md
git commit -m "docs: mark role unification todo as complete"
```
