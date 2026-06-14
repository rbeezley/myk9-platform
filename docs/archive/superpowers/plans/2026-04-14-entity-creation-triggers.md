# Entity Creation Triggers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a consistent `+ New [Entity]` button to the top-right of every page header that owns a creatable entity, so users always know where to look.

**Architecture:** The PipelineDashboard is the only page missing the button entirely — add it there alongside "Clone Show". All other pages already have creation buttons but use inconsistent labels ("Add X", "Create X"); standardize them all to "New X". No wizards, dialogs, or routes change.

**Tech Stack:** React, TypeScript, shadcn/ui `Button`, `lucide-react` `Plus`, React Router `Link`

---

## File Map

| File                                                                        | Change                                                |
| --------------------------------------------------------------------------- | ----------------------------------------------------- |
| `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx`      | Add `+ New Show` button in header                     |
| `apps/myk9show/src/utils/show-actions.ts`                                   | Rename `'Create Show'` → `'New Show'` (2 occurrences) |
| `apps/myk9show/src/pages/CalendarPage.tsx`                                  | Rename `'Create Show'` → `'New Show'`                 |
| `apps/myk9show/src/components/shows/tabs/TrialsTab.tsx`                     | Rename `'Add Trial'` → `'New Trial'`                  |
| `apps/myk9show/src/components/shows/tabs/ClassesTab.tsx`                    | Rename `'Add Class'` → `'New Class'`                  |
| `apps/myk9show/src/pages/BrowseDogsPage.tsx`                                | Rename `'Add Dog'` → `'New Dog'`                      |
| `apps/myk9show/src/pages/BrowsePeoplePage.tsx`                              | Rename `'Add User'` → `'New Person'`                  |
| `apps/myk9show/src/features/pipeline/components/PipelineDashboard.test.tsx` | **Create:** test for `+ New Show` button              |
| `apps/myk9show/src/test/pages/BrowseShowsPage.test.tsx`                     | [ADDED] Update assertions broken by label renames     |

> **Note — EntryManagementPage:** `/secretary/entries` already uses "New Entry" — no change needed. Verified compliant with spec.

---

## Task 1: Add `+ New Show` button to PipelineDashboard

**Files:**

- Modify: `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx:160-165`
- Create: `apps/myk9show/src/features/pipeline/components/PipelineDashboard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/myk9show/src/features/pipeline/components/PipelineDashboard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import PipelineDashboard from './PipelineDashboard';

// Mock all hooks that make network calls
vi.mock('../hooks/useMissionControlData', () => ({
  useMissionControlData: () => ({
    isLoading: false,
    classesLoading: false,
    shows: [{ id: 'show-1', name: 'Test Show', startDate: '2026-06-01', endDate: '2026-06-01' }],
    selectedShow: {
      id: 'show-1',
      name: 'Test Show',
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    },
    selectedTrial: null,
    trials: [],
    handleShowChange: vi.fn(),
    handleTrialChange: vi.fn(),
    classesByStage: new Map(),
    pipelineClasses: [],
    hasLiveClasses: false,
    showStats: null,
    trialStats: null,
  }),
}));

vi.mock('../hooks/useQuickActionStats', () => ({
  useQuickActionStats: () => ({
    pendingEntriesCount: 0,
    reportsReadyCount: 0,
    activeTrialsCount: 0,
  }),
}));

vi.mock('@/hooks/queries/useClassesDatabase', () => ({
  useUpdateClassMutation: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/components/shows/cloning', () => ({
  ShowCloneDialog: () => null,
}));

vi.mock('./ShowContextRow', () => ({ ShowContextRow: () => null }));
vi.mock('./TrialContextRow', () => ({ TrialContextRow: () => null }));
vi.mock('./AnnouncementsCard', () => ({ AnnouncementsCard: () => null }));
vi.mock('./QuickActionsSection', () => ({ QuickActionsSection: () => null }));
vi.mock('./ShowSettingsPanel', () => ({ ShowSettingsPanel: () => null }));

describe('PipelineDashboard', () => {
  it('renders the New Show button in the header', () => {
    render(<PipelineDashboard />);
    expect(screen.getByRole('link', { name: /new show/i })).toBeInTheDocument();
  });

  it('New Show button links to the show creation wizard', () => {
    render(<PipelineDashboard />);
    const link = screen.getByRole('link', { name: /new show/i });
    expect(link).toHaveAttribute('href', '/secretary/create-show/wizard');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/myk9show && npx vitest run src/features/pipeline/components/PipelineDashboard.test.tsx
```

