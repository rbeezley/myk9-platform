# Migrate Show Officials to user_roles & Harden Volunteer RLS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move secretary/chairman/chief_steward assignment from TEXT fields on `shows` into scoped `user_roles` rows, then rewrite volunteer RLS to be show-scoped.

**Architecture:** Create `is_show_secretary()` and `is_show_official()` helper functions. Migrate existing TEXT data into `user_roles` rows with `show_id` scoping. Drop the TEXT columns. Extend `ensureUserHasRole()` to support show scoping. Rewrite all consumers (~30 files) to read officials from `user_roles` via a new `useShowOfficials` hook.

**Tech Stack:** PostgreSQL (SECURITY DEFINER functions, RLS policies), Supabase (PostgREST joins), React Query, TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-03-30-secretary-scoping-rls-design.md`

---

### Task 1: Database Migration — Helper Functions + Data Migration + Column Drop + Volunteer RLS

**Files:**

- Create: `supabase/migrations/096_migrate_officials_to_user_roles.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- =============================================================================
-- Migration 096: Migrate show officials to user_roles & harden volunteer RLS
--
-- 1. Create is_show_secretary() and is_show_official() helper functions
-- 2. Migrate shows.secretary/chairman/chief_steward data into user_roles rows
-- 3. Drop the TEXT columns from shows
-- 4. Rewrite volunteer RLS policies to use helper functions with show scoping
--
-- ROLLBACK:
-- ALTER TABLE shows ADD COLUMN secretary TEXT, ADD COLUMN chairman TEXT, ADD COLUMN chief_steward TEXT;
-- UPDATE shows s SET secretary = p.id::text FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN people p ON p.id = ur.user_id WHERE r.name = 'secretary' AND ur.show_id = s.id AND ur.is_active = true;
-- UPDATE shows s SET chairman = p.id::text FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN people p ON p.id = ur.user_id WHERE r.name = 'chairman' AND ur.show_id = s.id AND ur.is_active = true;
-- UPDATE shows s SET chief_steward = p.id::text FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN people p ON p.id = ur.user_id WHERE r.name = 'steward' AND ur.show_id = s.id AND ur.is_active = true;
-- DROP FUNCTION IF EXISTS is_show_secretary(UUID);
-- DROP FUNCTION IF EXISTS is_show_official(UUID);
-- (Then restore original volunteer policies from migration 095)
-- =============================================================================

-- =============================================================================
-- 1. Helper functions
-- =============================================================================

CREATE OR REPLACE FUNCTION is_show_secretary(check_show_id UUID)
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
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      AND (
        (r.name = 'secretary' AND ur.show_id = check_show_id)
        OR r.name = 'site_admin'
      )
  );
$$;

CREATE OR REPLACE FUNCTION is_show_official(check_show_id UUID)
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
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      AND (
        (r.name IN ('secretary', 'chairman', 'steward') AND ur.show_id = check_show_id)
        OR r.name = 'site_admin'
      )
  );
$$;

GRANT EXECUTE ON FUNCTION is_show_secretary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_show_official(UUID) TO authenticated;

-- =============================================================================
-- 2. Migrate existing show official data into user_roles
-- =============================================================================

-- Secretary: shows.secretary stores a people.id as TEXT
INSERT INTO user_roles (user_id, role_id, show_id, is_active, granted_at)
SELECT
  s.secretary::uuid,
  r.id,
  s.id,
  true,
  NOW()
FROM shows s
CROSS JOIN roles r
WHERE r.name = 'secretary'
  AND s.secretary IS NOT NULL
  AND s.secretary != ''
  AND s.deleted_at IS NULL
  -- Only migrate if the person actually exists
  AND EXISTS (SELECT 1 FROM people p WHERE p.id = s.secretary::uuid)
  -- Skip if user_roles row already exists for this person+role+show
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = s.secretary::uuid
      AND ur.role_id = r.id
      AND ur.show_id = s.id
  );

-- Chairman: shows.chairman stores a people.id as TEXT
INSERT INTO user_roles (user_id, role_id, show_id, is_active, granted_at)
SELECT
  s.chairman::uuid,
  r.id,
  s.id,
  true,
  NOW()
FROM shows s
CROSS JOIN roles r
WHERE r.name = 'chairman'
  AND s.chairman IS NOT NULL
  AND s.chairman != ''
  AND s.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM people p WHERE p.id = s.chairman::uuid)
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = s.chairman::uuid
      AND ur.role_id = r.id
      AND ur.show_id = s.id
  );

-- Chief Steward: shows.chief_steward stores a people.id as TEXT → steward role
INSERT INTO user_roles (user_id, role_id, show_id, is_active, granted_at)
SELECT
  s.chief_steward::uuid,
  r.id,
  s.id,
  true,
  NOW()
FROM shows s
CROSS JOIN roles r
WHERE r.name = 'steward'
  AND s.chief_steward IS NOT NULL
  AND s.chief_steward != ''
  AND s.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM people p WHERE p.id = s.chief_steward::uuid)
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = s.chief_steward::uuid
      AND ur.role_id = r.id
      AND ur.show_id = s.id
  );

-- =============================================================================
-- 3. Drop TEXT columns from shows
-- =============================================================================

ALTER TABLE shows DROP COLUMN IF EXISTS secretary;
ALTER TABLE shows DROP COLUMN IF EXISTS chairman;
ALTER TABLE shows DROP COLUMN IF EXISTS chief_steward;

