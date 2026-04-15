# Sidebar Nav Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the sidebar for all roles — secretary nav follows show lifecycle order, exhibitor nav collapses to 3 items with a new consolidated My Shows page, duplicate routes are deleted.

**Architecture:** Four independent work streams: (1) sidebar config + tests, (2) roleUtils redirect update, (3) new DogStrip component + MyEntriesPage enhancements, (4) route cleanup and ExhibitorDashboard deletion. Each stream can be reviewed and committed independently.

**Tech Stack:** React, TypeScript, Vitest, React Query, `unifiedSidebarConfig.ts`, `publicRoutes.tsx`, `MyEntriesPage/index.tsx`

---

## File Map

| File                                                                   | Change                                                                                                         |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/components/layout/sidebar/unifiedSidebarConfig.ts`                | Reorder/rename Manage items, update Browse, update My Shows → As Exhibitor, update exhibitor-only groups       |
| `src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts` | Update broken tests, add new assertions for renamed/reordered items                                            |
| `src/hooks/roleUtils.ts`                                               | Change exhibitor dashboard route from `/exhibitor/dashboard` → `/exhibitor/entries`                            |
| `src/components/exhibitor/DogStripCard.tsx`                            | **New** — compact dog card: name, breed, upcoming count badge, title abbreviations                             |
| `src/components/exhibitor/DogStrip.tsx`                                | **New** — row of DogStripCards + "Add Dog" card; fetches its own entries via useEntriesQuery                   |
| `src/pages/MyEntriesPage/index.tsx`                                    | Add greeting header, show day alert, stats row, DogStrip; wire up `useDogsByOwnerQuery` and `useShowDayData`   |
| `src/routes/publicRoutes.tsx`                                          | Delete `/exhibitor/account`, `/exhibitor/profile`, `/exhibitor/dashboard`; add Navigate redirect for dashboard |
| `src/pages/ExhibitorDashboard.tsx`                                     | Delete entire file                                                                                             |

---

## Task 1: Update sidebar config tests

**Files:**

- Modify: `apps/myk9show/src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts`

- [ ] **Step 1: Run the existing test suite to establish baseline**

```bash
cd apps/myk9show && npx vitest run src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts
```

Expected: all tests pass before we touch anything.

- [ ] **Step 2: Update the Manage section test to match new structure**

Replace the three existing Manage tests with these:

```typescript
// ── Manage ───────────────────────────────────────────────────────────────
it('manage sidebar items are in lifecycle order', () => {
  const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
  const group = config.groups.find(g => g.title === 'Manage');
  const titles = group?.items.map(i => i.title) ?? [];
  expect(titles).toEqual([
    'Dashboard',
    'Entries',
    'Tasks',
    'Schedule',
    'Day of Show',
    'Reports',
    'Results Control',
    'Submit Results',
  ]);
});

it('manage sidebar omits Create Show, Messages, and parked items', () => {
  const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
  const group = config.groups.find(g => g.title === 'Manage');
  const titles = group?.items.map(i => i.title) ?? [];
  for (const absent of [
    'Create Show',
    'Messages',
    'Check-In',
    'Volunteers',
    'Settings',
    'Wait List',
    'Run Orders',
    'Pipeline',
  ]) {
    expect(titles, `"${absent}" should be absent`).not.toContain(absent);
  }
});

it('manage Dashboard href is /secretary/dashboard', () => {
  const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
  const group = config.groups.find(g => g.title === 'Manage');
  const item = group?.items.find(i => i.title === 'Dashboard');
  expect(item?.href).toBe('/secretary/dashboard');
});

it('manage Schedule href is /secretary/run-order', () => {
  const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
  const group = config.groups.find(g => g.title === 'Manage');
  const item = group?.items.find(i => i.title === 'Schedule');
  expect(item?.href).toBe('/secretary/run-order');
});

it('manage Day of Show href is /secretary/day-of', () => {
  const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
  const group = config.groups.find(g => g.title === 'Manage');
  const item = group?.items.find(i => i.title === 'Day of Show');
  expect(item?.href).toBe('/secretary/day-of');
});

