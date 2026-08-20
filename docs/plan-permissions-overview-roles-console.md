# Permissions Overview — Roles-First Console Implementation Plan

> **Status:** Active

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/admin/permissions` Overview tab's static two-stat explainer with a working roles console — a roles table showing members, permission counts, and last-changed, plus a recent-access-changes rail — so a site admin lands on the actual objects instead of a junction page.

**Architecture:** The Overview tab keeps its position inside the existing `PrimaryTabs` shell; only its `TabsContent` body changes. Two new presentational components (`RolesOverviewTable`, `RecentAccessChanges`) are fed by one new data hook (`usePermissionsOverview`) that wraps the three `rbacService` reads the page already makes plus the audit log. Every roles-table row is a `<Link>` into the existing `/admin/permissions/roles/:roleId` editor — the table is a *navigation* surface, never a second editing surface. Phase 3 then retires `RoleListPage` (whose card grid this table supersedes) behind a `<Navigate>` redirect, matching the precedent already set by `/admin/permissions/users` and `/admin/permissions/audit`.

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind + shadcn/ui via `@myk9/ui`, `react-router-dom`, Vitest + Testing Library, `date-fns`.

**Spec:** The published design canvas — <https://claude.ai/code/artifact/5bfc4bf6-6f54-4353-aaa2-a65eee9b771f>, artboard **"Option B — Roles-First Console"**. Read that artboard before Task 1; it is the visual target.

---

## Global Constraints

Copied verbatim from the repo's standing rules — every task's requirements implicitly include this section.

- **TypeScript only.** Never JavaScript. When fixing types, verify property names against the actual interface in `apps/myk9show/src/types/rbac-types.ts` — do not guess.
- **Keep files under 500 lines.** Extract types, helpers, and constants into sibling modules.
- **Do not duplicate an existing surface.** Every roles-table row links to the existing role editor. Do not add create/edit/delete affordances to the Overview tab beyond the "New role" header button that links to `/admin/permissions/roles/new`.
- **14px type floor.** `text-xs` is remapped to 0.875rem/14px in `apps/myk9show/tailwind.config.js` — never introduce a raw smaller size.
- **44px touch targets** on every interactive control (`h-11`, or `size="touch"` on `Button`).
- **No emoji.** Icons come from `lucide-react` only.
- **Use the custom render** from `@/test/utils/testUtils` in tests, never raw `render` from Testing Library — it wraps with QueryClient, Auth, and Router providers.
- **Remove unused variables in tests** rather than underscore-prefixing them.
- **Run any test you add or touch with `--sequence.shuffle` 6+ times before merging.** CI shuffles; local runs do not. A test that leaks state passes every local run and fails randomly in CI.
- **Commit after every task.** Work in this worktree, never the primary checkout.

## Fidelity decisions — where the build departs from the mockup, and why

Read these before Task 1; they are the difference between the artboard and what the data can honestly support.

1. **The "Scope" column is dropped.** The mockup shows a Global/Club/Show pill per role. Scope is not a property of a role — `Role` in `rbac-types.ts:8-20` has no scope field. Scope lives on each *grant* (`UserRole.club_id` / `UserRole.show_id`, `rbac-types.ts:43-59`), so the same role is Global for one person and Club for another. Rendering a per-role scope pill would be inventing data. The column is replaced by **Type** (System / Custom), which `Role.is_system` does back.
2. **"Last changed" comes from the audit log, not the role row.** The `roles` table has no `updated_at` column (confirmed by the comment at `RoleListPage.tsx:255`). Task 3 derives it from `permission_audit_log` entries whose `target_id` matches the role, and renders an em-dash when no entry exists. It is never fabricated.
3. **Members and Permissions counts need no new query.** `RoleManager.getAllRoles()` already populates the virtual `permission_count` and `user_count` fields (`RoleManager.ts:581-582`).
4. **The mockup's "Show all 12 roles" footer is dropped.** With ~12 roles the table shows all of them; a disclosure control for a list that already fits is noise. Search filters the same list in place.
5. **[ADDED] "Active grants" is a derived sum, not a query.** The stat sums `role.user_count` across roles rather than counting `user_roles` rows. That is one number from data already in hand instead of a second round trip, and it is the same number the roles table's Members column shows — but it is *derived*. Do not present it anywhere as an authoritative grant count, and do not reuse it for anything that makes a claim about a specific person's access.

## [ADDED] Blast radius — what else this change touches

Two existing test files assert against the Overview tab. Both must be updated in the same task that changes it (Task 5), not discovered afterwards.

| File | Why it breaks | Fix |
| --- | --- | --- |
| `__tests__/PermissionManagementPage.tabs.test.tsx` | Mocks `rbacService` without `getAuditLogs`; `getAllRoles` returns `[]` so the table has nothing to render | Task 5, Step 1 |
| `__tests__/PermissionManagementPage.assignments.test.tsx` | Same missing `getAuditLogs` mock — the hook calls `undefined()` and every test in the file throws. Separately, `'explains the canonical access workflow without a duplicate personal role card'` asserts `heading /how access works/i` and `heading /assign access/i`, both of which the redesign removes | Task 5, Step 2 |

**The `assignments` test is load-bearing, not incidental.** It encodes a decision from the role-assignment consolidation work: the Overview must explain where access is granted, and must *not* grow a personal "Your Active Roles" card. Its two heading assertions are the current expression of that rule, not the rule itself. Task 5 replaces them with assertions against the new copy while keeping the anti-duplication assertions verbatim.

**Rollback:** this change is frontend-only — no migration, no edge function, no schema or grant change. Reverting is `git revert` of the phase commits; nothing to undo in the database. Phases 1–2 and Phase 3 revert independently.

**Authorization:** no new data exposure. `/admin/permissions` is already behind `adminGuard`, and `rbacService.getAuditLogs()` is already called from `PermissionAuditPage` — the same page, the same site-admin caller, the same rows. The overview reads a bounded slice of what the Audit tab already reads in full.

## File Structure

**Created:**

- `apps/myk9show/src/components/admin/permissions/RolesOverviewTable.tsx` — presentational roles table. Props in, links out, no data fetching, no mutations.
- `apps/myk9show/src/components/admin/permissions/RecentAccessChanges.tsx` — presentational activity rail for the newest audit entries.
- `apps/myk9show/src/components/admin/permissions/rolesOverview.ts` — pure helpers (`buildLastChangedMap`, `filterRoles`, `getRoleTypeLabel`). No React. This is where the logic under test lives.
- `apps/myk9show/src/hooks/usePermissionsOverview.ts` — the single data hook for the Overview tab.
- Tests colocated per existing convention:
  - `apps/myk9show/src/components/admin/permissions/__tests__/rolesOverview.test.ts`
  - `apps/myk9show/src/components/admin/permissions/__tests__/RolesOverviewTable.test.tsx`
  - `apps/myk9show/src/components/admin/permissions/__tests__/RecentAccessChanges.test.tsx`

**Modified:**

- `apps/myk9show/src/pages/admin/permissions/PermissionManagementPage.tsx:72-197` — the Overview `TabsContent` body is replaced; the file's other three tabs are untouched.
- `apps/myk9show/src/pages/admin/permissions/__tests__/PermissionManagementPage.tabs.test.tsx` — one existing assertion changes (Task 5).
- `apps/myk9show/src/routes/adminRoutes.tsx:249-256` — Phase 3 only.
- `apps/myk9show/src/features/admin-help/data/pageDirectory.ts:54-68` — Phase 3 only.

**Deleted (Phase 3 only):**

- `apps/myk9show/src/pages/admin/permissions/RoleListPage.tsx`

---

## Phase 1 — Pure logic

### Task 1: Roles-overview helpers

**Files:**

- Create: `apps/myk9show/src/components/admin/permissions/rolesOverview.ts`
- Test: `apps/myk9show/src/components/admin/permissions/__tests__/rolesOverview.test.ts`

**Interfaces:**

- Consumes: `Role` and `AuditLogEntry` from `@/types/rbac-types`.
- Produces:
  - `buildLastChangedMap(entries: AuditLogEntry[]): Map<string, string>` — role id → ISO timestamp of that role's newest audit entry.
  - `filterRoles(roles: Role[], term: string): Role[]`
  - `getRoleTypeLabel(role: Role): 'System' | 'Custom'`
  - `getRoleDisplayName(role: Role): string`

- [ ] **Step 1: Write the failing test**

Create `apps/myk9show/src/components/admin/permissions/__tests__/rolesOverview.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { Role, AuditLogEntry } from '@/types/rbac-types';
import {
  buildLastChangedMap,
  filterRoles,
  getRoleTypeLabel,
  getRoleDisplayName,
} from '../rolesOverview';

