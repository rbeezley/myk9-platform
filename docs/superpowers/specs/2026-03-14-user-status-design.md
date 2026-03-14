# User Status & Last Login — Design Spec

**Date:** 2026-03-14
**Status:** Draft

## Problem

The admin user table shows Active/Inactive/Suspended badges and filter options, but none of it is backed by real data. Status is computed from profile completeness (has email + name = "active"), the "Suspended" filter is hardcoded to `return false`, and the "Account Active" switch in the edit panel doesn't save. There's no way for an admin to suspend a user or see when they last logged in.

## Design

### Status Column

Add a `status` column to the `people` table with two values:

- **`active`** (default) — normal account, can log in and use the platform
- **`suspended`** — admin-set, blocks login

No "inactive" or "pending" status. Inactivity is handled by the Last Login column (admin filters by date). Incomplete profiles are visible from blank name fields in the table.

### Last Login Column

Display `last_sign_in_at` from `auth.users` in the admin user table as a sortable column. Shows relative time ("2 hours ago", "3 days ago"). Very old dates (configurable threshold, default 6+ months) get a warning tint. "Never" for users who haven't logged in.

### Suspended Login Block (Layered)

Two layers of enforcement:

1. **Database level:** A `public.custom_access_token_hook` function (Supabase Auth Hook) that checks `people.status` during token creation. If `status = 'suspended'`, the hook rejects the token with an error claim. Configured via Supabase Dashboard under Auth > Hooks > Custom Access Token.

2. **Client level:** AuthContext checks `people.status` after login. If suspended, signs the user out and displays a message: "Your account has been suspended. Contact the administrator for assistance." This handles the edge case where an admin suspends a currently logged-in user — on their next page load or token refresh, they're signed out with a clear explanation.

### Deleted User Visibility

- Default view hides soft-deleted users (`deleted_at IS NULL`)
- "Show deleted" checkbox in the filter bar reveals them
- Deleted rows: strikethrough text, dimmed opacity, gray "Deleted" badge
- No status badge shown for deleted users — the "Deleted" indicator replaces it

### Admin Edit Panel

Replace the non-functional "Account Active" switch with a status dropdown:

- Dropdown with "Active" and "Suspended" options
- If the selected user is the current admin, the "Suspended" option is disabled with a tooltip: "You cannot suspend your own account"
- Suspending shows a confirmation dialog: "This will immediately block [name] from logging in. Continue?"
- Status change is saved via the existing `useUpdateUserMutation`

### User Table Changes

- **Status badge:** Green "Active" or red "Suspended" (replace current computed badge)
- **Suspended row:** Subtle red background tint, red name text
- **Last Login column:** New sortable column showing relative time from `auth.users.last_sign_in_at`
- **Blank names:** Shown as italic dashes — no special badge needed
- **Filter dropdown:** "All Status", "Active", "Suspended" (remove "Inactive")
- **Show deleted toggle:** Checkbox in filter bar, off by default

## Database Changes

### Migration `063_add_people_status_and_auth_hook.sql`

```sql
-- Add status column
ALTER TABLE people ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE people ADD CONSTRAINT people_status_check CHECK (status IN ('active', 'suspended'));
CREATE INDEX idx_people_status ON people (status);

-- Auth hook to block suspended users at token creation
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  person_status TEXT;
BEGIN
  SELECT status INTO person_status
  FROM public.people
  WHERE auth_user_id = (event->>'user_id')::uuid
  AND deleted_at IS NULL;

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

-- Grant auth admin access to run the hook and read people status
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
GRANT SELECT ON public.people TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- Admin user list RPC (joins auth.users for last_sign_in_at)
CREATE OR REPLACE FUNCTION public.get_admin_user_list(show_deleted BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  status TEXT,
  roles TEXT[],
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Verify caller is a site_admin
  IF NOT EXISTS (
    SELECT 1 FROM public.people
    WHERE auth_user_id = auth.uid()
    AND deleted_at IS NULL
    AND ('site_admin' = ANY(roles)
         OR EXISTS (
           SELECT 1 FROM public.user_roles ur
           JOIN public.roles r ON r.id = ur.role_id
           WHERE ur.user_id = auth.uid()
           AND r.name = 'site_admin'
         ))
  ) THEN
    RAISE EXCEPTION 'Unauthorized: site_admin role required';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.first_name,
    p.last_name,
    p.email,
    p.status,
    p.roles,
    p.deleted_at,
    p.deleted_by,
    p.created_at,
    au.last_sign_in_at
  FROM public.people p
  LEFT JOIN auth.users au ON au.id = p.auth_user_id
  WHERE show_deleted OR p.deleted_at IS NULL;
END;
$$;
```

