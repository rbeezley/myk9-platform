# Admin Help — Page Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/admin/help` — a SITE_ADMIN-only page listing every route in myK9Show with title, description, role(s), classification, status, and a "Go to page" link (auto-resolving example IDs for parameterized routes). Surface undocumented routes as drift.

**Architecture:** New feature folder `apps/myk9show/src/features/admin-help/` with a hand-authored `pageDirectory.ts` as source-of-truth for metadata, a React-Query hook that resolves one representative ID per parameterized table, pure utilities for route diffing and path resolution, and shadcn-based UI components composed into a route-level page. Route added to `adminRoutes.tsx` (SITE_ADMIN guard) and sidebar entry added to `unifiedSidebarConfig.ts`. Tests via vitest + RTL; no E2E.

**Tech Stack:** React 18, TypeScript, React Router v6, TanStack React Query, Supabase JS client, shadcn/ui + Tailwind, lucide-react, vitest, @testing-library/react.

**Spec reference:** [`docs/superpowers/specs/2026-04-23-admin-help-page-directory-design.md`](../specs/2026-04-23-admin-help-page-directory-design.md)

---

## File Structure

All paths under `apps/myk9show/src/`.

| File | Responsibility |
|------|---------------|
| `features/admin-help/types.ts` | `PageEntry`, `PageStatus`, `PageClassification`, `ExampleIds` types |
| `features/admin-help/data/pageDirectory.ts` | Hand-authored `PageEntry[]` for every route in `fullRouteRegistry` |
| `features/admin-help/utils/routeDiff.ts` | Pure: compute `{ missing, extra }` between registry and directory |
| `features/admin-help/utils/resolveExamplePath.ts` | Pure: substitute `:param` tokens using an `ExampleIds` object |
| `features/admin-help/hooks/useExampleIds.ts` | React Query hook fetching one representative id per parameterized table |
| `features/admin-help/components/PageDirectoryRow.tsx` | Presentational: one entry row with "Go to page" button |
| `features/admin-help/components/PageDirectorySection.tsx` | Presentational: collapsible role section (state persisted to localStorage) |
| `features/admin-help/components/UndocumentedRoutesPanel.tsx` | Presentational: list of undocumented/extra routes |
| `features/admin-help/components/AdminHelpPage.tsx` | Route target: owns search/filter state, composes sections |
| `features/admin-help/index.ts` | Barrel export for the page component |
| `features/admin-help/__tests__/routeDiff.test.ts` | Unit tests for `routeDiff` |
| `features/admin-help/__tests__/resolveExamplePath.test.ts` | Unit tests for `resolveExamplePath` |
| `features/admin-help/__tests__/useExampleIds.test.tsx` | Unit tests for the hook (Supabase mocked) |
| `features/admin-help/__tests__/pageDirectory.test.ts` | Invariant: every `path` in directory exists in `fullRouteRegistry` |
| `features/admin-help/__tests__/PageDirectoryRow.test.tsx` | Component test: "Go to page" enabled/disabled states |
| `features/admin-help/__tests__/UndocumentedRoutesPanel.test.tsx` | Component test: renders diff, hidden when empty |
| `features/admin-help/__tests__/AdminHelpPage.test.tsx` | Component test: search + filters + toggles |
| `routes/adminRoutes.tsx` | Modify: add `/admin/help` route with `adminGuard` |
| `routes/routeRegistry.ts` | Modify: register `/admin/help` in `adminRouteComponents` |
| `components/layout/sidebar/unifiedSidebarConfig.ts` | Modify: add "Help" item to admin section (SITE_ADMIN) |

Files are kept under 500 lines (CLAUDE.md rule). `AdminHelpPage.tsx` delegates row/section rendering to children so it stays ~200 lines.

---

## Conventions

- Import `supabase` from `@/lib/supabase`.
- Import `UserRole` from `@/types/auth-types`.
- Route lazy-loading: use `createEnhancedLazy` + `RouteLazyPresets.mediumPriority` + `SuspenseWrapper` + `PageTransition` + `adminGuard` (match patterns in [`adminRoutes.tsx`](../../../apps/myk9show/src/routes/adminRoutes.tsx)).
- Tests: use `render` from `@/test/utils/testUtils` (wraps `QueryClientProvider`, `AuthProvider`, `MemoryRouter`).
- Icons: `HelpCircle` from `lucide-react` for the sidebar entry.
- Styling: Tailwind classes + shadcn/ui primitives (`Card`, `Input`, `Select`, `Button`, `Badge`, `Collapsible`, `Tooltip`).
- Commit prefix: `feat(admin-help):` for implementation commits, `test(admin-help):` for test-only commits, `docs(admin-help):` for doc updates. Always include `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` when committing.

---

## Task 1: Scaffold feature folder + types

**Files:**
- Create: `apps/myk9show/src/features/admin-help/types.ts`
- Create: `apps/myk9show/src/features/admin-help/index.ts` (placeholder exporting nothing yet)

- [ ] **Step 1: Create the types file**

Write `apps/myk9show/src/features/admin-help/types.ts`:

```typescript
import type { UserRole } from '@/types/auth-types';

export type PageStatus = 'working' | 'stub' | 'known-issues';

export type PageClassification = 'critical-path' | 'park' | 'hidden';

export interface PageEntry {
  /** Must match a key in fullRouteRegistry (may contain :params) */
  path: string;
  /** Display title, e.g. "Show Entries" */
  title: string;
  /** 1-2 sentences, plain English */
  description: string;
  /** Who uses the page; drives role grouping */
  roles: UserRole[];
  /** Critical-path = keep, park = deprioritized, hidden = dev/internal */
  classification: PageClassification;
  /** Cross-role slice, free-form in v1 */
  category: string;
  /** Triage flag visible to admin */
  status: PageStatus;
}

export interface ExampleIds {
  showId?: string;
  trialId?: string;
  trialShowId?: string;
  classId?: string;
  classTrialId?: string;
  classShowId?: string;
  dogId?: string;
  clubId?: string;
  roleId?: string;
  templateId?: string;
  personId?: string;
  entryId?: string;
  registrationId?: string;
  userId?: string;
}
```

- [ ] **Step 2: Create barrel file**

Write `apps/myk9show/src/features/admin-help/index.ts`:

```typescript
export type {
  PageEntry,
  PageStatus,
  PageClassification,
  ExampleIds,
} from './types';
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: no errors for `features/admin-help/*`.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/features/admin-help/
git commit -m "$(cat <<'EOF'
feat(admin-help): scaffold feature folder with PageEntry types

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Implement `routeDiff.ts` (TDD)

**Files:**
- Test: `apps/myk9show/src/features/admin-help/__tests__/routeDiff.test.ts`
- Create: `apps/myk9show/src/features/admin-help/utils/routeDiff.ts`

- [ ] **Step 1: Write the failing test**

Write `apps/myk9show/src/features/admin-help/__tests__/routeDiff.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { routeDiff } from '../utils/routeDiff';
import type { PageEntry } from '../types';
import { UserRole } from '@/types/auth-types';

const makeEntry = (path: string): PageEntry => ({
  path,
  title: path,
  description: '',
  roles: [UserRole.SITE_ADMIN],
  classification: 'critical-path',
  category: 'Admin',
  status: 'working',
});

describe('routeDiff', () => {
  it('returns empty sets when registry and directory match', () => {
    const registry = { '/a': () => Promise.resolve({ default: () => null as never }) };
    const directory = [makeEntry('/a')];
    const result = routeDiff(registry, directory);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
  });

  it('flags routes in registry that lack a directory entry as missing', () => {
    const registry = {
      '/a': () => Promise.resolve({ default: () => null as never }),
      '/b': () => Promise.resolve({ default: () => null as never }),
    };
    const directory = [makeEntry('/a')];
    const result = routeDiff(registry, directory);
    expect(result.missing).toEqual(['/b']);
    expect(result.extra).toEqual([]);
  });

  it('flags directory entries with no matching registry route as extra', () => {
    const registry = { '/a': () => Promise.resolve({ default: () => null as never }) };
    const directory = [makeEntry('/a'), makeEntry('/gone')];
    const result = routeDiff(registry, directory);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual(['/gone']);
  });

  it('returns both sets sorted alphabetically for stable output', () => {
    const registry = {
      '/b': () => Promise.resolve({ default: () => null as never }),
      '/a': () => Promise.resolve({ default: () => null as never }),
    };
    const directory = [makeEntry('/z'), makeEntry('/y')];
    const result = routeDiff(registry, directory);
    expect(result.missing).toEqual(['/a', '/b']);
    expect(result.extra).toEqual(['/y', '/z']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/routeDiff.test.ts`
Expected: FAIL with "Cannot find module '../utils/routeDiff'".

- [ ] **Step 3: Implement `routeDiff`**

Write `apps/myk9show/src/features/admin-help/utils/routeDiff.ts`:

```typescript
import type { PageEntry } from '../types';

export interface RouteDiffResult {
  /** Routes present in the registry but missing from the directory */
  missing: string[];
  /** Entries in the directory that point to routes no longer in the registry */
  extra: string[];
}