function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 'r1',
    name: 'show_secretary',
    description: 'Runs entries, classes, and results',
    is_system: true,
    permissions: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'a1',
    action: 'update_role',
    user_id: 'u1',
    target_id: 'r1',
    target_type: 'role',
    old_value: null,
    new_value: null,
    ip_address: null,
    user_agent: null,
    created_at: '2026-08-01T10:00:00Z',
    ...overrides,
  };
}

describe('buildLastChangedMap', () => {
  it('maps a role id to its newest audit entry timestamp', () => {
    const map = buildLastChangedMap([
      makeEntry({ id: 'a1', created_at: '2026-08-01T10:00:00Z' }),
      makeEntry({ id: 'a2', created_at: '2026-08-05T10:00:00Z' }),
    ]);
    expect(map.get('r1')).toBe('2026-08-05T10:00:00Z');
  });

  it('keeps the newest even when entries arrive oldest-first', () => {
    const map = buildLastChangedMap([
      makeEntry({ id: 'a1', created_at: '2026-08-05T10:00:00Z' }),
      makeEntry({ id: 'a2', created_at: '2026-08-01T10:00:00Z' }),
    ]);
    expect(map.get('r1')).toBe('2026-08-05T10:00:00Z');
  });

  it('ignores entries that are not about a role', () => {
    const map = buildLastChangedMap([makeEntry({ target_type: 'user_role' })]);
    expect(map.size).toBe(0);
  });

  it('ignores entries with no target or no timestamp', () => {
    const map = buildLastChangedMap([
      makeEntry({ target_id: null }),
      makeEntry({ id: 'a2', created_at: null }),
    ]);
    expect(map.size).toBe(0);
  });

  it('returns an empty map for no entries', () => {
    expect(buildLastChangedMap([]).size).toBe(0);
  });
});

describe('filterRoles', () => {
  const roles = [
    makeRole({ id: 'r1', name: 'show_secretary', display_name: 'Show Secretary' }),
    makeRole({ id: 'r2', name: 'judge', display_name: 'Judge', description: 'Scores classes' }),
  ];

  it('returns every role for an empty term', () => {
    expect(filterRoles(roles, '')).toHaveLength(2);
  });

  it('returns every role for a whitespace-only term', () => {
    expect(filterRoles(roles, '   ')).toHaveLength(2);
  });

  it('matches on display name, case-insensitively', () => {
    expect(filterRoles(roles, 'JUDGE').map(r => r.id)).toEqual(['r2']);
  });

  it('matches on the raw name', () => {
    expect(filterRoles(roles, 'show_sec').map(r => r.id)).toEqual(['r1']);
  });

  it('matches on description', () => {
    expect(filterRoles(roles, 'scores').map(r => r.id)).toEqual(['r2']);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterRoles(roles, 'zzz')).toEqual([]);
  });
});

describe('getRoleTypeLabel', () => {
  it('labels a system role System', () => {
    expect(getRoleTypeLabel(makeRole({ is_system: true }))).toBe('System');
  });

  it('labels a non-system role Custom', () => {
    expect(getRoleTypeLabel(makeRole({ is_system: false }))).toBe('Custom');
  });

  it('treats a null is_system as Custom', () => {
    expect(getRoleTypeLabel(makeRole({ is_system: null }))).toBe('Custom');
  });
});