-- =============================================================================
-- 4. Rewrite volunteer RLS policies with show scoping
-- =============================================================================

-- Drop old policies
DROP POLICY IF EXISTS "Secretary can manage volunteers" ON volunteers;
DROP POLICY IF EXISTS "Secretary can manage class assignments" ON volunteer_class_assignments;
DROP POLICY IF EXISTS "Secretary can manage general assignments" ON volunteer_general_assignments;

-- Volunteers: secretary must be assigned to this show
CREATE POLICY "Secretary can manage volunteers"
  ON volunteers FOR ALL TO authenticated
  USING ((SELECT public.is_show_secretary(show_id)));

-- Class assignments: scope through parent volunteer's show_id
CREATE POLICY "Secretary can manage class assignments"
  ON volunteer_class_assignments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.volunteers v
      WHERE v.id = volunteer_id
        AND (SELECT public.is_show_secretary(v.show_id))
    )
  );

-- General assignments: scope through parent volunteer's show_id
CREATE POLICY "Secretary can manage general assignments"
  ON volunteer_general_assignments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.volunteers v
      WHERE v.id = volunteer_id
        AND (SELECT public.is_show_secretary(v.show_id))
    )
  );

-- =============================================================================
-- 5. Index for show-scoped role lookups
-- =============================================================================

CREATE INDEX IF NOT EXISTS user_roles_show_role_idx
  ON user_roles(show_id, role_id)
  WHERE show_id IS NOT NULL AND is_active = true;

-- =============================================================================
-- SUCCESS
-- =============================================================================
SELECT 'Migration 096: Officials migrated to user_roles, volunteer RLS hardened' as status;
```

- [ ] **Step 2: Apply the migration locally**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && supabase db push --local`

If that command isn't available, use:

```bash
supabase migration up --local
```

Expected: Migration applies without errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/096_migrate_officials_to_user_roles.sql
git commit -m "feat(db): migrate show officials to user_roles and harden volunteer RLS

Create is_show_secretary() and is_show_official() SECURITY DEFINER helpers.
Migrate shows.secretary/chairman/chief_steward data into user_roles rows
with show_id scoping. Drop the TEXT columns. Rewrite volunteer policies
to use show-scoped helper functions."
```

---

### Task 2: Regenerate Supabase Types

**Files:**

- Modify: `packages/supabase/src/database.types.ts`
- Modify: `apps/myk9show/src/types/supabase.ts`

- [ ] **Step 1: Regenerate types from the local database**

Run:

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform" && supabase gen types typescript --local > packages/supabase/src/database.types.ts
```

Then copy to the app:

```bash
cp packages/supabase/src/database.types.ts apps/myk9show/src/types/supabase.ts
```

- [ ] **Step 2: Verify the columns are gone**

Check that `secretary`, `chairman`, and `chief_steward` no longer appear in the shows Row/Insert/Update types. Also verify that `is_show_secretary` and `is_show_official` appear in the Functions section.

Run: `grep -n 'secretary\|chairman\|chief_steward' packages/supabase/src/database.types.ts`

Expected: Only function references, no column references in shows table types.

- [ ] **Step 3: Commit**

```bash
git add packages/supabase/src/database.types.ts apps/myk9show/src/types/supabase.ts
git commit -m "chore: regenerate Supabase types after officials column drop"
```

---

### Task 3: Remove Official Fields from Show Types and Interfaces

**Files:**

- Modify: `apps/myk9show/src/types/show-types.ts:86-88,136-138`
- Modify: `apps/myk9show/src/store/showStore.ts:54-56,109-111,187-189,313-315,343-345`
- Modify: `apps/myk9show/src/services/replication/ReplicatedShowsTable.ts:37-39,71-73,139-141`
- Modify: `apps/myk9show/src/services/mappers/showMappers.ts:22-24,60-62,221-223,281-283,339-345,403-405`
- Modify: `apps/myk9show/src/types/database-mappings.ts`

- [ ] **Step 1: Remove from Show interface**

In `apps/myk9show/src/types/show-types.ts`, delete lines 86-88:

```typescript
// DELETE these three lines from the Show interface:
chairman: string;
secretary: string;
chiefSteward: string;
```

- [ ] **Step 2: Remove from ShowInput interface**

In the same file, delete lines 136-138:

```typescript
// DELETE these three lines from the ShowInput interface:
chairman: string;
secretary: string;
chiefSteward: string;
```

- [ ] **Step 3: Remove from showMappers.ts**

In `apps/myk9show/src/services/mappers/showMappers.ts`:

Remove from `mapShowInputToInsert` (lines 22-24):

```typescript
// DELETE:
chairman: input.chairman,
secretary: input.secretary,
chief_steward: input.chiefSteward,
```

Remove from `mapShowInputToUpdate` (lines 60-62):

```typescript
// DELETE:
if (input.chairman !== undefined) update.chairman = input.chairman;
if (input.secretary !== undefined) update.secretary = input.secretary;
if (input.chiefSteward !== undefined) update.chief_steward = input.chiefSteward;
```

Remove from `mapDatabaseToShow` (lines 221-223):

```typescript
// DELETE:
chairman: dbShow.chairman || '',
secretary: dbShow.secretary || '',
chiefSteward: dbShow.chief_steward || '',
```

Remove from `mapShowToShowInput` (lines 281-283):

```typescript
// DELETE:
chairman: show.chairman,
secretary: show.secretary,
chiefSteward: show.chiefSteward,
```

