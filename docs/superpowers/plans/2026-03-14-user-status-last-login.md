# User Status & Last Login Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real `status` column to the `people` table (active/suspended), enforce suspended login blocking at both database and client levels, display last login time from `auth.users`, and add a "show deleted" toggle to the admin user table.

**Architecture:** Single migration adds the status column, auth hook function, and admin RPC. Client changes replace computed status logic with real database values, add a new `useAdminUsersQuery` hook calling the RPC, and enforce suspension in AuthContext.

**Tech Stack:** Supabase (Postgres migration, Auth Hook, RPC), React, TypeScript, React Query, Vitest

**Spec:** `docs/superpowers/specs/2026-03-14-user-status-design.md`

---

## File Map

| Action | File                                                                     | Responsibility                                                                  |
| ------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Create | `supabase/migrations/063_add_people_status_and_auth_hook.sql`            | Status column, auth hook, admin RPC                                             |
| Modify | `apps/myk9show/src/types/user-types.ts`                                  | Add `status` to `User` interface                                                |
| Modify | `apps/myk9show/src/pages/admin/UserManagementPage.types.ts`              | Update `UserFilter` type                                                        |
| Modify | `apps/myk9show/src/hooks/queries/useUsersQuery.ts`                       | Add status to mappers, add `useAdminUsersQuery`                                 |
| Modify | `apps/myk9show/src/context/AuthContext.tsx`                              | Fetch status, enforce suspension                                                |
| Modify | `apps/myk9show/src/components/admin/users/UserTable/utils.ts`            | Replace computed status with DB status                                          |
| Modify | `apps/myk9show/src/components/admin/users/UserTable/types.ts`            | Update `UserTableProps` to accept `AdminUser[]`                                 |
| Modify | `apps/myk9show/src/components/admin/users/UserTable/index.tsx`           | Update sort logic for real `lastSignInAt`                                       |
| Modify | `apps/myk9show/src/components/admin/users/UserTable/UserTableRow.tsx`    | Status badge, suspended/deleted row styling, last login cell                    |
| Modify | `apps/myk9show/src/components/admin/users/UserTable/UserTableHeader.tsx` | Rename "Last Activity" to "Last Login"                                          |
| Modify | `apps/myk9show/src/components/admin/users/UserFilters.tsx`               | Update options, add show-deleted checkbox, update resetFilters/hasActiveFilters |
| Modify | `apps/myk9show/src/pages/admin/UserManagementPage.helpers.ts`            | Replace mock filter logic                                                       |
| Modify | `apps/myk9show/src/components/panels/edit/UserEditPanel.types.ts`        | Add `status` to `UserFormData`                                                  |
| Modify | `apps/myk9show/src/components/panels/edit/UserEditPanel.helpers.ts`      | Add status to `userToFormData` and `formDataToUser`                             |
| Modify | `apps/myk9show/src/components/panels/edit/UserEditPanel.tsx`             | Add status dropdown to edit form                                                |
| Modify | `apps/myk9show/src/pages/admin/UserManagementPage.tsx`                   | Switch to `useAdminUsersQuery`                                                  |

---

## Chunk 1: Database Migration & Type Regeneration

### Task 1: Write and apply the migration

**Files:**

- Create: `supabase/migrations/063_add_people_status_and_auth_hook.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 063_add_people_status_and_auth_hook.sql
-- Adds status column to people, auth hook to block suspended users,
-- and admin RPC for user list with last_sign_in_at.

--------------------------------------------------------------
-- 1. Status column
--------------------------------------------------------------
ALTER TABLE people ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE people ADD CONSTRAINT people_status_check
  CHECK (status IN ('active', 'suspended'));
CREATE INDEX idx_people_status ON people (status);

--------------------------------------------------------------
-- 2. Auth hook: block suspended users at token creation
--------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  person_status TEXT;
BEGIN
  SELECT p.status INTO person_status
  FROM public.people p
  WHERE p.auth_user_id = (event->>'user_id')::uuid
    AND p.deleted_at IS NULL;

  IF person_status = 'suspended' THEN
    RETURN jsonb_build_object(
      'claims', event->'claims',
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Account suspended'
      )
    );
  END IF;

  RETURN event;
END;
$$;

-- Auth admin needs schema access, function execution, and SELECT on people
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
GRANT SELECT ON public.people TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

--------------------------------------------------------------
-- 3. Admin RPC: user list with last_sign_in_at from auth.users
--------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_user_list(show_deleted BOOLEAN DEFAULT FALSE)
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
STABLE
AS $$
BEGIN
  -- Verify caller is site_admin (check both legacy roles and RBAC)
  IF NOT EXISTS (
    SELECT 1 FROM public.people
    WHERE auth_user_id = auth.uid()
      AND deleted_at IS NULL
      AND (
        'site_admin' = ANY(people.roles)
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
          WHERE ur.user_id = auth.uid()
            AND r.name = 'site_admin'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: site_admin role required';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.first_name,
    p.last_name,
    p.email,
    p.phone,
    p.status,
    p.roles,
    p.profile_image,
    p.deleted_at,
    p.deleted_by,
    p.created_at,
    p.updated_at,
    au.last_sign_in_at
  FROM public.people p
  LEFT JOIN auth.users au ON au.id = p.auth_user_id
  WHERE show_deleted OR p.deleted_at IS NULL
  ORDER BY p.last_name ASC NULLS LAST, p.first_name ASC NULLS LAST;
END;
$$;
```