Expected: FAIL — "Unable to find role=link with name /new show/i"

- [ ] **Step 3: Add the button to PipelineDashboard**

In `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx`, the header `<div className="flex items-center gap-2">` currently contains only the Clone Show button. Add `+ New Show` as a primary button before it:

```tsx
<div className="flex items-center gap-2">
  <Button asChild size="sm">
    <Link to="/secretary/create-show/wizard">
      <Plus className="h-4 w-4 mr-2" />
      New Show
    </Link>
  </Button>
  <Button variant="outline" size="sm" onClick={() => setCloneDialogOpen(true)}>
    <Copy className="h-4 w-4 mr-2" />
    Clone Show
  </Button>
  <div className="text-right">
    {/* timing display — unchanged */}
```

`Plus`, `Link`, and `Button` are already imported — no new imports needed.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/myk9show && npx vitest run src/features/pipeline/components/PipelineDashboard.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx \
        apps/myk9show/src/features/pipeline/components/PipelineDashboard.test.tsx
git commit -m "feat(dashboard): add persistent New Show button to secretary dashboard header"
```

---

## Task 2: Standardize "Create Show" → "New Show" labels

**Files:**

- Modify: `apps/myk9show/src/utils/show-actions.ts` (2 occurrences at lines ~271, ~320)
- Modify: `apps/myk9show/src/pages/CalendarPage.tsx` (1 occurrence)

- [ ] **Step 1: Update show-actions.ts**

Replace both occurrences of `label: 'Create Show'` with `label: 'New Show'`:

```ts
// line ~271
label: 'New Show',

// line ~320
label: 'New Show',
```

Also update the `actionLabel` string at lines ~405 and ~437:

```ts
actionLabel: userPermissions.includes(PERMISSIONS.SHOW_CREATE) ? 'New Show' : undefined,
```

- [ ] **Step 2: Update CalendarPage.tsx**

Find the `Create Show` button text in `apps/myk9show/src/pages/CalendarPage.tsx` and change it to `New Show`:

```tsx
// Before
Create Show

// After
New Show
```

- [ ] **Step 3: [ADDED] Find and fix broken test assertions**

Search for any test files asserting the old label strings:

```bash
cd apps/myk9show && grep -rn "Create Show\|Add Trial\|Add Class\|Add Dog\|Add User" src/test/ src/features/ src/components/ src/pages/ --include="*.test.*"
```

For each match in a test file, update the assertion to the new label. Example — if `BrowseShowsPage.test.tsx` has:

```ts
// Before
expect(screen.getByRole('button', { name: /create show/i })).toBeInTheDocument();

// After
expect(screen.getByRole('button', { name: /new show/i })).toBeInTheDocument();
```

Apply the same substitution pattern for any other matched strings (`Add Trial` → `New Trial`, etc.).

- [ ] **Step 4: Run BrowseShowsPage tests to verify nothing broke**

```bash
cd apps/myk9show && npx vitest run src/test/pages/BrowseShowsPage.test.tsx
```

Expected: all existing tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/utils/show-actions.ts \
        apps/myk9show/src/pages/CalendarPage.tsx \
        apps/myk9show/src/test/pages/BrowseShowsPage.test.tsx
git commit -m "feat(nav): standardize Create Show label to New Show; fix test assertions"
```

---

## Task 3: Standardize "Add Trial" → "New Trial"

**Files:**

- Modify: `apps/myk9show/src/components/shows/tabs/TrialsTab.tsx` (~line 153)

- [ ] **Step 1: Update the button label in TrialsTab.tsx**

Find the `Add Trial` button (inside the `canManage` guard) and update its text:

```tsx
// Before
<Button size="sm" onClick={openWizard} className="gap-1.5">
  <Plus className="h-4 w-4" />
  Add Trial
</Button>

// After
<Button size="sm" onClick={openWizard} className="gap-1.5">
  <Plus className="h-4 w-4" />
  New Trial
</Button>
```

- [ ] **Step 2: Run the full test suite to check for regressions**

```bash
cd apps/myk9show && npx vitest run --reporter=verbose 2>&1 | tail -20
```