it('manage Results Control href is /secretary/results-control', () => {
  const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
  const group = config.groups.find(g => g.title === 'Manage');
  const item = group?.items.find(i => i.title === 'Results Control');
  expect(item?.href).toBe('/secretary/results-control');
});
```

- [ ] **Step 3: Update the Browse section test for secretary**

Replace:

```typescript
it('browse section for secretary omits Clubs and Calendar', () => {
  const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
  const browse = config.groups.find(g => g.title === 'Browse');
  const titles = browse?.items.map(i => i.title) ?? [];
  expect(titles).not.toContain('Clubs');
  expect(titles).not.toContain('Calendar');
});
```

With:

```typescript
it('browse section for secretary includes Shows, Dogs, Clubs, People', () => {
  const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
  const browse = config.groups.find(g => g.title === 'Browse');
  const titles = browse?.items.map(i => i.title) ?? [];
  expect(titles).toEqual(['Shows', 'Dogs', 'Clubs', 'People']);
});

it('browse section for secretary omits Calendar', () => {
  const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
  const browse = config.groups.find(g => g.title === 'Browse');
  const titles = browse?.items.map(i => i.title) ?? [];
  expect(titles).not.toContain('Calendar');
});
```

- [ ] **Step 4: Update the My Shows / As Exhibitor section tests**

Replace:

```typescript
it('my shows section omits Entry History', () => {
  const config = buildUnifiedSidebarConfig([UserRole.SECRETARY, UserRole.EXHIBITOR]);
  const myShows = config.groups.find(g => g.title === 'My Shows');
  const titles = myShows?.items.map(i => i.title) ?? [];
  expect(titles).not.toContain('Entry History');
});
```

With:

```typescript
it('as exhibitor section has exactly one item — My Shows — for secretary+exhibitor', () => {
  const config = buildUnifiedSidebarConfig([UserRole.SECRETARY, UserRole.EXHIBITOR]);
  const group = config.groups.find(g => g.title === 'As Exhibitor');
  expect(group).toBeDefined();
  expect(group?.items.map(i => i.title)).toEqual(['My Shows']);
});

it('as exhibitor My Shows href is /exhibitor/entries', () => {
  const config = buildUnifiedSidebarConfig([UserRole.SECRETARY, UserRole.EXHIBITOR]);
  const group = config.groups.find(g => g.title === 'As Exhibitor');
  const item = group?.items.find(i => i.title === 'My Shows');
  expect(item?.href).toBe('/exhibitor/entries');
});

it('no section is titled My Shows for secretary+exhibitor', () => {
  const config = buildUnifiedSidebarConfig([UserRole.SECRETARY, UserRole.EXHIBITOR]);
  const oldSection = config.groups.find(g => g.title === 'My Shows');
  expect(oldSection).toBeUndefined();
});
```

- [ ] **Step 5: Update exhibitor-only sidebar tests**

Replace:

```typescript
it('exhibitor-only sidebar omits Clubs, Calendar, Messages', () => {
  const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
  const allTitles = config.groups.flatMap(g => g.items.map(i => i.title));
  for (const hidden of ['Clubs', 'Calendar', 'Messages']) {
    expect(allTitles, `"${hidden}" should be absent`).not.toContain(hidden);
  }
});

it('exhibitor-only sidebar includes Profile', () => {
  const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
  const allTitles = config.groups.flatMap(g => g.items.map(i => i.title));
  expect(allTitles).toContain('Profile');
});

it('exhibitor-only Profile href is /profile', () => {
  const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
  const item = config.groups.flatMap(g => g.items).find(i => i.title === 'Profile');
  expect(item?.href).toBe('/profile');
});
```

With:

```typescript
it('exhibitor-only sidebar has exactly My Shows, Show Day, Find Shows', () => {
  const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
  const allTitles = config.groups.flatMap(g => g.items.map(i => i.title));
  expect(allTitles).toEqual(['My Shows', 'Show Day', 'Find Shows']);
});

it('exhibitor-only My Shows href is /exhibitor/entries', () => {
  const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
  const item = config.groups.flatMap(g => g.items).find(i => i.title === 'My Shows');
  expect(item?.href).toBe('/exhibitor/entries');
});