export function routeDiff(
  registry: Record<string, unknown>,
  directory: readonly PageEntry[]
): RouteDiffResult {
  const registryPaths = new Set(Object.keys(registry));
  const directoryPaths = new Set(directory.map(e => e.path));

  const missing = [...registryPaths].filter(p => !directoryPaths.has(p)).sort();
  const extra = [...directoryPaths].filter(p => !registryPaths.has(p)).sort();

  return { missing, extra };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/routeDiff.test.ts`
Expected: 4 passing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/features/admin-help/utils/routeDiff.ts \
        apps/myk9show/src/features/admin-help/__tests__/routeDiff.test.ts
git commit -m "$(cat <<'EOF'
feat(admin-help): add routeDiff utility for directory drift detection

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Implement `resolveExamplePath.ts` (TDD)

**Files:**
- Test: `apps/myk9show/src/features/admin-help/__tests__/resolveExamplePath.test.ts`
- Create: `apps/myk9show/src/features/admin-help/utils/resolveExamplePath.ts`

Design: a hard-coded table of `pattern → (ids) => string | null` entries. Order matters: longer/more specific patterns first.

- [ ] **Step 1: Write the failing test**

Write `apps/myk9show/src/features/admin-help/__tests__/resolveExamplePath.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveExamplePath } from '../utils/resolveExamplePath';
import type { ExampleIds } from '../types';

const fullIds: ExampleIds = {
  showId: 'SHOW_1',
  trialId: 'TRIAL_1',
  trialShowId: 'SHOW_1',
  classId: 'CLASS_1',
  classTrialId: 'TRIAL_1',
  classShowId: 'SHOW_1',
  dogId: 'DOG_1',
  clubId: 'CLUB_1',
  roleId: 'ROLE_1',
  templateId: 'TEMPLATE_1',
  personId: 'PERSON_1',
  entryId: 'ENTRY_1',
  registrationId: 'REG_1',
  userId: 'USER_1',
};

