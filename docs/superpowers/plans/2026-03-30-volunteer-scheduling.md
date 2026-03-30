# Volunteer Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a show-scoped volunteer scheduling page where secretaries manage a volunteer pool and assign volunteers to per-class ring roles and show-level general duties.

**Architecture:** React Query for server state, Zustand show store for show context, client-side filtering via a custom hook. Components follow the existing card-based layout pattern (like CheckInReportPage). Data lives in three existing tables (`volunteers`, `volunteer_class_assignments`, `volunteer_general_assignments`) with a new migration to add `show_id` scoping and fix unique constraints.

**Tech Stack:** React 18, TypeScript, TanStack React Query, Zustand, shadcn/ui, Lucide icons, Vitest + React Testing Library

---

## Route Decision

The spec says `/shows/:showId/volunteers`, but **all existing secretary routes** use `/secretary/*` with `useShowStore().selectedShowId` for show context (e.g., `/secretary/check-in`, `/secretary/entries`, `/secretary/tasks`). This plan uses `/secretary/volunteers` for consistency.

## File Map

| File                                                                                              | Responsibility                                                 |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `supabase/migrations/095_volunteer_scheduling.sql`                                                | Add `show_id` to `volunteers`, fix unique constraints, add RLS |
| `apps/myk9show/src/types/volunteer.ts`                                                            | App-layer types and `VOLUNTEER_ROLES` constant                 |
| `apps/myk9show/src/lib/queryClient.ts`                                                            | Add volunteer query keys (modify existing)                     |
| `apps/myk9show/src/hooks/queries/volunteerQueries.ts`                                             | All query + mutation hooks                                     |
| `apps/myk9show/src/components/volunteers/VolunteerChip.tsx`                                       | Assigned volunteer pill with unassign                          |
| `apps/myk9show/src/components/volunteers/VolunteerPool.tsx`                                       | Horizontal chip strip + add button                             |
| `apps/myk9show/src/components/volunteers/VolunteerDialog.tsx`                                     | Add/edit volunteer dialog                                      |
| `apps/myk9show/src/components/volunteers/AssignVolunteerPopover.tsx`                              | Click-to-assign popover                                        |
| `apps/myk9show/src/components/volunteers/ClassVolunteerCard.tsx`                                  | Per-class card with role rows                                  |
| `apps/myk9show/src/components/volunteers/GeneralDutyCard.tsx`                                     | Per-duty card                                                  |
| `apps/myk9show/src/pages/secretary/VolunteerSchedulingPage/index.tsx`                             | Top-level page                                                 |
| `apps/myk9show/src/pages/secretary/VolunteerSchedulingPage/useVolunteerFilters.ts`                | Client-side filtering hook                                     |
| `apps/myk9show/src/routes/secretaryRoutes.tsx`                                                    | Add route (modify existing)                                    |
| `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts`                             | Add sidebar entry (modify existing)                            |
| **Test files:**                                                                                   |                                                                |
| `apps/myk9show/src/types/__tests__/volunteer.test.ts`                                             | Role constants tests                                           |
| `apps/myk9show/src/hooks/queries/__tests__/volunteerQueries.test.ts`                              | Query/mutation hook tests                                      |
| `apps/myk9show/src/components/volunteers/__tests__/VolunteerChip.test.tsx`                        | Chip tests                                                     |
| `apps/myk9show/src/components/volunteers/__tests__/VolunteerPool.test.tsx`                        | Pool tests                                                     |
| `apps/myk9show/src/components/volunteers/__tests__/VolunteerDialog.test.tsx`                      | Dialog tests                                                   |
| `apps/myk9show/src/components/volunteers/__tests__/AssignVolunteerPopover.test.tsx`               | Popover tests                                                  |
| `apps/myk9show/src/components/volunteers/__tests__/ClassVolunteerCard.test.tsx`                   | Class card tests                                               |
| `apps/myk9show/src/components/volunteers/__tests__/GeneralDutyCard.test.tsx`                      | Duty card tests                                                |
| `apps/myk9show/src/pages/secretary/VolunteerSchedulingPage/__tests__/useVolunteerFilters.test.ts` | Filter hook tests                                              |

---

## Task 0: Branch Setup [ADDED]

- [ ] **Step 1: Create feature branch from main**

```bash
git checkout main
git pull origin main
git checkout -b feature/volunteer-scheduling
```

- [ ] **Step 2: Move the spec file from the check-in branch**

The spec is untracked on `feature/check-in-report`. Cherry-pick or copy it:

```bash
git checkout feature/check-in-report -- docs/superpowers/specs/2026-03-30-volunteer-scheduling-design.md
```

- [ ] **Step 3: Commit the spec on the new branch**

```bash
git add docs/superpowers/specs/2026-03-30-volunteer-scheduling-design.md
git commit -m "docs: add volunteer scheduling design spec"
```

---

## Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/095_volunteer_scheduling.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 095_volunteer_scheduling.sql
-- Add show_id scoping to volunteers table and fix unique constraints for myK9Show
--
-- [ADDED] SAFETY NOTE: Before running, verify no duplicate data exists that would
-- violate the new unique constraints. Run these checks first:
--   SELECT volunteer_id, class_id, role_name, count(*)
--     FROM volunteer_class_assignments
--     GROUP BY volunteer_id, class_id, role_name HAVING count(*) > 1;
--   SELECT volunteer_id, show_id, role_name, count(*)
--     FROM volunteer_general_assignments
--     GROUP BY volunteer_id, show_id, role_name HAVING count(*) > 1;
-- If either returns rows, deduplicate before applying this migration.

-- Wrap in transaction for atomic rollback on failure
BEGIN;

-- 1. Add show_id column to volunteers (nullable — myK9Q rows won't have it)
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS show_id UUID REFERENCES shows(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS volunteers_show_id_idx ON volunteers(show_id);

-- 2. Fix volunteer_class_assignments unique constraint
-- Old: (volunteer_id, class_id, role_id) — wrong, v1 uses role_name not role_id
-- New: (volunteer_id, class_id, role_name)
ALTER TABLE volunteer_class_assignments
  DROP CONSTRAINT IF EXISTS volunteer_class_assignments_volunteer_id_class_id_role_id_key;
ALTER TABLE volunteer_class_assignments
  ADD CONSTRAINT volunteer_class_assignments_volunteer_class_role_name_key
  UNIQUE (volunteer_id, class_id, role_name);

-- 3. Add unique constraint to volunteer_general_assignments
ALTER TABLE volunteer_general_assignments
  ADD CONSTRAINT volunteer_general_assignments_volunteer_show_role_name_key
  UNIQUE (volunteer_id, show_id, role_name);

-- 4. RLS policies
ALTER TABLE volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteer_class_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteer_general_assignments ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read volunteer data
CREATE POLICY "Authenticated users can view volunteers"
  ON volunteers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can view class assignments"
  ON volunteer_class_assignments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can view general assignments"
  ON volunteer_general_assignments FOR SELECT TO authenticated USING (true);

-- Secretary/admin can manage volunteers (insert, update, delete)
-- Note: RLS checks auth.uid() roles via user_roles table
CREATE POLICY "Secretary can manage volunteers"
  ON volunteers FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_name IN ('secretary', 'site_admin')
        AND user_roles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_name IN ('secretary', 'site_admin')
        AND user_roles.is_active = true
    )
  );

CREATE POLICY "Secretary can manage class assignments"
  ON volunteer_class_assignments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_name IN ('secretary', 'site_admin')
        AND user_roles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_name IN ('secretary', 'site_admin')
        AND user_roles.is_active = true
    )
  );

CREATE POLICY "Secretary can manage general assignments"
  ON volunteer_general_assignments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_name IN ('secretary', 'site_admin')
        AND user_roles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_name IN ('secretary', 'site_admin')
        AND user_roles.is_active = true
    )
  );

COMMIT;
```

- [ ] **Step 2: [ADDED] Run duplicate-data safety checks**

Run these queries against the remote database before applying the migration:

```bash
supabase db execute "SELECT volunteer_id, class_id, role_name, count(*) FROM volunteer_class_assignments GROUP BY volunteer_id, class_id, role_name HAVING count(*) > 1;"
supabase db execute "SELECT volunteer_id, show_id, role_name, count(*) FROM volunteer_general_assignments GROUP BY volunteer_id, show_id, role_name HAVING count(*) > 1;"
```

Expected: Both return 0 rows. If duplicates exist, deduplicate before proceeding.

- [ ] **Step 3: Apply migration locally**

Run: `cd /Users/richardbeezley/AI\ Projects/myk9-platform && supabase db push`
Expected: Migration applies without errors.

- [ ] **Step 4: Regenerate Supabase types**

Run: `cd /Users/richardbeezley/AI\ Projects/myk9-platform && supabase gen types typescript --project-id sojmvhhwsjxmfistvzbe > apps/myk9show/src/types/supabase.ts`
Expected: `supabase.ts` now includes `show_id` on the `volunteers` table type.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/095_volunteer_scheduling.sql apps/myk9show/src/types/supabase.ts
git commit -m "feat(volunteers): migration 095 — add show_id, fix unique constraints, add RLS"
```

---

## Task 2: Types & Constants

**Files:**

- Create: `apps/myk9show/src/types/volunteer.ts`
- Test: `apps/myk9show/src/types/__tests__/volunteer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/myk9show/src/types/__tests__/volunteer.test.ts`:

```typescript
import {
  RING_ROLES,
  GENERAL_DUTY_ROLES,
  ALL_VOLUNTEER_ROLES,
  type Volunteer,
  type ClassAssignment,
  type GeneralAssignment,
  formatVolunteerDisplayName,
} from '../volunteer';

describe('volunteer types', () => {
  describe('RING_ROLES', () => {
    it('contains exactly 3 ring roles', () => {
      expect(RING_ROLES).toEqual(['Gate Steward', 'Timer', 'Ring Steward']);
    });
  });

  describe('GENERAL_DUTY_ROLES', () => {
    it('contains exactly 4 general duty roles', () => {
      expect(GENERAL_DUTY_ROLES).toEqual(['Hospitality', 'Equipment', 'Ring Setup', 'Ribbons']);
    });
  });

  describe('ALL_VOLUNTEER_ROLES', () => {
    it('contains all 7 roles', () => {
      expect(ALL_VOLUNTEER_ROLES).toHaveLength(7);
      expect(ALL_VOLUNTEER_ROLES).toEqual([...RING_ROLES, ...GENERAL_DUTY_ROLES]);
    });
  });

  describe('formatVolunteerDisplayName', () => {
    it('returns first name + last initial for multi-word names', () => {
      expect(formatVolunteerDisplayName('Sarah Miller')).toBe('Sarah M.');
    });

    it('returns single name as-is', () => {
      expect(formatVolunteerDisplayName('Sarah')).toBe('Sarah');
    });

    it('handles three-part names using last word as last name', () => {
      expect(formatVolunteerDisplayName('Mary Jane Watson')).toBe('Mary Jane W.');
    });

    it('trims whitespace', () => {
      expect(formatVolunteerDisplayName('  Sarah Miller  ')).toBe('Sarah M.');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/types/__tests__/volunteer.test.ts`
Expected: FAIL — module `../volunteer` not found.

- [ ] **Step 3: Write the implementation**

Create `apps/myk9show/src/types/volunteer.ts`:

```typescript
/** Ring roles assigned per-class */
export const RING_ROLES = ['Gate Steward', 'Timer', 'Ring Steward'] as const;

/** General duties assigned per-show */
export const GENERAL_DUTY_ROLES = ['Hospitality', 'Equipment', 'Ring Setup', 'Ribbons'] as const;

/** All volunteer roles (ring + general) */
export const ALL_VOLUNTEER_ROLES = [...RING_ROLES, ...GENERAL_DUTY_ROLES] as const;

export type RingRole = (typeof RING_ROLES)[number];
export type GeneralDutyRole = (typeof GENERAL_DUTY_ROLES)[number];
export type VolunteerRoleName = (typeof ALL_VOLUNTEER_ROLES)[number];

/** A volunteer in the pool for a given show */
export interface Volunteer {
  id: string;
  personId: string | null;
  name: string;
  phone: string | null;
  notes: string | null;
  isAvailable: boolean;
  showId: string;
  createdAt: string;
  updatedAt: string;
}

/** A volunteer assigned to a ring role on a specific class */
export interface ClassAssignment {
  id: string;
  volunteerId: string;
  classId: string;
  roleName: string;
  status: string;
  notes: string | null;
  createdAt: string;
  /** Joined from volunteers table for display */
  volunteerName: string;
  /** Whether the volunteer is also entered in this class (conflict) */
  hasConflict?: boolean;
}

/** A volunteer assigned to a general duty for a show */
export interface GeneralAssignment {
  id: string;
  volunteerId: string;
  showId: string;
  roleName: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  /** Joined from volunteers table for display */
  volunteerName: string;
}

/**
 * Format a full name as "First L." for compact display.
 * "Sarah Miller" → "Sarah M."
 * "Sarah" → "Sarah"
 */
export function formatVolunteerDisplayName(fullName: string): string {
  const trimmed = fullName.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const lastName = parts[parts.length - 1];
  const firstParts = parts.slice(0, -1).join(' ');
  return `${firstParts} ${lastName[0]}.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/types/__tests__/volunteer.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/types/volunteer.ts apps/myk9show/src/types/__tests__/volunteer.test.ts
git commit -m "feat(volunteers): add types, role constants, and display name formatter"
```

---

## Task 3: Query Keys

**Files:**

- Modify: `apps/myk9show/src/lib/queryClient.ts` (add volunteer keys after line 242, before the closing `} as const`)

- [ ] **Step 1: Add volunteer query keys**

Add after the `checkInReport` key (line 242):

```typescript
  // Volunteers
  volunteers: (showId: string) => ['volunteers', showId] as const,
  volunteerClassAssignments: (showId: string) =>
    ['volunteer-assignments', 'class', showId] as const,
  volunteerGeneralAssignments: (showId: string) =>
    ['volunteer-assignments', 'general', showId] as const,
```

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/richardbeezley/AI\ Projects/myk9-platform && pnpm typecheck`
Expected: No new type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/lib/queryClient.ts
git commit -m "feat(volunteers): add query keys for volunteer data"
```

---

## Task 4: Query & Mutation Hooks

**Files:**

- Create: `apps/myk9show/src/hooks/queries/volunteerQueries.ts`
- Test: `apps/myk9show/src/hooks/queries/__tests__/volunteerQueries.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/myk9show/src/hooks/queries/__tests__/volunteerQueries.test.ts`:

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { supabase } from '@/services/database/supabaseClient';
import {
  useVolunteers,
  useVolunteerClassAssignments,
  useVolunteerGeneralAssignments,
  useSearchPeople,
  useVolunteerConflicts,
  useAddVolunteer,
  useDeleteVolunteer,
  useAssignToClass,
  useUnassignFromClass,
  useAssignToGeneralDuty,
  useUnassignFromGeneralDuty,
} from '../volunteerQueries';

// supabase is auto-mocked by test setup

const SHOW_ID = 'show-1';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('volunteerQueries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useVolunteers', () => {
    it('returns empty array when no volunteers exist', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      } as never);

      const { result } = renderHook(() => useVolunteers(SHOW_ID), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([]);
    });

    it('is disabled when showId is undefined', () => {
      const { result } = renderHook(() => useVolunteers(undefined), {
        wrapper: createWrapper(),
      });
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  describe('useVolunteerConflicts', () => {
    it('returns a map of volunteer conflicts', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({
              data: [
                { person_id: 'person-1', class_id: 'class-1' },
                { person_id: 'person-1', class_id: 'class-2' },
              ],
              error: null,
            }),
          }),
        }),
      } as never);

      // Need volunteers to map person_id → volunteer_id
      const { result } = renderHook(() => useVolunteerConflicts(SHOW_ID, [
        { id: 'vol-1', personId: 'person-1', name: 'Test', phone: null, notes: null, isAvailable: true, showId: SHOW_ID, createdAt: '', updatedAt: '' },
      ]), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.get('vol-1')?.has('class-1')).toBe(true);
      expect(result.current.data?.get('vol-1')?.has('class-2')).toBe(true);
    });

    it('returns empty map when no conflicts', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as never);

      const { result } = renderHook(() => useVolunteerConflicts(SHOW_ID, []), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.size).toBe(0);
    });
  });

  describe('useSearchPeople', () => {
    it('is disabled when query is shorter than 2 characters', () => {
      const { result } = renderHook(() => useSearchPeople('a'), {
        wrapper: createWrapper(),
      });
      expect(result.current.fetchStatus).toBe('idle');
    });

    it('searches people when query is 2+ characters', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [{ id: 'p1', first_name: 'Sarah', last_name: 'Miller', phone: '555-1234' }],
              error: null,
            }),
          }),
        }),
      } as never);

      const { result } = renderHook(() => useSearchPeople('Sa'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([
        { id: 'p1', firstName: 'Sarah', lastName: 'Miller', phone: '555-1234' },
      ]);
    });
  });

  describe('useAddVolunteer', () => {
    it('calls supabase insert', async () => {
      const insertData = { name: 'Test Vol', showId: SHOW_ID, phone: null, notes: null, personId: null };
      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'new-1', ...insertData, is_available: true, show_id: SHOW_ID, person_id: null, created_at: '', updated_at: '' },
              error: null,
            }),
          }),
        }),
      } as never);

      const { result } = renderHook(() => useAddVolunteer(), { wrapper: createWrapper() });

      await result.current.mutateAsync(insertData);
      expect(supabase.from).toHaveBeenCalledWith('volunteers');
    });
  });

  describe('useAssignToClass', () => {
    it('calls supabase insert on volunteer_class_assignments', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'a-1', volunteer_id: 'v-1', class_id: 'c-1', role_name: 'Timer', status: 'assigned', notes: null, created_at: '' },
              error: null,
            }),
          }),
        }),
      } as never);

      const { result } = renderHook(() => useAssignToClass(SHOW_ID), { wrapper: createWrapper() });

      await result.current.mutateAsync({ volunteerId: 'v-1', classId: 'c-1', roleName: 'Timer' });
      expect(supabase.from).toHaveBeenCalledWith('volunteer_class_assignments');
    });
  });

  describe('useUnassignFromClass', () => {
    it('calls supabase delete on volunteer_class_assignments', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as never);

      const { result } = renderHook(() => useUnassignFromClass(SHOW_ID), { wrapper: createWrapper() });

      await result.current.mutateAsync('a-1');
      expect(supabase.from).toHaveBeenCalledWith('volunteer_class_assignments');
    });
  });

  describe('useAssignToGeneralDuty', () => {
    it('calls supabase insert on volunteer_general_assignments', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'ga-1', volunteer_id: 'v-1', show_id: SHOW_ID, role_name: 'Hospitality', shift_start: null, shift_end: null, status: 'assigned', notes: null, created_at: '' },
              error: null,
            }),
          }),
        }),
      } as never);

      const { result } = renderHook(() => useAssignToGeneralDuty(SHOW_ID), { wrapper: createWrapper() });

      await result.current.mutateAsync({ volunteerId: 'v-1', showId: SHOW_ID, roleName: 'Hospitality' });
      expect(supabase.from).toHaveBeenCalledWith('volunteer_general_assignments');
    });
  });

  describe('useUnassignFromGeneralDuty', () => {
    it('calls supabase delete on volunteer_general_assignments', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as never);

      const { result } = renderHook(() => useUnassignFromGeneralDuty(SHOW_ID), { wrapper: createWrapper() });

      await result.current.mutateAsync('ga-1');
      expect(supabase.from).toHaveBeenCalledWith('volunteer_general_assignments');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/volunteerQueries.test.ts`
Expected: FAIL — module `../volunteerQueries` not found.

- [ ] **Step 3: Write the implementation**