describe('getRoleDisplayName', () => {
  it('prefers display_name', () => {
    expect(getRoleDisplayName(makeRole({ display_name: 'Show Secretary' }))).toBe('Show Secretary');
  });

  it('humanizes the raw name when display_name is absent', () => {
    expect(getRoleDisplayName(makeRole({ name: 'club_admin' }))).toBe('Club Admin');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/myk9show && pnpm vitest run src/components/admin/permissions/__tests__/rolesOverview.test.ts
```

Expected: FAIL — `Failed to resolve import "../rolesOverview"`.

- [ ] **Step 3: Write the implementation**

Create `apps/myk9show/src/components/admin/permissions/rolesOverview.ts`:

```typescript
/**
 * Pure helpers for the Roles & Permissions overview console.
 *
 * Lives apart from the components so the ordering and matching rules are
 * testable without rendering. See docs/plan-permissions-overview-roles-console.md.
 */
import type { AuditLogEntry, Role } from '@/types/rbac-types';

/**
 * Role id -> ISO timestamp of that role's most recent audit entry.
 *
 * The `roles` table has no `updated_at` column, so "last changed" can only be
 * derived from the audit log. Entries that are not about a role, or that carry
 * no target or timestamp, are skipped rather than guessed at.
 */
export function buildLastChangedMap(entries: AuditLogEntry[]): Map<string, string> {
  const newest = new Map<string, string>();
  for (const entry of entries) {
    if (entry.target_type !== 'role') continue;
    const { target_id: targetId, created_at: createdAt } = entry;
    if (!targetId || !createdAt) continue;
    const existing = newest.get(targetId);
    if (!existing || createdAt > existing) {
      newest.set(targetId, createdAt);
    }
  }
  return newest;
}

export function getRoleDisplayName(role: Role): string {
  if (role.display_name) return role.display_name;
  return role.name.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export function getRoleTypeLabel(role: Role): 'System' | 'Custom' {
  return role.is_system ? 'System' : 'Custom';
}

export function filterRoles(roles: Role[], term: string): Role[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return roles;
  return roles.filter(
    role =>
      role.name.toLowerCase().includes(needle) ||
      getRoleDisplayName(role).toLowerCase().includes(needle) ||
      (role.description ?? '').toLowerCase().includes(needle)
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/myk9show && pnpm vitest run src/components/admin/permissions/__tests__/rolesOverview.test.ts
```

Expected: PASS, 16 tests.

- [ ] **Step 5: Run it shuffled 6 times**

```bash
cd apps/myk9show && for i in 1 2 3 4 5 6; do pnpm vitest run src/components/admin/permissions/__tests__/rolesOverview.test.ts --sequence.shuffle || break; done
```

Expected: 6 consecutive passes.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/admin/permissions/rolesOverview.ts apps/myk9show/src/components/admin/permissions/__tests__/rolesOverview.test.ts
git commit -m "feat(admin): pure helpers for the roles-first permissions overview"
```

---

## Phase 2 — Components and wiring

### Task 2: RolesOverviewTable component

**Files:**

- Create: `apps/myk9show/src/components/admin/permissions/RolesOverviewTable.tsx`
- Test: `apps/myk9show/src/components/admin/permissions/__tests__/RolesOverviewTable.test.tsx`

**Interfaces:**

- Consumes: `filterRoles`, `getRoleDisplayName`, `getRoleTypeLabel` from `./rolesOverview` (Task 1).
- Produces:

```typescript
export interface RolesOverviewTableProps {
  roles: Role[];
  /** Role id -> ISO timestamp, from buildLastChangedMap. */
  lastChanged: Map<string, string>;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}
export const RolesOverviewTable: React.FC<RolesOverviewTableProps>;
```

- [ ] **Step 1: Write the failing test**

Create `apps/myk9show/src/components/admin/permissions/__tests__/RolesOverviewTable.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { Role } from '@/types/rbac-types';
import { RolesOverviewTable } from '../RolesOverviewTable';

const roles: Role[] = [
  {
    id: 'r1',
    name: 'show_secretary',
    description: 'Runs entries, classes, and results',
    is_system: true,
    permissions: null,
    created_at: null,
    display_name: 'Show Secretary',
    permission_count: 37,
    user_count: 14,
  },
  {
    id: 'r2',
    name: 'ring_helper',
    description: 'Custom club role',
    is_system: false,
    permissions: null,
    created_at: null,
    permission_count: 4,
    user_count: 0,
  },
];

function renderTable(overrides: Partial<React.ComponentProps<typeof RolesOverviewTable>> = {}) {
  return render(
    <RolesOverviewTable
      roles={roles}
      lastChanged={new Map([['r1', '2026-08-18T10:00:00Z']])}
      isLoading={false}
      error={null}
      onRetry={vi.fn()}
      {...overrides}
    />
  );
}

describe('RolesOverviewTable', () => {
  it('renders one row per role with its member and permission counts', () => {
    renderTable();
    const secretaryRow = screen.getByRole('row', { name: /Show Secretary/ });
    expect(secretaryRow).toHaveTextContent('37');
    expect(secretaryRow).toHaveTextContent('14');
  });

  it('links each role to its existing editor rather than editing in place', () => {
    renderTable();
    expect(screen.getByRole('link', { name: /Show Secretary/ })).toHaveAttribute(
      'href',
      '/admin/permissions/roles/r1'
    );
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('marks system roles and custom roles distinctly', () => {
    renderTable();
    expect(screen.getByRole('row', { name: /Show Secretary/ })).toHaveTextContent('System');
    expect(screen.getByRole('row', { name: /Ring Helper/ })).toHaveTextContent('Custom');
  });

  it('shows an em-dash when a role has no recorded change', () => {
    renderTable();
    expect(screen.getByRole('row', { name: /Ring Helper/ })).toHaveTextContent('—');
  });

  it('filters rows as the admin types', async () => {
    const { user } = renderTable();
    await user.type(screen.getByRole('searchbox', { name: /search roles/i }), 'ring');
    expect(screen.queryByText('Show Secretary')).not.toBeInTheDocument();
    expect(screen.getByText('Ring Helper')).toBeInTheDocument();
  });

  it('tells the admin when a search matches nothing, and offers a way back', async () => {
    const { user } = renderTable();
    await user.type(screen.getByRole('searchbox', { name: /search roles/i }), 'zzzz');
    expect(screen.getByText(/no roles match/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /clear search/i }));
    expect(screen.getByText('Show Secretary')).toBeInTheDocument();
  });

  it('shows a loading state instead of a false empty state', () => {
    renderTable({ roles: [], isLoading: true });
    expect(screen.getByRole('status', { name: /loading roles/i })).toBeInTheDocument();
    expect(screen.queryByText(/no roles/i)).not.toBeInTheDocument();
  });

  // [ADDED] Zero roles and zero *matching* roles are different states with
  // different exits — a search-clear button is nonsense when there is no search.
  it('distinguishes an empty system from an empty search result', async () => {
    const { user } = renderTable({ roles: [] });
    expect(screen.getByText(/no roles defined yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clear search/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create the first role/i })).toHaveAttribute(
      'href',
      '/admin/permissions/roles/new'
    );

    renderTable();
    await user.type(screen.getAllByRole('searchbox', { name: /search roles/i })[1], 'zzzz');
    expect(screen.getByText(/no roles match/i)).toBeInTheDocument();
  });

  it('surfaces an error with a retry that calls back', async () => {
    const onRetry = vi.fn();
    const { user } = renderTable({ roles: [], error: "We couldn't load roles.", onRetry });
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/myk9show && pnpm vitest run src/components/admin/permissions/__tests__/RolesOverviewTable.test.tsx
```

Expected: FAIL — `Failed to resolve import "../RolesOverviewTable"`.

- [ ] **Step 3: Write the implementation**

Create `apps/myk9show/src/components/admin/permissions/RolesOverviewTable.tsx`:

```tsx
/**
 * Roles table for the Roles & Permissions overview.
 *
 * A NAVIGATION surface, not an editing one: every row links into the existing
 * /admin/permissions/roles/:roleId editor. Do not add inline create, edit, or
 * delete affordances here — that is the duplication this table exists to end.
 * See docs/plan-permissions-overview-roles-console.md.
 */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/common/SkeletonLoaders';
import type { Role } from '@/types/rbac-types';
import { filterRoles, getRoleDisplayName, getRoleTypeLabel } from './rolesOverview';

export interface RolesOverviewTableProps {
  roles: Role[];
  /** Role id -> ISO timestamp, from buildLastChangedMap. */
  lastChanged: Map<string, string>;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

export const RolesOverviewTable: React.FC<RolesOverviewTableProps> = ({
  roles,
  lastChanged,
  isLoading,
  error,
  onRetry,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const visibleRoles = useMemo(() => filterRoles(roles, searchTerm), [roles, searchTerm]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <Button variant="outline" className="h-11" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div
        className="rounded-xl border bg-card p-4"
        role="status"
        aria-label="Loading roles"
        aria-busy="true"
      >
        <TableSkeleton rows={6} columns={5} />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search roles"
            placeholder="Search roles"
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            className="h-11 pl-10"
          />
        </div>
        <p className="text-muted-foreground">
          {visibleRoles.length === roles.length
            ? `${roles.length} roles`
            : `${visibleRoles.length} of ${roles.length} roles`}
        </p>
      </div>

      {/* [EXPANDED] An empty system and an empty search result are different
          states: only one of them has a search to clear. */}
      {roles.length === 0 ? (
        <div className="p-10 text-center">
          <p className="font-medium">No roles defined yet</p>
          <p className="mt-1 text-muted-foreground">
            Roles decide what each person can do. Start with one.
          </p>
          <Button asChild variant="outline" className="mt-4 h-11">
            <Link to="/admin/permissions/roles/new">Create the first role</Link>
          </Button>
        </div>
      ) : visibleRoles.length === 0 ? (
        <div className="p-10 text-center">
          <p className="font-medium">No roles match “{searchTerm}”</p>
          <Button variant="outline" className="mt-4 h-11" onClick={() => setSearchTerm('')}>
            Clear search
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  Role
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  Type
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right font-semibold text-muted-foreground"
                >
                  Members
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right font-semibold text-muted-foreground"
                >
                  Permissions
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-3 text-left font-semibold text-muted-foreground md:table-cell"
                >
                  Last changed
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRoles.map(role => {
                const changedAt = lastChanged.get(role.id);
                return (
                  <tr key={role.id} className="border-b border-border last:border-b-0 hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/permissions/roles/${role.id}`}
                        className="flex min-h-11 items-center justify-between gap-3 font-medium"
                      >
                        <span>
                          {getRoleDisplayName(role)}
                          {role.description && (
                            <span className="mt-0.5 block font-normal text-muted-foreground">
                              {role.description}
                            </span>
                          )}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={role.is_system ? 'secondary' : 'outline'}>
                        {getRoleTypeLabel(role)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {role.user_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {role.permission_count ?? 0}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {changedAt
                        ? formatDistanceToNow(new Date(changedAt), { addSuffix: true })
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/myk9show && pnpm vitest run src/components/admin/permissions/__tests__/RolesOverviewTable.test.tsx
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Run it shuffled 6 times**

```bash
cd apps/myk9show && for i in 1 2 3 4 5 6; do pnpm vitest run src/components/admin/permissions/__tests__/RolesOverviewTable.test.tsx --sequence.shuffle || break; done
```

Expected: 6 consecutive passes.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/admin/permissions/RolesOverviewTable.tsx apps/myk9show/src/components/admin/permissions/__tests__/RolesOverviewTable.test.tsx
git commit -m "feat(admin): roles overview table linking into the role editor"
```

---

### Task 3: RecentAccessChanges rail

**Files:**

- Create: `apps/myk9show/src/components/admin/permissions/RecentAccessChanges.tsx`
- Test: `apps/myk9show/src/components/admin/permissions/__tests__/RecentAccessChanges.test.tsx`

**Interfaces:**

- Consumes: `AuditLogEntry` from `@/types/rbac-types`.
- Produces:

```typescript
export interface RecentAccessChangesProps {
  entries: AuditLogEntry[];
  isLoading: boolean;
}
export const RecentAccessChanges: React.FC<RecentAccessChangesProps>;
```

The rail renders at most the five newest entries and always ends with a link to `/admin/permissions?tab=audit`. It never renders a retry — the audit rail is secondary to the roles table, so a failed audit fetch degrades to the empty state rather than shouting.

- [ ] **Step 1: Write the failing test**

Create `apps/myk9show/src/components/admin/permissions/__tests__/RecentAccessChanges.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { AuditLogEntry } from '@/types/rbac-types';
import { RecentAccessChanges } from '../RecentAccessChanges';

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'a1',
    action: 'assign_role',
    user_id: 'u1',
    target_id: 'r1',
    target_type: 'role',
    old_value: null,
    new_value: null,
    ip_address: null,
    user_agent: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('RecentAccessChanges', () => {
  it('renders each change with a readable action label', () => {
    render(<RecentAccessChanges entries={[makeEntry({ action: 'revoke_role' })]} isLoading={false} />);
    expect(screen.getByText('Revoke Role')).toBeInTheDocument();
  });

  it('shows at most five entries', () => {
    const entries = Array.from({ length: 8 }, (_, index) => makeEntry({ id: `a${index}` }));
    render(<RecentAccessChanges entries={entries} isLoading={false} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  it('always offers the full audit log', () => {
    render(<RecentAccessChanges entries={[]} isLoading={false} />);
    expect(screen.getByRole('link', { name: /view full audit/i })).toHaveAttribute(
      'href',
      '/admin/permissions?tab=audit'
    );
  });

  it('states plainly when there is no recent activity', () => {
    render(<RecentAccessChanges entries={[]} isLoading={false} />);
    expect(screen.getByText(/no access changes recorded yet/i)).toBeInTheDocument();
  });

  it('does not claim emptiness while still loading', () => {
    render(<RecentAccessChanges entries={[]} isLoading />);
    expect(screen.queryByText(/no access changes recorded yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: /loading recent changes/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/myk9show && pnpm vitest run src/components/admin/permissions/__tests__/RecentAccessChanges.test.tsx
```

Expected: FAIL — `Failed to resolve import "../RecentAccessChanges"`.

- [ ] **Step 3: Write the implementation**

Create `apps/myk9show/src/components/admin/permissions/RecentAccessChanges.tsx`:

```tsx
/**
 * Recent access changes rail for the Roles & Permissions overview.
 *
 * A read-only window onto the newest permission_audit_log rows; the Permission
 * Audit tab remains the full, filterable surface. Secondary to the roles
 * table, so an audit fetch failure degrades to the empty state rather than
 * raising an alert that would outshout the primary content.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, History } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { AuditLogEntry } from '@/types/rbac-types';

export interface RecentAccessChangesProps {
  entries: AuditLogEntry[];
  isLoading: boolean;
}

const MAX_ENTRIES = 5;

function formatAction(action: string): string {
  return action.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

/** Grant-shaped actions read as additions, revoke-shaped ones as removals. */
function getDotClass(action: string): string {
  if (action.includes('revoke') || action.includes('delete')) return 'bg-destructive';
  if (action.includes('assign') || action.includes('grant') || action.includes('create'))
    return 'bg-success';
  return 'bg-warning';
}

export const RecentAccessChanges: React.FC<RecentAccessChangesProps> = ({ entries, isLoading }) => (
  <section aria-labelledby="recent-access-heading" className="rounded-xl border bg-card">
    <div className="flex items-center justify-between gap-3 border-b border-border p-4">
      <h2 id="recent-access-heading" className="font-semibold">
        Recent access changes
      </h2>
      <History className="h-4 w-4 text-muted-foreground" />
    </div>

    {isLoading ? (
      <div className="space-y-3 p-4" role="status" aria-label="Loading recent changes" aria-busy="true">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    ) : entries.length === 0 ? (
      <p className="p-4 text-muted-foreground">No access changes recorded yet.</p>
    ) : (
      <ul className="divide-y divide-border">
        {entries.slice(0, MAX_ENTRIES).map(entry => (
          <li key={entry.id} className="flex gap-3 p-4">
            <span
              aria-hidden="true"
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${getDotClass(entry.action)}`}
            />
            <div className="min-w-0">
              <p className="font-medium">{formatAction(entry.action)}</p>
              <p className="text-muted-foreground">
                {entry.target_display ?? entry.target_type ?? 'Access change'}
                {entry.created_at
                  ? ` · ${formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}`
                  : ''}
              </p>
            </div>
          </li>
        ))}
      </ul>
    )}

    <div className="border-t border-border p-2">
      <Link
        to="/admin/permissions?tab=audit"
        className="flex min-h-11 items-center justify-center gap-2 font-medium text-primary"
      >
        View full audit
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  </section>
);
```

- [ ] **Step 4: Confirm `Skeleton` and the `success` / `warning` classes exist**

```bash
cd apps/myk9show && ls src/components/ui/skeleton* && grep -n "success\|warning" tailwind.config.js | head -5
```

Expected: the skeleton module exists and the config defines `success` / `warning` colors. If `Skeleton` is not at that path, import it from wherever `SkeletonLoaders.tsx` gets it and adjust the import line — do not invent a new skeleton.

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd apps/myk9show && pnpm vitest run src/components/admin/permissions/__tests__/RecentAccessChanges.test.tsx
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Run it shuffled 6 times**

```bash
cd apps/myk9show && for i in 1 2 3 4 5 6; do pnpm vitest run src/components/admin/permissions/__tests__/RecentAccessChanges.test.tsx --sequence.shuffle || break; done
```

Expected: 6 consecutive passes.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/components/admin/permissions/RecentAccessChanges.tsx apps/myk9show/src/components/admin/permissions/__tests__/RecentAccessChanges.test.tsx
git commit -m "feat(admin): recent access changes rail for the permissions overview"
```

---

### Task 4: usePermissionsOverview data hook

**Files:**

- Create: `apps/myk9show/src/hooks/usePermissionsOverview.ts`

**Interfaces:**

- Consumes: `rbacService.getAllRoles()`, `rbacService.getAllPermissions()`, `rbacService.getAuditLogs({ limit })`; `buildLastChangedMap` from Task 1.
- Produces:

```typescript
export interface PermissionsOverviewState {
  roles: Role[];
  permissions: Permission[] | null;
  auditEntries: AuditLogEntry[];
  lastChanged: Map<string, string>;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}
export function usePermissionsOverview(): PermissionsOverviewState;
```

The hook keeps the page's existing failure semantics: a failed roles/permissions read sets `error`; a failed *audit* read is swallowed to an empty list, because the rail is secondary and must not blank the console.

- [ ] **Step 1: Write the implementation**

Create `apps/myk9show/src/hooks/usePermissionsOverview.ts`:

```typescript
/**
 * Single data source for the Roles & Permissions overview console.
 *
 * Roles and permissions are load-bearing (a failure sets `error`); the audit
 * feed is secondary and degrades to an empty rail so one failed read cannot
 * blank the page.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { rbacService } from '@/services/rbac/RBACService';
import { buildLastChangedMap } from '@/components/admin/permissions/rolesOverview';
import type { AuditLogEntry, Permission, Role } from '@/types/rbac-types';

/** Enough history to date every role without pulling the whole log. */
const AUDIT_FETCH_LIMIT = 200;

export interface PermissionsOverviewState {
  roles: Role[];
  permissions: Permission[] | null;
  auditEntries: AuditLogEntry[];
  lastChanged: Map<string, string>;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

export function usePermissionsOverview(): PermissionsOverviewState {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[] | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    // The audit rail is secondary: swallow its failure so a flaky log read
    // cannot blank the roles console beside it.
    const auditPromise = rbacService
      .getAuditLogs({ limit: AUDIT_FETCH_LIMIT })
      .catch(() => [] as AuditLogEntry[]);
    try {
      const [allRoles, allPermissions, entries] = await Promise.all([
        rbacService.getAllRoles(),
        rbacService.getAllPermissions(),
        auditPromise,
      ]);
      setRoles(allRoles);
      setPermissions(allPermissions);
      setAuditEntries(entries);
      setError(null);
    } catch {
      setError("We couldn't load the access summary.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // This starts an external service read; state updates occur after the
    // promise settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const lastChanged = useMemo(() => buildLastChangedMap(auditEntries), [auditEntries]);

  return {
    roles,
    permissions,
    auditEntries,
    lastChanged,
    isLoading,
    error,
    reload: () => void load(),
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: no errors. If errors mention generated DB types, rebuild first: `pnpm --filter @myk9/supabase build`.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/hooks/usePermissionsOverview.ts
git commit -m "feat(admin): usePermissionsOverview hook for the roles console"
```

The hook has no test of its own — its only logic is the `buildLastChangedMap` fold (covered in Task 1) and the degradation rule, which Task 5 asserts through the page.

---

### Task 5: Wire the Overview tab

**Files:**

- Modify: `apps/myk9show/src/pages/admin/permissions/PermissionManagementPage.tsx:72-197`
- Modify: `apps/myk9show/src/pages/admin/permissions/__tests__/PermissionManagementPage.tabs.test.tsx`

**Interfaces:**

- Consumes: `usePermissionsOverview` (Task 4), `RolesOverviewTable` (Task 2), `RecentAccessChanges` (Task 3).
- Produces: no new exports; the page's default export is unchanged.

- [ ] **Step 1: Write the failing test**

Append to `apps/myk9show/src/pages/admin/permissions/__tests__/PermissionManagementPage.tabs.test.tsx`, inside the existing `describe`. Note the file's `vi.mock` of `RBACService` at the top: add `getAuditLogs: vi.fn().mockResolvedValue([])` to that mock object first, and give `getAllRoles` a real role so the table has something to render:

```tsx
  it('lands the admin on the roles themselves, not a lobby', async () => {
    render(<PermissionManagementPage />, { initialRoute: '/admin/permissions' });
    const row = await screen.findByRole('row', { name: /Show Secretary/ });
    expect(row).toHaveTextContent('37');
    expect(screen.getByRole('link', { name: /Show Secretary/ })).toHaveAttribute(
      'href',
      '/admin/permissions/roles/r1'
    );
  });

  it('keeps the recent-changes rail pointed at the audit tab', async () => {
    render(<PermissionManagementPage />, { initialRoute: '/admin/permissions' });
    expect(await screen.findByRole('link', { name: /view full audit/i })).toHaveAttribute(
      'href',
      '/admin/permissions?tab=audit'
    );
  });

  it('still shows the roles console when the audit log fails to load', async () => {
    const { rbacService } = await import('@/services/rbac/RBACService');
    vi.mocked(rbacService.getAuditLogs).mockRejectedValueOnce(new Error('audit down'));
    render(<PermissionManagementPage />, { initialRoute: '/admin/permissions' });
    expect(await screen.findByRole('row', { name: /Show Secretary/ })).toBeInTheDocument();
    expect(screen.getByText(/no access changes recorded yet/i)).toBeInTheDocument();
  });
```

The existing `getAllRoles` mock becomes:

```tsx
    getAllRoles: vi.fn().mockResolvedValue([
      {
        id: 'r1',
        name: 'show_secretary',
        description: 'Runs entries, classes, and results',
        is_system: true,
        permissions: null,
        created_at: null,
        display_name: 'Show Secretary',
        permission_count: 37,
        user_count: 14,
      },
    ]),
    getAuditLogs: vi.fn().mockResolvedValue([]),
```

- [ ] **Step 2: [EXPANDED] Fix the second test file, which breaks two ways**

`apps/myk9show/src/pages/admin/permissions/__tests__/PermissionManagementPage.assignments.test.tsx` is not optional collateral — read it in full before editing. Two separate breakages:

**(a) Its `rbacService` mock has no `getAuditLogs`.** The new hook calls it, gets `undefined`, and every test in the file throws. Add it to the mock, alongside a real role so the console renders:

```tsx
vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getAllRoles: vi.fn().mockResolvedValue([
      {
        id: 'r1',
        name: 'show_secretary',
        description: 'Runs entries, classes, and results',
        is_system: true,
        permissions: null,
        created_at: null,
        display_name: 'Show Secretary',
        permission_count: 37,
        user_count: 14,
      },
    ]),
    getAllPermissions: vi.fn().mockResolvedValue([]),
    getAuditLogs: vi.fn().mockResolvedValue([]),
    clearAllCache: vi.fn(),
  },
}));
```

**(b) Its test `'explains the canonical access workflow without a duplicate personal role card'` asserts two headings the redesign deletes** — `/how access works/i` and `/assign access/i`. That test encodes a decision from the role-assignment consolidation work (see `docs/plan-role-assignment-consolidation.md` and the header comment in `RoleAssignmentsPanel.tsx`): the Overview must point at where access is granted, and must **never** grow a personal "Your Active Roles" card. The headings are the current *expression* of that rule; the rule itself survives this redesign intact.

Replace that single test with the version below. The two `queryByText` anti-duplication assertions are carried over **verbatim** — do not weaken them. Only the positive assertions change, from "the explainer section exists" to "the page still routes the admin to the two management surfaces":

```tsx
  it('routes to the canonical access surfaces without a duplicate personal role card', async () => {
    render(<PermissionManagementPage />);
    await screen.findByRole('tab', { name: /assignments/i });
    // Carried over verbatim: the Overview must never grow a personal roles card.
    expect(screen.queryByText('Your Active Roles')).not.toBeInTheDocument();
    expect(screen.queryByText('Your Role Grants')).not.toBeInTheDocument();
    // The explainer section is gone; the console itself now shows the roles,
    // and the two management surfaces stay one click away.
    expect(
      screen.getByRole('link', { name: /assign roles in user management/i })
    ).toHaveAttribute('href', '/admin/users');
    expect(screen.getByRole('link', { name: /new role/i })).toHaveAttribute(
      'href',
      '/admin/permissions/roles/new'
    );
  });
```

**In `tabs.test.tsx`:** the test `'links the Total Permissions stat to the inventory tab, not the roles list'` still holds — the new layout keeps exactly one `a[href="/admin/permissions?tab=permissions"]` on the Permissions stat. Leave it alone. Then read `'keeps the overview focused on the two places where access is managed'` and apply the same treatment as (b): keep whatever it asserts about *absence*, update what it asserts about the old explainer's presence.

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd apps/myk9show && pnpm vitest run src/pages/admin/permissions/__tests__/PermissionManagementPage.tabs.test.tsx
```

Expected: FAIL — no `row` matching `/Show Secretary/`.

- [ ] **Step 4: Replace the Overview tab body**

In `PermissionManagementPage.tsx`, delete the local `roleCount` / `permissions` / `permissionsError` state and the `loadCounts` callback (lines 39-70), replacing them with the hook. Keep every other tab exactly as it is.

```tsx
const {
  roles,
  permissions,
  auditEntries,
  lastChanged,
  isLoading,
  error,
  reload,
} = usePermissionsOverview();
```

Replace the Overview `TabsContent` body (lines 79-197) with:

```tsx
      <TabsContent value="overview">
        <div className="min-h-screen bg-background">
          <div className="container mx-auto max-w-6xl px-6 pb-10 pt-8">
            <div className="space-y-6">
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                    <Shield className="h-6 w-6 text-primary" />
                    Roles &amp; Permissions
                  </h1>
                  <p className="mt-2 max-w-2xl text-muted-foreground">
                    Every role in the system — open one to change what it can do.
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
                  <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
                    <Link to="/admin/users">
                      <Users className="mr-2 h-4 w-4" />
                      Assign roles in User Management
                    </Link>
                  </Button>
                  <Button asChild className="h-11 w-full sm:w-auto">
                    <Link to="/admin/permissions/roles/new">
                      <Plus className="mr-2 h-4 w-4" />
                      New role
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <RolesOverviewTable
                    roles={roles}
                    lastChanged={lastChanged}
                    isLoading={isLoading}
                    error={error}
                    onRetry={reload}
                  />
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl border bg-card p-4">
                      <p className="font-medium text-muted-foreground">Active grants</p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums">
                        {roles.reduce((sum, role) => sum + (role.user_count ?? 0), 0)}
                      </p>
                    </div>
                    <Link
                      to="/admin/permissions?tab=permissions"
                      className="rounded-xl border bg-card p-4"
                    >
                      <p className="font-medium text-muted-foreground">Permissions</p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums">
                        {permissions?.length.toString() ?? '–'}
                      </p>
                    </Link>
                  </div>
                  <RecentAccessChanges entries={auditEntries} isLoading={isLoading} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </TabsContent>
```

Update the imports: add `usePermissionsOverview`, `RolesOverviewTable`, `RecentAccessChanges`; drop `Card`, `CardContent`, `Alert`, `AlertDescription`, `AlertCircle`, `RefreshCw`, `ArrowRight`, `History`, `Settings` if the linter reports them unused. The Permissions tab still needs `permissions`, `isLoading`, and `error` — pass them from the hook (`isLoading={isLoading}` replaces the old `permissionsLoading`, `error={error}`, `onRetry={reload}`).

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd apps/myk9show && pnpm vitest run src/pages/admin/permissions/__tests__/
```

Expected: PASS across all four test files in that directory.

- [ ] **Step 6: Typecheck and lint**

```bash
cd apps/myk9show && pnpm typecheck && pnpm lint
```

Expected: no errors. Lint warnings do not gate CI, but errors do.

- [ ] **Step 7: Run the touched tests shuffled 6 times**

```bash
cd apps/myk9show && for i in 1 2 3 4 5 6; do pnpm vitest run src/pages/admin/permissions/__tests__/ src/components/admin/permissions/__tests__/ --sequence.shuffle || break; done
```

Expected: 6 consecutive passes.

- [ ] **Step 8: Verify in the browser**

Start the dev server via the preview tooling (never `pnpm dev` in a raw shell), sign in as a site admin, and open `/admin/permissions`. Confirm: roles render with real counts, a row click lands on the role editor, the rail shows real audit entries, and the page reads correctly at 390px width and in dark mode.

- [ ] **Step 9: Commit**

```bash
git add apps/myk9show/src/pages/admin/permissions/PermissionManagementPage.tsx apps/myk9show/src/pages/admin/permissions/__tests__/PermissionManagementPage.tabs.test.tsx
git commit -m "feat(admin): roles-first permissions overview console"
```

---

## Phase 3 — Retire the duplicate roles list

**Read this before starting Phase 3.** After Task 5, the roles list exists in two places: the new Overview console and `RoleListPage` at `/admin/permissions/roles`. That is precisely the duplication the project's current phase forbids, and the codebase already has a pattern for resolving it — `/admin/permissions/users` and `/admin/permissions/audit` are both `<Navigate>` redirects into a tab of this same page (`adminRoutes.tsx:292-300`). Phase 3 applies that pattern to the roles list.

If you would rather keep `RoleListPage` as a standalone surface, stop after Phase 2 and mark this plan Complete — Phases 1-2 stand alone and ship a working console. Skipping Phase 3 leaves a known duplicate; record it in `TECHNICAL_DEBT.md` if so.

### Task 6: Redirect the roles list into the overview

**Files:**

- Modify: `apps/myk9show/src/routes/adminRoutes.tsx:249-256`
- Modify: `apps/myk9show/src/features/admin-help/data/pageDirectory.ts:54-68`
- Delete: `apps/myk9show/src/pages/admin/permissions/RoleListPage.tsx`
- Test: `apps/myk9show/src/pages/admin/permissions/__tests__/rolesListRedirect.test.tsx` (create)

- [ ] **Step 1: Find every inbound link**

```bash
cd apps/myk9show && grep -rn '"/admin/permissions/roles"' src --include="*.tsx" --include="*.ts"
```

Expected hits: `CreateRolePage.tsx:180,447`, `CloneRolePage.tsx:193,380`, `RoleEditPage.tsx:193`, `adminRoutes.tsx:251`. These "back"/"cancel" links keep working through the redirect and need no edit — but confirm the list matches before proceeding. If a hit appears outside that set, read it and decide deliberately.

- [ ] **Step 2: Write the failing test**

Create `apps/myk9show/src/pages/admin/permissions/__tests__/rolesListRedirect.test.tsx`. This mirrors the sibling `userRoleManagementRedirect.test.tsx`, which declares its routes inline with a `LocationProbe` rather than mounting `adminRoutes` — follow that shape exactly:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

describe('/admin/permissions/roles redirect', () => {
  it('redirects to the overview console rather than a second roles list', () => {
    render(
      <MemoryRouter initialEntries={['/admin/permissions/roles']}>
        <Routes>
          <Route
            path="/admin/permissions/roles"
            element={<Navigate to="/admin/permissions" replace />}
          />
          <Route path="/admin/permissions" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/permissions');
  });
});
```

Two notes on why this departs from the plan's global constraints. It uses raw `render` from `@testing-library/react` rather than the custom render — deliberate, and matching the sibling file: there is no provider to wrap, and the custom render supplies its own router, which would fight the `MemoryRouter` under test. And this test asserts the *redirect shape*, not that `adminRoutes` wires it up; Step 6's `pageDirectory.test.ts` run is what proves the route still resolves in the real registry.

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd apps/myk9show && pnpm vitest run src/pages/admin/permissions/__tests__/rolesListRedirect.test.tsx
```

Expected: FAIL — the roles list page renders instead of the overview.

- [ ] **Step 4: Replace the route with a redirect**

In `adminRoutes.tsx`, replace the `/admin/permissions/roles` route element with:

```tsx
    {/* The roles list now lives on the overview console — see
        docs/plan-permissions-overview-roles-console.md. Kept as a redirect
        because CreateRolePage / CloneRolePage / RoleEditPage all link back
        here, matching the /admin/permissions/users precedent below. */}
    <Route
      path="/admin/permissions/roles"
      element={adminGuard(<Navigate to="/admin/permissions" replace />)}
    />
```

Then in `routeRegistry.ts`, point `/admin/permissions/roles` at `PermissionManagementPage` (the same treatment `/admin/permissions/users` gets at line 49), and delete `RoleListPage.tsx`:

```bash
cd apps/myk9show && git rm src/pages/admin/permissions/RoleListPage.tsx
```

- [ ] **Step 5: Update the help directory**

In `pageDirectory.ts`, change the `/admin/permissions/roles` entry's `title` to `'Role List (redirects to Roles & Permissions)'` and its `description` to `'Redirects to the Roles & Permissions console, where the roles list now lives.'` Keep the path and the `linksTo` array — the directory test asserts every `linksTo` resolves to an existing entry, and the create/edit/clone entries still point here.

- [ ] **Step 6: Run the full permissions + help test set**

```bash
cd apps/myk9show && pnpm vitest run src/pages/admin/permissions/__tests__/ src/features/admin-help/__tests__/
```

Expected: PASS, including `pageDirectory.test.ts`'s "every entry path exists in fullRouteRegistry" and "every linksTo path resolves".

- [ ] **Step 7: Typecheck, lint, shuffle**

```bash
cd apps/myk9show && pnpm typecheck && pnpm lint
cd apps/myk9show && for i in 1 2 3 4 5 6; do pnpm vitest run src/pages/admin/permissions/__tests__/ src/features/admin-help/__tests__/ --sequence.shuffle || break; done
```

Expected: clean typecheck, no lint errors, 6 consecutive shuffled passes.

- [ ] **Step 8: Commit**

```bash
git add -A apps/myk9show/src
git commit -m "refactor(admin): retire the duplicate roles list behind a redirect"
```

---

## Phase 4 — Ship

### Task 7: Full verification and PR

- [ ] **Step 1: Run the app's full unit suite**

```bash
cd apps/myk9show && pnpm test
```

Expected: PASS. The suite has known pre-existing timeout/hang issues — if a runner hangs more than 30 seconds, stop and report rather than retrying in a loop.

- [ ] **Step 2: Build**

```bash
pnpm build
```

Expected: clean build.

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "feat(admin): roles-first permissions overview console" --body "$(cat <<'EOF'
## What changed
Replaces the /admin/permissions Overview tab's static two-stat explainer with a working roles console: a roles table (members, permissions, type, last changed) whose rows link into the existing role editor, plus a recent-access-changes rail. Retires the duplicate RoleListPage behind a redirect.

## Design
Option B from the design canvas.

## Fidelity notes
- No per-role Scope column: scope is a property of a grant, not a role.
- "Last changed" is derived from permission_audit_log; roles have no updated_at.

## Tests
Unit tests for the helpers, both components, and the page wiring; all run shuffled.
EOF
)"
```

- [ ] **Step 4: Codex review — required gate**

```bash
codex review --base origin/main
```

Address findings before merge. This is a gate, not a formality.

- [ ] **Step 5: Post the Linear update**

Comment on the corresponding MYK9 issue with: what changed, tests/checks run and their results, the PR link, risks or remaining work, and whether the acceptance criteria passed. Move to Done only after the PR merges.

- [ ] **Step 6: Flip this plan's status**

On merge, change the status line at the top of this file to `Complete`, `git mv` it into `docs/archive/`, and drop its row from `docs/README.md`.
