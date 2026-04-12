# Phase 1 — Quiet the Noise Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove everything parked/hidden from navigation, execute the "X should be a tab of Y" consolidation decisions, and establish one canonical "add a dog" implementation — so the visible app reflects only the fall 2026 golden paths.

**Architecture:** Three ordered passes: (1) sidebar nav pruning — remove parked items, verify dev/demo and scoring routes absent from router; (2) page consolidation — tab merges + redirects for Wait List, Check-In, and Permission Audit; Class Details consolidation is deferred to Phase 2 (no sidebar nav item exists to remove in Phase 1); (3) canonical-path audit — one AddDog implementation, one redirected entry point per duplicate. Secretary Dashboard legacy files deleted after porting Clone Show and Quick Actions into PipelineDashboard.

**Tech Stack:** TypeScript, React, React Router v6 (Navigate/redirect), shadcn/ui Tabs, Vitest, pnpm

---

## Reference Documents

- Feature audit decisions: `docs/feature-audit-2026.md`
- Navigation / IA decisions: `docs/navigation-ia.md`
- North Star plan: `docs/plans/strategy/2026-04-11-north-star-fall-2026.md`

---

## Exit Criteria

- `pnpm typecheck && pnpm lint && pnpm build` clean from repo root
- No parked/hidden feature appears as a nav item in any role's sidebar
- People link absent from Browse section for judge-only users
- Dev/demo and `/scoring/*` routes confirmed absent from router
- Wait List, Check-In, and Permission Audit each reachable as a tab from their parent page
- Old standalone routes for Wait List, Check-In, and Permission Audit redirect to new tab URLs
- Tab consolidation unit tests pass for all three pages
- Clone Show and Quick Actions accessible from PipelineDashboard
- Completed Trials visibility in PipelineDashboard confirmed (or Phase 2 note filed)
- Legacy `SecretaryDashboard.tsx` and `SecretaryDashboard/` directory deleted
- Class Details consolidation note filed in TO-DOS.md for Phase 2
- 22 testing findings each tagged with a triage bucket in TO-DOS.md
- Results Control visible in the Manage sidebar group

---

## File Map

| File                                                                                                | Action | Tasks       |
| --------------------------------------------------------------------------------------------------- | ------ | ----------- |
| `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts`                               | Modify | 1–6         |
| `apps/myk9show/src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts`                | Create | 1, 6        |
| `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx`                              | Modify | 7–8         |
| `apps/myk9show/src/pages/SecretaryDashboard.tsx`                                                    | Delete | 9           |
| `apps/myk9show/src/pages/SecretaryDashboard/` (directory)                                           | Delete | 9           |
| `apps/myk9show/src/pages/secretary/EntryManagementPage.tsx`                                         | Modify | 10          |
| `apps/myk9show/src/pages/secretary/__tests__/EntryManagementPage.tabs.test.tsx`                     | Create | 10          |
| `apps/myk9show/src/pages/secretary/DayOfOperationsPage/index.tsx`                                   | Modify | 11          |
| `apps/myk9show/src/pages/secretary/DayOfOperationsPage/__tests__/DayOfOperationsPage.tabs.test.tsx` | Create | 11          |
| `apps/myk9show/src/pages/admin/permissions/PermissionManagementPage.tsx`                            | Modify | 12          |
| `apps/myk9show/src/pages/admin/permissions/__tests__/PermissionManagementPage.tabs.test.tsx`        | Create | 12          |
| `apps/myk9show/src/routes/secretaryRoutes.tsx`                                                      | Modify | 10, 11      |
| `apps/myk9show/src/routes/adminRoutes.tsx`                                                          | Modify | 12          |
| `TO-DOS.md`                                                                                         | Modify | 12b, 14, 15 |

---

## Pass 1 — Hide/Disable (Sidebar Nav Only)

> Routes are NOT removed. Pages remain accessible by direct URL. Only nav visibility changes.

### Task 1: Write failing sidebar tests

**Files:**

- Create: `apps/myk9show/src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { buildUnifiedSidebarConfig } from '../unifiedSidebarConfig';
import { UserRole } from '@/types/auth-types';

describe('buildUnifiedSidebarConfig — Phase 1 nav pruning', () => {
  // ── Admin ────────────────────────────────────────────────────────────────
  it('admin sidebar contains only Dashboard, Users, Roles & Permissions', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN]);
    const adminGroup = config.groups.find(g => g.title === 'Admin');
    const titles = adminGroup?.items.map(i => i.title) ?? [];
    expect(titles).toEqual(['Dashboard', 'Users', 'Roles & Permissions']);
  });

  it('admin sidebar omits all parked items', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN]);
    const adminGroup = config.groups.find(g => g.title === 'Admin');
    const titles = adminGroup?.items.map(i => i.title) ?? [];
    for (const parked of [
      'Alerts',
      'Performance',
      'Analytics',
      'Data Lifecycle',
      'Performance Mode',
      'Load Testing',
      'Sync',
      'Permission Audit',
      'Templates',
      'Onboarding',
    ]) {
      expect(titles, `"${parked}" should be absent`).not.toContain(parked);
    }
  });

  // ── Manage ───────────────────────────────────────────────────────────────
  it('manage sidebar includes Results Control', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const group = config.groups.find(g => g.title === 'Manage');
    const titles = group?.items.map(i => i.title) ?? [];
    expect(titles).toContain('Results Control');
  });

  it('manage sidebar Results Control href is /secretary/results-control', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const group = config.groups.find(g => g.title === 'Manage');
    const item = group?.items.find(i => i.title === 'Results Control');
    expect(item?.href).toBe('/secretary/results-control');
  });

  it('manage sidebar omits parked items', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const group = config.groups.find(g => g.title === 'Manage');
    const titles = group?.items.map(i => i.title) ?? [];
    for (const parked of ['Check-In', 'Volunteers', 'Settings', 'Wait List']) {
      expect(titles, `"${parked}" should be absent`).not.toContain(parked);
    }
  });

  // ── Judging ──────────────────────────────────────────────────────────────
  it('judging section is absent for JUDGE role', () => {
    const config = buildUnifiedSidebarConfig([UserRole.JUDGE]);
    const judging = config.groups.find(g => g.title === 'Judging');
    expect(judging).toBeUndefined();
  });

  it('judging section is absent even when JUDGE is combined with EXHIBITOR', () => {
    const config = buildUnifiedSidebarConfig([UserRole.JUDGE, UserRole.EXHIBITOR]);
    const judging = config.groups.find(g => g.title === 'Judging');
    expect(judging).toBeUndefined();
  });

  // ── Exhibitor-only ───────────────────────────────────────────────────────
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

  // ── Browse (multi-role) ───────────────────────────────────────────────────
  it('browse section for secretary omits Clubs and Calendar', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const browse = config.groups.find(g => g.title === 'Browse');
    const titles = browse?.items.map(i => i.title) ?? [];
    expect(titles).not.toContain('Clubs');
    expect(titles).not.toContain('Calendar');
  });

  // ── My Shows (multi-role exhibitor) ──────────────────────────────────────
  it('my shows section omits Entry History', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY, UserRole.EXHIBITOR]);
    const myShows = config.groups.find(g => g.title === 'My Shows');
    const titles = myShows?.items.map(i => i.title) ?? [];
    expect(titles).not.toContain('Entry History');
  });
});
```