Remove from `validateShowData` (lines 339-345):

```typescript
// DELETE:
if (!show.secretary?.trim()) {
  errors.push('Secretary is required');
}

if (!show.chairman?.trim()) {
  errors.push('Chairman is required');
}
```

Remove from `createDefaultShowInput` (lines 403-405):

```typescript
// DELETE:
chairman: '',
secretary: '',
chiefSteward: '',
```

- [ ] **Step 4: Remove from showStore.ts**

In `apps/myk9show/src/store/showStore.ts`:

Remove from the local `ShowInput` interface (lines 109-111):

```typescript
// DELETE:
chairman: string;
secretary: string;
chiefSteward: string;
```

Remove from `replicatedToShow` (lines 54-56):

```typescript
// DELETE:
chairman: replicated.chairman || '',
secretary: replicated.secretary || '',
chiefSteward: replicated.chiefSteward || '',
```

Remove from `addShow` (lines 187-189):

```typescript
// DELETE:
chairman: showData.chairman || undefined,
secretary: showData.secretary || undefined,
chiefSteward: showData.chiefSteward || undefined,
```

Remove from `updateShow` — both blocks (lines 313-315 and 343-345):

```typescript
// DELETE (both blocks):
if (updates.chairman !== undefined) replicatedUpdates.chairman = updates.chairman;
if (updates.secretary !== undefined) replicatedUpdates.secretary = updates.secretary;
if (updates.chiefSteward !== undefined) replicatedUpdates.chiefSteward = updates.chiefSteward;
```

- [ ] **Step 5: Remove from ReplicatedShowsTable.ts**

In `apps/myk9show/src/services/replication/ReplicatedShowsTable.ts`:

Remove from `ReplicatedShow` interface (lines 37-39):

```typescript
// DELETE:
chairman?: string | undefined;
secretary?: string | undefined;
chiefSteward?: string | undefined;
```

Remove from `rowToShow` (lines 71-73):

```typescript
// DELETE:
chairman: row.chairman ?? undefined,
secretary: row.secretary ?? undefined,
chiefSteward: row.chief_steward ?? undefined,
```

Remove from `toSupabaseRow` (lines 139-141):

```typescript
// DELETE:
chairman: show.chairman ?? null,
secretary: show.secretary ?? null,
chief_steward: show.chiefSteward ?? null,
```

- [ ] **Step 6: Run typecheck to see what breaks**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`

Expected: Many TypeScript errors in files that still reference `show.secretary`, `show.chairman`, or `show.chiefSteward`. These are the consumers we fix in subsequent tasks.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/types/show-types.ts apps/myk9show/src/store/showStore.ts apps/myk9show/src/services/replication/ReplicatedShowsTable.ts apps/myk9show/src/services/mappers/showMappers.ts
git commit -m "refactor: remove secretary/chairman/chiefSteward from Show types and mappers"
```

---

### Task 4: Extend ensureUserHasRole to Support Show Scoping

**Files:**

- Modify: `apps/myk9show/src/services/rbac/RoleManager.ts:149-213`
- Modify: `apps/myk9show/src/services/rbac/RBACService.ts:113-114`

- [ ] **Step 1: Update ensureUserHasRole in RoleManager**

In `apps/myk9show/src/services/rbac/RoleManager.ts`, replace the `ensureUserHasRole` method (lines 149-213) with a version that accepts an options object for scoping:

```typescript
  async ensureUserHasRole(
    userId: string,
    roleName: string,
    scopeOptions?: { clubId?: string; showId?: string }
  ): Promise<boolean> {
    const clubId = scopeOptions?.clubId;
    const showId = scopeOptions?.showId;

    // Look up the role ID
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id')
      .eq('name', roleName)
      .single();

    if (roleError || !role) {
      logger.warn('ensureUserHasRole: role not found', 'rbac', { roleName });
      return false;
    }

    // Check if the assignment already exists (active or inactive)
    let query = supabase
      .from('user_roles')
      .select('id, is_active')
      .eq('user_id', userId)
      .eq('role_id', role.id);

    if (clubId) {
      query = query.eq('club_id', clubId);
    } else {
      query = query.is('club_id', null);
    }

    if (showId) {
      query = query.eq('show_id', showId);
    } else {
      query = query.is('show_id', null);
    }

    const { data: existing } = await query.limit(1);

    if (existing && existing.length > 0) {
      if (!existing[0].is_active) {
        // Reactivate the deactivated role
        const { error: reactivateError } = await supabase
          .from('user_roles')
          .update({ is_active: true })
          .eq('id', existing[0].id);
        if (reactivateError) {
          throw new Error(`Failed to reactivate role: ${reactivateError.message}`);
        }
        this.clearUserCache(userId);
        logger.info('Reactivated role', 'rbac', { userId, roleName, clubId, showId });
        return true;
      }
      return false; // Already has this active role
    }

    // Determine scope type
    let scopeType: string | undefined;
    let scopeId: string | undefined;
    if (showId) {
      scopeType = 'show';
      scopeId = showId;
    } else if (clubId) {
      scopeType = 'club';
      scopeId = clubId;
    }

    // Grant the role (catch unique constraint violations from concurrent calls)
    try {
      await this.assignRole({
        userId,
        roleName,
        roleId: role.id,
        scopeType,
        scopeId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('23505')) {
        return false; // Race condition: another call granted it first
      }
      throw err;
    }

    logger.info('Auto-granted role', 'rbac', { userId, roleName, clubId, showId });
    return true;
  }
```