- [ ] **Step 2: Apply migration to Supabase**

Run: `supabase db push`
Expected: Migration applies successfully.

- [ ] **Step 3: Regenerate Supabase TypeScript types**

The database mapping types (`DbPerson`, `DbPersonUpdate`, etc.) are auto-generated from the Supabase schema. After migration, regenerate so `status` appears in the types:

Run: `supabase gen types typescript --project-id sojmvhhwsjxmfistvzbe > packages/supabase/src/database.types.ts`

Verify: The generated types include `status: string` in the `people` table's `Row`, `Insert`, and `Update` types. Check the output path — it may be `apps/myk9show/src/types/supabase.ts` or `packages/supabase/src/database.types.ts` depending on project setup. Search for the existing generated types file with: `grep -rl "Generated by Supabase" apps/ packages/`

- [ ] **Step 4: Verify migration**

Run the following SQL in Supabase SQL Editor:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'people' AND column_name = 'status';
```

Expected: `status | text | 'active'::text`

- [ ] **Step 5: Enable auth hook in Supabase Dashboard**

Manual step: Go to Supabase Dashboard > Authentication > Hooks > Custom Access Token.
Point it to `public.custom_access_token_hook`. Save.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/063_add_people_status_and_auth_hook.sql packages/supabase/src/database.types.ts
git commit -m "feat(db): add status column, auth hook, and admin user list RPC"
```

---

## Chunk 2: Type Definitions & Data Layer

### Task 2: Update TypeScript types

**Files:**

- Modify: `apps/myk9show/src/types/user-types.ts:1-43`
- Modify: `apps/myk9show/src/pages/admin/UserManagementPage.types.ts:8-30`

- [ ] **Step 1: Add `status` to User interface**

In `apps/myk9show/src/types/user-types.ts`, add after the `deletedBy` field (around line 32):

```typescript
status?: 'active' | 'suspended' | undefined;
```

- [ ] **Step 2: Update UserFilter type**

In `apps/myk9show/src/pages/admin/UserManagementPage.types.ts`, change:

```typescript
// Before
status: 'active' | 'inactive' | 'suspended' | 'all';

// After
status: 'active' | 'suspended' | 'all';
```

Add `showDeleted` to the interface:

```typescript
showDeleted: boolean;
```

Update `DEFAULT_USER_FILTER`:

```typescript
export const DEFAULT_USER_FILTER: UserFilter = {
  search: '',
  role: 'all',
  status: 'all',
  clubAffiliation: '',
  showDeleted: false,
  dateRange: { start: null, end: null },
};
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: May have errors in files that reference the old `'inactive'` status value — that's expected, we'll fix those next.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/types/user-types.ts apps/myk9show/src/pages/admin/UserManagementPage.types.ts
git commit -m "feat(types): add status to User, update UserFilter for active/suspended"
```

### Task 3: Update data mappers and add admin users query

**Files:**

- Modify: `apps/myk9show/src/hooks/queries/useUsersQuery.ts:18-34, 36-54`

- [ ] **Step 1: Add status to mapDbUserToUser**

In `apps/myk9show/src/hooks/queries/useUsersQuery.ts`, add to `mapDbUserToUser` (after the `updatedAt` line, around line 33):