- [ ] **Step 2: Run tests to confirm they all fail**

```bash
cd apps/myk9show && npx vitest run src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts
```

Expected: multiple FAIL — the sidebar still has parked items.

---

### Task 2: Admin sidebar — remove parked items

**Files:**

- Modify: `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts:147–220`

The Admin group currently has 13 items. Replace it with 3 items only.

- [ ] **Step 1: Replace the Admin group items**

In `unifiedSidebarConfig.ts`, replace the entire `groups.push({ title: 'Admin', items: [...] })` block (lines 148–220) with:

```typescript
if (hasAnyRole(userRoles, [UserRole.SITE_ADMIN])) {
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
    ],
  });
}
```

- [ ] **Step 2: Run the admin tests**

```bash
cd apps/myk9show && npx vitest run src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts -t "admin"
```

Expected: admin tests PASS.

---

### Task 3: Manage sidebar — remove parked items, add Results Control

**Files:**

- Modify: `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts:224–307`

Remove: Check-In, Volunteers, Settings, Wait List.
Add: Results Control (between Reports and Submit Results).
Need a new icon — `CheckSquare` is not currently imported; use `ClipboardCheck` or `ListChecks`.
`ListChecks` is not yet imported. Add it to the import block from `lucide-react`.

- [ ] **Step 1: Add `ListChecks` to the lucide-react import**

Find the lucide-react import block at the top of `unifiedSidebarConfig.ts` and add `ListChecks`:

```typescript
import {
  LayoutDashboard,
  Home,
  Activity,
  Calendar,
  CalendarDays,
  Heart,
  Users,
  Building2,
  Scale,
  BarChart3,
  ClipboardCheck,
  FileText,
  History,
  Plus,
  List,
  User,
  Crown,
  Shield,
  Bell,
  TrendingUp,
  Database,
  Zap,
  TestTube,
  RefreshCw,
  FileSearch,
  Compass,
  UserPlus,
  Settings,
  Search,
  KanbanSquare,
  UserCheck,
  MessageSquare,
  ClipboardList,
  FileBarChart,
  Send,
  ListChecks,
} from 'lucide-react';
```

- [ ] **Step 2: Replace the Manage group items block**

Replace the entire `groups.push({ title: 'Manage', items: [...] })` block (lines 224–307) with:

```typescript
if (hasAnyRole(userRoles, [UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN])) {
  groups.push({
    title: 'Manage',
    items: [
      {
        title: 'Pipeline',
        href: '/secretary/dashboard',
        icon: LayoutDashboard,
        description: 'Show management pipeline',
      },
      {
        title: 'Create Show',
        href: '/secretary/create-show',
        icon: Plus,
        description: 'Start a new show',
      },
      {
        title: 'Entries',
        href: '/secretary/entries',
        icon: FileText,
        description: 'Manage show entries',
      },
      {
        title: 'Day-of Ops',
        href: '/secretary/day-of',
        icon: ClipboardCheck,
        description: 'Walk-ins, scratches, move-ups',
      },
      {
        title: 'Tasks',
        href: '/secretary/tasks',
        icon: KanbanSquare,
        description: 'Kanban task board',
      },
      {
        title: 'Run Orders',
        href: '/secretary/run-order',
        icon: List,
        description: 'Class scheduling and ordering',
      },
      {
        title: 'Messages',
        href: '/secretary/messages',
        icon: MessageSquare,
        description: 'Chat with exhibitors and participants',
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
        description: 'Send results to AKC, UKC, and others',
      },
    ],
  });
}
```

- [ ] **Step 3: Run the manage tests**

```bash
cd apps/myk9show && npx vitest run src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts -t "manage"
```

Expected: manage tests PASS.

---

### Task 4: Remove the Judging sidebar section

**Files:**

- Modify: `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts:311–334`

Delete the entire Judging group push block. Judge routes are preserved in `judgeRoutes.tsx` — this is nav-only removal.

- [ ] **Step 1: Delete the Judging section**

Remove this entire block from `unifiedSidebarConfig.ts`:

```typescript
// 3. Judging section
if (hasAnyRole(userRoles, [UserRole.JUDGE])) {
  groups.push({
    title: 'Judging',
    items: [
      {
        title: 'Dashboard',
        href: '/judge/dashboard',
        icon: LayoutDashboard,
        description: "Today's assignments",
      },
      {
        title: 'My Stats',
        href: '/judge/stats',
        icon: BarChart3,
        description: 'Season performance',
      },
      {
        title: 'Check-In',
        href: '/judge/check-in',
        icon: ClipboardCheck,
        description: 'Class check-in management',
      },
    ],
  });
}
```

Also update the section-numbering comments below it:

- "4. My Shows section" → "3. My Shows section"
- "5. Browse section" → "4. Browse section"
- "6. My Club section" → "5. My Club section"

Also update the `isJudge` branch in the header/footer branding block. Find:

```typescript
const isJudge = hasAnyRole(userRoles, [UserRole.JUDGE]);
```

This variable is still used for the header icon — keep it. But update `dashboardHref` to not route judges to `/judge/dashboard`:

```typescript
const dashboardHref = isAdmin
  ? '/admin/dashboard'
  : isSecretary
    ? '/secretary/dashboard'
    : hasAnyRole(userRoles, [UserRole.EXHIBITOR])
      ? '/exhibitor/dashboard'
      : '/shows';
```

(Remove the `isJudge ? '/judge/dashboard' :` branch since the judging section is gone.)

- [ ] **Step 2: Run the judging tests**

```bash
cd apps/myk9show && npx vitest run src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts -t "judging"
```

Expected: judging tests PASS.

---

### Task 5: Exhibitor-only sidebar — remove Clubs/Calendar/Messages, add Profile

**Files:**

- Modify: `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts:84–143`

Current Group 3: Find Shows, Clubs, Calendar.  
Current Group 4: Settings, Messages.  
Target Group 3: Find Shows, Profile.  
Target Group 4: Settings.

- [ ] **Step 1: Replace Groups 3 and 4 of the exhibitor-only sidebar**

In `unifiedSidebarConfig.ts`, replace the two group pushes for exhibitor-only Groups 3 and 4 (lines ~114–142):

```typescript
groups.push({
  title: '',
  items: [
    {
      title: 'Find Shows',
      href: '/shows',
      icon: Search,
      description: 'Browse and enter shows',
    },
    {
      title: 'Profile',
      href: '/profile',
      icon: User,
      description: 'Your account and preferences',
    },
  ],
});
groups.push({
  title: '',
  items: [
    {
      title: 'Settings',
      href: '/preferences',
      icon: Settings,
      description: 'Profile and preferences',
    },
  ],
});
```

- [ ] **Step 2: Run the exhibitor-only tests**

```bash
cd apps/myk9show && npx vitest run src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts -t "exhibitor-only"
```

Expected: exhibitor-only tests PASS.

---

### Task 6: Browse section and My Shows section — remove remaining parked items

**Files:**

- Modify: `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts:377–414`

Browse section: remove Clubs and Calendar. Keep Shows and Dogs for everyone. **People: secretary + admin only** — judges would see a broken link because the route guard rejects them (`navigation-ia.md`: "hide from exhibitor nav"). `[EXPANDED]`  
My Shows section: remove Entry History.

- [ ] **Step 1: Replace the Browse section**

Replace the Browse section push (lines ~377–386):

```typescript
// 4. Browse section (always visible for non-exhibitor-only users)
const browseItems: NavGroup['items'] = [
  { title: 'Shows', href: '/shows', icon: Calendar, description: 'Find and explore shows' },
  { title: 'Dogs', href: '/dogs', icon: Heart, description: 'Browse dogs' },
];
// People is secretary + admin only (privacy restriction — navigation-ia.md)
if (hasAnyRole(userRoles, [UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN])) {
  browseItems.push({ title: 'People', href: '/people', icon: Users, description: 'Browse people' });
}
groups.push({ title: 'Browse', items: browseItems });
```

Also add two tests to the test file (insert after the existing "browse section" test):

```typescript
it('browse section hides People from judge-only role', () => {
  const config = buildUnifiedSidebarConfig([UserRole.JUDGE]);
  const browse = config.groups.find(g => g.title === 'Browse');
  const titles = browse?.items.map(i => i.title) ?? [];
  expect(titles).not.toContain('People');
});

it('browse section shows People to secretary', () => {
  const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
  const browse = config.groups.find(g => g.title === 'Browse');
  const titles = browse?.items.map(i => i.title) ?? [];
  expect(titles).toContain('People');
});
```

- [ ] **Step 2: Remove Entry History from My Shows section**

Find the My Shows section (lines ~337–374) and remove the Entry History item:

```typescript
// 3. My Shows section (exhibitor with other roles)
if (hasAnyRole(userRoles, [UserRole.EXHIBITOR])) {
  groups.push({
    title: 'My Shows',
    items: [
      {
        title: 'Dashboard',
        href: '/exhibitor/dashboard',
        icon: LayoutDashboard,
        description: 'Overview and quick actions',
      },
      {
        title: 'My Account',
        href: '/exhibitor/account',
        icon: User,
        description: 'Profile and preferences',
      },
      {
        title: 'Current Entries',
        href: '/exhibitor/entries',
        icon: FileText,
        description: 'Active show entries',
      },
    ],
  });
}
```

- [ ] **Step 3: Remove now-unused icon imports**

After all sidebar edits, remove any icons that are no longer referenced. Check which of these are unused: `Bell`, `TrendingUp`, `Database`, `Zap`, `TestTube`, `RefreshCw`, `FileSearch`, `UserPlus`, `History`, `UserCheck`, `ClipboardList`, `Scale`.

Run typecheck to find unused imports:

```bash
cd apps/myk9show && pnpm typecheck 2>&1 | grep "is declared but"
```

Remove each flagged unused import from the `lucide-react` import block.

- [ ] **Step 4: Run all sidebar tests**

```bash
cd apps/myk9show && npx vitest run src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts
```

Expected: all 14 tests PASS (12 original + 2 People-restriction tests added in Task 6 Step 1).

- [ ] **Step 5: Commit Pass 1**

```bash
git add apps/myk9show/src/components/layout/sidebar/
git commit -m "feat(phase1): prune sidebar nav — hide all parked items, add Results Control"
```

---

### Task 6b: Verify dev/demo and scoring routes absent from router `[ADDED]`

The feature audit marks `/offline-test`, `/sync-dashboard-demo`, `/scoring-demo`, and `/scoring/*` (JudgeScoringPage) as `delete/hide`. Exploration found these page files exist but appeared unregistered. Confirm and clean up.

**Files:**

- Search: `apps/myk9show/src/routes/` and `apps/myk9show/src/App.tsx`

- [ ] **Step 1: Search for demo and scoring routes in all route files**