Create `apps/myk9show/src/hooks/queries/volunteerQueries.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { supabase } from '@/services/database/supabaseClient';
import { notifications } from '@/lib/notifications';
import type { Volunteer, ClassAssignment, GeneralAssignment } from '@/types/volunteer';

// ── Mappers ──────────────────────────────────────────────────────────────────

function mapVolunteerRow(row: Record<string, unknown>): Volunteer {
  return {
    id: row.id as string,
    personId: (row.person_id as string) ?? null,
    name: row.name as string,
    phone: (row.phone as string) ?? null,
    notes: (row.notes as string) ?? null,
    isAvailable: (row.is_available as boolean) ?? true,
    showId: (row.show_id as string) ?? '',
    createdAt: (row.created_at as string) ?? '',
    updatedAt: (row.updated_at as string) ?? '',
  };
}

function mapClassAssignmentRow(row: Record<string, unknown>): ClassAssignment {
  const volunteer = row.volunteer as Record<string, unknown> | undefined;
  return {
    id: row.id as string,
    volunteerId: row.volunteer_id as string,
    classId: row.class_id as string,
    roleName: (row.role_name as string) ?? '',
    status: (row.status as string) ?? 'assigned',
    notes: (row.notes as string) ?? null,
    createdAt: (row.created_at as string) ?? '',
    volunteerName: (volunteer?.name as string) ?? '',
  };
}

function mapGeneralAssignmentRow(row: Record<string, unknown>): GeneralAssignment {
  const volunteer = row.volunteer as Record<string, unknown> | undefined;
  return {
    id: row.id as string,
    volunteerId: row.volunteer_id as string,
    showId: (row.show_id as string) ?? '',
    roleName: (row.role_name as string) ?? '',
    shiftStart: (row.shift_start as string) ?? null,
    shiftEnd: (row.shift_end as string) ?? null,
    status: (row.status as string) ?? 'assigned',
    notes: (row.notes as string) ?? null,
    createdAt: (row.created_at as string) ?? '',
    volunteerName: (volunteer?.name as string) ?? '',
  };
}

// ── Queries ──────────────────────────────────────────────────────────────────

export function useVolunteers(showId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.volunteers(showId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase.from('volunteers').select('*').eq('show_id', showId!);
      if (error) throw error;
      return (data ?? []).map(row => mapVolunteerRow(row as Record<string, unknown>));
    },
    enabled: !!showId,
    ...cacheStrategies.dynamic,
  });
}

export function useVolunteerClassAssignments(showId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.volunteerClassAssignments(showId ?? ''),
    queryFn: async () => {
      // Join through classes → trials to filter by show
      const { data, error } = await supabase
        .from('volunteer_class_assignments')
        .select(
          `
          *,
          volunteer:volunteers!inner(name, show_id),
          class:classes!inner(trial:trials!inner(show_id))
        `
        )
        .eq('class.trial.show_id', showId!);
      if (error) throw error;
      return (data ?? []).map(row =>
        mapClassAssignmentRow(row as unknown as Record<string, unknown>)
      );
    },
    enabled: !!showId,
    ...cacheStrategies.dynamic,
  });
}

export function useVolunteerGeneralAssignments(showId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.volunteerGeneralAssignments(showId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('volunteer_general_assignments')
        .select('*, volunteer:volunteers!inner(name)')
        .eq('show_id', showId!);
      if (error) throw error;
      return (data ?? []).map(row =>
        mapGeneralAssignmentRow(row as unknown as Record<string, unknown>)
      );
    },
    enabled: !!showId,
    ...cacheStrategies.dynamic,
  });
}

export interface PersonSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}

export function useSearchPeople(query: string) {
  return useQuery({
    queryKey: queryKeys.peopleSearch(query),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people')
        .select('id, first_name, last_name, phone')
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
        .limit(20);
      if (error) throw error;
      return (data ?? []).map(
        (row): PersonSearchResult => ({
          id: row.id,
          firstName: row.first_name ?? '',
          lastName: row.last_name ?? '',
          phone: row.phone ?? null,
        })
      );
    },
    enabled: query.length >= 2,
    ...cacheStrategies.moderate,
  });
}

/**
 * Builds a Map<volunteerId, Set<classId>> of conflicts.
 * A conflict = volunteer's linked person is entered in a class.
 */
export function useVolunteerConflicts(showId: string | undefined, volunteers: Volunteer[]) {
  const personIds = volunteers.filter(v => v.personId !== null).map(v => v.personId!);

  return useQuery({
    queryKey: ['volunteer-conflicts', showId, personIds.sort().join(',')],
    queryFn: async () => {
      if (personIds.length === 0) return new Map<string, Set<string>>();

      // Find entries where the handler matches a volunteer's person
      const { data, error } = await supabase
        .from('entries')
        .select('handler_id, class_id, class:classes!inner(trial:trials!inner(show_id))')
        .eq('class.trial.show_id', showId!)
        .not('handler_id', 'is', null);
      if (error) throw error;

      // Build person→volunteer lookup
      const personToVolunteer = new Map<string, string>();
      for (const v of volunteers) {
        if (v.personId) personToVolunteer.set(v.personId, v.id);
      }

      // Build conflict map
      const conflicts = new Map<string, Set<string>>();
      for (const row of data ?? []) {
        const handlerId = (row as Record<string, unknown>).handler_id as string;
        const classId = (row as Record<string, unknown>).class_id as string;
        const volunteerId = personToVolunteer.get(handlerId);
        if (volunteerId) {
          if (!conflicts.has(volunteerId)) conflicts.set(volunteerId, new Set());
          conflicts.get(volunteerId)!.add(classId);
        }
      }
      return conflicts;
    },
    enabled: !!showId && personIds.length > 0,
    ...cacheStrategies.moderate,
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────

interface AddVolunteerInput {
  name: string;
  showId: string;
  phone: string | null;
  notes: string | null;
  personId: string | null;
}

export function useAddVolunteer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddVolunteerInput) => {
      const { data, error } = await supabase
        .from('volunteers')
        .insert({
          name: input.name,
          show_id: input.showId,
          phone: input.phone,
          notes: input.notes,
          person_id: input.personId,
        })
        .select()
        .single();
      if (error) throw error;
      return mapVolunteerRow(data as Record<string, unknown>);
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers(data.showId) });
    },
    onError: () => {
      notifications.error('Failed to add volunteer');
    },
  });
}

interface UpdateVolunteerInput {
  id: string;
  showId: string;
  name: string;
  phone: string | null;
  notes: string | null;
  personId: string | null;
}

export function useUpdateVolunteer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateVolunteerInput) => {
      const { error } = await supabase
        .from('volunteers')
        .update({
          name: input.name,
          phone: input.phone,
          notes: input.notes,
          person_id: input.personId,
        })
        .eq('id', input.id);
      if (error) throw error;
      return input;
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers(data.showId) });
    },
    onError: () => {
      notifications.error('Failed to update volunteer');
    },
  });
}

export function useDeleteVolunteer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, showId }: { id: string; showId: string }) => {
      const { error } = await supabase.from('volunteers').delete().eq('id', id);
      if (error) throw error;
      return { showId };
    },
    onSuccess: ({ showId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers(showId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteerClassAssignments(showId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteerGeneralAssignments(showId) });
    },
    onError: () => {
      notifications.error('Failed to delete volunteer');
    },
  });
}

interface AssignToClassInput {
  volunteerId: string;
  classId: string;
  roleName: string;
}

// [EXPANDED] — Added optimistic updates with rollback per spec requirement
export function useAssignToClass(showId: string) {
  const queryClient = useQueryClient();
  const qk = queryKeys.volunteerClassAssignments(showId);
  return useMutation({
    mutationFn: async (input: AssignToClassInput) => {
      const { data, error } = await supabase
        .from('volunteer_class_assignments')
        .insert({
          volunteer_id: input.volunteerId,
          class_id: input.classId,
          role_name: input.roleName,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async input => {
      await queryClient.cancelQueries({ queryKey: qk });
      const previous = queryClient.getQueryData<ClassAssignment[]>(qk);
      queryClient.setQueryData<ClassAssignment[]>(qk, old => [
        ...(old ?? []),
        {
          id: `optimistic-${Date.now()}`,
          volunteerId: input.volunteerId,
          classId: input.classId,
          roleName: input.roleName,
          status: 'assigned',
          notes: null,
          createdAt: new Date().toISOString(),
          volunteerName: '', // Will be corrected on refetch
        },
      ]);
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(qk, context.previous);
      notifications.error('Failed to assign volunteer');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk });
    },
  });
}

// [EXPANDED] — Added optimistic updates with rollback per spec requirement
export function useUnassignFromClass(showId: string) {
  const queryClient = useQueryClient();
  const qk = queryKeys.volunteerClassAssignments(showId);
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from('volunteer_class_assignments')
        .delete()
        .eq('id', assignmentId);
      if (error) throw error;
    },
    onMutate: async assignmentId => {
      await queryClient.cancelQueries({ queryKey: qk });
      const previous = queryClient.getQueryData<ClassAssignment[]>(qk);
      queryClient.setQueryData<ClassAssignment[]>(qk, old =>
        (old ?? []).filter(a => a.id !== assignmentId)
      );
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(qk, context.previous);
      notifications.error('Failed to unassign volunteer');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk });
    },
  });
}

interface AssignToGeneralDutyInput {
  volunteerId: string;
  showId: string;
  roleName: string;
}

// [EXPANDED] — Added optimistic updates with rollback per spec requirement
export function useAssignToGeneralDuty(showId: string) {
  const queryClient = useQueryClient();
  const qk = queryKeys.volunteerGeneralAssignments(showId);
  return useMutation({
    mutationFn: async (input: AssignToGeneralDutyInput) => {
      const { data, error } = await supabase
        .from('volunteer_general_assignments')
        .insert({
          volunteer_id: input.volunteerId,
          show_id: input.showId,
          role_name: input.roleName,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async input => {
      await queryClient.cancelQueries({ queryKey: qk });
      const previous = queryClient.getQueryData<GeneralAssignment[]>(qk);
      queryClient.setQueryData<GeneralAssignment[]>(qk, old => [
        ...(old ?? []),
        {
          id: `optimistic-${Date.now()}`,
          volunteerId: input.volunteerId,
          showId: input.showId,
          roleName: input.roleName,
          shiftStart: null,
          shiftEnd: null,
          status: 'assigned',
          notes: null,
          createdAt: new Date().toISOString(),
          volunteerName: '', // Will be corrected on refetch
        },
      ]);
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(qk, context.previous);
      notifications.error('Failed to assign volunteer to duty');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk });
    },
  });
}

// [EXPANDED] — Added optimistic updates with rollback per spec requirement
export function useUnassignFromGeneralDuty(showId: string) {
  const queryClient = useQueryClient();
  const qk = queryKeys.volunteerGeneralAssignments(showId);
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from('volunteer_general_assignments')
        .delete()
        .eq('id', assignmentId);
      if (error) throw error;
    },
    onMutate: async assignmentId => {
      await queryClient.cancelQueries({ queryKey: qk });
      const previous = queryClient.getQueryData<GeneralAssignment[]>(qk);
      queryClient.setQueryData<GeneralAssignment[]>(qk, old =>
        (old ?? []).filter(a => a.id !== assignmentId)
      );
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(qk, context.previous);
      notifications.error('Failed to unassign volunteer from duty');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk });
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/volunteerQueries.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/queries/volunteerQueries.ts apps/myk9show/src/hooks/queries/__tests__/volunteerQueries.test.ts
git commit -m "feat(volunteers): add query and mutation hooks with tests"
```