```typescript
status: (dbUser.status as 'active' | 'suspended') || 'active',
deletedAt: dbUser.deleted_at || undefined,
deletedBy: dbUser.deleted_by || undefined,
```

- [ ] **Step 2: Add status to mapUserToDbUpdate**

In the same file, add to `mapUserToDbUpdate` (after the `roles` mapping, around line 53):

```typescript
if (user.status !== undefined) dbUpdate.status = user.status;
```

- [ ] **Step 3: Define AdminUser type and add useAdminUsersQuery hook**

Add after the existing imports at the top of `useUsersQuery.ts`:

```typescript
export interface AdminUser extends User {
  lastSignInAt: string | null;
}
```

Add a new hook after `useUsersQuery`:

```typescript
/**
 * Admin-only hook that fetches user list via RPC, including last_sign_in_at from auth.users.
 * Falls back to empty array on error (e.g., non-admin caller).
 */
export function useAdminUsersQuery(showDeleted: boolean = false) {
  return useQuery({
    queryKey: [...queryKeys.users.all, 'admin', { showDeleted }],
    queryFn: async (): Promise<AdminUser[]> => {
      const { data, error } = await supabase.rpc('get_admin_user_list', {
        show_deleted: showDeleted,
      });

      if (error) {
        logger.error('Failed to fetch admin user list:', 'query', {}, ensureError(error));
        throw error;
      }

      return (data || []).map(
        (row: Record<string, unknown>): AdminUser => ({
          id: row.id as string,
          firstName: (row.first_name as string) || '',
          lastName: (row.last_name as string) || '',
          email: (row.email as string) || undefined,
          phone: (row.phone as string) || undefined,
          profileImage: (row.profile_image as string) || undefined,
          roles: (row.roles as UserRole[]) || [],
          status: (row.status as 'active' | 'suspended') || 'active',
          deletedAt: (row.deleted_at as string) || undefined,
          deletedBy: (row.deleted_by as string) || undefined,
          createdAt: row.created_at ? new Date(row.created_at as string) : undefined,
          updatedAt: row.updated_at ? new Date(row.updated_at as string) : undefined,
          lastSignInAt: (row.last_sign_in_at as string) || null,
        })
      );
    },
  });
}
```

Ensure `supabase` and `logger` and `ensureError` are imported at the top of the file. Check existing imports — `supabase` may need to be imported from `@myk9/supabase`.

- [ ] **Step 4: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: Errors in filter/status files that still reference `'inactive'` — fixed in next tasks.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useUsersQuery.ts
git commit -m "feat(data): add status to user mappers, add useAdminUsersQuery RPC hook"
```

---

## Chunk 3: AuthContext Suspension Enforcement

### Task 4: Add suspension check to AuthContext

**Files:**

- Modify: `apps/myk9show/src/context/AuthContext.tsx:142-163`

- [ ] **Step 1: Add `status` to the people query select**

In `apps/myk9show/src/context/AuthContext.tsx`, find the query at line 150:

```typescript
// Before
.select('id, roles, first_name, last_name, email')

// After
.select('id, roles, first_name, last_name, email, status')
```

- [ ] **Step 2: Add suspension enforcement effect with toast notification**

Add a new `useEffect` after the `userProfile` query (after line 163). This signs out suspended users with a clear message:

```typescript
// Enforce account suspension — sign out if status is 'suspended'
useEffect(() => {
  if (userProfile?.status === 'suspended') {
    logger.warn('Account suspended, signing out user', 'auth');
    notifications.error(
      'Your account has been suspended. Contact the administrator for assistance.'
    );
    supabase.auth.signOut();
  }
}, [userProfile?.status]);
```

Import `notifications` from `@/lib/notifications` if not already imported.

- [ ] **Step 3: Handle auth hook 403 on login page**

Find the login page's error handling (where sign-in errors are displayed). When the error message contains "Account suspended" or the error code indicates 403, display: "Your account has been suspended. Contact the administrator for assistance."

Check the sign-in handler — it likely catches errors from `supabase.auth.signInWithPassword()`. The auth hook will cause this call to fail with the suspended message. Map this to a user-friendly error.

- [ ] **Step 4: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS (or errors only in unrelated filter files).

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/context/AuthContext.tsx
git commit -m "feat(auth): enforce account suspension in AuthContext with toast notification"
```

---

## Chunk 4: Admin User Table UI

### Task 5: Update status utilities

**Files:**