```bash
grep -r "offline-test\|sync-dashboard-demo\|scoring-demo\|ScoringDemo\|SyncDashboardDemo\|OfflineTest" \
  apps/myk9show/src --include="*.tsx" --include="*.ts"
```

```bash
grep -r '"/scoring/' apps/myk9show/src/routes --include="*.tsx"
```

If any route definitions are found, remove those `<Route>` blocks and their associated lazy imports. If none are found, proceed — routes are already absent.

- [ ] **Step 2: If any scoring routes exist in any route file, remove them**

Example removal pattern — if you find something like:

```tsx
const ScoringDemoPage = lazy(() => import('@/pages/ScoringDemoPage'));
// ...
<Route path="/scoring-demo" element={<ScoringDemoPage />} />;
```

Delete the lazy import and the `<Route>` block.

- [ ] **Step 3: Typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

- [ ] **Step 4: Commit if changes were made**

```bash
git add apps/myk9show/src/routes/
git commit -m "chore(phase1): remove dev/demo routes from router"
```

If no routes were found, skip the commit and note "confirmed absent" in a comment.

---

## Pass 1b — Secretary Dashboard Migration

> Port the two missing features from the legacy `SecretaryDashboard` into `PipelineDashboard`, then delete the legacy files.

### Task 7: Port Clone Show button to PipelineDashboard

**Files:**

- Modify: `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx`

The legacy `SecretaryDashboard.tsx` has a working "Clone Show" button that opens `ShowCloneDialog`. `PipelineDashboard` does not. The `ShowCloneDialog` component already exists at `@/components/shows/cloning`.

- [ ] **Step 1: Add ShowCloneDialog import and state to PipelineDashboard**

At the top of `PipelineDashboard.tsx`, add:

```typescript
import { useState } from 'react'; // may already be imported — merge if so
import { Copy } from 'lucide-react'; // merge into existing lucide import
import { ShowCloneDialog } from '@/components/shows/cloning';
```

In the component body, after the existing `const [settingsOpen, setSettingsOpen] = useState(false);` line, add:

```typescript
const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
```

- [ ] **Step 2: Add the Clone Show button to the header**

In the JSX header section (`<div className="flex items-center justify-between">`), the right side currently has only the timing display. Add the Clone Show button between the heading and the timing:

```tsx
{
  /* Header */
}
<div className="flex items-center justify-between">
  <div className="flex items-center gap-2">
    <h1 className="text-2xl font-bold tracking-tight">Mission Control</h1>
    {selectedShow && (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={() => setSettingsOpen(true)}
        title="Show Settings"
      >
        <Settings className="h-4 w-4" />
      </Button>
    )}
  </div>
  <div className="flex items-center gap-2">
    <Button variant="outline" size="sm" onClick={() => setCloneDialogOpen(true)}>
      <Copy className="h-4 w-4 mr-2" />
      Clone Show
    </Button>
    <div className="text-right">
      {timing.text && (
        <div className="flex items-center gap-1.5 justify-end">
          {timing.isShowDay && <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />}
          <span
            className={
              timing.isShowDay
                ? 'text-sm text-green-400 font-medium'
                : 'text-sm text-muted-foreground'
            }
          >
            {timing.text}
          </span>
        </div>
      )}
      {!timing.isShowDay && hasLiveClasses && (
        <div className="flex items-center gap-1 justify-end mt-0.5">
          <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm text-green-400 font-medium">Live</span>
        </div>
      )}
    </div>
  </div>
</div>;
```

- [ ] **Step 3: Add ShowCloneDialog to the JSX output**

At the bottom of the returned JSX, just before the closing `</div>`, add:

```tsx
<ShowCloneDialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen} />
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: no new errors.

---

### Task 8: Port Quick Actions section to PipelineDashboard

The legacy `QuickActionsSection` has three action cards: Result Entry (→ `/secretary/results-control`), Export Reports (→ `/secretary/reports`), and Pending Actions. These are navigation shortcuts, not data-critical — port them as a compact row of link buttons at the bottom of `PipelineDashboard`, below the pipeline columns.

**Files:**

- Modify: `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx`

- [ ] **Step 1: Add Link import**

At the top of `PipelineDashboard.tsx`, confirm `Link` is already imported from `react-router-dom` (it is on line 9). If not, add it.

Also add to lucide imports: `FileText`, `Download`, `AlertCircle` (merge with existing lucide import block).

- [ ] **Step 2: Add quick-actions row before the ShowSettingsPanel in the JSX**

In the returned JSX, after the AnnouncementsCard and the pipeline columns DndContext, and before the `<ShowSettingsPanel ...>`, add:

```tsx
{
  /* Quick Actions */
}
<div className="flex items-center gap-3 flex-wrap">
  <Button variant="outline" size="sm" asChild>
    <Link to="/secretary/results-control">
      <FileText className="h-4 w-4 mr-2" />
      Results Control
    </Link>
  </Button>
  <Button variant="outline" size="sm" asChild>
    <Link to="/secretary/reports">
      <Download className="h-4 w-4 mr-2" />
      Reports
    </Link>
  </Button>
  <Button variant="outline" size="sm" asChild>
    <Link to="/secretary/entries">
      <AlertCircle className="h-4 w-4 mr-2" />
      Entries
    </Link>
  </Button>