describe('resolveExamplePath', () => {
  it('returns non-parameterized paths unchanged', () => {
    expect(resolveExamplePath('/admin/dashboard', fullIds)).toBe('/admin/dashboard');
    expect(resolveExamplePath('/shows', fullIds)).toBe('/shows');
  });

  it('resolves single-param patterns using the id map', () => {
    expect(resolveExamplePath('/shows/:id', fullIds)).toBe('/shows/SHOW_1');
    expect(resolveExamplePath('/dogs/:id', fullIds)).toBe('/dogs/DOG_1');
    expect(resolveExamplePath('/clubs/:id', fullIds)).toBe('/clubs/CLUB_1');
  });

  it('resolves multi-param chains with consistent parent ids', () => {
    expect(
      resolveExamplePath('/shows/:showId/trials/:trialId', fullIds)
    ).toBe('/shows/SHOW_1/trials/TRIAL_1');
    expect(
      resolveExamplePath('/shows/:showId/trials/:trialId/classes/:classId', fullIds)
    ).toBe('/shows/SHOW_1/trials/TRIAL_1/classes/CLASS_1');
  });

  it('resolves class results sub-route with the same chain', () => {
    expect(
      resolveExamplePath(
        '/shows/:showId/trials/:trialId/classes/:classId/results',
        fullIds
      )
    ).toBe('/shows/SHOW_1/trials/TRIAL_1/classes/CLASS_1/results');
  });

  it('resolves admin parameterized routes', () => {
    expect(resolveExamplePath('/admin/permissions/roles/:roleId', fullIds)).toBe(
      '/admin/permissions/roles/ROLE_1'
    );
    expect(resolveExamplePath('/admin/permissions/roles/:roleId/clone', fullIds)).toBe(
      '/admin/permissions/roles/ROLE_1/clone'
    );
    expect(resolveExamplePath('/admin/templates/:templateId/edit', fullIds)).toBe(
      '/admin/templates/TEMPLATE_1/edit'
    );
    expect(resolveExamplePath('/admin/templates/:templateId/test', fullIds)).toBe(
      '/admin/templates/TEMPLATE_1/test'
    );
  });

  it('resolves exhibitor check-in and tv display patterns', () => {
    expect(resolveExamplePath('/exhibitor/check-in/:entryId', fullIds)).toBe(
      '/exhibitor/check-in/ENTRY_1'
    );
    expect(resolveExamplePath('/tv/:showId', fullIds)).toBe('/tv/SHOW_1');
    expect(resolveExamplePath('/shows/:showId/register', fullIds)).toBe(
      '/shows/SHOW_1/register'
    );
  });

  it('returns null when any required id is missing', () => {
    const partial: ExampleIds = { showId: 'SHOW_1' };
    expect(resolveExamplePath('/dogs/:id', partial)).toBeNull();
    expect(
      resolveExamplePath('/shows/:showId/trials/:trialId', partial)
    ).toBeNull();
  });

  it('returns null for an unknown parameterized pattern', () => {
    expect(resolveExamplePath('/totally/:unknown/route', fullIds)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/resolveExamplePath.test.ts`
Expected: FAIL with "Cannot find module '../utils/resolveExamplePath'".

- [ ] **Step 3: Implement `resolveExamplePath`**

Write `apps/myk9show/src/features/admin-help/utils/resolveExamplePath.ts`:

```typescript
import type { ExampleIds } from '../types';

type Resolver = (ids: ExampleIds) => string | null;

const makeResolver =
  (build: (ids: ExampleIds) => string, required: (keyof ExampleIds)[]): Resolver =>
  (ids) =>
    required.every(key => ids[key]) ? build(ids) : null;

/**
 * Hard-coded map of route patterns to resolver functions.
 * Order intentional: longer/more-specific routes are matched by exact-pattern
 * lookup so parent prefixes do not shadow children.
 */
const PATTERN_RESOLVERS: Record<string, Resolver> = {
  // Shows / trials / classes chain
  '/shows/:id': makeResolver(ids => `/shows/${ids.showId}`, ['showId']),
  '/shows/:showId/trials/:trialId': makeResolver(
    ids => `/shows/${ids.trialShowId}/trials/${ids.trialId}`,
    ['trialShowId', 'trialId']
  ),
  '/shows/:showId/trials/:trialId/classes/:classId': makeResolver(
    ids => `/shows/${ids.classShowId}/trials/${ids.classTrialId}/classes/${ids.classId}`,
    ['classShowId', 'classTrialId', 'classId']
  ),
  '/shows/:showId/trials/:trialId/classes/:classId/results': makeResolver(
    ids =>
      `/shows/${ids.classShowId}/trials/${ids.classTrialId}/classes/${ids.classId}/results`,
    ['classShowId', 'classTrialId', 'classId']
  ),
  '/trials/:trialId': makeResolver(ids => `/trials/${ids.trialId}`, ['trialId']),
  '/classes/:classId': makeResolver(ids => `/classes/${ids.classId}`, ['classId']),
  '/shows/:showId/register': makeResolver(
    ids => `/shows/${ids.showId}/register`,
    ['showId']
  ),

  // Dogs / clubs
  '/dogs/:id': makeResolver(ids => `/dogs/${ids.dogId}`, ['dogId']),
  '/clubs/:id': makeResolver(ids => `/clubs/${ids.clubId}`, ['clubId']),

  // Exhibitor
  '/exhibitor/check-in/:entryId': makeResolver(
    ids => `/exhibitor/check-in/${ids.entryId}`,
    ['entryId']
  ),

  // TV display
  '/tv/:showId': makeResolver(ids => `/tv/${ids.showId}`, ['showId']),

  // Admin — permissions
  '/admin/permissions/roles/:roleId': makeResolver(
    ids => `/admin/permissions/roles/${ids.roleId}`,
    ['roleId']
  ),
  '/admin/permissions/roles/:roleId/clone': makeResolver(
    ids => `/admin/permissions/roles/${ids.roleId}/clone`,
    ['roleId']
  ),

  // Admin — templates
  '/admin/templates/:templateId/edit': makeResolver(
    ids => `/admin/templates/${ids.templateId}/edit`,
    ['templateId']
  ),
  '/admin/templates/:templateId/test': makeResolver(
    ids => `/admin/templates/${ids.templateId}/test`,
    ['templateId']
  ),
};

/**
 * Substitute :param tokens in a route pattern with sample ids.
 * - If `pattern` has no `:`, it is returned unchanged.
 * - If `pattern` has a `:` and is listed in PATTERN_RESOLVERS, the resolver
 *   returns the substituted path or `null` when any required id is missing.
 * - If `pattern` has a `:` but is not listed, returns `null` (caller should
 *   treat as "unresolvable — disable the Go button").
 */
export function resolveExamplePath(pattern: string, ids: ExampleIds): string | null {
  if (!pattern.includes(':')) return pattern;
  const resolver = PATTERN_RESOLVERS[pattern];
  return resolver ? resolver(ids) : null;
}

/** Exported for invariants / tests that need the set of known patterns. */
export const KNOWN_PARAMETERIZED_PATTERNS = Object.keys(PATTERN_RESOLVERS);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/resolveExamplePath.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/features/admin-help/utils/resolveExamplePath.ts \
        apps/myk9show/src/features/admin-help/__tests__/resolveExamplePath.test.ts
git commit -m "$(cat <<'EOF'
feat(admin-help): add resolveExamplePath for parameterized route substitution

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Implement `useExampleIds` hook (TDD)

**Files:**
- Test: `apps/myk9show/src/features/admin-help/__tests__/useExampleIds.test.tsx`
- Create: `apps/myk9show/src/features/admin-help/hooks/useExampleIds.ts`

- [ ] **Step 1: Write the failing test**

Write `apps/myk9show/src/features/admin-help/__tests__/useExampleIds.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useExampleIds } from '../hooks/useExampleIds';

vi.mock('@/lib/supabase', () => {
  const fromMock = vi.fn();
  return {
    supabase: {
      from: fromMock,
    },
    __fromMock: fromMock,
  };
});

import * as supabaseModule from '@/lib/supabase';

const getFromMock = () =>
  (supabaseModule as unknown as { __fromMock: ReturnType<typeof vi.fn> }).__fromMock;

function makeSelectChain(result: { data: unknown; error: null | Error }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const limit = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ limit });
  return { select };
}

const wrapper =
  (client: QueryClient) =>
  ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

describe('useExampleIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ids for every table when queries succeed', async () => {
    const mocks: Record<string, unknown> = {
      shows: { id: 'SHOW_1' },
      trials: { id: 'TRIAL_1', show_id: 'SHOW_1' },
      classes: { id: 'CLASS_1', trial_id: 'TRIAL_1', show_id: 'SHOW_1' },
      dogs: { id: 'DOG_1' },
      clubs: { id: 'CLUB_1' },
      roles: { id: 'ROLE_1' },
      organization_templates: { id: 'TEMPLATE_1' },
      people: { id: 'PERSON_1' },
      entries: { id: 'ENTRY_1' },
      show_registrations: { id: 'REG_1' },
      profiles: { id: 'USER_1' },
    };
    getFromMock().mockImplementation((table: string) =>
      makeSelectChain({ data: mocks[table] ?? null, error: null })
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useExampleIds(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      showId: 'SHOW_1',
      trialId: 'TRIAL_1',
      trialShowId: 'SHOW_1',
      classId: 'CLASS_1',
      classTrialId: 'TRIAL_1',
      classShowId: 'SHOW_1',
      dogId: 'DOG_1',
      clubId: 'CLUB_1',
      roleId: 'ROLE_1',
      templateId: 'TEMPLATE_1',
      personId: 'PERSON_1',
      entryId: 'ENTRY_1',
      registrationId: 'REG_1',
      userId: 'USER_1',
    });
  });

  it('returns undefined for tables that are empty (maybeSingle null)', async () => {
    getFromMock().mockImplementation(() =>
      makeSelectChain({ data: null, error: null })
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useExampleIds(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.showId).toBeUndefined();
    expect(result.current.data?.dogId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/useExampleIds.test.tsx`
Expected: FAIL with "Cannot find module '../hooks/useExampleIds'".

- [ ] **Step 3: Implement the hook**

Write `apps/myk9show/src/features/admin-help/hooks/useExampleIds.ts`:

```typescript
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ExampleIds } from '../types';

async function firstRow<T extends Record<string, unknown>>(
  table: string,
  columns: string
): Promise<T | null> {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as T | null) ?? null;
}

export function useExampleIds(): UseQueryResult<ExampleIds, Error> {
  return useQuery<ExampleIds, Error>({
    queryKey: ['admin-help', 'example-ids'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [
        show,
        trial,
        classRow,
        dog,
        club,
        role,
        template,
        person,
        entry,
        registration,
        user,
      ] = await Promise.all([
        firstRow<{ id: string }>('shows', 'id'),
        firstRow<{ id: string; show_id: string }>('trials', 'id, show_id'),
        firstRow<{ id: string; trial_id: string; show_id: string }>(
          'classes',
          'id, trial_id, show_id'
        ),
        firstRow<{ id: string }>('dogs', 'id'),
        firstRow<{ id: string }>('clubs', 'id'),
        firstRow<{ id: string }>('roles', 'id'),
        firstRow<{ id: string }>('organization_templates', 'id'),
        firstRow<{ id: string }>('people', 'id'),
        firstRow<{ id: string }>('entries', 'id'),
        firstRow<{ id: string }>('show_registrations', 'id'),
        firstRow<{ id: string }>('profiles', 'id'),
      ]);

      return {
        showId: show?.id,
        trialId: trial?.id,
        trialShowId: trial?.show_id,
        classId: classRow?.id,
        classTrialId: classRow?.trial_id,
        classShowId: classRow?.show_id,
        dogId: dog?.id,
        clubId: club?.id,
        roleId: role?.id,
        templateId: template?.id,
        personId: person?.id,
        entryId: entry?.id,
        registrationId: registration?.id,
        userId: user?.id,
      };
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/useExampleIds.test.tsx`
Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/features/admin-help/hooks/useExampleIds.ts \
        apps/myk9show/src/features/admin-help/__tests__/useExampleIds.test.tsx
git commit -m "$(cat <<'EOF'
feat(admin-help): add useExampleIds hook with React Query + 5-min staleTime

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Seed `pageDirectory.ts` + invariant test

**Files:**
- Create: `apps/myk9show/src/features/admin-help/data/pageDirectory.ts`
- Test: `apps/myk9show/src/features/admin-help/__tests__/pageDirectory.test.ts`

Source material for descriptions + classification: [`docs/feature-audit-2026.md`](../../feature-audit-2026.md) and [`docs/navigation-ia.md`](../../navigation-ia.md). Role assignment derived from route file location and journeys.

- [ ] **Step 1: Write the invariant test first**

Write `apps/myk9show/src/features/admin-help/__tests__/pageDirectory.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { pageDirectory } from '../data/pageDirectory';
import { fullRouteRegistry } from '@/routes/routeRegistry';

describe('pageDirectory (invariant)', () => {
  it('every entry path exists in fullRouteRegistry', () => {
    const registryPaths = new Set(Object.keys(fullRouteRegistry));
    const stray = pageDirectory
      .map(e => e.path)
      .filter(p => !registryPaths.has(p));
    expect(stray).toEqual([]);
  });

  it('has no duplicate paths', () => {
    const paths = pageDirectory.map(e => e.path);
    const unique = new Set(paths);
    expect(paths.length).toBe(unique.size);
  });

  it('every entry has a non-empty title and description', () => {
    const invalid = pageDirectory.filter(
      e => !e.title.trim() || !e.description.trim()
    );
    expect(invalid).toEqual([]);
  });

  it('every entry has at least one role', () => {
    const invalid = pageDirectory.filter(e => e.roles.length === 0);
    expect(invalid).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/pageDirectory.test.ts`
Expected: FAIL with "Cannot find module '../data/pageDirectory'".

- [ ] **Step 3: Create the directory seed**

Write `apps/myk9show/src/features/admin-help/data/pageDirectory.ts`. Seed with an entry per route in `fullRouteRegistry`. For each entry:
- Derive `path` directly from the registry key.
- Derive `title` from the component name (humanized) or from feature-audit wording.
- Lift `description` (1 sentence) from feature-audit-2026.md when available; otherwise summarize from the page component.
- Set `roles`:
  - `/admin/*` → `[UserRole.SITE_ADMIN]`
  - `/secretary/*` → `[UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN]`
  - `/judge/*` → `[UserRole.JUDGE, UserRole.SITE_ADMIN]`
  - `/exhibitor/*`, `/cart`, `/checkout/*`, `/my-entries` → `[UserRole.EXHIBITOR, UserRole.SITE_ADMIN]`
  - `/shows`, `/shows/:id`, `/trials/:trialId`, `/classes/:classId`, `/dogs`, `/dogs/:id`, `/clubs`, `/clubs/:id`, `/calendar`, `/subscription`, `/registration`, `/browse-shows` → all logged-in roles (`EXHIBITOR, SECRETARY, CLUB_ADMIN, SITE_ADMIN`)
  - `/tv/:showId` → `[UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN]`
- Set `classification`:
  - `critical-path` for items marked as such in feature-audit / navigation-ia
  - `park` for items listed in the Park column of navigation-ia Section 2
  - `hidden` for dev/test pages (`/admin/rbac-test`, `/admin/load-testing`, `/admin/onboarding` if park)
- Set `category` from `{ Shows, Entries, Dogs, Clubs, People, Reports, Results, Payments, Admin, Auth, Public }`.
- Set `status` to `working` by default; mark `/admin/settings` as `stub` (it's a placeholder component per adminRoutes.tsx:127–128).

Template (~50 entries, elide for brevity in this plan, but the implementer must list every registry key):

```typescript
import type { PageEntry } from '../types';
import { UserRole } from '@/types/auth-types';

/**
 * Hand-authored directory of every user-facing page in myK9Show.
 * Must stay in sync with fullRouteRegistry (enforced by pageDirectory.test.ts).
 */
export const pageDirectory: readonly PageEntry[] = [
  // =========================
  // ADMIN
  // =========================
  {
    path: '/admin/dashboard',
    title: 'Admin Dashboard',
    description: 'System health overview, active shows, and admin quick actions.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Admin',
    status: 'working',
  },
  {
    path: '/admin/users',
    title: 'User Management',
    description: 'Create, deactivate, and reset user accounts across the platform.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Admin',
    status: 'working',
  },
  {
    path: '/admin/permissions',
    title: 'Roles & Permissions',
    description: 'Grant roles (secretary, club admin, exhibitor, site admin) to users.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Admin',
    status: 'working',
  },
  {
    path: '/admin/permissions/roles',
    title: 'Role List',
    description: 'Browse all roles and their assigned permissions.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Admin',
    status: 'working',
  },
  {
    path: '/admin/permissions/roles/new',
    title: 'Create Role',
    description: 'Define a new custom role with a permission set.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Admin',
    status: 'working',
  },
  {
    path: '/admin/permissions/roles/:roleId',
    title: 'Edit Role',
    description: 'Modify a role\'s display name and assigned permissions.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Admin',
    status: 'working',
  },
  {
    path: '/admin/permissions/roles/:roleId/clone',
    title: 'Clone Role',
    description: 'Duplicate an existing role as a starting point for a new one.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Admin',
    status: 'working',
  },
  {
    path: '/admin/permissions/users',
    title: 'User Role Assignment',
    description: 'Assign and revoke roles per user.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Admin',
    status: 'working',
  },
  {
    path: '/admin/permissions/audit',
    title: 'Permission Audit',
    description: 'Audit log of role and permission changes (tabbed into Permissions page).',
    roles: [UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Admin',
    status: 'working',
  },
  {
    path: '/admin/templates',
    title: 'Template Management',
    description: 'Maintain organization/sport templates (AKC, UKC, ASCA) and class definitions.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Admin',
    status: 'working',
  },
  {
    path: '/admin/templates/new',
    title: 'New Template',
    description: 'Create a new organization/sport template.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Admin',
    status: 'working',
  },
  {
    path: '/admin/templates/:templateId/edit',
    title: 'Edit Template',
    description: 'Edit an existing organization/sport template.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Admin',
    status: 'working',
  },
  {
    path: '/admin/templates/:templateId/test',
    title: 'Template Testing',
    description: 'Preview how a template renders and validates in the show wizard.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Admin',
    status: 'working',
  },
  {
    path: '/admin/sync',
    title: 'Sync Monitoring',
    description: 'Monitor ingress/egress sync jobs and queued mutations.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Admin',
    status: 'working',
  },
  {
    path: '/admin/performance',
    title: 'Performance Dashboard',
    description: 'Latency, memory, and bundle performance telemetry.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Admin',
    status: 'working',
  },
  {
    path: '/admin/data-lifecycle',
    title: 'Data Lifecycle',
    description: 'Retention, archival, and purge policies for show data.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Admin',
    status: 'working',
  },
  {
    path: '/admin/load-testing',
    title: 'Load Testing',
    description: 'Dev-only harness for synthetic load tests.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'hidden',
    category: 'Admin',
    status: 'working',
  },
  {
    path: '/admin/alerts',
    title: 'System Alerts',
    description: 'Platform-wide alerts and notifications for admin attention.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Admin',
    status: 'working',
  },

  // =========================
  // SECRETARY
  // =========================
  {
    path: '/secretary/dashboard',
    title: 'Secretary Dashboard (Mission Control)',
    description: 'Pipeline of upcoming shows with Setup / Entries / Day-of / Closeout badges.',
    roles: [UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Shows',
    status: 'working',
  },
  {
    path: '/secretary/classes',
    title: 'Show Creation Wizard',
    description: 'Multi-step wizard for creating a show with trials, classes, and officials.',
    roles: [UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Shows',
    status: 'working',
  },
  {
    path: '/secretary/results-control',
    title: 'Results Control',
    description: 'Verify class results and release to exhibitors.',
    roles: [UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Results',
    status: 'working',
  },

  // =========================
  // EXHIBITOR / PUBLIC
  // =========================
  {
    path: '/shows',
    title: 'Browse Shows',
    description: 'Find upcoming shows and enter directly.',
    roles: [UserRole.EXHIBITOR, UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Shows',
    status: 'working',
  },
  {
    path: '/shows/:id',
    title: 'Show Details',
    description: 'Per-show detail page: trials, classes, judges, run order.',
    roles: [UserRole.EXHIBITOR, UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Shows',
    status: 'working',
  },
  {
    path: '/shows/:showId/trials/:trialId',
    title: 'Trial Details',
    description: 'Single-trial view with classes and scheduling.',
    roles: [UserRole.EXHIBITOR, UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Shows',
    status: 'working',
  },
  {
    path: '/trials/:trialId',
    title: 'Trial Details (legacy path)',
    description: 'Legacy trial URL that renders the same page as the nested path.',
    roles: [UserRole.EXHIBITOR, UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Shows',
    status: 'working',
  },
  {
    path: '/shows/:showId/trials/:trialId/classes/:classId',
    title: 'Class Details',
    description: 'Run order, entries, and results for a specific class.',
    roles: [UserRole.EXHIBITOR, UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Shows',
    status: 'working',
  },
  {
    path: '/shows/:showId/trials/:trialId/classes/:classId/results',
    title: 'Class Results',
    description: 'Final placements and qualifying codes for a class.',
    roles: [UserRole.EXHIBITOR, UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Results',
    status: 'working',
  },
  {
    path: '/classes/:classId',
    title: 'Class Details (legacy path)',
    description: 'Legacy class URL redirect target; tabbed into Show Details per nav-ia.',
    roles: [UserRole.EXHIBITOR, UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Shows',
    status: 'working',
  },
  {
    path: '/browse-shows',
    title: 'Browse Shows (legacy path)',
    description: 'Backwards-compat redirect to /shows.',
    roles: [UserRole.EXHIBITOR, UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Shows',
    status: 'working',
  },
  {
    path: '/my-entries',
    title: 'My Entries (legacy path)',
    description: 'Backwards-compat redirect to /exhibitor/entries.',
    roles: [UserRole.EXHIBITOR, UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Entries',
    status: 'working',
  },
  {
    path: '/exhibitor/entries',
    title: 'My Entries',
    description: 'Exhibitor\'s entries across all shows with status pills.',
    roles: [UserRole.EXHIBITOR, UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Entries',
    status: 'working',
  },
  {
    path: '/exhibitor/show-day',
    title: 'Show Day',
    description: 'Exhibitor\'s day-of view: check-in, run order, results.',
    roles: [UserRole.EXHIBITOR, UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Entries',
    status: 'working',
  },
  {
    path: '/exhibitor/entries/history',
    title: 'Entry History',
    description: 'Historical entries view (flagged for removal from sidebar per nav-ia).',
    roles: [UserRole.EXHIBITOR, UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Entries',
    status: 'working',
  },
  {
    path: '/exhibitor/check-in/:entryId',
    title: 'Class Check-In',
    description: 'Exhibitor self check-in for a specific entry.',
    roles: [UserRole.EXHIBITOR, UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Entries',
    status: 'working',
  },
  {
    path: '/exhibitor/analytics',
    title: 'Personal Analytics',
    description: 'Exhibitor-only stats: entry counts, Qs, placements over time.',
    roles: [UserRole.EXHIBITOR, UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Entries',
    status: 'working',
  },
  {
    path: '/dogs',
    title: 'Browse Dogs',
    description: 'Directory of dogs registered with the platform.',
    roles: [UserRole.EXHIBITOR, UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Dogs',
    status: 'working',
  },
  {
    path: '/dogs/:id',
    title: 'Dog Detail',
    description: 'Single dog profile: registrations, titles, entry history.',
    roles: [UserRole.EXHIBITOR, UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Dogs',
    status: 'working',
  },
  {
    path: '/clubs',
    title: 'Browse Clubs',
    description: 'Directory of clubs (parked from primary nav; secretary/admin access).',
    roles: [UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Clubs',
    status: 'working',
  },
  {
    path: '/clubs/:id',
    title: 'Club Detail',
    description: 'Single club profile: shows, members, officials.',
    roles: [UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Clubs',
    status: 'working',
  },
  {
    path: '/calendar',
    title: 'Calendar',
    description: 'Calendar view of upcoming shows (parked from primary nav).',
    roles: [UserRole.EXHIBITOR, UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Public',
    status: 'working',
  },
  {
    path: '/subscription',
    title: 'Subscription',
    description: 'Plan and billing view for the logged-in user.',
    roles: [UserRole.EXHIBITOR, UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Payments',
    status: 'working',
  },
  {
    path: '/registration',
    title: 'Registration (alias)',
    description: 'Legacy alias that currently renders the Calendar page.',
    roles: [UserRole.EXHIBITOR, UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Public',
    status: 'stub',
  },
  {
    path: '/shows/:showId/register',
    title: 'Registration Wizard',
    description: 'Exhibitor entry flow: pick classes, dogs, pay.',
    roles: [UserRole.EXHIBITOR, UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Entries',
    status: 'working',
  },
  {
    path: '/cart',
    title: 'Cart',
    description: 'Pending entries awaiting payment.',
    roles: [UserRole.EXHIBITOR, UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Payments',
    status: 'working',
  },
  {
    path: '/checkout/success',
    title: 'Checkout Success',
    description: 'Post-payment confirmation page.',
    roles: [UserRole.EXHIBITOR, UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Payments',
    status: 'working',
  },
  {
    path: '/checkout/cancel',
    title: 'Checkout Cancelled',
    description: 'Returned from Stripe when payment is abandoned.',
    roles: [UserRole.EXHIBITOR, UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Payments',
    status: 'working',
  },
  {
    path: '/tv/:showId',
    title: 'TV Display',
    description: 'Large-format announcer board for the venue (parked).',
    roles: [UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Shows',
    status: 'working',
  },

  // =========================
  // JUDGE (all parked for fall per nav-ia)
  // =========================
  {
    path: '/judge/dashboard',
    title: 'Judge Dashboard',
    description: 'Judge landing page (parked for fall; myK9Q is the judge surface).',
    roles: [UserRole.JUDGE, UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Shows',
    status: 'working',
  },
  {
    path: '/judge/assignments',
    title: 'Judge Assignments',
    description: 'Judging assignments list (parked for fall).',
    roles: [UserRole.JUDGE, UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Shows',
    status: 'working',
  },
] as const;
```

**Note for implementer:** The list above is the starting seed. Run the invariant test (Step 4) — if it reports extra registry routes, add matching entries before committing. Use `docs/feature-audit-2026.md` for wording.

Also add the `/admin/help` entry — but **not yet**. That entry is added in Task 10 so the invariant test fails until that task. (Reason: the registry key only exists after Task 10 wires the route.)

- [ ] **Step 4: Run the invariant test**

Run: `cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/pageDirectory.test.ts`
Expected: four tests pass. If "stray" lists any route, the implementer missed it in the seed — add an entry.

**If `admin/rbac-test`, `admin/judges/analytics`, `admin/onboarding`, `admin/analytics`, `admin/settings`, or `admin/users` (for any routes registered only in `adminRoutes.tsx` but not in `routeRegistry.ts`) show up as extras, DO NOT add them to the directory — instead, leave them for the `UndocumentedRoutesPanel` to surface.** The invariant test only checks that directory entries exist in the registry, not the reverse. The `missing` direction is surfaced at runtime.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/features/admin-help/data/pageDirectory.ts \
        apps/myk9show/src/features/admin-help/__tests__/pageDirectory.test.ts
git commit -m "$(cat <<'EOF'
feat(admin-help): seed pageDirectory with entries for every registered route

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Implement `PageDirectoryRow.tsx` (TDD)

**Files:**
- Test: `apps/myk9show/src/features/admin-help/__tests__/PageDirectoryRow.test.tsx`
- Create: `apps/myk9show/src/features/admin-help/components/PageDirectoryRow.tsx`

- [ ] **Step 1: Write the failing test**

Write `apps/myk9show/src/features/admin-help/__tests__/PageDirectoryRow.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { PageDirectoryRow } from '../components/PageDirectoryRow';
import type { PageEntry } from '../types';
import { UserRole } from '@/types/auth-types';

const entry: PageEntry = {
  path: '/shows/:id',
  title: 'Show Details',
  description: 'Per-show view.',
  roles: [UserRole.EXHIBITOR, UserRole.SITE_ADMIN],
  classification: 'critical-path',
  category: 'Shows',
  status: 'working',
};

describe('PageDirectoryRow', () => {
  it('renders title, description, path, category, and status', () => {
    render(
      <PageDirectoryRow entry={entry} resolvedPath="/shows/SHOW_1" loading={false} />
    );
    expect(screen.getByText('Show Details')).toBeInTheDocument();
    expect(screen.getByText('Per-show view.')).toBeInTheDocument();
    expect(screen.getByText('/shows/:id')).toBeInTheDocument();
    expect(screen.getByText(/Shows/)).toBeInTheDocument();
    expect(screen.getByText(/working/)).toBeInTheDocument();
  });

  it('renders an enabled "Go to page" link when resolvedPath is present', () => {
    render(
      <PageDirectoryRow entry={entry} resolvedPath="/shows/SHOW_1" loading={false} />
    );
    const link = screen.getByRole('link', { name: /go to page/i });
    expect(link).toHaveAttribute('href', '/shows/SHOW_1');
  });

  it('disables "Go to page" when loading', () => {
    render(<PageDirectoryRow entry={entry} resolvedPath={null} loading={true} />);
    const btn = screen.getByRole('button', { name: /go to page/i });
    expect(btn).toBeDisabled();
  });

  it('disables "Go to page" with tooltip when resolvedPath is null and not loading', () => {
    render(<PageDirectoryRow entry={entry} resolvedPath={null} loading={false} />);
    const btn = screen.getByRole('button', { name: /go to page/i });
    expect(btn).toBeDisabled();
  });

  it('renders non-parameterized entry with the path as href', () => {
    const flat: PageEntry = { ...entry, path: '/admin/dashboard' };
    render(
      <PageDirectoryRow entry={flat} resolvedPath="/admin/dashboard" loading={false} />
    );
    const link = screen.getByRole('link', { name: /go to page/i });
    expect(link).toHaveAttribute('href', '/admin/dashboard');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/PageDirectoryRow.test.tsx`
Expected: FAIL ("Cannot find module '../components/PageDirectoryRow'").

- [ ] **Step 3: Implement the row**

Write `apps/myk9show/src/features/admin-help/components/PageDirectoryRow.tsx`:

```typescript
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { PageEntry } from '../types';

export interface PageDirectoryRowProps {
  entry: PageEntry;
  /** Pre-resolved navigation path. `null` means unresolvable (disables the button). */
  resolvedPath: string | null;
  /** True while example ids are still being fetched. */
  loading: boolean;
}

function classificationVariant(
  c: PageEntry['classification']
): 'default' | 'secondary' | 'outline' {
  if (c === 'critical-path') return 'default';
  if (c === 'park') return 'secondary';
  return 'outline';
}

export function PageDirectoryRow({
  entry,
  resolvedPath,
  loading,
}: PageDirectoryRowProps) {
  const disabled = loading || resolvedPath === null;
  const disabledReason = loading
    ? 'Resolving example id…'
    : resolvedPath === null
      ? 'No example record available for this route'
      : '';

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-medium">{entry.title}</h4>
          <Badge variant={classificationVariant(entry.classification)}>
            {entry.classification}
          </Badge>
          <Badge variant="outline">{entry.category}</Badge>
          <Badge variant="outline">{entry.status}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
        <code className="mt-1 block text-xs text-muted-foreground">{entry.path}</code>
      </div>
      <div className="shrink-0">
        {disabled ? (
          <Button variant="outline" size="sm" disabled title={disabledReason}>
            {loading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="mr-1 h-4 w-4" />
            )}
            Go to page
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link to={resolvedPath}>
              <ArrowRight className="mr-1 h-4 w-4" />
              Go to page
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/PageDirectoryRow.test.tsx`
Expected: all five tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/features/admin-help/components/PageDirectoryRow.tsx \
        apps/myk9show/src/features/admin-help/__tests__/PageDirectoryRow.test.tsx
git commit -m "$(cat <<'EOF'
feat(admin-help): add PageDirectoryRow with resolved-path Go button

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Implement `PageDirectorySection.tsx`

**Files:**
- Test: `apps/myk9show/src/features/admin-help/__tests__/PageDirectorySection.test.tsx`
- Create: `apps/myk9show/src/features/admin-help/components/PageDirectorySection.tsx`

- [ ] **Step 1: Write the failing test**

Write `apps/myk9show/src/features/admin-help/__tests__/PageDirectorySection.test.tsx`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render, userEvent } from '@/test/utils/testUtils';
import { PageDirectorySection } from '../components/PageDirectorySection';
import { UserRole } from '@/types/auth-types';
import type { PageEntry } from '../types';

const e = (path: string, title: string): PageEntry => ({
  path,
  title,
  description: `desc ${title}`,
  roles: [UserRole.SITE_ADMIN],
  classification: 'critical-path',
  category: 'Admin',
  status: 'working',
});

describe('PageDirectorySection', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the role title and entry count', () => {
    render(
      <PageDirectorySection
        roleKey="site-admin"
        title="Site Admin"
        entries={[e('/admin/dashboard', 'Dashboard'), e('/admin/users', 'Users')]}
        resolvePath={(p) => p}
        loading={false}
      />
    );
    expect(screen.getByText(/site admin/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders all entries when expanded', () => {
    render(
      <PageDirectorySection
        roleKey="site-admin"
        title="Site Admin"
        entries={[e('/admin/dashboard', 'Dashboard'), e('/admin/users', 'Users')]}
        resolvePath={(p) => p}
        loading={false}
      />
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
  });

  it('collapses and persists state to localStorage', async () => {
    const user = userEvent.setup();
    render(
      <PageDirectorySection
        roleKey="site-admin"
        title="Site Admin"
        entries={[e('/admin/dashboard', 'Dashboard')]}
        resolvePath={(p) => p}
        loading={false}
      />
    );
    await user.click(screen.getByRole('button', { name: /site admin/i }));
    expect(window.localStorage.getItem('admin-help:section:site-admin')).toBe('closed');
  });

  it('reads saved collapsed state on mount', () => {
    window.localStorage.setItem('admin-help:section:site-admin', 'closed');
    render(
      <PageDirectorySection
        roleKey="site-admin"
        title="Site Admin"
        entries={[e('/admin/dashboard', 'Dashboard')]}
        resolvePath={(p) => p}
        loading={false}
      />
    );
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/PageDirectorySection.test.tsx`
Expected: FAIL ("Cannot find module '../components/PageDirectorySection'").

- [ ] **Step 3: Implement the section**

Write `apps/myk9show/src/features/admin-help/components/PageDirectorySection.tsx`:

```typescript
import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PageDirectoryRow } from './PageDirectoryRow';
import type { PageEntry } from '../types';

export interface PageDirectorySectionProps {
  /** Stable key used for localStorage persistence, e.g. "site-admin" */
  roleKey: string;
  /** Human-facing label */
  title: string;
  entries: readonly PageEntry[];
  /** Returns the resolved navigation path for an entry, or null if unresolvable */
  resolvePath: (path: string) => string | null;
  loading: boolean;
}

const storageKey = (roleKey: string) => `admin-help:section:${roleKey}`;

export function PageDirectorySection({
  roleKey,
  title,
  entries,
  resolvePath,
  loading,
}: PageDirectorySectionProps) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(storageKey(roleKey)) !== 'closed';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey(roleKey), open ? 'open' : 'closed');
  }, [roleKey, open]);

  const toggle = useCallback(() => setOpen(v => !v), []);

  return (
    <section className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between p-3 text-left"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <h3 className="font-semibold">{title}</h3>
          <Badge variant="secondary">{entries.length}</Badge>
        </div>
      </button>
      {open && (
        <div className="space-y-2 border-t p-3">
          {entries.map(entry => (
            <PageDirectoryRow
              key={entry.path}
              entry={entry}
              resolvedPath={resolvePath(entry.path)}
              loading={loading}
            />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/PageDirectorySection.test.tsx`
Expected: four passing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/features/admin-help/components/PageDirectorySection.tsx \
        apps/myk9show/src/features/admin-help/__tests__/PageDirectorySection.test.tsx
git commit -m "$(cat <<'EOF'
feat(admin-help): add collapsible PageDirectorySection with localStorage persistence

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Implement `UndocumentedRoutesPanel.tsx` (TDD)

**Files:**
- Test: `apps/myk9show/src/features/admin-help/__tests__/UndocumentedRoutesPanel.test.tsx`
- Create: `apps/myk9show/src/features/admin-help/components/UndocumentedRoutesPanel.tsx`

- [ ] **Step 1: Write the failing test**

Write `apps/myk9show/src/features/admin-help/__tests__/UndocumentedRoutesPanel.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { UndocumentedRoutesPanel } from '../components/UndocumentedRoutesPanel';

describe('UndocumentedRoutesPanel', () => {
  it('renders nothing when both lists are empty', () => {
    const { container } = render(
      <UndocumentedRoutesPanel missing={[]} extra={[]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a Missing section when missing has entries', () => {
    render(<UndocumentedRoutesPanel missing={['/admin/new-page']} extra={[]} />);
    expect(screen.getByText(/missing/i)).toBeInTheDocument();
    expect(screen.getByText('/admin/new-page')).toBeInTheDocument();
  });

  it('renders an Extra section when extra has entries', () => {
    render(<UndocumentedRoutesPanel missing={[]} extra={['/old-route']} />);
    expect(screen.getByText(/extra/i)).toBeInTheDocument();
    expect(screen.getByText('/old-route')).toBeInTheDocument();
  });

  it('renders both sections when both lists are non-empty', () => {
    render(
      <UndocumentedRoutesPanel missing={['/admin/new-page']} extra={['/old-route']} />
    );
    expect(screen.getByText(/missing/i)).toBeInTheDocument();
    expect(screen.getByText(/extra/i)).toBeInTheDocument();
    expect(screen.getByText('/admin/new-page')).toBeInTheDocument();
    expect(screen.getByText('/old-route')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/UndocumentedRoutesPanel.test.tsx`
Expected: FAIL ("Cannot find module '../components/UndocumentedRoutesPanel'").

- [ ] **Step 3: Implement the panel**

Write `apps/myk9show/src/features/admin-help/components/UndocumentedRoutesPanel.tsx`:

```typescript
import React from 'react';
import { AlertTriangle } from 'lucide-react';

export interface UndocumentedRoutesPanelProps {
  /** Registered routes without a matching directory entry */
  missing: readonly string[];
  /** Directory entries whose path is not (or no longer) in the registry */
  extra: readonly string[];
}

export function UndocumentedRoutesPanel({
  missing,
  extra,
}: UndocumentedRoutesPanelProps) {
  if (missing.length === 0 && extra.length === 0) return null;

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h3 className="font-semibold">Directory drift</h3>
      </div>
      {missing.length > 0 && (
        <div className="mb-2">
          <h4 className="text-sm font-medium">
            Missing directory entries ({missing.length})
          </h4>
          <ul className="mt-1 space-y-0.5 text-sm">
            {missing.map(p => (
              <li key={p}>
                <code>{p}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {extra.length > 0 && (
        <div>
          <h4 className="text-sm font-medium">
            Extra directory entries ({extra.length})
          </h4>
          <ul className="mt-1 space-y-0.5 text-sm">
            {extra.map(p => (
              <li key={p}>
                <code>{p}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/UndocumentedRoutesPanel.test.tsx`
Expected: four passing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/features/admin-help/components/UndocumentedRoutesPanel.tsx \
        apps/myk9show/src/features/admin-help/__tests__/UndocumentedRoutesPanel.test.tsx
git commit -m "$(cat <<'EOF'
feat(admin-help): add UndocumentedRoutesPanel for drift display

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Implement `AdminHelpPage.tsx` (TDD)

**Files:**
- Test: `apps/myk9show/src/features/admin-help/__tests__/AdminHelpPage.test.tsx`
- Create: `apps/myk9show/src/features/admin-help/components/AdminHelpPage.tsx`
- Modify: `apps/myk9show/src/features/admin-help/index.ts` (export `AdminHelpPage`)

- [ ] **Step 1: Write the failing test**

Write `apps/myk9show/src/features/admin-help/__tests__/AdminHelpPage.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render, userEvent } from '@/test/utils/testUtils';

vi.mock('../hooks/useExampleIds', () => ({
  useExampleIds: () => ({
    data: { showId: 'SHOW_1', dogId: 'DOG_1' },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('../data/pageDirectory', async () => {
  const { UserRole } = await import('@/types/auth-types');
  return {
    pageDirectory: [
      {
        path: '/admin/dashboard',
        title: 'Admin Dashboard',
        description: 'Admin overview page.',
        roles: [UserRole.SITE_ADMIN],
        classification: 'critical-path',
        category: 'Admin',
        status: 'working',
      },
      {
        path: '/exhibitor/entries',
        title: 'My Entries',
        description: 'Exhibitor entries list.',
        roles: [UserRole.EXHIBITOR, UserRole.SITE_ADMIN],
        classification: 'critical-path',
        category: 'Entries',
        status: 'working',
      },
      {
        path: '/calendar',
        title: 'Calendar',
        description: 'Parked calendar view.',
        roles: [
          UserRole.EXHIBITOR,
          UserRole.SECRETARY,
          UserRole.CLUB_ADMIN,
          UserRole.SITE_ADMIN,
        ],
        classification: 'park',
        category: 'Public',
        status: 'working',
      },
    ],
  };
});

import { AdminHelpPage } from '../components/AdminHelpPage';

describe('AdminHelpPage', () => {
  it('hides parked entries by default', () => {
    render(<AdminHelpPage />);
    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
    expect(screen.getByText('My Entries')).toBeInTheDocument();
    expect(screen.queryByText('Calendar')).not.toBeInTheDocument();
  });

  it('shows parked entries when the toggle is enabled', async () => {
    const user = userEvent.setup();
    render(<AdminHelpPage />);
    await user.click(screen.getByLabelText(/show parked/i));
    expect(screen.getByText('Calendar')).toBeInTheDocument();
  });

  it('filters by search term across title and description', async () => {
    const user = userEvent.setup();
    render(<AdminHelpPage />);
    await user.type(screen.getByPlaceholderText(/search pages/i), 'exhibitor');
    expect(screen.getByText('My Entries')).toBeInTheDocument();
    expect(screen.queryByText('Admin Dashboard')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/AdminHelpPage.test.tsx`
Expected: FAIL ("Cannot find module '../components/AdminHelpPage'").

- [ ] **Step 3: Implement the page**

Write `apps/myk9show/src/features/admin-help/components/AdminHelpPage.tsx`:

```typescript
import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserRole } from '@/types/auth-types';
import { fullRouteRegistry } from '@/routes/routeRegistry';
import { pageDirectory } from '../data/pageDirectory';
import { useExampleIds } from '../hooks/useExampleIds';
import { resolveExamplePath } from '../utils/resolveExamplePath';
import { routeDiff } from '../utils/routeDiff';
import { PageDirectorySection } from './PageDirectorySection';
import { UndocumentedRoutesPanel } from './UndocumentedRoutesPanel';
import type { PageClassification, PageEntry, PageStatus } from '../types';

const ROLE_ORDER: { role: UserRole; title: string; key: string }[] = [
  { role: UserRole.SITE_ADMIN, title: 'Site Admin', key: 'site-admin' },
  { role: UserRole.SECRETARY, title: 'Secretary', key: 'secretary' },
  { role: UserRole.CLUB_ADMIN, title: 'Club Admin', key: 'club-admin' },
  { role: UserRole.JUDGE, title: 'Judge', key: 'judge' },
  { role: UserRole.EXHIBITOR, title: 'Exhibitor', key: 'exhibitor' },
];

const ALL = '__all__';

export function AdminHelpPage() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>(ALL);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);
  const [classificationFilter, setClassificationFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [showParked, setShowParked] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const { data: ids, isLoading } = useExampleIds();

  const categories = useMemo(
    () => Array.from(new Set(pageDirectory.map(e => e.category))).sort(),
    []
  );

  const filtered: PageEntry[] = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pageDirectory.filter(entry => {
      if (!showParked && entry.classification === 'park') return false;
      if (!showHidden && entry.classification === 'hidden') return false;
      if (roleFilter !== ALL && !entry.roles.includes(roleFilter as UserRole))
        return false;
      if (categoryFilter !== ALL && entry.category !== categoryFilter) return false;
      if (
        classificationFilter !== ALL &&
        entry.classification !== (classificationFilter as PageClassification)
      )
        return false;
      if (statusFilter !== ALL && entry.status !== (statusFilter as PageStatus))
        return false;
      if (term) {
        const haystack = `${entry.title} ${entry.description} ${entry.path} ${entry.category}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [
    search,
    roleFilter,
    categoryFilter,
    classificationFilter,
    statusFilter,
    showParked,
    showHidden,
  ]);

  const grouped = useMemo(() => {
    return ROLE_ORDER.map(r => ({
      ...r,
      entries: filtered.filter(e => e.roles.includes(r.role)),
    })).filter(group => group.entries.length > 0);
  }, [filtered]);

  const resolvePath = (path: string): string | null =>
    ids ? resolveExamplePath(path, ids) : null;

  const diff = useMemo(() => routeDiff(fullRouteRegistry, pageDirectory), []);

  return (
    <div className="container mx-auto max-w-5xl space-y-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">Page Directory</h1>
        <p className="text-sm text-muted-foreground">
          Every page in myK9Show, grouped by role.
        </p>
      </header>

      <div className="space-y-3 rounded-lg border bg-card p-3">
        <Input
          placeholder="Search pages by title, description, path…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="grid gap-2 md:grid-cols-4">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All roles</SelectItem>
              {ROLE_ORDER.map(r => (
                <SelectItem key={r.role} value={r.role}>
                  {r.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categories.map(c => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={classificationFilter}
            onValueChange={setClassificationFilter}
          >
            <SelectTrigger>
              <SelectValue placeholder="Classification" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All classifications</SelectItem>
              <SelectItem value="critical-path">Critical path</SelectItem>
              <SelectItem value="park">Park</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="working">Working</SelectItem>
              <SelectItem value="stub">Stub</SelectItem>
              <SelectItem value="known-issues">Known issues</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={showParked}
              onCheckedChange={v => setShowParked(v === true)}
              aria-label="Show parked pages"
            />
            Show parked pages
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={showHidden}
              onCheckedChange={v => setShowHidden(v === true)}
              aria-label="Show hidden / dev pages"
            />
            Show hidden/dev pages
          </label>
        </div>
      </div>

      {grouped.length === 0 && (
        <div className="rounded-lg border p-6 text-center text-muted-foreground">
          No pages match the current filters.
        </div>
      )}

      <div className="space-y-3">
        {grouped.map(group => (
          <PageDirectorySection
            key={group.key}
            roleKey={group.key}
            title={group.title}
            entries={group.entries}
            resolvePath={resolvePath}
            loading={isLoading}
          />
        ))}
      </div>

      <UndocumentedRoutesPanel missing={diff.missing} extra={diff.extra} />
    </div>
  );
}

export default AdminHelpPage;
```

- [ ] **Step 4: Update the barrel export**

Edit `apps/myk9show/src/features/admin-help/index.ts` to also export the page:

```typescript
export type {
  PageEntry,
  PageStatus,
  PageClassification,
  ExampleIds,
} from './types';
export { AdminHelpPage, default } from './components/AdminHelpPage';
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/AdminHelpPage.test.tsx`
Expected: all three tests pass.

- [ ] **Step 6: Run the full admin-help test suite to catch regressions**

Run: `cd apps/myk9show && npx vitest run src/features/admin-help/`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/features/admin-help/components/AdminHelpPage.tsx \
        apps/myk9show/src/features/admin-help/__tests__/AdminHelpPage.test.tsx \
        apps/myk9show/src/features/admin-help/index.ts
git commit -m "$(cat <<'EOF'
feat(admin-help): add AdminHelpPage with search, filters, and drift panel

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Wire `/admin/help` route into router + registry

**Files:**
- Modify: `apps/myk9show/src/routes/adminRoutes.tsx`
- Modify: `apps/myk9show/src/routes/routeRegistry.ts`
- Modify: `apps/myk9show/src/features/admin-help/data/pageDirectory.ts` (add self-entry)

- [ ] **Step 1: Add lazy import to `adminRoutes.tsx`**

At the end of the lazy imports block (near `UserManagementPage`), add:

```typescript
const AdminHelpPage = createEnhancedLazy(
  () => import('@/features/admin-help').then(m => ({ default: m.AdminHelpPage })),
  { ...RouteLazyPresets.mediumPriority, displayName: 'AdminHelpPage' }
);
```

- [ ] **Step 2: Add route definition**

Inside the `AdminRoutes` JSX — placed after the `/admin/onboarding` route block, before the `/admin/rbac-test` block — add:

```tsx
{/* Help / Page Directory */}
<Route
  path="/admin/help"
  element={adminGuard(
    <SuspenseWrapper>
      <PageTransition>
        <AdminHelpPage />
      </PageTransition>
    </SuspenseWrapper>
  )}
/>
```

- [ ] **Step 3: Register in `routeRegistry.ts`**

Edit the `adminRouteComponents` object in `apps/myk9show/src/routes/routeRegistry.ts` — add, right before the closing `} as const;`:

```typescript
  '/admin/help': () => import('@/features/admin-help').then(m => ({ default: m.AdminHelpPage })),
```

- [ ] **Step 4: Add `/admin/help` directory entry**

Edit `apps/myk9show/src/features/admin-help/data/pageDirectory.ts` — add immediately after the `/admin/users` entry:

```typescript
  {
    path: '/admin/help',
    title: 'Help — Page Directory',
    description: 'Directory of every page in myK9Show, grouped by role.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Admin',
    status: 'working',
  },
```

- [ ] **Step 5: Run the invariant test**

Run: `cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/pageDirectory.test.ts`
Expected: all four tests pass.

- [ ] **Step 6: Typecheck + start dev server to smoke test**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: no errors.

Then start dev server in background:

```bash
cd apps/myk9show && pnpm dev
```

Navigate to `http://localhost:5173/admin/help` in a SITE_ADMIN session. Confirm:
- Page renders with the header "Page Directory".
- Role sections appear (Site Admin at minimum).
- Parameterized entries (e.g. Show Details) have a "Go to page" button.
- Clicking a Go button navigates without error.
- The `UndocumentedRoutesPanel` is either empty (ideal) or lists specific registry routes for which an entry is missing — if any appear, add them to `pageDirectory.ts` before committing.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/routes/adminRoutes.tsx \
        apps/myk9show/src/routes/routeRegistry.ts \
        apps/myk9show/src/features/admin-help/data/pageDirectory.ts
git commit -m "$(cat <<'EOF'
feat(admin-help): wire /admin/help route behind SITE_ADMIN guard

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Add "Help" sidebar entry for SITE_ADMIN

**Files:**
- Modify: `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts`

- [ ] **Step 1: Add `HelpCircle` icon import**

Edit the lucide-react import in `unifiedSidebarConfig.ts` — add `HelpCircle` to the list:

```typescript
import {
  LayoutDashboard,
  Activity,
  Calendar,
  Heart,
  Users,
  Building2,
  Scale,
  ClipboardCheck,
  FileText,
  List,
  Crown,
  Shield,
  Compass,
  Search,
  FileBarChart,
  Send,
  ListChecks,
  HelpCircle,
} from 'lucide-react';
```

- [ ] **Step 2: Append "Help" to the Admin section items**

In the block guarded by `hasAnyRole(userRoles, [UserRole.SITE_ADMIN])` (currently three items: Dashboard, Users, Roles & Permissions), append:

```typescript
          {
            title: 'Help',
            href: '/admin/help',
            icon: HelpCircle,
            description: 'Directory of every page in myK9Show',
          },
```

So the final admin group reads:

```typescript
      groups.push({
        title: 'Admin',
        items: [
          {
            title: 'Dashboard',
            href: '/admin/dashboard',
            icon: LayoutDashboard,
            description: 'System overview',
          },
          { title: 'Users', href: '/admin/users', icon: Users, description: 'User accounts' },
          {
            title: 'Roles & Permissions',
            href: '/admin/permissions',
            icon: Shield,
            description: 'Access control',
          },
          {
            title: 'Help',
            href: '/admin/help',
            icon: HelpCircle,
            description: 'Directory of every page in myK9Show',
          },
        ],
      });
```

- [ ] **Step 3: Typecheck + dev-server smoke test**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: no errors.

With the dev server still running, reload as SITE_ADMIN. Confirm the "Help" entry appears under the Admin section and clicking it navigates to `/admin/help`.

Log in as an exhibitor (or any non-admin) and confirm the "Help" entry is **not** visible.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts
git commit -m "$(cat <<'EOF'
feat(admin-help): add Help entry to admin sidebar for SITE_ADMIN

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Final verification

**Files:** (none to create — verification only)

- [ ] **Step 1: Full test run for the feature**

Run: `cd apps/myk9show && npx vitest run src/features/admin-help/`
Expected: all tests pass. Capture the count; it should be ≥ 20 across utilities, hook, and components.

- [ ] **Step 2: Monorepo typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no new errors introduced by `features/admin-help/*`.

- [ ] **Step 4: Acceptance checklist**

Walk the spec's Acceptance Criteria against the shipped feature:

- [ ] `/admin/help` route exists, gated to SITE_ADMIN.
- [ ] `pageDirectory.ts` contains an entry for every route in `fullRouteRegistry` (or any gap is surfaced by `UndocumentedRoutesPanel`).
- [ ] Page renders role-grouped sections with collapse state persisted.
- [ ] Search + four filter dropdowns + two hide toggles work.
- [ ] Parameterized "Go to page" buttons resolve to a real ID chain and degrade gracefully when tables are empty.
- [ ] `UndocumentedRoutesPanel` renders drift when simulated (temporarily add `'/admin/fake': …` to `adminRouteComponents`, confirm it shows up in Missing, revert).
- [ ] Unit + component tests pass; invariant test catches any path typo.
- [ ] Sidebar "Help" entry visible to SITE_ADMIN only.

- [ ] **Step 5: Final commit (only if the checklist turned up minor fixes)**

```bash
git add -u
git commit -m "$(cat <<'EOF'
chore(admin-help): fixes from acceptance-criteria walk-through

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

If the acceptance walk turned up no changes, skip this step.

---

## Out of Scope (per spec)

- Navigation flow diagram (deferred to separate v2 todo logged 2026-04-23).
- Screenshots per page.
- Journey cross-references.
- Role-filtered UX for non-admin users (data model supports it; UI not shipped).
- Keyword/synonym search.
- Global drawer / command palette.
- User-selectable example IDs.
- CI lint rule for drift (stretch; may be added separately if trivial).