it('exhibitor-only sidebar omits Profile, Settings, My Dogs, My Entries, Home', () => {
  const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
  const allTitles = config.groups.flatMap(g => g.items.map(i => i.title));
  for (const absent of ['Profile', 'Settings', 'My Dogs', 'My Entries', 'Home']) {
    expect(allTitles, `"${absent}" should be absent`).not.toContain(absent);
  }
});
```

- [ ] **Step 6: Run tests — expect failures (config not updated yet)**

```bash
cd apps/myk9show && npx vitest run src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts
```

Expected: multiple failures — this confirms the tests are driving the config changes.

- [ ] **Step 7: Commit the test updates**

```bash
git add apps/myk9show/src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts
git commit -m "test(nav): update sidebar config tests for nav redesign"
```

---

## Task 2: Update `unifiedSidebarConfig.ts`

**Files:**

- Modify: `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts`

- [ ] **Step 1: Verify the Create Show button exists on the Dashboard page**

```bash
grep -n "Create Show\|create-show" apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx
```

Expected: a result around line 224 (`<Link to="/secretary/create-show">`). If no result, add a "Create Show" button to `PipelineDashboard.tsx` before proceeding. The nav item is being removed on the assumption this button already exists.

- [ ] **Step 2: Update imports — add Building2 for Clubs if not present, remove unused icons**

At the top of `unifiedSidebarConfig.ts`, verify `Building2` is imported (it already is). Remove `Scale` and `KanbanSquare` from the import if they become unused after the changes (check after editing). `LayoutDashboard` is already imported.

- [ ] **Step 2: Replace the Manage section items array**

Find this block (starting around line 154):

```typescript
if (hasAnyRole(userRoles, [UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN])) {
  groups.push({
    title: 'Manage',
    items: [
```

Replace the entire `items` array with:

```typescript
items: [
  {
    title: 'Dashboard',
    href: '/secretary/dashboard',
    icon: LayoutDashboard,
    description: 'Show management dashboard',
  },
  {
    title: 'Entries',
    href: '/secretary/entries',
    icon: FileText,
    description: 'Manage show entries',
  },
  {
    title: 'Tasks',
    href: '/secretary/tasks',
    icon: ListChecks,
    description: 'Pre-show preparation tasks',
  },
  {
    title: 'Schedule',
    href: '/secretary/run-order',
    icon: List,
    description: 'Class and ring scheduling',
  },
  {
    title: 'Day of Show',
    href: '/secretary/day-of',
    icon: ClipboardCheck,
    description: 'Walk-ins, scratches, move-ups',
  },
  {
    title: 'Reports',
    href: '/secretary/reports',
    icon: FileBarChart,
    description: 'Generate and print reports',
  },
  {
    title: 'Results Control',
    href: '/secretary/results-control',
    icon: ListChecks,
    description: 'Verify results and release to exhibitors',
  },
  {
    title: 'Submit Results',
    href: '/secretary/results-submission',
    icon: Send,
    description: 'Submit results to sanctioning organizations',
  },
],
```

Note: `ListChecks` is used for both Tasks and Results Control — that's fine, they're different sections. If you want to distinguish them, use `KanbanSquare` for Tasks and `ListChecks` for Results Control.

- [ ] **Step 3: Replace the Browse section**

Find the Browse section block (around line 250):

```typescript
const browseItems: NavItem[] = [
  { title: 'Shows', href: '/shows', icon: Calendar, description: 'Find and explore shows' },
  { title: 'Dogs', href: '/dogs', icon: Heart, description: 'Browse dogs' },
];
// People is secretary + admin only
if (hasAnyRole(userRoles, [UserRole.SECRETARY, UserRole.SITE_ADMIN])) {
  browseItems.push({
    title: 'People',
    href: '/people',
    icon: Users,
    description: 'Browse people',
  });
}
```

Replace with:

```typescript
const browseItems: NavItem[] = [
  { title: 'Shows', href: '/shows', icon: Calendar, description: 'Find and explore shows' },
  { title: 'Dogs', href: '/dogs', icon: Heart, description: 'Browse dogs' },
];
// Clubs and People are secretary + admin only
if (hasAnyRole(userRoles, [UserRole.SECRETARY, UserRole.SITE_ADMIN])) {
  browseItems.push(
    {
      title: 'Clubs',
      href: '/clubs',
      icon: Building2,
      description: 'Browse clubs',
    },
    {
      title: 'People',
      href: '/people',
      icon: Users,
      description: 'Browse people',
    }
  );
}
```

- [ ] **Step 4: Replace the My Shows section (secretary + exhibitor)**

Find the section starting with `// 3. My Shows section`:

```typescript
if (hasAnyRole(userRoles, [UserRole.EXHIBITOR])) {
  groups.push({
    title: 'My Shows',
    items: [
      {
        title: 'Dashboard',
        href: '/exhibitor/dashboard',
        ...
      },
      {
        title: 'My Account',
        href: '/exhibitor/account',
        ...
      },
      {
        title: 'Current Entries',
        href: '/exhibitor/entries',
        ...
      },
    ],
  });
}
```

Replace with:

```typescript
if (hasAnyRole(userRoles, [UserRole.EXHIBITOR])) {
  groups.push({
    title: 'As Exhibitor',
    items: [
      {
        title: 'My Shows',
        href: '/exhibitor/entries',
        icon: FileText,
        description: 'Your entries, dogs, and upcoming shows',
      },
    ],
  });
}
```

- [ ] **Step 5: Replace the exhibitor-only sidebar groups**

Find the `if (isExhibitorOnly)` block and replace the entire `groups.push(...)` chain with:

```typescript
if (isExhibitorOnly) {
  groups.push({
    title: '',
    items: [
      {
        title: 'My Shows',
        href: '/exhibitor/entries',
        icon: FileText,
        description: 'Your entries, dogs, and upcoming shows',
      },
      {
        title: 'Show Day',
        href: '/exhibitor/show-day',
        icon: Activity,
        description: 'Check-in, run order, results',
      },
      {
        title: 'Find Shows',
        href: '/shows',
        icon: Search,
        description: 'Browse and enter shows',
      },
    ],
  });
}
```

- [ ] **Step 6: Remove unused imports**

After all edits, check which icons are no longer referenced: `KanbanSquare`, `MessageSquare`, `Plus`, `Crown`, `Scale`, `Compass`, `Settings`, `User`. Remove any that are no longer used to keep the import clean. Run TypeScript check to confirm:

```bash
cd apps/myk9show && pnpm typecheck 2>&1 | grep unifiedSidebarConfig
```

Expected: no errors for this file.

- [ ] **Step 7: Run the sidebar config tests**

```bash
cd apps/myk9show && npx vitest run src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts
git commit -m "feat(nav): simplify sidebar — secretary lifecycle order, exhibitor consolidation"
```

---

## Task 3: Update `roleUtils.ts`

**Files:**

- Modify: `apps/myk9show/src/hooks/roleUtils.ts`

- [ ] **Step 1: Update the exhibitor and judge dashboard routes**

In `ROLE_DASHBOARD_ROUTES`, change:

```typescript
[UserRole.JUDGE]: '/exhibitor/dashboard',
[UserRole.EXHIBITOR]: '/exhibitor/dashboard',
```

To:

```typescript
// INTENT: JUDGE has no dedicated dashboard. Route to /exhibitor/entries
// (the consolidated My Shows page) until a judge-specific landing page is built.
[UserRole.JUDGE]: '/exhibitor/entries',
[UserRole.EXHIBITOR]: '/exhibitor/entries',
```

Also update the fallback at the bottom of `getDashboardRoute`:

```typescript
return ROLE_DASHBOARD_ROUTES[highest] ?? '/exhibitor/entries';
```

- [ ] **Step 2: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck 2>&1 | grep roleUtils
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/hooks/roleUtils.ts
git commit -m "fix(auth): update exhibitor post-login redirect to /exhibitor/entries"
```

---

## Task 4: Build `DogStripCard` component

**Files:**

- Create: `apps/myk9show/src/components/exhibitor/DogStripCard.tsx`

This component renders one compact dog card in the My Shows page header strip. It receives the dog's data and upcoming entry count as props, and fetches title abbreviations internally via `useTitleProgress`.

- [ ] **Step 1: Create the component**

```tsx
/**
 * DogStripCard — compact dog card for the My Shows page dog strip.
 *
 * Shows dog name, breed, upcoming show count (green) or "Not entered" (amber),
 * and earned title abbreviations. Clicking navigates to the dog's detail page.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTitleProgress } from '@/hooks/useTitleProgress';

interface DogStripCardProps {
  dogId: string;
  dogName: string;
  breed: string;
  upcomingCount: number;
}

export const DogStripCard: React.FC<DogStripCardProps> = ({
  dogId,
  dogName,
  breed,
  upcomingCount,
}) => {
  const navigate = useNavigate();
  const { earnedAbbreviations, isLoading: titlesLoading } = useTitleProgress(dogId);

  return (
    <button
      type="button"
      onClick={() => navigate(`/dogs/${dogId}`)}
      className="flex-shrink-0 w-40 rounded-xl border border-border bg-card p-3 text-left hover:bg-accent/50 hover:shadow-sm active:scale-[0.98] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <p className="font-semibold text-sm text-foreground truncate">{dogName}</p>
      <p className="text-xs text-muted-foreground truncate mb-2">{breed}</p>
      <div className="flex flex-wrap gap-1">
        {upcomingCount > 0 ? (
          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
            {upcomingCount} upcoming
          </span>
        ) : (
          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
            Not entered
          </span>
        )}
        {!titlesLoading && earnedAbbreviations.length > 0 && (
          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {earnedAbbreviations.slice(0, 3).join(', ')}
            {earnedAbbreviations.length > 3 && ' …'}
          </span>
        )}
      </div>
    </button>
  );
};

export default DogStripCard;
```

- [ ] **Step 2: Write unit tests for `DogStripCard`** [ADDED]

Create `apps/myk9show/src/components/exhibitor/__tests__/DogStripCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils/testUtils';
import { DogStripCard } from '../DogStripCard';

vi.mock('@/hooks/useTitleProgress', () => ({
  useTitleProgress: () => ({ earnedAbbreviations: ['SWN', 'SWA'], isLoading: false }),
}));

describe('DogStripCard', () => {
  it('shows dog name and breed', () => {
    renderWithProviders(
      <DogStripCard dogId="d1" dogName="Rosie" breed="German Shepherd" upcomingCount={2} />
    );
    expect(screen.getByText('Rosie')).toBeInTheDocument();
    expect(screen.getByText('German Shepherd')).toBeInTheDocument();
  });

  it('shows green upcoming badge when upcomingCount > 0', () => {
    renderWithProviders(<DogStripCard dogId="d1" dogName="Rosie" breed="GSD" upcomingCount={2} />);
    expect(screen.getByText('2 upcoming')).toBeInTheDocument();
  });

  it('shows amber Not entered badge when upcomingCount is 0', () => {
    renderWithProviders(<DogStripCard dogId="d1" dogName="Max" breed="BC" upcomingCount={0} />);
    expect(screen.getByText('Not entered')).toBeInTheDocument();
  });

  it('shows title abbreviations when earned', () => {
    renderWithProviders(<DogStripCard dogId="d1" dogName="Rosie" breed="GSD" upcomingCount={1} />);
    expect(screen.getByText('SWN, SWA')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
cd apps/myk9show && npx vitest run src/components/exhibitor/__tests__/DogStripCard.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: Verify the file compiles**

```bash
cd apps/myk9show && pnpm typecheck 2>&1 | grep DogStripCard
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/exhibitor/DogStripCard.tsx apps/myk9show/src/components/exhibitor/__tests__/DogStripCard.test.tsx
git commit -m "feat(exhibitor): add DogStripCard component with tests"
```

---

## Task 5: Build `DogStrip` component

**Files:**

- Create: `apps/myk9show/src/components/exhibitor/DogStrip.tsx`

Renders the horizontal scrolling row of `DogStripCard`s plus an "Add Dog" card. Fetches its own entries via `useEntriesQuery` rather than accepting them as props — this avoids type mismatches with `MyEntry[]` in the parent. React Query deduplicates the fetch so there is no extra network call.

- [ ] **Step 1: Create the component**

```tsx
/**
 * DogStrip — horizontal scrolling row of dog cards for the My Shows page.
 *
 * Fetches entries directly so it doesn't need to share types with the parent.
 * React Query deduplicates the fetch — no extra network call.
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PawPrint } from 'lucide-react';
import { useEntriesQuery } from '@/hooks/queries/useEntriesDatabase';
import { DogStripCard } from './DogStripCard';

interface Dog {
  id: string;
  call_name?: string;
  name?: string;
  breed?: string;
}

interface DogStripProps {
  dogs: Dog[];
}

export const DogStrip: React.FC<DogStripProps> = ({ dogs }) => {
  const navigate = useNavigate();
  const { data: rawEntries = [] } = useEntriesQuery();
  const now = new Date();

  const upcomingCountByDog = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of rawEntries as Array<{ dog_id: string; show?: { start_date?: string } }>) {
      const showDate = entry.show?.start_date ? new Date(entry.show.start_date) : null;
      if (showDate && showDate > now) {
        counts[entry.dog_id] = (counts[entry.dog_id] ?? 0) + 1;
      }
    }
    return counts;
  }, [rawEntries, now]);

  if (dogs.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
        My Dogs
      </p>
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {dogs.map(dog => (
          <DogStripCard
            key={dog.id}
            dogId={dog.id}
            dogName={dog.call_name ?? dog.name ?? 'Unknown'}
            breed={dog.breed ?? ''}
            upcomingCount={upcomingCountByDog[dog.id] ?? 0}
          />
        ))}
        <button
          type="button"
          onClick={() => navigate('/dogs/new')}
          className="flex-shrink-0 w-40 rounded-xl border border-dashed border-border p-3 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-accent/30 active:scale-[0.98] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <PawPrint className="h-5 w-5" />
          <span className="text-xs">Add Dog</span>
        </button>
      </div>
    </div>
  );
};

export default DogStrip;
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd apps/myk9show && pnpm typecheck 2>&1 | grep DogStrip
```

Expected: no errors.

- [ ] **Step 2: Verify `/dogs/new` route exists** [ADDED]

```bash
grep -rn '"/dogs/new"\|path.*dogs.*new' apps/myk9show/src/routes/
```

If no result: the Add Dog button in `DogStrip` will 404. Either change the `navigate('/dogs/new')` call to `navigate('/dogs')` (browse dogs, where an add button likely exists), or verify the correct creation route from the routes files before proceeding.

- [ ] **Step 3: Write unit tests for `DogStrip`** [ADDED]

Create `apps/myk9show/src/components/exhibitor/__tests__/DogStrip.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils/testUtils';
import { DogStrip } from '../DogStrip';

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesQuery: () => ({
    data: [
      { dog_id: 'd1', show: { start_date: new Date(Date.now() + 86400000).toISOString() } },
      { dog_id: 'd1', show: { start_date: new Date(Date.now() + 172800000).toISOString() } },
    ],
  }),
}));

vi.mock('@/hooks/useTitleProgress', () => ({
  useTitleProgress: () => ({ earnedAbbreviations: [], isLoading: false }),
}));

const dogs = [
  { id: 'd1', call_name: 'Rosie', breed: 'German Shepherd' },
  { id: 'd2', call_name: 'Max', breed: 'Border Collie' },
];

describe('DogStrip', () => {
  it('renders a card for each dog', () => {
    renderWithProviders(<DogStrip dogs={dogs} />);
    expect(screen.getByText('Rosie')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
  });

  it('shows upcoming count for dog with future entries', () => {
    renderWithProviders(<DogStrip dogs={dogs} />);
    expect(screen.getByText('2 upcoming')).toBeInTheDocument();
  });

  it('shows Not entered for dog with no future entries', () => {
    renderWithProviders(<DogStrip dogs={dogs} />);
    expect(screen.getByText('Not entered')).toBeInTheDocument();
  });

  it('renders nothing when dogs array is empty', () => {
    const { container } = renderWithProviders(<DogStrip dogs={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders Add Dog button', () => {
    renderWithProviders(<DogStrip dogs={dogs} />);
    expect(screen.getByText('Add Dog')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the tests**

```bash
cd apps/myk9show && npx vitest run src/components/exhibitor/__tests__/DogStrip.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Verify the file compiles**

```bash
cd apps/myk9show && pnpm typecheck 2>&1 | grep DogStrip
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/exhibitor/DogStrip.tsx apps/myk9show/src/components/exhibitor/__tests__/DogStrip.test.tsx
git commit -m "feat(exhibitor): add DogStrip component with tests"
```

---

## Task 6: Enhance `MyEntriesPage` to become the consolidated My Shows hub

**Files:**

- Modify: `apps/myk9show/src/pages/MyEntriesPage/index.tsx`

Add: greeting header, show day alert, stats row (from `CompactStatsRow`), and `DogStrip`. Wire up `useDogsByOwnerQuery` and `useShowDayData`. The existing entry tabs and list are unchanged.

- [ ] **Step 1: Add new imports at the top of `MyEntriesPage/index.tsx`**

Add to the existing imports:

```typescript
import { useNavigate, Link } from 'react-router-dom';
import { Calendar as CalendarIcon, Activity, ChevronRight } from 'lucide-react';
import { useDogsByOwnerQuery } from '@/hooks/queries/useDogsDatabase';
import { useShowDayData } from '@/hooks/queries/useShowDayData';
import { useEntryStatisticsQuery } from '@/hooks/queries/useEntriesDatabase';
import { CompactStatsRow } from '@/components/exhibitor/CompactStatsRow';
import { DogStrip } from '@/components/exhibitor/DogStrip';
import { useAuthContext } from '@/hooks/useAuthContext';
```

Note: `Link` is already imported. Add only what is missing. Check existing imports before adding to avoid duplicates.

- [ ] **Step 2: Add data hooks inside `MyEntriesPage` component**

After the existing `useMyEntriesData()` and `useMyEntriesFilters()` calls, add:

```typescript
const navigate = useNavigate();
const { userWithRoles } = useAuthContext();
const ownerId = userWithRoles?.databaseUserId ?? '';

const { data: dogs = [] } = useDogsByOwnerQuery(ownerId, !!ownerId);
const { data: stats } = useEntryStatisticsQuery();
const showDayData = useShowDayData();
```

- [ ] **Step 3: Add a `getGreeting` helper at module level (above the component)**

```typescript
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
```

- [ ] **Step 4: Add statistics derived value inside the component**

After the hook calls from Step 2, add:

```typescript
const statistics = useMemo(
  () => ({
    activeEntries: entries.filter((e: MyEntry) => e.status === 'confirmed').length,
    totalFees: stats?.totalRevenue ?? 0,
    upcomingShows: entries.filter((e: MyEntry) => {
      const d = (e as unknown as { showDate?: Date }).showDate;
      return d && d > new Date();
    }).length,
    totalDogs: dogs.length,
  }),
  [entries, stats, dogs]
);
```

- [ ] **Step 5: Insert the greeting header, show day alert, stats row, and dog strip into the JSX**

In the return statement, find the outermost `<div className="space-y-8">` (after the container divs). Insert the following **before** the existing breadcrumb/actions row:

```tsx
{
  /* Greeting header */
}
<div className="rounded-2xl bg-gradient-to-br from-primary/8 via-primary/4 to-transparent border border-primary/10 p-5 sm:p-6">
  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
    <div>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
        {getGreeting()}
      </h1>
      <p className="text-muted-foreground text-sm sm:text-base mt-1">
        Here&apos;s what&apos;s happening with your shows
      </p>
    </div>
    <Button onClick={() => navigate('/shows')} size="sm">
      <CalendarIcon className="h-4 w-4 mr-2" />
      Enter a Show
    </Button>
  </div>
</div>;

{
  /* Show Day alert — only when exhibitor has a show today */
}
{
  showDayData.isShowDay && (
    <Link
      to="/exhibitor/show-day"
      className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 p-4 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-300"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 flex-shrink-0">
        <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground">You have a show today!</p>
        <p className="text-sm text-muted-foreground">
          Check in, view run order, and see live results
        </p>
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
    </Link>
  );
}

{
  /* Stats */
}
<CompactStatsRow
  activeEntries={statistics.activeEntries}
  upcomingShows={statistics.upcomingShows}
  totalDogs={statistics.totalDogs}
  onNavigate={navigate}
/>;

{
  /* Dog strip */
}
<DogStrip dogs={dogs as unknown as Parameters<typeof DogStrip>[0]['dogs']} />;
```

- [ ] **Step 6: Remove the existing `<h1 className="sr-only">My Entries</h1>` line**

The greeting header now serves as the page title visually. The sr-only h1 is no longer needed.

- [ ] **Step 7: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck 2>&1 | grep MyEntriesPage
```

Expected: no errors.

- [ ] **Step 8: Smoke-test in the browser**

```bash
pnpm dev:show
```

Navigate to `http://localhost:5173/exhibitor/entries` while logged in as an exhibitor. Verify:

- Greeting header appears with correct time-of-day salutation
- Dog strip shows your dogs with upcoming counts
- Entry tabs and list are intact
- Show Day alert only appears if you have a show today (likely won't show in dev)

- [ ] **Step 9: Commit**

```bash
git add apps/myk9show/src/pages/MyEntriesPage/index.tsx
git commit -m "feat(exhibitor): enhance MyEntriesPage into consolidated My Shows hub"
```

---

## Task 7: Route cleanup and ExhibitorDashboard deletion

**Files:**

- Modify: `apps/myk9show/src/routes/publicRoutes.tsx`
- Delete: `apps/myk9show/src/pages/ExhibitorDashboard.tsx`

- [ ] **Step 1: Replace duplicate profile routes with redirects** [EXPANDED]

Instead of deleting these routes outright (which 404s any bookmarked URL), replace them with `Navigate` redirects to `/profile`:

```tsx
<Route path="/exhibitor/profile" element={<Navigate to="/profile" replace />} />
<Route path="/exhibitor/account" element={<Navigate to="/profile" replace />} />
```

Find and replace these two route blocks:

```tsx
<Route
  path="/exhibitor/profile"
  element={
    <ProtectedRoute>
      <SuspenseWrapper>
        <ProfilePage />
      </SuspenseWrapper>
    </ProtectedRoute>
  }
/>
<Route
  path="/exhibitor/account"
  element={
    <ProtectedRoute>
      <SuspenseWrapper>
        <ProfilePage />
      </SuspenseWrapper>
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 2: Replace `/exhibitor/dashboard` route with a redirect**

Find:

```tsx
<Route
  path="/exhibitor/dashboard"
  element={
    <ProtectedRoute>
      <SuspenseWrapper>
        <PageTransition>
          <ExhibitorDashboard />
        </PageTransition>
      </SuspenseWrapper>
    </ProtectedRoute>
  }
/>
```

Replace with:

```tsx
<Route path="/exhibitor/dashboard" element={<Navigate to="/exhibitor/entries" replace />} />
```

Add `Navigate` to the `react-router-dom` import if not already present:

```typescript
import { Routes, Route, Navigate } from 'react-router-dom';
```

- [ ] **Step 3: Remove the `ExhibitorDashboard` lazy import**

Delete:

```typescript
const ExhibitorDashboard = lazy(() => import('@/pages/ExhibitorDashboard'));
```

- [ ] **Step 4: Run typecheck to confirm no remaining references**

```bash
cd apps/myk9show && pnpm typecheck 2>&1 | grep -i "exhibitordashboard\|exhibitor/dashboard\|exhibitor/account\|exhibitor/profile"
```

Expected: no errors.

- [ ] **Step 5: Delete `ExhibitorDashboard.tsx`**

```bash
rm apps/myk9show/src/pages/ExhibitorDashboard.tsx
```

- [ ] **Step 6: Verify no remaining imports of ExhibitorDashboard**

```bash
grep -r "ExhibitorDashboard" apps/myk9show/src/ --include="*.ts" --include="*.tsx"
```

Expected: no output.

- [ ] **Step 7: Run the full test suite**

```bash
cd apps/myk9show && pnpm test
```

Expected: all tests pass. If any test imports `ExhibitorDashboard` directly, delete or update that test.

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/routes/publicRoutes.tsx
git rm apps/myk9show/src/pages/ExhibitorDashboard.tsx
git commit -m "feat(nav): delete ExhibitorDashboard, remove duplicate profile routes, redirect /exhibitor/dashboard"
```

---

## Task 8: End-to-end smoke test

- [ ] **Step 1: Start the dev server**

```bash
pnpm dev:show
```

- [ ] **Step 2: Test secretary nav (log in as a secretary)**

Navigate to `http://localhost:5173`. Verify the Manage section shows exactly:
Dashboard, Entries, Tasks, Schedule, Day of Show, Reports, Results Control, Submit Results — in that order.

Verify Browse shows: Shows, Dogs, Clubs, People.

Verify Create Show is **not** in the nav. Confirm it still exists as a button on the Dashboard page (`/secretary/dashboard`).

- [ ] **Step 3: Test secretary + exhibitor nav**

Log in as a user with both SECRETARY and EXHIBITOR roles. Verify the "As Exhibitor" section appears with one item: "My Shows" → `/exhibitor/entries`.

- [ ] **Step 4: Test pure exhibitor nav**

Log in as an exhibitor-only user. Verify exactly three items: My Shows, Show Day, Find Shows. Verify Profile and Settings are **not** in the sidebar.

- [ ] **Step 5: Test My Shows page**

Navigate to `/exhibitor/entries`. Verify:

- Greeting header ("Good morning/afternoon/evening")
- Dog strip with per-dog upcoming counts
- Entry tabs (All, Upcoming, Accepted, Waitlist, Pending, Completed)
- Entry list loads normally

- [ ] **Step 6: Test old routes redirect** [EXPANDED]

Navigate to `http://localhost:5173/exhibitor/dashboard` — should redirect to `/exhibitor/entries`.
Navigate to `http://localhost:5173/exhibitor/account` — should redirect to `/profile`.
Navigate to `http://localhost:5173/exhibitor/profile` — should redirect to `/profile`.

- [ ] **Step 7: Run full test suite one final time**

```bash
cd apps/myk9show && pnpm test
```

Expected: all tests pass.

- [ ] **Step 8: Final commit if any loose changes remain**

```bash
git status
# commit anything uncommitted
```