</div>;
```

Note: These are navigation shortcuts, not data-driven counters. The legacy counters (pending entry count, completed trials count) are deferred to Phase 2 when walking the golden path will reveal whether they add enough value to justify data fetching.

- [ ] **Step 3: Typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: no new errors.

- [ ] **Step 4: Commit secretary dashboard migration**

```bash
git add apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx
git commit -m "feat(phase1): port Clone Show and Quick Actions into PipelineDashboard"
```

---

### Task 9: Delete legacy SecretaryDashboard files

The route at `/secretary/dashboard` already imports `PipelineDashboard` (see `secretaryRoutes.tsx:16`). The legacy `SecretaryDashboard.tsx` and its `SecretaryDashboard/` directory are dead code.

**Files:**

- Delete: `apps/myk9show/src/pages/SecretaryDashboard.tsx`
- Delete: `apps/myk9show/src/pages/SecretaryDashboard/` (entire directory — 8 files)

- [ ] **Step 1: Verify Completed Trials are visible in PipelineDashboard** `[ADDED]`

The legacy `TrialManagementTabs` surfaced completed trials in a "Completed" tab. Confirm PipelineDashboard shows completed shows before deleting the legacy file.

Start the dev server (`pnpm dev:show`) and log in as a secretary. Open Mission Control (`/secretary/dashboard`). Select a show that has completed trials (status = `closed` or `results_published`). Confirm:

- The completed trial/class appears in the pipeline (likely in the "Results Published" column).
- The secretary can see it without navigating away.

If completed shows are not visible in the current pipeline (e.g., pipeline filters them out by date), note this as a Phase 2 fix and proceed — do not block the deletion. Log a comment in the commit message if this is the case.

- [ ] **Step 2: Search for any remaining imports of the legacy file**

```bash
grep -r "SecretaryDashboard" apps/myk9show/src --include="*.tsx" --include="*.ts" -l
```

Expected: only `apps/myk9show/src/pages/SecretaryDashboard.tsx` and `apps/myk9show/src/pages/SecretaryDashboard/index.ts` reference themselves. If any OTHER file imports from `@/pages/SecretaryDashboard`, update that import before deleting.

- [ ] **Step 3: Delete the files**

```bash
rm apps/myk9show/src/pages/SecretaryDashboard.tsx
rm -rf "apps/myk9show/src/pages/SecretaryDashboard"
```

- [ ] **Step 3: Typecheck and build**

```bash
cd apps/myk9show && pnpm typecheck && pnpm build
```

Expected: clean — no broken imports.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(phase1): delete legacy SecretaryDashboard — superseded by PipelineDashboard"
```

---

## Pass 2 — Page Consolidation

### Task 10: Wait List → tab of Entries

**Decision (nav-ia.md):** "Tab of Entries `/secretary/entries`. Phase 2 interleaves accepting and waitlisting; single entry-management hub is cleaner."

**Implementation:** Add a top-level page-tabs bar to `EntryManagementPage` with "Entries" and "Waitlist" tabs. Waitlist tab renders `<WaitlistManagementPage />` inline. Add redirect from `/secretary/waitlist` → `/secretary/entries?tab=waitlist`.

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/EntryManagementPage.tsx`
- Modify: `apps/myk9show/src/routes/secretaryRoutes.tsx`

- [ ] **Step 1: Add tab-aware imports to EntryManagementPage**

At the top of `EntryManagementPage.tsx`, add to the existing React Router import:

```typescript
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
```

Add shadcn Tabs components to the existing UI imports:

```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
```

Add WaitlistManagementPage import (lazy import is fine here since it's already loaded by the route):

```typescript
import WaitlistManagementPage from './WaitlistManagementPage/index';
```

- [ ] **Step 2: Read the active tab from search params**

In the component body, after the existing `useParams` call, add:

```typescript
const [searchParams, setSearchParams] = useSearchParams();
const activePageTab = searchParams.get('tab') === 'waitlist' ? 'waitlist' : 'entries';

const handlePageTabChange = (value: string) => {
  if (value === 'waitlist') {
    setSearchParams({ tab: 'waitlist' });
  } else {
    setSearchParams({});
  }
};
```

- [ ] **Step 3: Wrap the page content in a Tabs component**

In the JSX, replace the outermost `<div className="container mx-auto p-6 space-y-6">` wrapper so the content is tab-conditional. Insert the tab bar just after the `</div>` that closes the Header block (after the Export CSV button group):

```tsx
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header — unchanged */}
      <div className="flex justify-between items-start">
        {/* ... existing header JSX unchanged ... */}
      </div>

      {/* Page-level tab bar */}
      <Tabs value={activePageTab} onValueChange={handlePageTabChange}>
        <TabsList>
          <TabsTrigger value="entries">Entries</TabsTrigger>
          <TabsTrigger value="waitlist">Waitlist</TabsTrigger>
        </TabsList>

        <TabsContent value="entries" className="space-y-6 mt-4">
          {/* Error Alert */}
          {error && ( ... )}
          {/* Show Selection */}
          <Card> ... </Card>
          {/* No Show Selected / Loading / Main Content */}
          {/* ... all existing content from here down, unchanged ... */}
        </TabsContent>

        <TabsContent value="waitlist" className="mt-4">
          <WaitlistManagementPage />
        </TabsContent>
      </Tabs>
    </div>
  );