---

## Task 5: VolunteerChip Component

**Files:**

- Create: `apps/myk9show/src/components/volunteers/VolunteerChip.tsx`
- Test: `apps/myk9show/src/components/volunteers/__tests__/VolunteerChip.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/myk9show/src/components/volunteers/__tests__/VolunteerChip.test.tsx`:

```typescript
import { render, screen, userEvent } from '@/test/utils/testUtils';
import { VolunteerChip } from '../VolunteerChip';

describe('VolunteerChip', () => {
  const defaultProps = {
    name: 'Sarah Miller',
    onRemove: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the formatted display name', () => {
    render(<VolunteerChip {...defaultProps} />);
    expect(screen.getByText('Sarah M.')).toBeInTheDocument();
  });

  it('shows remove button', () => {
    render(<VolunteerChip {...defaultProps} />);
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  it('calls onRemove when X is clicked', async () => {
    const { user } = render(<VolunteerChip {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /remove/i }));
    expect(defaultProps.onRemove).toHaveBeenCalledOnce();
  });

  it('shows conflict indicator when hasConflict is true', () => {
    render(<VolunteerChip {...defaultProps} hasConflict />);
    expect(screen.getByTitle(/conflict/i)).toBeInTheDocument();
  });

  it('does not show conflict indicator by default', () => {
    render(<VolunteerChip {...defaultProps} />);
    expect(screen.queryByTitle(/conflict/i)).not.toBeInTheDocument();
  });

  it('applies amber styling when hasConflict is true', () => {
    render(<VolunteerChip {...defaultProps} hasConflict />);
    const chip = screen.getByText('Sarah M.').closest('[data-testid="volunteer-chip"]');
    expect(chip?.className).toMatch(/amber|warning/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/components/volunteers/__tests__/VolunteerChip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/myk9show/src/components/volunteers/VolunteerChip.tsx`:

```typescript
import { X, AlertTriangle } from 'lucide-react';
import { formatVolunteerDisplayName } from '@/types/volunteer';
import { cn } from '@/lib/utils';

interface VolunteerChipProps {
  name: string;
  hasConflict?: boolean;
  onRemove: () => void;
}

export function VolunteerChip({ name, hasConflict = false, onRemove }: VolunteerChipProps) {
  return (
    <span
      data-testid="volunteer-chip"
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        hasConflict
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
          : 'bg-muted text-muted-foreground'
      )}
    >
      {hasConflict && (
        <AlertTriangle className="h-3 w-3" title="Conflict: volunteer is entered in this class" />
      )}
      {formatVolunteerDisplayName(name)}
      <button
        type="button"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/components/volunteers/__tests__/VolunteerChip.test.tsx`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/volunteers/VolunteerChip.tsx apps/myk9show/src/components/volunteers/__tests__/VolunteerChip.test.tsx
git commit -m "feat(volunteers): add VolunteerChip component with tests"
```

---

## Task 6: VolunteerPool Component

**Files:**

- Create: `apps/myk9show/src/components/volunteers/VolunteerPool.tsx`
- Test: `apps/myk9show/src/components/volunteers/__tests__/VolunteerPool.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/myk9show/src/components/volunteers/__tests__/VolunteerPool.test.tsx`:

```typescript
import { render, screen, userEvent } from '@/test/utils/testUtils';
import { VolunteerPool } from '../VolunteerPool';
import type { Volunteer } from '@/types/volunteer';