- Modify: `apps/myk9show/src/components/admin/users/UserTable/utils.ts:30-62`

- [ ] **Step 1: Replace getUserStatus with direct DB status**

Replace the `getUserStatus` function:

```typescript
// Before (computed from profile completeness)
export const getUserStatus = (user: User): 'active' | 'incomplete' | 'inactive' => {
  if (!user.email) return 'inactive';
  if (!user.firstName || !user.lastName) return 'incomplete';
  return 'active';
};

// After (reads from database)
export const getUserStatus = (user: User): 'active' | 'suspended' => {
  return user.status || 'active';
};
```

- [ ] **Step 2: Update getStatusConfig**

Replace the `getStatusConfig` function:

```typescript
export const getStatusConfig = (status: string): StatusConfig => {
  switch (status) {
    case 'suspended':
      return {
        icon: XCircle,
        color: '#EF4444',
        background: 'rgba(239, 68, 68, 0.1)',
        label: 'Suspended',
      };
    case 'active':
    default:
      return {
        icon: CheckCircle2,
        color: '#34C759',
        background: 'rgba(52, 199, 89, 0.1)',
        label: 'Active',
      };
  }
};
```

Add `XCircle` to the lucide-react import at the top of the file (alongside `CheckCircle2`, `AlertCircle`, `Clock`). Remove `AlertCircle` and `Clock` if no longer used elsewhere in the file.

- [ ] **Step 3: Add deleted status config**

Add a helper for deleted user display:

```typescript
export const getDeletedStatusConfig = (): StatusConfig => ({
  icon: Trash2,
  color: '#8E8E93',
  background: 'rgba(142, 142, 147, 0.1)',
  label: 'Deleted',
});
```

Add `Trash2` to the lucide-react import.

- [ ] **Step 4: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/admin/users/UserTable/utils.ts
git commit -m "feat(ui): update status utils for active/suspended from DB"
```

### Task 6: Update UserTable types, index, header, and row

**Files:**

- Modify: `apps/myk9show/src/components/admin/users/UserTable/types.ts:18-32`
- Modify: `apps/myk9show/src/components/admin/users/UserTable/index.tsx:85-89`
- Modify: `apps/myk9show/src/components/admin/users/UserTable/UserTableHeader.tsx:89-93`
- Modify: `apps/myk9show/src/components/admin/users/UserTable/UserTableRow.tsx:49-50, 190-223`

- [ ] **Step 1: Update UserTableProps to accept AdminUser[]**

In `types.ts` (line 18-19), change:

```typescript
// Before
users: import('@/types/user-types').User[];

// After
users: import('@/hooks/queries/useUsersQuery').AdminUser[];
```

- [ ] **Step 2: Update sort logic for real lastSignInAt**

In `index.tsx` (lines 85-89), replace the mock `lastLogin` sort case:

```typescript
// Before
case 'lastLogin':
  // Mock last login - in real app would come from database
  aValue = a.updatedAt || a.createdAt || new Date(0);
  bValue = b.updatedAt || b.createdAt || new Date(0);
  break;

// After
case 'lastLogin':
  aValue = (a as AdminUser).lastSignInAt || '';
  bValue = (b as AdminUser).lastSignInAt || '';
  break;
```

Import `AdminUser` from `useUsersQuery` at the top.

- [ ] **Step 3: Rename "Last Activity" to "Last Login" in header**

In `UserTableHeader.tsx` (lines 89-93):

```typescript
// Before
{
  /* Last Activity Column */
}

// After
{
  /* Last Login Column */
}
```

And change the button text:

```typescript
// Before
Last Activity

// After
Last Login
```

The sort field `'lastLogin'` stays the same (already defined in `SortField` type).

- [ ] **Step 4: Update UserTableRow for status, last login, and deleted styling**

This task modifies UserTableRow to:

1. Replace the existing "Last Activity" cell content with real `lastSignInAt` data
2. Apply suspended row styling (red tint background, red name)
3. Apply deleted row styling (strikethrough, dimmed, "Deleted" badge instead of status)

Add a relative time helper at the top of the file (or import from a shared util):

```typescript
function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${diffYears}y ago`;
}

function isStaleLogin(dateString: string | null | undefined, thresholdDays: number = 180): boolean {
  if (!dateString) return false;
  const diffMs = Date.now() - new Date(dateString).getTime();
  return diffMs > thresholdDays * 86400000;
}
```