```

Move every existing JSX element from below the header into the `TabsContent value="entries"` block. The `WaitlistManagementPage` renders inside the `TabsContent value="waitlist"` block.

- [ ] **Step 4: Add redirect from /secretary/waitlist in secretaryRoutes.tsx**

In `secretaryRoutes.tsx`, replace the existing `/secretary/waitlist` route:

```tsx
<Route
  path="/secretary/waitlist"
  element={
    <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
      <Navigate to="/secretary/entries?tab=waitlist" replace />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 5: Write and run a unit test for the tab behavior** `[ADDED]`

Create `apps/myk9show/src/pages/secretary/__tests__/EntryManagementPage.tabs.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EntryManagementPage from '../EntryManagementPage';

// Minimal mock — we only test tab switching, not full page data
vi.mock('@/hooks/useEntryManagementData', () => ({
  useEntryManagementData: () => ({
    user: null,
    hasRole: () => true,
    shows: [],
    selectedShowId: null,
    setSelectedShowId: vi.fn(),
    isLoadingShows: false,
    entries: [],
    setEntries: vi.fn(),
    isLoading: false,
    error: null,
    setError: vi.fn(),
    loadEntries: vi.fn(),
    stats: {},
    tabCounts: {},
  }),
}));
vi.mock('@/hooks/useEntryManagementFilters', () => ({
  useEntryManagementFilters: () => ({
    searchTerm: '',
    setSearchTerm: vi.fn(),
    statusFilter: 'all',
    setStatusFilter: vi.fn(),
    paymentFilter: 'all',
    setPaymentFilter: vi.fn(),
    selectedTab: 'all',
    setSelectedTab: vi.fn(),
    trialFilter: null,
    classFilter: null,
    viewMode: 'registration',
    setTrialFilter: vi.fn(),
    setClassFilter: vi.fn(),
    selectedEntries: [],
    setSelectedEntries: vi.fn(),
    handleSelectEntry: vi.fn(),
    handleSelectAll: vi.fn(),
    filteredEntries: [],
    clearFilters: vi.fn(),
  }),
}));
vi.mock('@/hooks/useEntryManagementActions', () => ({
  useEntryManagementActions: () => ({
    isProcessing: false,
    checkInDialog: { open: false },
    setCheckInDialog: vi.fn(),
    armbandDialog: { open: false },
    setArmbandDialog: vi.fn(),
    autoArmbandDialog: { open: false, startNumber: '1' },
    setAutoArmbandDialog: vi.fn(),
    bulkActionDialog: { open: false },
    setBulkActionDialog: vi.fn(),
    handleStatusChange: vi.fn(),
    handleAssignArmband: vi.fn(),
    handleAutoAssignArmbands: vi.fn(),
    handleBulkCheckIn: vi.fn(),
    handleCheckInStatusUpdate: vi.fn(),
    handleBulkAction: vi.fn(),
    handleExportCSV: vi.fn(),
    handleCompEntry: vi.fn(),
    handleUncompEntry: vi.fn(),
  }),
}));
vi.mock('@/hooks/queries/useShowTrials', () => ({
  useShowTrials: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/queries/useClassesDatabase', () => ({
  useClassesByTrialQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/queries/useTrialEntries', () => ({
  useTrialEntries: () => ({ data: [], isLoading: false }),
}));
vi.mock('../WaitlistManagementPage/index', () => ({ default: () => <div>Waitlist Content</div> }));

function renderWithUrl(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/secretary/entries" element={<EntryManagementPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EntryManagementPage tab consolidation', () => {
  it('shows Entries tab by default', () => {
    renderWithUrl('/secretary/entries');
    expect(screen.getByRole('tab', { name: 'Entries' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Waitlist' })).toBeInTheDocument();
  });

  it('shows Waitlist content when ?tab=waitlist', () => {
    renderWithUrl('/secretary/entries?tab=waitlist');
    expect(screen.getByText('Waitlist Content')).toBeInTheDocument();
  });
});
```

Run:

```bash
cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/EntryManagementPage.tabs.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/pages/secretary/EntryManagementPage.tsx \
        apps/myk9show/src/pages/secretary/__tests__/EntryManagementPage.tabs.test.tsx \
        apps/myk9show/src/routes/secretaryRoutes.tsx
git commit -m "feat(phase1): waitlist as tab of entries — consolidate nav"
```

---

### Task 11: Check-In → tab of Day-of Ops

**Decision (nav-ia.md):** "Tab of Day-of Ops `/secretary/day-of`. Phase 3 Step 2; check-in is a Day-of Ops operation."

`DayOfOperationsPage` already uses shadcn `Tabs` with three tabs (Day-of Entries, Move-Ups, Scratches). Add a fourth "Check-In" tab.

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/DayOfOperationsPage/index.tsx`
- Modify: `apps/myk9show/src/routes/secretaryRoutes.tsx`

- [ ] **Step 1: Import CheckInReportPage and URL params into DayOfOperationsPage**

At the top of `apps/myk9show/src/pages/secretary/DayOfOperationsPage/index.tsx`:

```typescript
import { useSearchParams } from 'react-router-dom';
import { UserCheck } from 'lucide-react'; // merge into existing lucide import
```

Add a lazy import of CheckInReportPage:

```typescript
import { lazy, Suspense } from 'react';
const CheckInReportPage = lazy(() => import('../CheckInReportPage'));
```

- [ ] **Step 2: Read active tab from URL params**

In the component body, after `useDayOfOperationsData()`:

```typescript
const [searchParams, setSearchParams] = useSearchParams();
const activeTab = searchParams.get('tab') ?? 'entries';

const handleTabChange = (value: string) => {
  if (value === 'entries') {
    setSearchParams({});
  } else {
    setSearchParams({ tab: value });
  }
};
```

- [ ] **Step 3: Update the Tabs component**

Replace `<Tabs defaultValue="entries" className="space-y-4">` with:

```tsx
<Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
  <TabsList>
    <TabsTrigger value="entries" className="flex items-center gap-2">
      <UserPlus className="h-4 w-4" />
      Day-of Entries
    </TabsTrigger>
    <TabsTrigger value="moveups" className="flex items-center gap-2">
      <ArrowUpCircle className="h-4 w-4" />
      Move-Ups
    </TabsTrigger>
    <TabsTrigger value="scratches" className="flex items-center gap-2">
      <XCircle className="h-4 w-4" />
      Scratches
    </TabsTrigger>
    <TabsTrigger value="check-in" className="flex items-center gap-2">
      <UserCheck className="h-4 w-4" />
      Check-In
    </TabsTrigger>
  </TabsList>

  {/* existing TabsContent for entries, moveups, scratches — unchanged */}

  <TabsContent value="check-in">
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">Loading…</div>}>
      <CheckInReportPage />
    </Suspense>
  </TabsContent>
</Tabs>
```

- [ ] **Step 4: Add redirect from /secretary/check-in in secretaryRoutes.tsx**

In `secretaryRoutes.tsx`, replace the existing `/secretary/check-in` route:

```tsx
<Route
  path="/secretary/check-in"
  element={
    <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
      <Navigate to="/secretary/day-of?tab=check-in" replace />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 5: Write and run a unit test for the Check-In tab** `[ADDED]`

Create `apps/myk9show/src/pages/secretary/DayOfOperationsPage/__tests__/DayOfOperationsPage.tabs.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DayOfOperationsPage from '../index';

vi.mock('../useDayOfOperationsData', () => ({
  useDayOfOperationsData: () => ({
    userId: 'u1',
    shows: [],
    selectedShowId: null,
    setSelectedShowId: vi.fn(),
    isLoading: false,
    classes: [],
    scratchableEntries: [],
    moveUpEntries: [],
    loadData: vi.fn(),
  }),
}));
vi.mock('@/services/database/queries/dayOfOperationsQueries', () => ({ scratchEntry: vi.fn() }));
vi.mock('../CheckInReportPage', () => ({ default: () => <div>Check-In Content</div> }));

function renderWithUrl(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/secretary/day-of" element={<DayOfOperationsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('DayOfOperationsPage tab consolidation', () => {
  it('renders all four tabs', () => {
    renderWithUrl('/secretary/day-of');
    expect(screen.getByRole('tab', { name: /day-of entries/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /check-in/i })).toBeInTheDocument();
  });

  it('shows Check-In content when ?tab=check-in', async () => {
    renderWithUrl('/secretary/day-of?tab=check-in');
    expect(await screen.findByText('Check-In Content')).toBeInTheDocument();
  });
});
```

Run:

```bash
cd apps/myk9show && npx vitest run src/pages/secretary/DayOfOperationsPage/__tests__/DayOfOperationsPage.tabs.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/pages/secretary/DayOfOperationsPage/ \
        apps/myk9show/src/routes/secretaryRoutes.tsx
git commit -m "feat(phase1): check-in as tab of day-of ops — consolidate nav"
```

---

### Task 12: Permission Audit → tab of Roles & Permissions

**Decision (nav-ia.md):** "Tab of Roles & Permissions `/admin/permissions`. Keeps admin nav to 3 items; audit is a subview of permissions."

**Files:**

- Modify: `apps/myk9show/src/pages/admin/permissions/PermissionManagementPage.tsx`
- Modify: `apps/myk9show/src/routes/adminRoutes.tsx`

- [ ] **Step 1: Add imports to PermissionManagementPage**

```typescript
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { lazy, Suspense } from 'react';
const PermissionAuditPage = lazy(() => import('./PermissionAuditPage'));
```

- [ ] **Step 2: Read active tab from URL**

In the component body, after the existing `useState` hooks:

```typescript
const [searchParams, setSearchParams] = useSearchParams();
const activeTab = searchParams.get('tab') === 'audit' ? 'audit' : 'overview';
```

- [ ] **Step 3: Wrap existing page content in Tabs**

Wrap the existing JSX `return (...)` content:

```tsx
return (
  <Tabs
    value={activeTab}
    onValueChange={value => setSearchParams(value === 'audit' ? { tab: 'audit' } : {})}
  >
    <TabsList className="mb-6">
      <TabsTrigger value="overview">Overview</TabsTrigger>
      <TabsTrigger value="audit">Permission Audit</TabsTrigger>
    </TabsList>

    <TabsContent value="overview">
      {/* existing full JSX of PermissionManagementPage here, unchanged */}
    </TabsContent>

    <TabsContent value="audit">
      <Suspense fallback={<div className="py-12 text-center text-muted-foreground">Loading…</div>}>
        <PermissionAuditPage />
      </Suspense>
    </TabsContent>
  </Tabs>
);
```

- [ ] **Step 4: Add redirect from /admin/permissions/audit in adminRoutes.tsx**

In `adminRoutes.tsx`, replace the existing `/admin/permissions/audit` route:

```tsx
<Route
  path="/admin/permissions/audit"
  element={adminGuard(<Navigate to="/admin/permissions?tab=audit" replace />)}
/>
```

Remove the `PermissionAuditPage` import from adminRoutes.tsx's `createEnhancedLazy` block — it's now lazy-loaded inside PermissionManagementPage.

- [ ] **Step 5: Write and run a unit test for the Audit tab** `[ADDED]`

Create `apps/myk9show/src/pages/admin/permissions/__tests__/PermissionManagementPage.tabs.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PermissionManagementPage from '../PermissionManagementPage';

vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({
    userRoles: [],
    userPermissions: [],
    effectivePermissions: [],
    isLoading: false,
  }),
}));
vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getAllRoles: () => Promise.resolve([]),
    getAllPermissions: () => Promise.resolve([]),
  },
}));
vi.mock('@/components/rbac/RBACMigrationStatus', () => ({ RBACMigrationStatus: () => null }));
vi.mock('../PermissionAuditPage', () => ({ default: () => <div>Audit Content</div> }));

function renderWithUrl(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/admin/permissions" element={<PermissionManagementPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PermissionManagementPage tab consolidation', () => {
  it('shows Overview and Permission Audit tabs', () => {
    renderWithUrl('/admin/permissions');
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Permission Audit' })).toBeInTheDocument();
  });

  it('shows Audit content when ?tab=audit', async () => {
    renderWithUrl('/admin/permissions?tab=audit');
    expect(await screen.findByText('Audit Content')).toBeInTheDocument();
  });
});
```

Run:

```bash
cd apps/myk9show && npx vitest run src/pages/admin/permissions/__tests__/PermissionManagementPage.tabs.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/pages/admin/permissions/ \
        apps/myk9show/src/routes/adminRoutes.tsx
git commit -m "feat(phase1): permission audit as tab of permissions page — consolidate nav"
```

---

### Task 12b: Class Details consolidation — explicitly deferred `[ADDED]`

**Decision (nav-ia.md):** "Class Details `/classes/:classId` → park → tab → Tab of Show Details `/shows/:id`."

**Phase 1 action: none required.** The `/classes/:classId` route has no sidebar nav item — it is never surfaced as a top-level nav entry in any role's sidebar. There is nothing to hide or redirect in Pass 1. The full tab integration (adding a "Classes" tab to `ShowDetailsPage` and handling the parent-show lookup) is a UI change that belongs in Phase 2 when walking the exhibitor golden path. Add a note to track this:

- [ ] **Step 1: Note in TO-DOS.md under Phase 2 — Exhibitor Golden Path Items**

Add to the Phase 2 section of `TO-DOS.md`:

```markdown
#### Class Details → tab of Show Details (nav-ia deferred from Phase 1)

`/classes/:classId` has no Phase 1 nav action (no sidebar item). Full integration deferred to Phase 2:
add a "Classes" tab to `ShowDetailsPage` that renders `ClassDetailsPage` inline when a classId is
present in the URL. Standalone `/classes/:classId` can then redirect to
`/shows/:showId?tab=classes&classId=:classId`. Requires a DB lookup to resolve showId from classId —
appropriate for Phase 2 golden-path work.
```

```bash
git add TO-DOS.md
git commit -m "docs(phase1): note Class Details consolidation deferred to Phase 2"
```

---

## Pass 3 — Canonical Path

### Task 13: Audit "add a dog" entry points

**Goal:** Find every place a user can initiate adding a dog, confirm they all route through the single canonical `AddDogPanel`, and remove or redirect any that do not.

**Files:**

- Search: `apps/myk9show/src/` — no file changes yet, audit only
- Modify: whichever files the audit identifies as duplicates

- [ ] **Step 1: Find all AddDog entry points**

```bash
grep -r "AddDog\|add-dog\|addDog\|AddDogButton\|AddDogPanel" \
  apps/myk9show/src --include="*.tsx" --include="*.ts" -l
```

Note every file returned.

- [ ] **Step 2: Find all dog creation dialogs / forms not using AddDogPanel**

```bash
grep -r "CreateDogDialog\|DogCreate\|create.*dog\|dog.*create" \
  apps/myk9show/src --include="*.tsx" --include="*.ts" -l
```

Note every file returned.

- [ ] **Step 3: For each AddDog entry point, verify it opens AddDogPanel**

Open each file from Steps 1–2 and confirm: does clicking the button/link render `AddDogPanel` from `@/components/panels/edit/AddDogPanel`?

If any entry point opens a **different** add-dog implementation:

- Replace it with `<AddDogButton />` from `@/components/dogs/common/AddDogButton.tsx`, or render `<AddDogPanel>` directly.
- Delete the non-canonical implementation.

- [ ] **Step 4: Verify RegistrationWorkflow uses AddDogPanel**

Check `apps/myk9show/src/components/shows/RegistrationWorkflow/CreateDogDialog.tsx` — does it use `AddDogPanel` internally, or does it have its own dog-creation form?

If it has its own form: replace its internals with `<AddDogPanel onSuccess={...} />`.

- [ ] **Step 5: Typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

- [ ] **Step 6: Commit if any changes were made**

```bash
git add -A
git commit -m "refactor(phase1): canonical add-dog entry point — all paths use AddDogPanel"
```

---

## Testing Triage

### Task 14: Triage the 22 testing findings from TO-DOS.md

**Goal:** Tag every finding with a bucket so Phase 2 can pick them up in golden-path order.

Buckets:

- **Phase 2** — on the secretary or exhibitor golden path; fix naturally while walking
- **Phase 1** — canonical/consolidation issue that Phase 1 work already addresses; close after Phase 1 done
- **Close** — sits on a feature Phase 0 audit marked park/delete; no longer relevant
- **Post-fall** — not on any golden path and not blocking fall launch; defer

- [ ] **Step 1: Open TO-DOS.md and work through the "Testing Findings" section**

For each of the 22 `#### ` items under `## Testing Findings from 2026-04-10 Session`, add a triage tag on the line after the heading, e.g.:

```markdown
#### Fix Add Dog Owner Selection for Admins — 2026-04-10 08:11

> **Triage:** Phase 2 — secretary golden path (add mail-in entry flow)
```

Apply these tags based on the following pre-assessment (verify each against the journey maps before committing):

| Finding                                   | Pre-assessment                           |
| ----------------------------------------- | ---------------------------------------- |
| Fix Add Dog Owner Selection for Admins    | Phase 2                                  |
| Login Redirects to Highest-Role Dashboard | Phase 2                                  |
| Site Admin Sees Empty Browse Shows Page   | Phase 2                                  |
| Prevent Duplicate Rows in Core Tables     | Post-fall                                |
| Smarter Officials/Judges Assignment       | Phase 2                                  |
| Venue Map Fails with City/State Only      | Phase 2                                  |
| Review & Implement Feature Inventory      | Close (superseded by Phase 0 audit)      |
| Audit Secretary Pipeline/Mission Control  | Phase 1 (addressed by nav consolidation) |
| Evaluate Removing Club Cover Image        | Close (park decision in audit)           |
| Configurable Exhibitor Convenience Fee    | Post-fall                                |
| CC Show Secretary on Exhibitor Emails     | Phase 2                                  |
| Review awesome-design-md                  | Post-fall                                |
| Research Claude Code Managed Agents       | Post-fall                                |

(Adjust these if walking the journeys reveals otherwise.)

- [ ] **Step 2: Commit the triage**

```bash
git add TO-DOS.md
git commit -m "docs(phase1): triage 22 testing findings against fall 2026 golden paths"
```

---

## Final Verification

### Task 15: Full clean build

- [ ] **Step 1: Run all checks from repo root**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

Expected: all three pass with no errors.

- [ ] **Step 2: Run the sidebar unit tests**

```bash
cd apps/myk9show && npx vitest run src/components/layout/sidebar/__tests__/
```

Expected: all tests PASS.

- [ ] **Step 3: Manual smoke test — start dev server and walk the nav**

```bash
pnpm dev:show
```

Open `http://localhost:5173`. Log in as each role (admin, secretary, exhibitor) and confirm:

- Admin sidebar: only Dashboard, Users, Roles & Permissions visible
- Manage sidebar: Results Control present; Check-In, Wait List, Volunteers, Settings absent
- Judging section: absent entirely
- Exhibitor-only sidebar: Profile present; Clubs, Calendar, Messages absent
- Navigate to `/secretary/waitlist` → redirects to `/secretary/entries?tab=waitlist` with Waitlist tab active
- Navigate to `/secretary/check-in` → redirects to `/secretary/day-of?tab=check-in` with Check-In tab active
- PipelineDashboard: Clone Show button and Quick Actions row visible

- [ ] **Step 4: Update TO-DOS.md — mark Phase 1 complete**

In `TO-DOS.md`, change:

```markdown
- [ ] **Phase 1 — Quiet the Noise**
```

to:

```markdown
- [x] **Phase 1 — Quiet the Noise** ✓ completed YYYY-MM-DD
```

```bash
git add TO-DOS.md
git commit -m "chore(todos): mark Phase 1 complete"
```