**Manual step:** Enable the hook in the Supabase Dashboard under Authentication > Hooks > Custom Access Token (point it to `public.custom_access_token_hook`).

## Client Changes

### Type Definitions

**`user-types.ts`** — Add `status` field to the `User` interface:

```typescript
status: 'active' | 'suspended';
```

**`database-mappings.ts`** — Add `status` to `DbUser` and `DbUserUpdate` types.

**`UserManagementPage.types.ts`** — Update `UserFilter`:

- Change `status` options to `'active' | 'suspended' | 'all'`
- Add `showDeleted: boolean`

**New type** for admin user list RPC response (includes `lastSignInAt`):

```typescript
interface AdminUser extends User {
  lastSignInAt: string | null;
}
```

### Data Layer

**`useUsersQuery.ts`** — Add `mapDbUserToUser` mapping for `status` field. Add `mapUserToDbUpdate` mapping for `status` field.

**New hook: `useAdminUsersQuery`** — Calls `supabase.rpc('get_admin_user_list', { show_deleted })` instead of querying the `people` table directly. Returns `AdminUser[]` with `lastSignInAt` included. `UserManagementPage` switches to this hook.

### AuthContext

- Add `status` to the `people` query select: `'id, roles, first_name, last_name, email, status'`
- After sign-in, if `status === 'suspended'`: sign out, show suspended message
- On token refresh / page load, same check

### UserTable

- Replace `getUserStatus()` computed logic with direct `status` column read
- Add `lastSignInAt` column with relative time display and sort
- Add "Show deleted" checkbox to filter bar
- Deleted rows: strikethrough, dimmed, gray "Deleted" badge replacing status badge
- Suspended rows: red tint background, red name text

### UserFilters

- Update `STATUS_OPTIONS` to: All Status, Active, Suspended (remove Inactive)
- Add "Show deleted" checkbox state

### UserManagementPage.helpers

- Replace mock status filter logic with server-side filtering via `get_admin_user_list` RPC parameters
- Status filtering and deleted filtering handled by the RPC + client-side post-filter on status

### UserDetailsDialog

- Replace `UserFormData.isActive: boolean` with `UserFormData.status: 'active' | 'suspended'`
- Replace "Account Active" switch with status dropdown (Active / Suspended)
- Disable "Suspended" option when viewing own account, with tooltip
- Add confirmation dialog for suspending
- Include `status` in the update mutation payload

## Testing

- Migration: verify column exists, default is 'active', constraint rejects invalid values
- Auth hook: verify suspended user gets 403 on token creation
- Auth hook: verify `supabase_auth_admin` has SELECT on `people`
- AuthContext: verify suspended user is signed out with message on page load
- RPC: verify `get_admin_user_list` rejects non-admin callers
- RPC: verify `show_deleted` parameter filters correctly
- UserTable: verify badges reflect real status, last login displays correctly
- Filters: verify status filter and "show deleted" toggle work
- Edit panel: verify status change saves and confirmation dialog appears for suspend
- Edge case: admin cannot suspend themselves (dropdown disabled)