Import `AdminUser` from `useUsersQuery` and cast `user` to access `lastSignInAt`:

```typescript
const adminUser = user as AdminUser;
const lastSignInAt = adminUser.lastSignInAt;
```

For the row element, add conditional styling:

- If `user.deletedAt`: dim the row (`opacity-50`), strikethrough the name
- If `user.status === 'suspended'`: red tint background (`bg-red-500/5`)

For the status cell:

- If `user.deletedAt`: show "Deleted" badge (gray, using `getDeletedStatusConfig()`) instead of active/suspended
- Otherwise: show normal status badge

Replace the existing "Last Activity" cell content (around line 190) with real data:

```tsx
{
  /* Last Login */
}
<TableCell className="myk9-table-cell">
  <span
    className="text-sm"
    style={{
      color: isStaleLogin(lastSignInAt) ? '#EF4444' : undefined,
    }}
  >
    {formatRelativeTime(lastSignInAt)}
  </span>
</TableCell>;
```

- [ ] **Step 5: Run typecheck and lint**

Run: `cd apps/myk9show && pnpm typecheck && pnpm lint`

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/admin/users/UserTable/
git commit -m "feat(ui): real last login column, suspended/deleted row styling"
```

### Task 7: Update UserFilters

**Files:**

- Modify: `apps/myk9show/src/components/admin/users/UserFilters.tsx:53-58, 77-93, 150-176`

- [ ] **Step 1: Update STATUS_OPTIONS**

```typescript
// Before
const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
] as const;

// After
const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
] as const;
```

- [ ] **Step 2: Update resetFilters to include showDeleted**

In `resetFilters` (line 77-84):

```typescript
// Before
const resetFilters = () => {
  onFiltersChange({
    search: '',
    role: 'all',
    status: 'all',
    clubAffiliation: '',
    dateRange: { start: null, end: null },
  });
};

// After — import and use DEFAULT_USER_FILTER
const resetFilters = () => {
  onFiltersChange(DEFAULT_USER_FILTER);
};
```

Import `DEFAULT_USER_FILTER` from `@/pages/admin/UserManagementPage.types`.

- [ ] **Step 3: Update hasActiveFilters to include showDeleted**

In `hasActiveFilters` (line 88-93):

```typescript
// Before
const hasActiveFilters =
  filters.role !== 'all' ||
  filters.status !== 'all' ||
  filters.clubAffiliation !== '' ||
  filters.dateRange.start !== null ||
  filters.dateRange.end !== null;

// After
const hasActiveFilters =
  filters.role !== 'all' ||
  filters.status !== 'all' ||
  filters.showDeleted ||
  filters.clubAffiliation !== '' ||
  filters.dateRange.start !== null ||
  filters.dateRange.end !== null;
```

- [ ] **Step 4: Add "Show deleted" checkbox**

Add a checkbox in the filter bar (after the existing filters, aligned right):

```tsx
<label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer ml-auto">
  <input
    type="checkbox"
    checked={filters.showDeleted}
    onChange={e => updateFilter('showDeleted', e.target.checked)}
    className="accent-destructive"
  />
  Show deleted
</label>
```

- [ ] **Step 5: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/admin/users/UserFilters.tsx
git commit -m "feat(ui): update status filter options, add show-deleted toggle"
```

### Task 8: Update filter logic in helpers

**Files:**

- Modify: `apps/myk9show/src/pages/admin/UserManagementPage.helpers.ts:31-45`

- [ ] **Step 1: Replace mock status filter with real status check**

```typescript
// Before (mock)
if (filters.status !== 'all') {
  filtered = filtered.filter(user => {
    switch (filters.status) {
      case 'active':
        return user.email && user.firstName && user.lastName;
      case 'inactive':
        return !user.email;
      case 'suspended':
        return false;
      default:
        return true;
    }
  });
}

// After (real)
if (filters.status !== 'all') {
  filtered = filtered.filter(user => user.status === filters.status);
}
```

Note: The `showDeleted` filter is handled server-side by the `get_admin_user_list` RPC parameter, so no client-side filtering needed for that.