const makeVolunteer = (overrides: Partial<Volunteer> = {}): Volunteer => ({
  id: 'v-1',
  personId: null,
  name: 'Sarah Miller',
  phone: null,
  notes: null,
  isAvailable: true,
  showId: 'show-1',
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

describe('VolunteerPool', () => {
  const defaultProps = {
    volunteers: [
      makeVolunteer({ id: 'v-1', name: 'Sarah Miller' }),
      makeVolunteer({ id: 'v-2', name: 'Mike Roberts', personId: 'p-2' }),
    ],
    onAddClick: vi.fn(),
    onEditClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the volunteer count badge', () => {
    render(<VolunteerPool {...defaultProps} />);
    expect(screen.getByText('2 volunteers')).toBeInTheDocument();
  });

  it('renders each volunteer as a chip with display name', () => {
    render(<VolunteerPool {...defaultProps} />);
    expect(screen.getByText('Sarah M.')).toBeInTheDocument();
    expect(screen.getByText('Mike R.')).toBeInTheDocument();
  });

  it('shows "(walk-up)" label for volunteers without personId', () => {
    render(<VolunteerPool {...defaultProps} />);
    // Sarah has no personId — should show walk-up label
    expect(screen.getByText(/walk-up/)).toBeInTheDocument();
  });

  it('renders Add Volunteer button', () => {
    render(<VolunteerPool {...defaultProps} />);
    expect(screen.getByRole('button', { name: /add volunteer/i })).toBeInTheDocument();
  });

  it('calls onAddClick when Add Volunteer is clicked', async () => {
    const { user } = render(<VolunteerPool {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /add volunteer/i }));
    expect(defaultProps.onAddClick).toHaveBeenCalledOnce();
  });

  it('calls onEditClick with volunteer when chip is clicked', async () => {
    const { user } = render(<VolunteerPool {...defaultProps} />);
    await user.click(screen.getByText('Sarah M.'));
    expect(defaultProps.onEditClick).toHaveBeenCalledWith(defaultProps.volunteers[0]);
  });

  it('shows empty state when no volunteers', () => {
    render(<VolunteerPool volunteers={[]} onAddClick={vi.fn()} onEditClick={vi.fn()} />);
    expect(screen.getByText('0 volunteers')).toBeInTheDocument();
  });

  it('shows singular "1 volunteer" for single volunteer', () => {
    render(
      <VolunteerPool
        volunteers={[makeVolunteer()]}
        onAddClick={vi.fn()}
        onEditClick={vi.fn()}
      />
    );
    expect(screen.getByText('1 volunteer')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/components/volunteers/__tests__/VolunteerPool.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/myk9show/src/components/volunteers/VolunteerPool.tsx`:

```typescript
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatVolunteerDisplayName } from '@/types/volunteer';
import type { Volunteer } from '@/types/volunteer';

interface VolunteerPoolProps {
  volunteers: Volunteer[];
  onAddClick: () => void;
  onEditClick: (volunteer: Volunteer) => void;
}

export function VolunteerPool({ volunteers, onAddClick, onEditClick }: VolunteerPoolProps) {
  const count = volunteers.length;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
      <Badge variant="secondary" className="shrink-0">
        {count} {count === 1 ? 'volunteer' : 'volunteers'}
      </Badge>

      {volunteers.map(vol => (
        <button
          key={vol.id}
          type="button"
          onClick={() => onEditClick(vol)}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
        >
          {formatVolunteerDisplayName(vol.name)}
          {!vol.personId && (
            <span className="text-muted-foreground/60">(walk-up)</span>
          )}
        </button>
      ))}

      <Button
        variant="outline"
        size="sm"
        onClick={onAddClick}
        className="shrink-0"
      >
        <UserPlus className="mr-1 h-3.5 w-3.5" />
        Add Volunteer
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/components/volunteers/__tests__/VolunteerPool.test.tsx`
Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/volunteers/VolunteerPool.tsx apps/myk9show/src/components/volunteers/__tests__/VolunteerPool.test.tsx
git commit -m "feat(volunteers): add VolunteerPool component with tests"
```

---

## Task 7: VolunteerDialog Component

**Files:**

- Create: `apps/myk9show/src/components/volunteers/VolunteerDialog.tsx`
- Test: `apps/myk9show/src/components/volunteers/__tests__/VolunteerDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/myk9show/src/components/volunteers/__tests__/VolunteerDialog.test.tsx`:

```typescript
import { render, screen, userEvent, waitFor } from '@/test/utils/testUtils';
import { VolunteerDialog } from '../VolunteerDialog';
import type { Volunteer } from '@/types/volunteer';

// [ADDED] Mock the query hooks used internally by VolunteerDialog
vi.mock('@/hooks/queries/volunteerQueries', () => ({
  useSearchPeople: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/performance/useTimingHooks', () => ({
  useDebounce: <T,>(value: T) => value,
}));

describe('VolunteerDialog', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    volunteer: null as Volunteer | null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Add Volunteer" title when creating', () => {
    render(<VolunteerDialog {...defaultProps} />);
    expect(screen.getByText('Add Volunteer')).toBeInTheDocument();
  });

  it('renders "Edit Volunteer" title when editing', () => {
    const volunteer: Volunteer = {
      id: 'v-1', personId: null, name: 'Sarah Miller', phone: '555-1234',
      notes: 'Morning only', isAvailable: true, showId: 'show-1',
      createdAt: '', updatedAt: '',
    };
    render(<VolunteerDialog {...defaultProps} volunteer={volunteer} />);
    expect(screen.getByText('Edit Volunteer')).toBeInTheDocument();
  });

  it('pre-fills fields when editing', () => {
    const volunteer: Volunteer = {
      id: 'v-1', personId: null, name: 'Sarah Miller', phone: '555-1234',
      notes: 'Morning only', isAvailable: true, showId: 'show-1',
      createdAt: '', updatedAt: '',
    };
    render(<VolunteerDialog {...defaultProps} volunteer={volunteer} />);
    expect(screen.getByDisplayValue('Sarah Miller')).toBeInTheDocument();
    expect(screen.getByDisplayValue('555-1234')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Morning only')).toBeInTheDocument();
  });

  it('requires name field', async () => {
    const { user } = render(<VolunteerDialog {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(defaultProps.onSave).not.toHaveBeenCalled();
  });

  it('calls onSave with form data on submit', async () => {
    const { user } = render(<VolunteerDialog {...defaultProps} />);
    await user.type(screen.getByLabelText(/name/i), 'New Volunteer');
    await user.type(screen.getByLabelText(/phone/i), '555-9999');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(defaultProps.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Volunteer', phone: '555-9999' })
    );
  });

  it('calls onClose when Cancel is clicked', async () => {
    const { user } = render(<VolunteerDialog {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it('shows Delete button only in edit mode', () => {
    const volunteer: Volunteer = {
      id: 'v-1', personId: null, name: 'Sarah', phone: null,
      notes: null, isAvailable: true, showId: 'show-1',
      createdAt: '', updatedAt: '',
    };
    const { rerender } = render(<VolunteerDialog {...defaultProps} />);
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();

    rerender(<VolunteerDialog {...defaultProps} volunteer={volunteer} />);
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('calls onDelete when Delete is clicked', async () => {
    const volunteer: Volunteer = {
      id: 'v-1', personId: null, name: 'Sarah', phone: null,
      notes: null, isAvailable: true, showId: 'show-1',
      createdAt: '', updatedAt: '',
    };
    const { user } = render(<VolunteerDialog {...defaultProps} volunteer={volunteer} />);
    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(defaultProps.onDelete).toHaveBeenCalledWith('v-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/components/volunteers/__tests__/VolunteerDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/myk9show/src/components/volunteers/VolunteerDialog.tsx`:

```typescript
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSearchPeople } from '@/hooks/queries/volunteerQueries';
import { useDebounce } from '@/hooks/performance/useTimingHooks';
import type { Volunteer } from '@/types/volunteer';

interface VolunteerFormData {
  name: string;
  phone: string;
  notes: string;
  personId: string | null;
}

interface VolunteerDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: VolunteerFormData) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  volunteer: Volunteer | null;
}

export function VolunteerDialog({
  open,
  onClose,
  onSave,
  onDelete,
  volunteer,
}: VolunteerDialogProps) {
  const isEditing = volunteer !== null;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [personId, setPersonId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // People search for linking to registered users
  const [peopleQuery, setPeopleQuery] = useState('');
  const debouncedQuery = useDebounce(peopleQuery, 300);
  const { data: searchResults = [] } = useSearchPeople(debouncedQuery);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (open) {
      setName(volunteer?.name ?? '');
      setPhone(volunteer?.phone ?? '');
      setNotes(volunteer?.notes ?? '');
      setPersonId(volunteer?.personId ?? null);
      setPeopleQuery('');
      setShowSuggestions(false);
    }
  }, [open, volunteer]);

  function handleSelectPerson(person: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
  }) {
    setName(`${person.firstName} ${person.lastName}`.trim());
    setPhone(person.phone ?? '');
    setPersonId(person.id);
    setPeopleQuery('');
    setShowSuggestions(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        phone: phone.trim() || null,
        notes: notes.trim() || null,
        personId,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!volunteer || !onDelete) return;
    setSaving(true);
    try {
      await onDelete(volunteer.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={val => !val && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Volunteer' : 'Add Volunteer'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* People search — link to registered user (add mode only) */}
          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="vol-search">Search Registered Users</Label>
              <div className="relative">
                <Input
                  id="vol-search"
                  value={peopleQuery}
                  onChange={e => {
                    setPeopleQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  placeholder="Type to search... (optional)"
                />
                {showSuggestions && searchResults.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                    {searchResults.map(person => (
                      <button
                        key={person.id}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => handleSelectPerson(person)}
                      >
                        {person.firstName} {person.lastName}
                        {person.phone && (
                          <span className="ml-2 text-muted-foreground">{person.phone}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {personId ? 'Linked to registered user' : 'Skip to add as walk-up volunteer'}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="vol-name">Name</Label>
            <Input
              id="vol-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Full name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vol-phone">Phone</Label>
            <Input
              id="vol-phone"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vol-notes">Notes</Label>
            <Textarea
              id="vol-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Availability, skills, etc."
              rows={3}
            />
          </div>
          <DialogFooter className="flex justify-between">
            <div>
              {isEditing && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={saving}
                >
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                Save
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/components/volunteers/__tests__/VolunteerDialog.test.tsx`
Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/volunteers/VolunteerDialog.tsx apps/myk9show/src/components/volunteers/__tests__/VolunteerDialog.test.tsx
git commit -m "feat(volunteers): add VolunteerDialog component with tests"
```

---

## Task 8: AssignVolunteerPopover Component

**Files:**

- Create: `apps/myk9show/src/components/volunteers/AssignVolunteerPopover.tsx`
- Test: `apps/myk9show/src/components/volunteers/__tests__/AssignVolunteerPopover.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/myk9show/src/components/volunteers/__tests__/AssignVolunteerPopover.test.tsx`:

```typescript
import { render, screen, userEvent } from '@/test/utils/testUtils';
import { AssignVolunteerPopover } from '../AssignVolunteerPopover';
import type { Volunteer } from '@/types/volunteer';

const makeVol = (overrides: Partial<Volunteer> = {}): Volunteer => ({
  id: 'v-1',
  personId: null,
  name: 'Sarah Miller',
  phone: null,
  notes: null,
  isAvailable: true,
  showId: 'show-1',
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

describe('AssignVolunteerPopover', () => {
  const volunteers = [
    makeVol({ id: 'v-1', name: 'Sarah Miller' }),
    makeVol({ id: 'v-2', name: 'Mike Roberts', personId: 'p-2' }),
    makeVol({ id: 'v-3', name: 'Tom Kennedy' }),
  ];

  const defaultProps = {
    volunteers,
    excludeIds: [] as string[],
    conflictIds: new Set<string>(),
    onAssign: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders trigger button with "+" label', () => {
    render(<AssignVolunteerPopover {...defaultProps} />);
    expect(screen.getByRole('button', { name: /assign/i })).toBeInTheDocument();
  });

  it('shows volunteer list when trigger is clicked', async () => {
    const { user } = render(<AssignVolunteerPopover {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /assign/i }));
    expect(screen.getByText('Sarah Miller')).toBeInTheDocument();
    expect(screen.getByText('Mike Roberts')).toBeInTheDocument();
  });

  it('filters volunteers by search text', async () => {
    const { user } = render(<AssignVolunteerPopover {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /assign/i }));
    await user.type(screen.getByPlaceholderText(/search/i), 'Sarah');
    expect(screen.getByText('Sarah Miller')).toBeInTheDocument();
    expect(screen.queryByText('Mike Roberts')).not.toBeInTheDocument();
  });

  it('excludes already-assigned volunteers', async () => {
    const { user } = render(
      <AssignVolunteerPopover {...defaultProps} excludeIds={['v-1']} />
    );
    await user.click(screen.getByRole('button', { name: /assign/i }));
    expect(screen.queryByText('Sarah Miller')).not.toBeInTheDocument();
    expect(screen.getByText('Mike Roberts')).toBeInTheDocument();
  });

  it('shows conflict indicator for conflicting volunteers', async () => {
    const { user } = render(
      <AssignVolunteerPopover {...defaultProps} conflictIds={new Set(['v-1'])} />
    );
    await user.click(screen.getByRole('button', { name: /assign/i }));
    const item = screen.getByText('Sarah Miller').closest('[data-testid="volunteer-option"]');
    expect(item?.querySelector('[title*="onflict"]')).toBeInTheDocument();
  });

  it('calls onAssign with volunteer id when clicked', async () => {
    const { user } = render(<AssignVolunteerPopover {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /assign/i }));
    await user.click(screen.getByText('Sarah Miller'));
    expect(defaultProps.onAssign).toHaveBeenCalledWith('v-1');
  });

  it('shows "(walk-up)" for volunteers without personId', async () => {
    const { user } = render(<AssignVolunteerPopover {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /assign/i }));
    // Sarah and Tom have no personId
    const walkUpLabels = screen.getAllByText(/walk-up/);
    expect(walkUpLabels.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/components/volunteers/__tests__/AssignVolunteerPopover.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/myk9show/src/components/volunteers/AssignVolunteerPopover.tsx`:

```typescript
import { useState } from 'react';
import { Plus, AlertTriangle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Volunteer } from '@/types/volunteer';

interface AssignVolunteerPopoverProps {
  volunteers: Volunteer[];
  excludeIds: string[];
  conflictIds: Set<string>;
  onAssign: (volunteerId: string) => void;
}

export function AssignVolunteerPopover({
  volunteers,
  excludeIds,
  conflictIds,
  onAssign,
}: AssignVolunteerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const excludeSet = new Set(excludeIds);
  const filtered = volunteers
    .filter(v => !excludeSet.has(v.id))
    .filter(v => !search || v.name.toLowerCase().includes(search.toLowerCase()));

  function handleSelect(volunteerId: string) {
    onAssign(volunteerId);
    setOpen(false);
    setSearch('');
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Assign volunteer" className="h-6 px-1.5">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <Input
          placeholder="Search volunteers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="mb-2 h-8 text-sm"
        />
        <div className="max-h-48 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">No volunteers found</p>
          )}
          {filtered.map(vol => (
            <button
              key={vol.id}
              type="button"
              data-testid="volunteer-option"
              onClick={() => handleSelect(vol.id)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              {conflictIds.has(vol.id) && (
                <AlertTriangle
                  className="h-3.5 w-3.5 shrink-0 text-amber-500"
                  title="Conflict: entered in this class"
                />
              )}
              <span className="truncate">{vol.name}</span>
              {!vol.personId && (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">(walk-up)</span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/components/volunteers/__tests__/AssignVolunteerPopover.test.tsx`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/volunteers/AssignVolunteerPopover.tsx apps/myk9show/src/components/volunteers/__tests__/AssignVolunteerPopover.test.tsx
git commit -m "feat(volunteers): add AssignVolunteerPopover component with tests"
```

---

## Task 9: ClassVolunteerCard Component

**Files:**

- Create: `apps/myk9show/src/components/volunteers/ClassVolunteerCard.tsx`
- Test: `apps/myk9show/src/components/volunteers/__tests__/ClassVolunteerCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/myk9show/src/components/volunteers/__tests__/ClassVolunteerCard.test.tsx`:

```typescript
import { render, screen } from '@/test/utils/testUtils';
import { ClassVolunteerCard } from '../ClassVolunteerCard';
import { RING_ROLES } from '@/types/volunteer';
import type { Volunteer, ClassAssignment } from '@/types/volunteer';

const makeVol = (overrides: Partial<Volunteer> = {}): Volunteer => ({
  id: 'v-1', personId: null, name: 'Sarah Miller', phone: null, notes: null,
  isAvailable: true, showId: 'show-1', createdAt: '', updatedAt: '',
  ...overrides,
});

describe('ClassVolunteerCard', () => {
  const defaultProps = {
    classId: 'c-1',
    className: 'Containers Novice',
    classMeta: 'Ring 1 • 9:00 AM • Judge: Jane Doe',
    assignments: [
      {
        id: 'a-1', volunteerId: 'v-1', classId: 'c-1', roleName: 'Gate Steward',
        status: 'assigned', notes: null, createdAt: '', volunteerName: 'Sarah Miller',
      },
    ] as ClassAssignment[],
    volunteers: [makeVol()],
    conflictMap: new Map<string, Set<string>>(),
    onAssign: vi.fn(),
    onUnassign: vi.fn(),
  };

  it('renders the class name and metadata', () => {
    render(<ClassVolunteerCard {...defaultProps} />);
    expect(screen.getByText('Containers Novice')).toBeInTheDocument();
    expect(screen.getByText('Ring 1 • 9:00 AM • Judge: Jane Doe')).toBeInTheDocument();
  });

  it('renders a row for each ring role', () => {
    render(<ClassVolunteerCard {...defaultProps} />);
    for (const role of RING_ROLES) {
      expect(screen.getByText(role)).toBeInTheDocument();
    }
  });

  it('renders assigned volunteer chips in the correct role row', () => {
    render(<ClassVolunteerCard {...defaultProps} />);
    expect(screen.getByText('Sarah M.')).toBeInTheDocument();
  });

  it('renders an assign button for each role', () => {
    render(<ClassVolunteerCard {...defaultProps} />);
    const assignButtons = screen.getAllByRole('button', { name: /assign/i });
    expect(assignButtons.length).toBe(RING_ROLES.length);
  });

  it('shows conflict badge on chip when volunteer has a conflict', () => {
    const conflictMap = new Map([['v-1', new Set(['c-1'])]]);
    render(<ClassVolunteerCard {...defaultProps} conflictMap={conflictMap} />);
    expect(screen.getByTitle(/conflict/i)).toBeInTheDocument();
  });

  it('renders multiple volunteers per role', () => {
    const assignments: ClassAssignment[] = [
      { id: 'a-1', volunteerId: 'v-1', classId: 'c-1', roleName: 'Ring Steward', status: 'assigned', notes: null, createdAt: '', volunteerName: 'Sarah Miller' },
      { id: 'a-2', volunteerId: 'v-2', classId: 'c-1', roleName: 'Ring Steward', status: 'assigned', notes: null, createdAt: '', volunteerName: 'Mike Roberts' },
    ];
    const volunteers = [makeVol(), makeVol({ id: 'v-2', name: 'Mike Roberts' })];
    render(<ClassVolunteerCard {...defaultProps} assignments={assignments} volunteers={volunteers} />);
    expect(screen.getByText('Sarah M.')).toBeInTheDocument();
    expect(screen.getByText('Mike R.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/components/volunteers/__tests__/ClassVolunteerCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/myk9show/src/components/volunteers/ClassVolunteerCard.tsx`:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RING_ROLES } from '@/types/volunteer';
import type { Volunteer, ClassAssignment } from '@/types/volunteer';
import { VolunteerChip } from './VolunteerChip';
import { AssignVolunteerPopover } from './AssignVolunteerPopover';

interface ClassVolunteerCardProps {
  classId: string;
  className: string;
  classMeta: string;
  assignments: ClassAssignment[];
  volunteers: Volunteer[];
  conflictMap: Map<string, Set<string>>;
  onAssign: (volunteerId: string, classId: string, roleName: string) => void;
  onUnassign: (assignmentId: string) => void;
}

export function ClassVolunteerCard({
  classId,
  className,
  classMeta,
  assignments,
  volunteers,
  conflictMap,
  onAssign,
  onUnassign,
}: ClassVolunteerCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{className}</CardTitle>
        <p className="text-xs text-muted-foreground">{classMeta}</p>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-0">
        {RING_ROLES.map(role => {
          const roleAssignments = assignments.filter(a => a.roleName === role);
          const excludeIds = roleAssignments.map(a => a.volunteerId);
          const classConflictIds = new Set<string>();
          for (const [volId, classIds] of conflictMap) {
            if (classIds.has(classId)) classConflictIds.add(volId);
          }

          return (
            <div key={role} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">
                {role}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {roleAssignments.map(a => (
                  <VolunteerChip
                    key={a.id}
                    name={a.volunteerName}
                    hasConflict={classConflictIds.has(a.volunteerId)}
                    onRemove={() => onUnassign(a.id)}
                  />
                ))}
                <AssignVolunteerPopover
                  volunteers={volunteers}
                  excludeIds={excludeIds}
                  conflictIds={classConflictIds}
                  onAssign={volId => onAssign(volId, classId, role)}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/components/volunteers/__tests__/ClassVolunteerCard.test.tsx`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/volunteers/ClassVolunteerCard.tsx apps/myk9show/src/components/volunteers/__tests__/ClassVolunteerCard.test.tsx
git commit -m "feat(volunteers): add ClassVolunteerCard component with tests"
```

---

## Task 10: GeneralDutyCard Component

**Files:**

- Create: `apps/myk9show/src/components/volunteers/GeneralDutyCard.tsx`
- Test: `apps/myk9show/src/components/volunteers/__tests__/GeneralDutyCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/myk9show/src/components/volunteers/__tests__/GeneralDutyCard.test.tsx`:

```typescript
import { render, screen } from '@/test/utils/testUtils';
import { GeneralDutyCard } from '../GeneralDutyCard';
import type { Volunteer, GeneralAssignment } from '@/types/volunteer';

const makeVol = (overrides: Partial<Volunteer> = {}): Volunteer => ({
  id: 'v-1', personId: null, name: 'Sarah Miller', phone: null, notes: null,
  isAvailable: true, showId: 'show-1', createdAt: '', updatedAt: '',
  ...overrides,
});

describe('GeneralDutyCard', () => {
  const defaultProps = {
    roleName: 'Hospitality',
    assignments: [] as GeneralAssignment[],
    volunteers: [makeVol()],
    onAssign: vi.fn(),
    onUnassign: vi.fn(),
  };

  it('renders the role name', () => {
    render(<GeneralDutyCard {...defaultProps} />);
    expect(screen.getByText('Hospitality')).toBeInTheDocument();
  });

  it('renders assigned volunteer chips', () => {
    const assignments: GeneralAssignment[] = [{
      id: 'ga-1', volunteerId: 'v-1', showId: 'show-1', roleName: 'Hospitality',
      shiftStart: null, shiftEnd: null, status: 'assigned', notes: null,
      createdAt: '', volunteerName: 'Sarah Miller',
    }];
    render(<GeneralDutyCard {...defaultProps} assignments={assignments} />);
    expect(screen.getByText('Sarah M.')).toBeInTheDocument();
  });

  it('renders assign button', () => {
    render(<GeneralDutyCard {...defaultProps} />);
    expect(screen.getByRole('button', { name: /assign/i })).toBeInTheDocument();
  });

  it('calls onUnassign when chip X is clicked', async () => {
    const assignments: GeneralAssignment[] = [{
      id: 'ga-1', volunteerId: 'v-1', showId: 'show-1', roleName: 'Hospitality',
      shiftStart: null, shiftEnd: null, status: 'assigned', notes: null,
      createdAt: '', volunteerName: 'Sarah Miller',
    }];
    const { user } = render(<GeneralDutyCard {...defaultProps} assignments={assignments} />);
    await user.click(screen.getByRole('button', { name: /remove/i }));
    expect(defaultProps.onUnassign).toHaveBeenCalledWith('ga-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/components/volunteers/__tests__/GeneralDutyCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/myk9show/src/components/volunteers/GeneralDutyCard.tsx`:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Volunteer, GeneralAssignment } from '@/types/volunteer';
import { VolunteerChip } from './VolunteerChip';
import { AssignVolunteerPopover } from './AssignVolunteerPopover';

interface GeneralDutyCardProps {
  roleName: string;
  assignments: GeneralAssignment[];
  volunteers: Volunteer[];
  onAssign: (volunteerId: string) => void;
  onUnassign: (assignmentId: string) => void;
}

export function GeneralDutyCard({
  roleName,
  assignments,
  volunteers,
  onAssign,
  onUnassign,
}: GeneralDutyCardProps) {
  const excludeIds = assignments.map(a => a.volunteerId);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{roleName}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-1 pt-0">
        {assignments.map(a => (
          <VolunteerChip
            key={a.id}
            name={a.volunteerName}
            onRemove={() => onUnassign(a.id)}
          />
        ))}
        <AssignVolunteerPopover
          volunteers={volunteers}
          excludeIds={excludeIds}
          conflictIds={new Set()}
          onAssign={onAssign}
        />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/components/volunteers/__tests__/GeneralDutyCard.test.tsx`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/volunteers/GeneralDutyCard.tsx apps/myk9show/src/components/volunteers/__tests__/GeneralDutyCard.test.tsx
git commit -m "feat(volunteers): add GeneralDutyCard component with tests"
```

---

## Task 11: useVolunteerFilters Hook

**Files:**

- Create: `apps/myk9show/src/pages/secretary/VolunteerSchedulingPage/useVolunteerFilters.ts`
- Test: `apps/myk9show/src/pages/secretary/VolunteerSchedulingPage/__tests__/useVolunteerFilters.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/myk9show/src/pages/secretary/VolunteerSchedulingPage/__tests__/useVolunteerFilters.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react';
import { useVolunteerFilters } from '../useVolunteerFilters';
import { RING_ROLES, GENERAL_DUTY_ROLES } from '@/types/volunteer';
import type { ClassAssignment, GeneralAssignment } from '@/types/volunteer';

interface ClassInfo {
  id: string;
  name: string;
  trialId: string;
  meta: string;
}

const classes: ClassInfo[] = [
  { id: 'c-1', name: 'Containers Novice', trialId: 't-1', meta: 'Ring 1' },
  { id: 'c-2', name: 'Interior Advanced', trialId: 't-2', meta: 'Ring 2' },
];

const classAssignments: ClassAssignment[] = [
  {
    id: 'a-1',
    volunteerId: 'v-1',
    classId: 'c-1',
    roleName: 'Gate Steward',
    status: 'assigned',
    notes: null,
    createdAt: '',
    volunteerName: 'Sarah Miller',
  },
];

const generalAssignments: GeneralAssignment[] = [
  {
    id: 'ga-1',
    volunteerId: 'v-1',
    showId: 'show-1',
    roleName: 'Hospitality',
    shiftStart: null,
    shiftEnd: null,
    status: 'assigned',
    notes: null,
    createdAt: '',
    volunteerName: 'Sarah Miller',
  },
];

describe('useVolunteerFilters', () => {
  it('returns all classes and duties when no filters applied', () => {
    const { result } = renderHook(() =>
      useVolunteerFilters({ classes, classAssignments, generalAssignments })
    );
    expect(result.current.filteredClasses).toHaveLength(2);
    expect(result.current.filteredDutyRoles).toEqual([...GENERAL_DUTY_ROLES]);
  });

  it('filters classes by search text (class name)', () => {
    const { result } = renderHook(() =>
      useVolunteerFilters({ classes, classAssignments, generalAssignments })
    );
    act(() => result.current.setSearch('Containers'));
    expect(result.current.filteredClasses).toHaveLength(1);
    expect(result.current.filteredClasses[0].id).toBe('c-1');
  });

  it('filters classes by trial', () => {
    const { result } = renderHook(() =>
      useVolunteerFilters({ classes, classAssignments, generalAssignments })
    );
    act(() => result.current.setTrialFilter('t-1'));
    expect(result.current.filteredClasses).toHaveLength(1);
    expect(result.current.filteredClasses[0].trialId).toBe('t-1');
  });

  it('trial filter does not affect general duties', () => {
    const { result } = renderHook(() =>
      useVolunteerFilters({ classes, classAssignments, generalAssignments })
    );
    act(() => result.current.setTrialFilter('t-1'));
    expect(result.current.filteredDutyRoles).toEqual([...GENERAL_DUTY_ROLES]);
  });

  it('unfilled-only shows classes with at least one empty role', () => {
    const { result } = renderHook(() =>
      useVolunteerFilters({ classes, classAssignments, generalAssignments })
    );
    act(() => result.current.setUnfilledOnly(true));
    // c-1 has Gate Steward filled but Timer and Ring Steward empty → still shown
    // c-2 has no assignments → shown
    expect(result.current.filteredClasses).toHaveLength(2);
  });

  it('unfilled-only hides classes where all roles are filled', () => {
    const fullAssignments: ClassAssignment[] = RING_ROLES.map((role, i) => ({
      id: `a-${i}`,
      volunteerId: `v-${i}`,
      classId: 'c-1',
      roleName: role,
      status: 'assigned',
      notes: null,
      createdAt: '',
      volunteerName: `Vol ${i}`,
    }));
    const { result } = renderHook(() =>
      useVolunteerFilters({
        classes,
        classAssignments: fullAssignments,
        generalAssignments: [],
      })
    );
    act(() => result.current.setUnfilledOnly(true));
    // c-1 has all 3 roles filled → hidden; c-2 has none → shown
    expect(result.current.filteredClasses).toHaveLength(1);
    expect(result.current.filteredClasses[0].id).toBe('c-2');
  });

  it('unfilled-only filters general duties too', () => {
    const { result } = renderHook(() =>
      useVolunteerFilters({ classes, classAssignments, generalAssignments })
    );
    act(() => result.current.setUnfilledOnly(true));
    // Hospitality has 1 assignment → filled → hidden; others empty → shown
    expect(result.current.filteredDutyRoles).not.toContain('Hospitality');
    expect(result.current.filteredDutyRoles).toContain('Equipment');
  });

  it('search filters general duties by assigned volunteer name', () => {
    const { result } = renderHook(() =>
      useVolunteerFilters({ classes, classAssignments, generalAssignments })
    );
    act(() => result.current.setSearch('Sarah'));
    // "Sarah" matches Hospitality (assigned to Sarah) + class c-1 (Sarah assigned)
    expect(result.current.filteredDutyRoles).toContain('Hospitality');
    expect(result.current.filteredClasses).toHaveLength(1);
    expect(result.current.filteredClasses[0].id).toBe('c-1');
  });

  it('combines filters correctly', () => {
    const { result } = renderHook(() =>
      useVolunteerFilters({ classes, classAssignments, generalAssignments })
    );
    act(() => {
      result.current.setTrialFilter('t-1');
      result.current.setSearch('Containers');
    });
    expect(result.current.filteredClasses).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/VolunteerSchedulingPage/__tests__/useVolunteerFilters.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/myk9show/src/pages/secretary/VolunteerSchedulingPage/useVolunteerFilters.ts`:

```typescript
import { useState, useMemo } from 'react';
import { RING_ROLES, GENERAL_DUTY_ROLES } from '@/types/volunteer';
import type { ClassAssignment, GeneralAssignment } from '@/types/volunteer';

interface ClassInfo {
  id: string;
  name: string;
  trialId: string;
  meta: string;
}

interface UseVolunteerFiltersInput {
  classes: ClassInfo[];
  classAssignments: ClassAssignment[];
  generalAssignments: GeneralAssignment[];
}

export function useVolunteerFilters({
  classes,
  classAssignments,
  generalAssignments,
}: UseVolunteerFiltersInput) {
  const [search, setSearch] = useState('');
  const [trialFilter, setTrialFilter] = useState('all');
  const [unfilledOnly, setUnfilledOnly] = useState(false);

  const filteredClasses = useMemo(() => {
    let result = classes;

    // Trial filter
    if (trialFilter !== 'all') {
      result = result.filter(c => c.trialId === trialFilter);
    }

    // Search filter — match class name or assigned volunteer name
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c => {
        if (c.name.toLowerCase().includes(q)) return true;
        if (c.meta.toLowerCase().includes(q)) return true;
        const classAssigns = classAssignments.filter(a => a.classId === c.id);
        return classAssigns.some(a => a.volunteerName.toLowerCase().includes(q));
      });
    }

    // Unfilled-only — hide classes where all ring roles have at least one assignment
    if (unfilledOnly) {
      result = result.filter(c => {
        const classAssigns = classAssignments.filter(a => a.classId === c.id);
        const filledRoles = new Set(classAssigns.map(a => a.roleName));
        return RING_ROLES.some(role => !filledRoles.has(role));
      });
    }

    return result;
  }, [classes, classAssignments, search, trialFilter, unfilledOnly]);

  const filteredDutyRoles = useMemo(() => {
    let roles = [...GENERAL_DUTY_ROLES] as string[];

    // Search filter — match role name or assigned volunteer name
    if (search) {
      const q = search.toLowerCase();
      roles = roles.filter(role => {
        if (role.toLowerCase().includes(q)) return true;
        return generalAssignments
          .filter(a => a.roleName === role)
          .some(a => a.volunteerName.toLowerCase().includes(q));
      });
    }

    // Unfilled-only — hide duties that have at least one assignment
    if (unfilledOnly) {
      const filledRoles = new Set(generalAssignments.map(a => a.roleName));
      roles = roles.filter(role => !filledRoles.has(role));
    }

    return roles;
  }, [generalAssignments, search, unfilledOnly]);

  return {
    search,
    setSearch,
    trialFilter,
    setTrialFilter,
    unfilledOnly,
    setUnfilledOnly,
    filteredClasses,
    filteredDutyRoles,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/VolunteerSchedulingPage/__tests__/useVolunteerFilters.test.ts`
Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/secretary/VolunteerSchedulingPage/useVolunteerFilters.ts apps/myk9show/src/pages/secretary/VolunteerSchedulingPage/__tests__/useVolunteerFilters.test.ts
git commit -m "feat(volunteers): add useVolunteerFilters hook with tests"
```

---

## Task 12: VolunteerSchedulingPage

**Files:**

- Create: `apps/myk9show/src/pages/secretary/VolunteerSchedulingPage/index.tsx`

- [ ] **Step 1: Write the page**

Create `apps/myk9show/src/pages/secretary/VolunteerSchedulingPage/index.tsx`:

```typescript
import { useState, useMemo } from 'react';
import { Users } from 'lucide-react';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import {
  useVolunteers,
  useVolunteerClassAssignments,
  useVolunteerGeneralAssignments,
  useVolunteerConflicts,
  useAddVolunteer,
  useUpdateVolunteer,
  useDeleteVolunteer,
  useAssignToClass,
  useUnassignFromClass,
  useAssignToGeneralDuty,
  useUnassignFromGeneralDuty,
} from '@/hooks/queries/volunteerQueries';
import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { supabase } from '@/services/database/supabaseClient';
import { VolunteerPool } from '@/components/volunteers/VolunteerPool';
import { VolunteerDialog } from '@/components/volunteers/VolunteerDialog';
import { ClassVolunteerCard } from '@/components/volunteers/ClassVolunteerCard';
import { GeneralDutyCard } from '@/components/volunteers/GeneralDutyCard';
import { SearchBar } from '@/components/common/SearchBar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useVolunteerFilters } from './useVolunteerFilters';
import type { Volunteer } from '@/types/volunteer';

interface ClassInfo {
  id: string;
  name: string;
  trialId: string;
  meta: string;
}

function useShowClasses(showId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.showClasses(showId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, element, level, section, ring_number, start_time, trial:trials!inner(id, trial_date, trial_number, show_id), judge:people!classes_judge_id_fkey(first_name, last_name)')
        .eq('trial.show_id', showId!);
      if (error) throw error;
      return (data ?? []).map((row): ClassInfo => {
        const trial = row.trial as Record<string, unknown>;
        const judge = row.judge as Record<string, unknown> | null;
        const parts = [row.element, row.level, row.section].filter(Boolean);
        const judgeName = judge ? `${judge.first_name} ${judge.last_name}` : '';
        const metaParts = [
          row.ring_number ? `Ring ${row.ring_number}` : null,
          row.start_time ?? null,
          judgeName ? `Judge: ${judgeName}` : null,
        ].filter(Boolean);
        return {
          id: row.id,
          name: parts.join(' ') || 'Unnamed Class',
          trialId: trial.id as string,
          meta: metaParts.join(' \u2022 '),
        };
      });
    },
    enabled: !!showId,
    ...cacheStrategies.dynamic,
  });
}

export default function VolunteerSchedulingPage() {
  const { selectedShowId, shows } = useShowStore();
  const { trials } = useTrialStore();
  const showTrials = trials.filter(t => t.showId === selectedShowId);

  // Data fetching
  const { data: volunteers = [], isLoading: loadingVols } = useVolunteers(selectedShowId || undefined);
  const { data: classAssignments = [], isLoading: loadingCA } = useVolunteerClassAssignments(selectedShowId || undefined);
  const { data: generalAssignments = [], isLoading: loadingGA } = useVolunteerGeneralAssignments(selectedShowId || undefined);
  const { data: classInfos = [], isLoading: loadingClasses } = useShowClasses(selectedShowId || undefined);
  const { data: conflictMap = new Map() } = useVolunteerConflicts(selectedShowId || undefined, volunteers);

  const isLoading = loadingVols || loadingCA || loadingGA || loadingClasses;

  // Mutations
  const addVolunteer = useAddVolunteer();
  const updateVolunteer = useUpdateVolunteer();
  const deleteVolunteer = useDeleteVolunteer();
  const assignToClass = useAssignToClass(selectedShowId ?? '');
  const unassignFromClass = useUnassignFromClass(selectedShowId ?? '');
  const assignToGeneralDuty = useAssignToGeneralDuty(selectedShowId ?? '');
  const unassignFromGeneralDuty = useUnassignFromGeneralDuty(selectedShowId ?? '');

  // Filtering
  const {
    search, setSearch,
    trialFilter, setTrialFilter,
    unfilledOnly, setUnfilledOnly,
    filteredClasses, filteredDutyRoles,
  } = useVolunteerFilters({ classes: classInfos, classAssignments, generalAssignments });

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVolunteer, setEditingVolunteer] = useState<Volunteer | null>(null);

  // Group classes by trial
  const classesByTrial = useMemo(() => {
    const map = new Map<string, ClassInfo[]>();
    for (const cls of filteredClasses) {
      if (!map.has(cls.trialId)) map.set(cls.trialId, []);
      map.get(cls.trialId)!.push(cls);
    }
    return map;
  }, [filteredClasses]);

  // Handlers
  function handleAddClick() {
    setEditingVolunteer(null);
    setDialogOpen(true);
  }

  function handleEditClick(vol: Volunteer) {
    setEditingVolunteer(vol);
    setDialogOpen(true);
  }

  async function handleSave(data: { name: string; phone: string | null; notes: string | null; personId: string | null }) {
    if (editingVolunteer) {
      await updateVolunteer.mutateAsync({
        id: editingVolunteer.id,
        showId: selectedShowId!,
        ...data,
      });
    } else {
      await addVolunteer.mutateAsync({
        showId: selectedShowId!,
        ...data,
      });
    }
  }

  async function handleDelete(id: string) {
    await deleteVolunteer.mutateAsync({ id, showId: selectedShowId! });
  }

  // Guard: no show selected
  if (!selectedShowId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h2 className="text-lg font-semibold">Select a Show</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a show from the sidebar to manage volunteers.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-xl font-bold">Volunteer Scheduling</h1>

      {/* Volunteer Pool */}
      <VolunteerPool
        volunteers={volunteers}
        onAddClick={handleAddClick}
        onEditClick={handleEditClick}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search classes, volunteers..."
          className="w-64"
        />
        <Select value={trialFilter} onValueChange={setTrialFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Trials" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trials</SelectItem>
            {showTrials.map(t => (
              <SelectItem key={t.id} value={t.id}>
                Trial {t.trialNumber} — {t.trialDate}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Checkbox
            id="unfilled-only"
            checked={unfilledOnly}
            onCheckedChange={val => setUnfilledOnly(val === true)}
          />
          <Label htmlFor="unfilled-only" className="text-sm">
            Unfilled only
          </Label>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      )}

      {/* Class cards grouped by trial */}
      {!isLoading && classesByTrial.size === 0 && filteredDutyRoles.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">
            {classInfos.length === 0
              ? 'This show has no classes yet. Create trials and classes first.'
              : 'No classes match your filters.'}
          </p>
        </div>
      )}

      {!isLoading &&
        Array.from(classesByTrial.entries()).map(([trialId, trialClasses]) => {
          const trial = showTrials.find(t => t.id === trialId);
          return (
            <section key={trialId}>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
                Trial {trial?.trialNumber ?? '?'} — {trial?.trialDate ?? ''}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {trialClasses.map(cls => (
                  <ClassVolunteerCard
                    key={cls.id}
                    classId={cls.id}
                    className={cls.name}
                    classMeta={cls.meta}
                    assignments={classAssignments.filter(a => a.classId === cls.id)}
                    volunteers={volunteers}
                    conflictMap={conflictMap}
                    onAssign={(volId, classId, roleName) =>
                      assignToClass.mutate({ volunteerId: volId, classId, roleName })
                    }
                    onUnassign={id => unassignFromClass.mutate(id)}
                  />
                ))}
              </div>
            </section>
          );
        })}

      {/* General Duties */}
      {!isLoading && filteredDutyRoles.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">General Duties</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {filteredDutyRoles.map(role => (
              <GeneralDutyCard
                key={role}
                roleName={role}
                assignments={generalAssignments.filter(a => a.roleName === role)}
                volunteers={volunteers}
                onAssign={volId =>
                  assignToGeneralDuty.mutate({
                    volunteerId: volId,
                    showId: selectedShowId!,
                    roleName: role,
                  })
                }
                onUnassign={id => unassignFromGeneralDuty.mutate(id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Dialog */}
      <VolunteerDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
        volunteer={editingVolunteer}
      />
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/richardbeezley/AI\ Projects/myk9-platform && pnpm typecheck`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/pages/secretary/VolunteerSchedulingPage/index.tsx
git commit -m "feat(volunteers): add VolunteerSchedulingPage"
```

---

## Task 13: Route & Sidebar Wiring

**Files:**

- Modify: `apps/myk9show/src/routes/secretaryRoutes.tsx`
- Modify: `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts`

- [ ] **Step 1: Add lazy import to secretaryRoutes.tsx**

After line 53 (`const CheckInReportPage = ...`), add:

```typescript
const VolunteerSchedulingPage = lazy(() => import('@/pages/secretary/VolunteerSchedulingPage'));
```

- [ ] **Step 2: Add route element to SecretaryRoutes**

After the check-in route block (after line 187), add:

```typescript
    <Route
      path="/secretary/volunteers"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <VolunteerSchedulingPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
```

- [ ] **Step 3: Add sidebar entry to unifiedSidebarConfig.ts**

In the Manage section, after the Check-In entry (after line 232), add:

```typescript
        {
          title: 'Volunteers',
          href: '/secretary/volunteers',
          icon: Users,
          description: 'Schedule and manage volunteers',
        },
```

Ensure `Users` is imported from `lucide-react` at the top of the file. Check if it's already imported; if not, add it to the existing import statement.

- [ ] **Step 4: Run typecheck**

Run: `cd /Users/richardbeezley/AI\ Projects/myk9-platform && pnpm typecheck`
Expected: No errors.

- [ ] **Step 5: Verify dev server loads the page**

Run: `pnpm dev:show`
Navigate to `http://localhost:5173/secretary/volunteers` — page should load without errors (may show "Select a Show" if no show is selected).

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/routes/secretaryRoutes.tsx apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts
git commit -m "feat(volunteers): wire up route and sidebar entry"
```

---

## Task 14: Run Full Test Suite & Fix

- [ ] **Step 1: Run all volunteer tests**

Run: `cd apps/myk9show && npx vitest run src/types/__tests__/volunteer.test.ts src/hooks/queries/__tests__/volunteerQueries.test.ts src/components/volunteers/__tests__/ src/pages/secretary/VolunteerSchedulingPage/__tests__/`
Expected: All tests pass.

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/richardbeezley/AI\ Projects/myk9-platform && pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 3: Run lint**

Run: `cd /Users/richardbeezley/AI\ Projects/myk9-platform && pnpm lint`
Expected: 0 errors.

- [ ] **Step 4: Fix any failures**

If any test, type, or lint errors: fix them, re-run, and commit fixes.

- [ ] **Step 5: Final commit if fixes were needed**

```bash
git add -u
git commit -m "fix(volunteers): address test/type/lint issues"
```