- [ ] **Step 2: Update the RBACService delegation**

In `apps/myk9show/src/services/rbac/RBACService.ts`, update the `ensureUserHasRole` method signature (line 113):

```typescript
  async ensureUserHasRole(
    userId: string,
    roleName: string,
    scopeOptions?: { clubId?: string; showId?: string }
  ): Promise<boolean> {
    return this.roleManager.ensureUserHasRole(userId, roleName, scopeOptions);
  }
```

- [ ] **Step 3: Fix existing callers that pass clubId as third arg**

Search for all callers of `ensureUserHasRole` and update them to use the new options object:

In `apps/myk9show/src/hooks/useAuth.ts`, the two calls pass no clubId (just `(personId, 'exhibitor')`) — these are fine, no change needed.

In `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts` (line 285), change:

```typescript
// OLD:
rbacService.ensureUserHasRole(show.secretary, UserRole.SECRETARY, show.clubId);

// NEW (this line will be rewritten in Task 7, but for now fix the signature):
// This call will be completely rewritten in Task 7 when we change the wizard data flow
```

Actually, leave this caller for Task 7 — it will be rewritten entirely when we change the wizard to use show-scoped role grants instead of reading `show.secretary`.

- [ ] **Step 4: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`

Expected: The only remaining errors should be from consumers of `show.secretary`/etc (fixed in later tasks), not from the RBAC changes.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/services/rbac/RoleManager.ts apps/myk9show/src/services/rbac/RBACService.ts
git commit -m "feat(rbac): extend ensureUserHasRole to support show_id scoping"
```

---

### Task 5: Create useShowOfficials Hook

**Files:**

- Create: `apps/myk9show/src/hooks/queries/useShowOfficials.ts`
- Modify: `apps/myk9show/src/lib/queryClient.ts` (add query key)
- Test: `apps/myk9show/src/hooks/queries/__tests__/useShowOfficials.test.ts`

- [ ] **Step 1: Add query key to queryClient.ts**

In `apps/myk9show/src/lib/queryClient.ts`, add to the `queryKeys` object:

```typescript
showOfficials: (showId: string) => ['shows', showId, 'officials'] as const,
```

- [ ] **Step 2: Write the failing test**