- [ ] **Step 2: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/pages/admin/UserManagementPage.helpers.ts
git commit -m "feat(admin): replace mock status filter with real DB status"
```

---

## Chunk 5: Admin Edit Panel & Page Wiring

### Task 9: Add status to UserEditPanel

The admin user management page uses `UserEditPanel` (not `UserDetailsDialog`). The edit panel is at `apps/myk9show/src/components/panels/edit/UserEditPanel.tsx` with its types in `UserEditPanel.types.ts` and helpers in `UserEditPanel.helpers.ts`.

**Files:**

- Modify: `apps/myk9show/src/components/panels/edit/UserEditPanel.types.ts:15-32`
- Modify: `apps/myk9show/src/components/panels/edit/UserEditPanel.helpers.ts:80-137`
- Modify: `apps/myk9show/src/components/panels/edit/UserEditPanel.tsx`

- [ ] **Step 1: Add status to UserFormData**

In `UserEditPanel.types.ts`, add to the `UserFormData` interface (after `roles`):

```typescript
status: 'active' | 'suspended';
```

- [ ] **Step 2: Update userToFormData**

In `UserEditPanel.helpers.ts`, add to the `userToFormData` function's return object (line ~96, after `roles`):

```typescript
status: (user.status as 'active' | 'suspended') || 'active',
```

- [ ] **Step 3: Update formDataToUser**

In `UserEditPanel.helpers.ts`, add to the `formDataToUser` function's return object (line ~119, after `roles`):

```typescript
status: formData.status,
```

- [ ] **Step 4: Add status dropdown to UserEditPanel**

In `UserEditPanel.tsx`, add a status section to one of the edit tabs (e.g., the Basic Info tab or as a new Account tab). The dropdown should:

- Show "Active" and "Suspended" options
- Be disabled when the user is editing their own account
- Show a confirmation when changing to "Suspended"

```tsx
{
  /* Account Status — only visible to site_admin */
}
{
  hasPermission('manage_users') && (
    <div className="space-y-2">
      <Label className="text-sm font-[590]">Account Status</Label>
      <Select
        value={data.status}
        onValueChange={value => {
          if (value === 'suspended' && data.status !== 'suspended') {
            const confirmed = window.confirm(
              'This will immediately block this user from logging in. Continue?'
            );
            if (!confirmed) return;
          }
          updateData({ status: value as 'active' | 'suspended' });
        }}
        disabled={userId === currentUser?.id}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="suspended">Suspended</SelectItem>
        </SelectContent>
      </Select>
      {userId === currentUser?.id && (
        <p className="text-xs text-muted-foreground">You cannot suspend your own account</p>
      )}
    </div>
  );
}
```

Import `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` from `@/components/ui/select` and `Label` from `@/components/ui/label`.

- [ ] **Step 5: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/panels/edit/
git commit -m "feat(admin): add status dropdown to UserEditPanel"
```

### Task 10: Wire UserManagementPage to useAdminUsersQuery

**Files:**

- Modify: `apps/myk9show/src/pages/admin/UserManagementPage.tsx`

- [ ] **Step 1: Switch from useUsersQuery to useAdminUsersQuery**

Find where the page calls `useUsersQuery()` and replace:

```typescript
// Before
import { useUsersQuery } from '@/hooks/queries/useUsersQuery';
const { data: users, isLoading } = useUsersQuery();

// After
import { useAdminUsersQuery, type AdminUser } from '@/hooks/queries/useUsersQuery';
const { data: users, isLoading } = useAdminUsersQuery(filters.showDeleted);
```

This passes `showDeleted` to the RPC so the server handles deleted-user filtering.

- [ ] **Step 2: Update useUpdateUserMutation cache invalidation**

After a status change, the admin user list cache needs to refresh. In `useUsersQuery.ts`, update `useUpdateUserMutation`'s `onSuccess` to also invalidate the admin query:

```typescript
onSuccess: (updatedUser: User) => {
  // ... existing cache updates ...
  // Also invalidate admin user list so it refetches with updated status
  queryClient.invalidateQueries({ queryKey: [...queryKeys.users.all, 'admin'] });
},
```

- [ ] **Step 3: Run typecheck and test**

Run: `cd apps/myk9show && pnpm typecheck`
Run: `cd apps/myk9show && pnpm test -- --run`
Expected: Existing tests may need mock updates for the new `status` field and `useAdminUsersQuery`.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/pages/admin/ apps/myk9show/src/hooks/queries/useUsersQuery.ts
git commit -m "feat(admin): wire UserManagementPage to admin RPC with last login"
```

---

## Chunk 6: Tests

### Task 11: Write tests for new functionality

**Files:**

- Modify: existing test files for UserTable, UserFilters, AuthContext
- Create: test for useAdminUsersQuery if no existing test file

- [ ] **Step 1: Test getUserStatus reads from DB**

```typescript
import { getUserStatus, getStatusConfig } from './utils';
import type { User } from '@/types/user-types';