Expected: no new failures

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/shows/tabs/TrialsTab.tsx
git commit -m "feat(nav): standardize Add Trial label to New Trial"
```

---

## Task 4: Standardize "Add Class" → "New Class"

**Files:**

- Modify: `apps/myk9show/src/components/shows/tabs/ClassesTab.tsx` (~line 257)

- [ ] **Step 1: Update the button label in ClassesTab.tsx**

Find the `Add Class` button (inside the `canManage` guard) and update its text:

```tsx
// Before
<Button
  size="sm"
  onClick={() =>
    navigate(`/secretary/create-show/wizard?showId=${showId}&mode=add-classes`)
  }
  className="gap-1.5"
>
  <Plus className="h-4 w-4" />
  Add Class
</Button>

// After
<Button
  size="sm"
  onClick={() =>
    navigate(`/secretary/create-show/wizard?showId=${showId}&mode=add-classes`)
  }
  className="gap-1.5"
>
  <Plus className="h-4 w-4" />
  New Class
</Button>
```

- [ ] **Step 2: Run the full test suite**

```bash
cd apps/myk9show && npx vitest run --reporter=verbose 2>&1 | tail -20
```

Expected: no new failures

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/shows/tabs/ClassesTab.tsx
git commit -m "feat(nav): standardize Add Class label to New Class"
```

---

## Task 5: Standardize "Add Dog" → "New Dog"

**Files:**

- Modify: `apps/myk9show/src/pages/BrowseDogsPage.tsx` (~line 107)

- [ ] **Step 1: Update the button label in BrowseDogsPage.tsx**

Find the `Add Dog` button text in the `actionButtons` memo and update it:

```tsx
// Before
<Button onClick={() => setShowCreateDogPanel(true)}>
  <Plus className="h-4 w-4 mr-2" />
  Add Dog
</Button>

// After
<Button onClick={() => setShowCreateDogPanel(true)}>
  <Plus className="h-4 w-4 mr-2" />
  New Dog
</Button>
```

- [ ] **Step 2: Run the full test suite**

```bash
cd apps/myk9show && npx vitest run --reporter=verbose 2>&1 | tail -20
```

Expected: no new failures

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/pages/BrowseDogsPage.tsx
git commit -m "feat(nav): standardize Add Dog label to New Dog"
```

---

## Task 6: Standardize "Add User" → "New Person"

**Files:**

- Modify: `apps/myk9show/src/pages/BrowsePeoplePage.tsx` (~line 200)

- [ ] **Step 1: Update the button label in BrowsePeoplePage.tsx**

Find the `Add User` button text (inside the `canManageUsers` guard) and update it:

```tsx
// Before
{
  canManageUsers && (
    <Button onClick={() => setShowCreatePersonDialog(true)}>
      <Plus className="h-4 w-4 mr-2" />
      Add User
    </Button>
  );
}

// After
{
  canManageUsers && (
    <Button onClick={() => setShowCreatePersonDialog(true)}>
      <Plus className="h-4 w-4 mr-2" />
      New Person
    </Button>
  );
}
```

- [ ] **Step 2: Run the full test suite**

```bash
cd apps/myk9show && npx vitest run --reporter=verbose 2>&1 | tail -20
```

Expected: no new failures

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/pages/BrowsePeoplePage.tsx
git commit -m "feat(nav): standardize Add User label to New Person"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 7 pages in the spec's page mapping table are covered by a task; EntryManagementPage noted as already compliant
- [x] **No placeholders:** All steps have exact code or commands
- [x] **Type consistency:** No new types introduced — only string literal changes and one `Button asChild + Link` pattern already used in the same file
- [x] **Empty states preserved:** No task touches the empty-state CTA in PipelineDashboard — it remains untouched per spec
- [x] **Clone Show preserved:** Task 1 keeps Clone Show as a secondary `variant="outline"` button
- [x] **Permission gating:** BrowseShowsPage and CalendarPage already use `PermissionGuard`/`PERMISSIONS.SHOW_CREATE`; TrialsTab and ClassesTab already use `canManage`; BrowseDogsPage uses `canCreateDogs`; BrowsePeoplePage uses `canManageUsers` — none of that changes
- [x] **[ADDED] Existing test breakage:** Task 2 Step 3 greps for all old label strings across test files and updates them before committing
- [x] **[ADDED] Entries page:** Explicitly documented as already compliant — no change required