Create `apps/myk9show/src/hooks/queries/__tests__/useShowOfficials.test.ts`:

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useShowOfficials, type ShowOfficial } from '../useShowOfficials';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// Mock supabase
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockIn = vi.fn();
const mockNot = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
    })),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useShowOfficials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty arrays when no officials assigned', async () => {
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useShowOfficials('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.secretaries).toEqual([]);
    expect(result.current.data?.chairmen).toEqual([]);
    expect(result.current.data?.stewards).toEqual([]);
  });

  it('is disabled when showId is undefined', () => {
    const { result } = renderHook(() => useShowOfficials(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
  });

  it('groups officials by role', async () => {
    const mockData = [
      {
        role_id: 'r1',
        show_id: 'show-1',
        roles: { name: 'secretary' },
        people: { id: 'p1', first_name: 'Jane', last_name: 'Doe', email: 'jane@test.com' },
      },
      {
        role_id: 'r2',
        show_id: 'show-1',
        roles: { name: 'chairman' },
        people: { id: 'p2', first_name: 'John', last_name: 'Smith', email: 'john@test.com' },
      },
      {
        role_id: 'r3',
        show_id: 'show-1',
        roles: { name: 'steward' },
        people: { id: 'p3', first_name: 'Bob', last_name: 'Lee', email: null },
      },
    ];

    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue({ data: mockData, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useShowOfficials('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.secretaries).toHaveLength(1);
    expect(result.current.data?.secretaries[0]).toEqual({
      personId: 'p1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@test.com',
      role: 'secretary',
    });
    expect(result.current.data?.chairmen).toHaveLength(1);
    expect(result.current.data?.chairmen[0].personId).toBe('p2');
    expect(result.current.data?.stewards).toHaveLength(1);
    expect(result.current.data?.stewards[0].personId).toBe('p3');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && npx vitest run src/hooks/queries/__tests__/useShowOfficials.test.ts`

Expected: FAIL — module `../useShowOfficials` not found.

- [ ] **Step 4: Write the implementation**

Create `apps/myk9show/src/hooks/queries/useShowOfficials.ts`:

```typescript
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';

export interface ShowOfficial {
  personId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  role: 'secretary' | 'chairman' | 'steward';
}

export interface ShowOfficials {
  secretaries: ShowOfficial[];
  chairmen: ShowOfficial[];
  stewards: ShowOfficial[];
}

const OFFICIAL_ROLES = ['secretary', 'chairman', 'steward'];

async function fetchShowOfficials(showId: string): Promise<ShowOfficials> {
  const { data, error } = await supabase
    .from('user_roles')
    .select(
      `
      role_id,
      show_id,
      roles!inner(name),
      people!inner(id, first_name, last_name, email)
    `
    )
    .eq('show_id', showId)
    .in('roles.name', OFFICIAL_ROLES)
    .not('is_active', 'eq', false);

  if (error) throw error;

  const result: ShowOfficials = { secretaries: [], chairmen: [], stewards: [] };

  for (const row of data || []) {
    const role = (row.roles as Record<string, unknown>).name as string;
    const person = row.people as Record<string, unknown>;
    const official: ShowOfficial = {
      personId: person.id as string,
      firstName: (person.first_name as string) || '',
      lastName: (person.last_name as string) || '',
      email: (person.email as string) || null,
      role: role as ShowOfficial['role'],
    };

    if (role === 'secretary') result.secretaries.push(official);
    else if (role === 'chairman') result.chairmen.push(official);
    else if (role === 'steward') result.stewards.push(official);
  }

  return result;
}

export function useShowOfficials(showId: string | undefined): UseQueryResult<ShowOfficials> {
  return useQuery({
    queryKey: queryKeys.showOfficials(showId || ''),
    queryFn: () => fetchShowOfficials(showId!),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}

/**
 * Non-hook version for use outside React (export, reports).
 * Returns the same data structure as the hook.
 */
export async function getShowOfficials(showId: string): Promise<ShowOfficials> {
  return fetchShowOfficials(showId);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && npx vitest run src/hooks/queries/__tests__/useShowOfficials.test.ts`

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useShowOfficials.ts apps/myk9show/src/hooks/queries/__tests__/useShowOfficials.test.ts apps/myk9show/src/lib/queryClient.ts
git commit -m "feat: add useShowOfficials hook for fetching show officials from user_roles"
```

---

### Task 6: Rewrite ShowOfficials Display Component

**Files:**

- Modify: `apps/myk9show/src/components/shows/overview/ShowOfficials.tsx`
- Modify: `apps/myk9show/src/components/shows/tabs/ShowOverviewTab.tsx`

- [ ] **Step 1: Rewrite ShowOfficials to use the hook**

Replace the entire contents of `apps/myk9show/src/components/shows/overview/ShowOfficials.tsx`:

```typescript
import { Card } from '@/components/ui/card';
import { Mail } from 'lucide-react';
import { PersonAvatar } from '@/components/common/PersonAvatar';
import { useShowOfficials, type ShowOfficial } from '@/hooks/queries/useShowOfficials';

interface OfficialCardProps {
  official: ShowOfficial;
  role: string;
}

function OfficialCard({ official, role }: OfficialCardProps) {
  const name = `${official.firstName} ${official.lastName}`.trim() || 'Unknown';
  return (
    <div className="flex flex-col items-center text-center gap-2 p-4">
      <PersonAvatar name={name} size="lg" />
      <div>
        <div className="font-semibold text-foreground">{name}</div>
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{role}</div>
      </div>
      {official.email && (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <a
            href={`mailto:${official.email}`}
            className="flex items-center gap-1.5 hover:text-foreground"
          >
            <Mail className="h-3 w-3" />
            {official.email}
          </a>
        </div>
      )}
    </div>
  );
}

interface ShowOfficialsProps {
  showId: string;
}

export function ShowOfficials({ showId }: ShowOfficialsProps) {
  const { data: officials } = useShowOfficials(showId);

  if (!officials) return null;

  const hasAny =
    officials.secretaries.length > 0 ||
    officials.chairmen.length > 0 ||
    officials.stewards.length > 0;

  if (!hasAny) return null;

  return (
    <Card>
      <div className="p-4 border-b border-border/30">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Show Officials
        </h3>
      </div>
      <div className="divide-y divide-border/30">
        {officials.chairmen.map(o => (
          <OfficialCard key={o.personId} official={o} role="Chairman" />
        ))}
        {officials.secretaries.map(o => (
          <OfficialCard key={o.personId} official={o} role="Secretary" />
        ))}
        {officials.stewards.map(o => (
          <OfficialCard key={o.personId} official={o} role="Chief Steward" />
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Update ShowOverviewTab to pass showId instead of individual IDs**

In `apps/myk9show/src/components/shows/tabs/ShowOverviewTab.tsx`, change the ShowOfficials usage (around lines 40-44):

```typescript
// OLD:
<ShowOfficials
  chairmanId={show.chairman}
  secretaryId={show.secretary}
  chiefStewardId={show.chiefSteward}
/>

// NEW:
<ShowOfficials showId={show.id} />
```

Remove the old prop-based imports if `useResolveOfficial` and `ResolvedPerson` were imported here (they shouldn't be — they were internal to ShowOfficials).

- [ ] **Step 3: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`

Expected: Errors in ShowOfficials should be resolved. Other consumers of `show.secretary` etc may still have errors.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/shows/overview/ShowOfficials.tsx apps/myk9show/src/components/shows/tabs/ShowOverviewTab.tsx
git commit -m "refactor: ShowOfficials reads from user_roles via useShowOfficials hook"
```

---

### Task 7: Rewrite Show Creation Wizard

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/ShowCreationWizard/showCreationWizardTransformers.ts`
- Modify: `apps/myk9show/src/pages/secretary/ShowCreationWizard/showCreationWizardValidation.ts`
- Modify: `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts`
- Modify: `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx`
- Modify: `apps/myk9show/src/components/shows/wizard/steps/ReviewStep.tsx`

This task changes the wizard to store official selections in temporary state and write `user_roles` rows after show creation, instead of writing to `shows.secretary`/etc.

- [ ] **Step 1: Update WizardShowData in transformers**

In `apps/myk9show/src/pages/secretary/ShowCreationWizard/showCreationWizardTransformers.ts`:

Remove `chairman` and `secretary` from `WizardShowData` interface (lines 10-25). Add an `officials` object:

```typescript
// In WizardShowData interface, REPLACE chairman/secretary with:
officials: {
  secretary: string[];   // people.id values
  chairman: string[];
  steward: string[];
};
```

Update `transformShowToWizard()` — remove lines that read `show.chairman`/`show.secretary`. Initialize officials as empty arrays (in edit mode, they'll be populated from `user_roles` by the wizard page):

```typescript
// In the returned object, REPLACE chairman/secretary lines with:
officials: {
  secretary: [],
  chairman: [],
  steward: [],
},
```

Update `transformWizardDataToShow()` — remove `chairman`, `secretary`, `chiefSteward` from the returned Show object.

- [ ] **Step 2: Update wizard validation**

In `apps/myk9show/src/pages/secretary/ShowCreationWizard/showCreationWizardValidation.ts`:

Update the `ShowData` interface (lines 14-15) — replace `chairman`/`secretary` with `officials`:

```typescript
officials: {
  secretary: string[];
  chairman: string[];
  steward: string[];
};
```

Update validation messages (lines 42-43) to check `officials.secretary.length > 0` and `officials.chairman.length > 0`:

```typescript
// REPLACE:
if (!showData.chairman) errors.push('Show chairman is required');
if (!showData.secretary) errors.push('Show secretary is required');

// WITH:
if (showData.officials.chairman.length === 0) errors.push('Show chairman is required');
if (showData.officials.secretary.length === 0) errors.push('Show secretary is required');
```

- [ ] **Step 3: Update useShowCreationWizardActions**

In `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts`:

Replace the single secretary role grant (lines 282-291) with grants for all officials:

```typescript
// REPLACE the old secretary auto-grant block with:
// Auto-grant official roles scoped to the new show
const officialGrants = [
  ...show.officials.secretary.map(id => ({ id, role: UserRole.SECRETARY })),
  ...show.officials.chairman.map(id => ({ id, role: UserRole.CHAIRMAN })),
  ...show.officials.steward.map(id => ({ id, role: UserRole.STEWARD })),
];

for (const grant of officialGrants) {
  rbacService.ensureUserHasRole(grant.id, grant.role, { showId: realShowId }).catch(err =>
    logger.warn('Failed to auto-grant official role', 'wizard', {
      personId: grant.id,
      role: grant.role,
      error: err instanceof Error ? err.message : String(err),
    })
  );
}
```

- [ ] **Step 4: Update ShowDetailsStep**

In `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx`:

Replace the state that reads/writes `show.chairman` and `show.secretary` with reads/writes to `show.officials.chairman[0]` and `show.officials.secretary[0]`.

Update `updateShowData` calls (lines 147-170):

```typescript
// OLD: updateShowData({ chairman: person.id })
// NEW: updateShowData({ officials: { ...show.officials, chairman: [person.id] } })

// OLD: updateShowData({ secretary: person.id })
// NEW: updateShowData({ officials: { ...show.officials, secretary: [person.id] } })
```

Update the selected name derivation to use `show.officials.chairman[0]` instead of `show.chairman`, and similarly for secretary.

- [ ] **Step 5: Update ReviewStep**

In `apps/myk9show/src/components/shows/wizard/steps/ReviewStep.tsx`:

Update validation (lines 58-59):

```typescript
// OLD:
if (!show.chairman) errors.push('Chairman is required');
if (!show.secretary) errors.push('Secretary is required');

// NEW:
if (show.officials.chairman.length === 0) errors.push('Chairman is required');
if (show.officials.secretary.length === 0) errors.push('Secretary is required');
```

Update display (lines 226-237) to resolve person names for `show.officials.chairman[0]` and `show.officials.secretary[0]` instead of `show.chairman` and `show.secretary`.

- [ ] **Step 6: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`

Expected: Wizard-related errors resolved.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ShowCreationWizard/ apps/myk9show/src/components/shows/wizard/steps/
git commit -m "refactor(wizard): store officials in user_roles instead of show TEXT fields"
```

---

### Task 8: Rewrite Edit Forms

**Files:**

- Modify: `apps/myk9show/src/components/panels/edit/ShowEditPanel.types.ts`
- Modify: `apps/myk9show/src/components/panels/edit/ShowEditPanel.helpers.ts`
- Modify: `apps/myk9show/src/components/panels/edit/ShowEditForm.tsx`
- Modify: `apps/myk9show/src/components/shows/ShowDetails/dialogs/EditShowDialog.tsx`

- [ ] **Step 1: Update ShowEditFormData**

In `apps/myk9show/src/components/panels/edit/ShowEditPanel.types.ts`, replace the three fields (lines 28-30):

```typescript
// DELETE:
chairman: string;
secretary: string;
chiefSteward: string;

// ADD:
officials: {
  secretary: string[];
  chairman: string[];
  steward: string[];
};
```

- [ ] **Step 2: Update ShowEditPanel.helpers**

In `apps/myk9show/src/components/panels/edit/ShowEditPanel.helpers.ts`:

Update `showToFormData()` (lines 21-23) — remove the three fields. Initialize officials as empty (will be populated by the component using `useShowOfficials`):

```typescript
// DELETE:
chairman: show.chairman,
secretary: show.secretary,
chiefSteward: show.chiefSteward,

// ADD:
officials: {
  secretary: [],
  chairman: [],
  steward: [],
},
```

Update `formDataToShow()` (lines 56-58) — remove the three conditional spreads:

```typescript
// DELETE:
...(formData.chairman && { chairman: formData.chairman }),
...(formData.secretary && { secretary: formData.secretary }),
...(formData.chiefSteward && { chiefSteward: formData.chiefSteward }),
```

- [ ] **Step 3: Update ShowEditForm.tsx**

In `apps/myk9show/src/components/panels/edit/ShowEditForm.tsx`:

Replace the three SelectField components for chairman/secretary/chiefSteward (lines 209-297) with an Officials section that:

- Reads current officials via `useShowOfficials(showId)`
- Renders person selectors for each role
- On change, calls `rbacService.ensureUserHasRole(personId, role, { showId })` to add
- On remove, calls `rbacService.revokeRole(...)` to remove

The exact UI implementation depends on the existing SelectField pattern. Use the same people list and selection pattern as the current code, but write to `user_roles` instead of updating form data.

- [ ] **Step 4: Update EditShowDialog.tsx**

In `apps/myk9show/src/components/shows/ShowDetails/dialogs/EditShowDialog.tsx`:

Apply the same changes as ShowEditForm — remove chairman/secretary/chiefSteward from `ShowFormData` interface (lines 30-32) and replace the three SelectField components (lines 324-417) with an Officials section that manages `user_roles` rows.

- [ ] **Step 5: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/panels/edit/ apps/myk9show/src/components/shows/ShowDetails/dialogs/EditShowDialog.tsx
git commit -m "refactor(edit): officials section manages user_roles instead of show fields"
```

---

### Task 9: Fix Permission Utilities

**Files:**

- Modify: `apps/myk9show/src/utils/show-relationships.ts:59,67`
- Modify: `apps/myk9show/src/utils/permissionValidation.ts:58-59,80,101-103`
- Modify: `apps/myk9show/src/utils/show-management-tracking.ts:114-142,250-251`

- [ ] **Step 1: Fix show-relationships.ts**

In `apps/myk9show/src/utils/show-relationships.ts`, the `getUserManagedShows` function checks `show.secretary === userId` (line 59) and `show.chairman === userId` (line 67). These fields no longer exist on Show.

This function filters shows from the local store. We need a way to check if a user is an official for a show without the field on the Show object. Options:

1. Query `user_roles` for the user's show-scoped roles and build a Set of show IDs
2. Add a prefetched `managedShowIds` set from an initial query

The cleanest approach is to refactor this function to accept a `managedShowIds: Set<string>` parameter (precomputed from a `user_roles` query) and check membership. Update the call site to pass this set.

Replace the `show.secretary === userId` and `show.chairman === userId` checks:

```typescript
// OLD:
if (show.secretary === userId) return true;
// ...
if (show.chairman === userId) return true;

// NEW:
if (managedShowIds.has(show.id)) return true;
```

If refactoring the function signature is too invasive, an alternative is to do an inline Supabase query. But the function is synchronous, so the `managedShowIds` approach is better.

- [ ] **Step 2: Fix permissionValidation.ts**

In `apps/myk9show/src/utils/permissionValidation.ts`:

The `canEditShow`, `canDeleteShow`, and `canManageEntries` functions check `show.secretary === user.id` etc. Replace with RLS-based permission checks.

Since these functions need to be synchronous (they're called in render), the cleanest approach is to:

1. Add an `isShowOfficial` flag computed from `user_roles` and passed down via context or props
2. Or change these to async and use the DB function

The practical fix: these functions are used as client-side guards alongside DB-level RLS. Since RLS now handles the real security, simplify these to check `isAdmin || isSecretary` (from AuthContext roles) as a UI hint, and let RLS enforce the actual scoping. Remove the `show.secretary === user.id` checks entirely.

```typescript
// In canEditShow, REPLACE:
show.secretary === user.id ||
show.chairman === user.id ||

// WITH: (remove these lines — RLS handles it, and isAdmin/isSecretary from AuthContext covers the UI gate)
```

- [ ] **Step 3: Fix show-management-tracking.ts**

In `apps/myk9show/src/utils/show-management-tracking.ts`:

The `extractManagementRelationships` function (lines 114-142) checks `show.secretary === userId` etc to build relationship data. Remove these checks and the relationship entries they produce. If this function is used for navigation/display, it should query `user_roles` instead.

Similarly, `getManagedShows` (lines 250-251) checks `show.secretary === user.id`. Remove and replace with the `managedShowIds` set approach.

- [ ] **Step 4: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/utils/show-relationships.ts apps/myk9show/src/utils/permissionValidation.ts apps/myk9show/src/utils/show-management-tracking.ts
git commit -m "refactor: remove show.secretary/chairman checks from permission utils

RLS now handles secretary scoping via is_show_secretary(). Client-side
guards simplified to use AuthContext role flags as UI hints."
```

---

### Task 10: Fix Remaining Consumers

**Files:**

- Modify: `apps/myk9show/src/lib/validation.ts:134-136,161-163`
- Modify: `apps/myk9show/src/hooks/useShowStoreCompat.ts:101-103,128-130`
- Modify: `apps/myk9show/src/lib/export.ts:156-158`
- Modify: `apps/myk9show/src/services/offline/OfflineReportService.ts:545`
- Modify: `apps/myk9show/src/services/testing/LoadTestService.ts:229-231`

- [ ] **Step 1: Fix validation.ts**

In `apps/myk9show/src/lib/validation.ts`:

Remove from `showSchemas.basic` (lines 134-136):

```typescript
// DELETE:
chairman: commonValidations.optionalString,
secretary: commonValidations.optionalString,
chiefSteward: commonValidations.optionalString,
```

Remove from `showSchemas.edit` (lines 161-163):

```typescript
// DELETE:
chairman: z.string(),
secretary: z.string(),
chiefSteward: z.string(),
```

- [ ] **Step 2: Fix useShowStoreCompat.ts**

In `apps/myk9show/src/hooks/useShowStoreCompat.ts`:

Remove from `addShowLegacy` (lines 101-103):

```typescript
// DELETE:
chairman: show.chairman,
secretary: show.secretary,
chiefSteward: show.chiefSteward,
```

Remove from `updateShowLegacy` (lines 128-130):

```typescript
// DELETE:
chairman: show.chairman,
secretary: show.secretary,
chiefSteward: show.chiefSteward,
```

- [ ] **Step 3: Fix export.ts**

In `apps/myk9show/src/lib/export.ts`:

Replace the show official export lines (lines 156-158) with a call to `getShowOfficials`:

```typescript
// OLD:
Chairman: resolvePersonNameFromStore(show.chairman as string),
Secretary: resolvePersonNameFromStore(show.secretary as string),
'Chief Steward': resolvePersonNameFromStore(show.chiefSteward as string),

// NEW:
// Officials are resolved asynchronously — need to make the export function async
// or pre-fetch officials before building the row.
// For now, use an inline await:
```

Since the export function may need to become async to fetch officials, check if it already is. If not, the simplest approach is to prefetch all show officials before the export loop:

```typescript
import { getShowOfficials } from '@/hooks/queries/useShowOfficials';

// Before the shows export loop, prefetch:
const officialsMap = new Map<string, Awaited<ReturnType<typeof getShowOfficials>>>();
for (const show of shows) {
  officialsMap.set(show.id, await getShowOfficials(show.id));
}

// Then in the row builder:
const officials = officialsMap.get(show.id);
const secretaryNames = officials?.secretaries.map(o => `${o.firstName} ${o.lastName}`.trim()).join(', ') || '';
const chairmanNames = officials?.chairmen.map(o => `${o.firstName} ${o.lastName}`.trim()).join(', ') || '';
const stewardNames = officials?.stewards.map(o => `${o.firstName} ${o.lastName}`.trim()).join(', ') || '';

// Use in the row:
Chairman: chairmanNames,
Secretary: secretaryNames,
'Chief Steward': stewardNames,
```

- [ ] **Step 4: Fix OfflineReportService.ts**

In `apps/myk9show/src/services/offline/OfflineReportService.ts`, line 545:

```typescript
// OLD:
Secretary: ${resolvePersonNameFromStore(show.secretary) || 'N/A'},

// NEW:
// Use getShowOfficials (already async context in report generation):
const officials = await getShowOfficials(show.id);
const secretaryName = officials.secretaries.map(o => `${o.firstName} ${o.lastName}`.trim()).join(', ') || 'N/A';
// Then use secretaryName in the template
```

- [ ] **Step 5: Fix LoadTestService.ts**

In `apps/myk9show/src/services/testing/LoadTestService.ts`:

Remove the three fields from test data generation (lines 229-231):

```typescript
// DELETE:
chairman: faker.person.fullName(),
secretary: faker.person.fullName(),
chiefSteward: faker.person.fullName(),
```

Test data for officials would need to create `user_roles` rows separately, but since this is just a load test service, removing the fields is sufficient.

- [ ] **Step 6: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`

Expected: Zero errors.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/lib/validation.ts apps/myk9show/src/hooks/useShowStoreCompat.ts apps/myk9show/src/lib/export.ts apps/myk9show/src/services/offline/OfflineReportService.ts apps/myk9show/src/services/testing/LoadTestService.ts
git commit -m "refactor: remove show official fields from remaining consumers"
```

---

### Task 11: Fix Tests

**Files:**

- Modify: Tests that reference `show.secretary`, `show.chairman`, or `show.chiefSteward` in mock data

- [ ] **Step 1: Find all test files that reference the removed fields**

Run:

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform" && grep -rn "secretary\|chairman\|chiefSteward\|chief_steward" apps/myk9show/src --include="*.test.*" | grep -v node_modules | grep -v "user_roles\|UserRole\|SECRETARY\|role"
```

This shows test files with mock Show objects that still have the old fields.

- [ ] **Step 2: Remove the fields from all mock Show objects**

For each test file found, remove `secretary`, `chairman`, and `chiefSteward` from mock Show objects. These fields no longer exist on the Show type, so any test referencing them will fail to compile.

- [ ] **Step 3: Run the full test suite**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && pnpm test`

Expected: All tests pass (or only pre-existing failures remain).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: remove show official fields from test mock data"
```

---

### Task 12: Final Verification

- [ ] **Step 1: Run full typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`

Expected: Zero errors.

- [ ] **Step 2: Run full lint**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm lint`

Expected: Zero errors (or only pre-existing ones).

- [ ] **Step 3: Run full test suite**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && pnpm test`

Expected: All tests pass.

- [ ] **Step 4: Verify no stale references**

Run:

```bash
grep -rn "show\.secretary\|show\.chairman\|show\.chiefSteward" apps/myk9show/src --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "\.test\." | grep -v "// OLD"
```

Expected: Zero results.

- [ ] **Step 5: Verify no stale imports**

Run:

```bash
grep -rn "chief_steward\|chiefSteward" apps/myk9show/src --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "user_roles\|useShowOfficials\|ShowOfficial\|migration\|\.test\."
```

Expected: Zero results (only references should be in useShowOfficials, test files, or migration-related code).