describe('getUserStatus', () => {
  it('returns active for users with active status', () => {
    expect(getUserStatus({ status: 'active' } as User)).toBe('active');
  });

  it('returns suspended for suspended users', () => {
    expect(getUserStatus({ status: 'suspended' } as User)).toBe('suspended');
  });

  it('defaults to active when status is undefined', () => {
    expect(getUserStatus({} as User)).toBe('active');
  });
});

describe('getStatusConfig', () => {
  it('returns green config for active', () => {
    const config = getStatusConfig('active');
    expect(config.label).toBe('Active');
    expect(config.color).toBe('#34C759');
  });

  it('returns red config for suspended', () => {
    const config = getStatusConfig('suspended');
    expect(config.label).toBe('Suspended');
    expect(config.color).toBe('#EF4444');
  });
});
```

- [ ] **Step 2: Test filter logic**

Note: `filterUsers` takes 3 arguments: `(users, searchTerm, filters)`.

```typescript
import { filterUsers } from './UserManagementPage.helpers';
import { DEFAULT_USER_FILTER } from './UserManagementPage.types';
import type { User } from '@/types/user-types';

describe('filterUsers status filter', () => {
  const users = [
    { id: '1', status: 'active', firstName: 'A', lastName: 'B', email: 'a@b.com' },
    { id: '2', status: 'suspended', firstName: 'C', lastName: 'D', email: 'c@d.com' },
  ] as User[];

  it('shows all users when status is "all"', () => {
    const result = filterUsers(users, '', { ...DEFAULT_USER_FILTER, status: 'all' });
    expect(result).toHaveLength(2);
  });

  it('filters to active only', () => {
    const result = filterUsers(users, '', { ...DEFAULT_USER_FILTER, status: 'active' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filters to suspended only', () => {
    const result = filterUsers(users, '', { ...DEFAULT_USER_FILTER, status: 'suspended' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });
});
```

- [ ] **Step 3: Test AuthContext suspension enforcement**

Update the existing AuthContext test to verify that when `userProfile.status` is `'suspended'`, `signOut` is called. Mock the `supabase.from('people').select(...)` to return `{ status: 'suspended' }`.

- [ ] **Step 4: Test self-suspend prevention**

Test that the status dropdown is disabled when the user edits their own profile. This can be a component test for UserEditPanel rendering with `userId === currentUser.id`.

- [ ] **Step 5: Run full test suite**

Run: `cd apps/myk9show && pnpm test -- --run`
Expected: All tests pass.

- [ ] **Step 6: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: Clean.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/
git commit -m "test: add tests for user status, filters, and suspension enforcement"
```

---

## Chunk 7: Final Verification

### Task 12: End-to-end manual verification

- [ ] **Step 1: Start dev server**

Run: `pnpm dev:show`

- [ ] **Step 2: Verify admin user table**

1. Log in as site_admin
2. Navigate to User Management
3. Verify: Status column shows "Active" badges (green)
4. Verify: Last Login column shows relative times (not mock "Last Activity" data)
5. Verify: "Show deleted" checkbox is unchecked by default
6. Check "Show deleted" — deleted users appear with strikethrough and "Deleted" badge
7. Uncheck — deleted users disappear

- [ ] **Step 3: Verify status filter**

1. Filter by "Active" — only active users shown
2. Filter by "Suspended" — empty (no suspended users yet)
3. Filter by "All Status" — all users shown

- [ ] **Step 4: Verify suspend flow**

1. Open a user's edit panel
2. Change status from Active to Suspended
3. Confirm the confirmation dialog
4. Verify badge changes to red "Suspended"
5. Verify the suspended user cannot log in (test in incognito)

- [ ] **Step 5: Verify self-suspend prevention**

1. Open your own user edit panel
2. Verify the status dropdown is disabled
3. Verify tooltip text explains why

- [ ] **Step 6: Update TO-DOS.md**

Mark the "Add `status` column to `people` table" item as complete in TO-DOS.md.

- [ ] **Step 7: Final commit**

```bash
git add TO-DOS.md
git commit -m "docs: mark user status todo as complete"
```
