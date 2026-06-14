# Unified List/Detail Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all remaining list and detail pages to shared primitives, standardize tabs into two patterns, and URL-sync all primary tab navigation.

**Architecture:** Primitive-first migration — swap hand-rolled markup for existing shared components (PageShell, PageHeader, DetailHero, SearchBar, etc.) page by page. Create two new tab components (PrimaryTabs, SubTabs) and a useUrlTab hook before starting page migrations. Each phase is independently shippable.

**Tech Stack:** React 19, Base UI tabs, Tailwind CSS, React Router (useSearchParams), Vitest + RTL

**Spec:** `docs/superpowers/specs/2026-03-23-unified-list-detail-phase2-design.md`

---

## File Structure

### New files to create

```
apps/myk9show/src/
  components/common/
    PrimaryTabs.tsx              # Underline tab bar (icon + label + badge, URL-synced)
    SubTabs.tsx                  # Segmented pill tabs (local state)
    __tests__/PrimaryTabs.test.tsx
    __tests__/SubTabs.test.tsx
  hooks/
    useUrlTab.ts                 # URL ?tab= sync hook
    __tests__/useUrlTab.test.ts  # (or src/test/hooks/useUrlTab.test.ts per convention)
  pages/
    TrialDetailsPage.types.ts    # Extracted types from TrialDetailsPage
  hooks/
    useTrialStats.ts             # Extracted from TrialDetailsPage
    useTrialTemplates.ts         # Extracted from TrialDetailsPage
```

### Files to modify (by phase)

**Phase 0:** Create new files only (no modifications)

**Phase 1:** `pages/BrowseDogsPage.tsx`, dog card component (TBD from codebase)

**Phase 2:** `pages/BrowseClubsPage.tsx`

**Phase 3:** `pages/admin/UserManagementPage.tsx`

**Phase 4:** `pages/TrialDetailsPage.tsx`, `pages/ClassDetailsPage/index.tsx`

**Phase 5:** `components/dogs/DogDetailsMain/DogDetailsTabs.tsx`, `pages/DogDetailPage.tsx`

**Phase 6:** `pages/ClubDetailPage.tsx`, club details component

**Phase 7:** `pages/ShowDetailsPage.tsx`, `pages/BrowseShowsPage.tsx`, `components/dogs/DogDetails/Competitions/CompetitionsTabs.tsx`, `components/dogs/DogDetails/HealthRecords/HealthRecordsTraditionalView.tsx`, `pages/admin/permissions/RoleEditPage.tsx`, `pages/admin/permissions/UserRoleManagementPage.tsx`, `components/common/FilterableFieldGrid.tsx`, `styles/myk9-dog-details.css`, `styles/myk9-club-details.css`, `hooks/useRememberedTab.ts` (delete)

---

## Task 0: Create Shared Tab Components (Phase 0)

These must be built first — all subsequent phases depend on them.

**Files:**

- Create: `apps/myk9show/src/components/common/PrimaryTabs.tsx`
- Create: `apps/myk9show/src/components/common/SubTabs.tsx`
- Create: `apps/myk9show/src/hooks/useUrlTab.ts`
- Create: `apps/myk9show/src/components/common/__tests__/PrimaryTabs.test.tsx`
- Create: `apps/myk9show/src/components/common/__tests__/SubTabs.test.tsx`
- Create: `apps/myk9show/src/test/hooks/useUrlTab.test.ts`
- Reference: `packages/ui/src/components/Tabs/Tabs.tsx` (Base UI wrapper)
- Reference: `apps/myk9show/src/hooks/useRememberedTab.ts` (pattern to replace)
- Reference: `apps/myk9show/src/components/common/ViewToggle.tsx` (styling reference)

### useUrlTab hook

- [ ] **Step 1: Write tests for useUrlTab**

Test cases:

- Returns default tab when no `?tab=` param in URL
- Reads `?tab=classes` from URL on mount
- Calls `setSearchParams` when tab changes
- Falls back to default for invalid `?tab=` values (not in allowed list)
- Does not push a history entry on initial render (uses `replace: true`)
- Handles missing `allowedTabs` gracefully (accepts any value)

```typescript
// src/test/hooks/useUrlTab.test.ts
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
// Mock react-router-dom useSearchParams
// Hook signature: useUrlTab(allowedTabs: string[], defaultTab: string) => [string, (tab: string) => void]
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/test/hooks/useUrlTab.test.ts --reporter=verbose`

- [ ] **Step 3: Implement useUrlTab**

Note: `allowedTabs` should reflect only the currently visible tabs. Pages that conditionally hide tabs (e.g., ShowDetailsPage hides "My Entries" for unauthenticated users) must pass a dynamic `allowedTabs` array so `useUrlTab` falls back to the default when a hidden tab is in the URL. [ADDED]

```typescript
// src/hooks/useUrlTab.ts
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useUrlTab(
  allowedTabs: readonly string[],
  defaultTab: string
): [string, (tab: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = rawTab && allowedTabs.includes(rawTab) ? rawTab : defaultTab;

  const setTab = useCallback(
    (tab: string) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (tab === defaultTab) {
            next.delete('tab');
          } else {
            next.set('tab', tab);
          }
          return next;
        },
        { replace: true }
      );
    },
    [defaultTab, setSearchParams]
  );

  return [activeTab, setTab];
}
```

- [ ] **Step 4: Run tests — verify they pass**

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/useUrlTab.ts apps/myk9show/src/test/hooks/useUrlTab.test.ts
git commit -m "feat(myk9show): add useUrlTab hook for URL-synced tab state"
```

### PrimaryTabs component

- [ ] **Step 6: Write tests for PrimaryTabs**

Test cases:

- Renders tabs with icons, labels, and optional count badges
- Active tab has underline indicator (border-bottom styling)
- All triggers have min-height of 48px (touch target)
- Horizontal scroll container has `overflow-x-auto`
- Fires `onValueChange` when tab is clicked
- Renders without icons (icon prop optional per tab)
- Renders without badges (count prop optional per tab)

```typescript
// src/components/common/__tests__/PrimaryTabs.test.tsx
// Component wraps Base UI Tabs, adds consistent styling
// Props: { tabs: Array<{ id, label, icon?, count? }>, value, onValueChange, children }
```

- [ ] **Step 7: Run tests — verify they fail**

- [ ] **Step 8: Implement PrimaryTabs**

The component wraps the existing `Tabs`, `TabsList`, `TabsTrigger` from `@/components/ui/tabs`. It applies:

- Underline border-bottom on active trigger (blue)
- Flex layout with `overflow-x-auto` and `no-scrollbar` for mobile
- Icon (Lucide component) + label + optional Badge for count
- `min-h-[48px]` on each trigger
- No custom CSS files — Tailwind only

```typescript
// src/components/common/PrimaryTabs.tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface PrimaryTabDef {
  id: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

interface PrimaryTabsProps {
  tabs: PrimaryTabDef[];
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function PrimaryTabs({ tabs, value, onValueChange, children, className }: PrimaryTabsProps) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className={className}>
      <TabsList className="flex overflow-x-auto no-scrollbar border-b border-border bg-transparent p-0 gap-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className={cn(
                'inline-flex items-center gap-1.5 min-h-[48px] px-4 py-2 text-sm font-medium',
                'text-muted-foreground border-b-2 border-transparent rounded-none bg-transparent',
                'data-[state=active]:text-primary data-[state=active]:border-primary',
                'hover:text-foreground transition-colors whitespace-nowrap',
              )}
            >
              {Icon && <Icon className="h-4 w-4" />}
              {tab.label}
              {tab.count !== undefined && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] min-w-[20px] justify-center">
                  {tab.count}
                </Badge>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {children}
    </Tabs>
  );
}

// Re-export TabsContent for convenience
export { TabsContent } from '@/components/ui/tabs';
```

- [ ] **Step 9: Run tests — verify they pass**

- [ ] **Step 10: Commit**

### SubTabs component

- [ ] **Step 11: Write tests for SubTabs**

Test cases:

- Renders segmented pill style with muted background container
- Active tab has filled background (white/elevated)
- Icons render when provided
- No count badges (unlike PrimaryTabs)
- Fires `onValueChange` when pill is clicked
- Resets to first tab when `resetKey` prop changes

- [ ] **Step 12: Run tests — verify they fail**

- [ ] **Step 13: Implement SubTabs**

```typescript
// src/components/common/SubTabs.tsx
// Segmented pill style, wraps Base UI Tabs
// Props: { tabs: Array<{ id, label, icon? }>, value, onValueChange, resetKey?, children }
```

Styling: `bg-muted/50 rounded-lg p-1` container, each trigger uses `rounded-md px-3 py-1.5`, active state uses `bg-background text-foreground shadow-sm`.

- [ ] **Step 14: Run tests — verify they pass**

- [ ] **Step 15: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`

- [ ] **Step 16: Commit**

```bash
git add apps/myk9show/src/components/common/PrimaryTabs.tsx apps/myk9show/src/components/common/SubTabs.tsx apps/myk9show/src/components/common/__tests__/
git commit -m "feat(myk9show): add PrimaryTabs and SubTabs shared components"
```

---

## Task 1: Migrate BrowseDogsPage (Phase 1)

**Files:**

- Modify: `apps/myk9show/src/pages/BrowseDogsPage.tsx`
- Reference: `apps/myk9show/src/pages/BrowseShowsPage.tsx` (golden template)
- Reference: `apps/myk9show/src/components/common/PageShell.tsx`
- Reference: `apps/myk9show/src/components/common/PageHeader.tsx`
- Reference: `apps/myk9show/src/components/common/SearchBar.tsx`
- Reference: `apps/myk9show/src/components/common/EmptyState.tsx`
- Reference: `apps/myk9show/src/components/common/ErrorState.tsx`
- Test: existing tests (if any) + new migration tests

- [ ] **Step 1: Read BrowseDogsPage.tsx and BrowseShowsPage.tsx** to understand exact patterns

Read both files. Note the `useBrowseDogsData` hook interface — what loading/error/data/filter state does it expose? Compare with BrowseShowsPage's usage of PageShell, PageHeader, SearchBar, FilterChips, ViewToggle, ResultsCount, EmptyState, ErrorState.

- [ ] **Step 2: Replace page wrapper and header**

Replace the raw `<div className="bg-background"><div className="container mx-auto px-6 py-6 max-w-7xl">` wrapper with `<PageShell>`. Replace the `<Breadcrumb>` component + separate button with `<PageHeader breadcrumbs={[{ label: 'Dogs', href: '/dogs' }]} title="Dogs" actions={...} />`.

- [ ] **Step 3: Replace search bar**

Replace the raw `<Input>` with manual Search icon with `<SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Search by name, breed..." />`.

- [ ] **Step 4: Replace filter bar and view toggle**

Replace `<FilterBar>` with `<FilterChips>`. Replace hand-rolled view toggle buttons with `<ViewToggle modes={CARD_TABLE_MODES} active={viewMode} onChange={setViewMode} />`. Replace inline results count with `<ResultsCount>`.

Note: Use "Gender" (not "Sex") as the filter chip label for the dog sex/gender filter.

- [ ] **Step 5: Replace empty states**

Replace hand-rolled `<Card><CardContent>` empty states with `<EmptyState>` shared primitive. Two variants: no data ("No dogs yet") and filtered-to-zero ("No dogs match your filters").

- [ ] **Step 6: Add ErrorState**

The page currently has no error handling. Add `<ErrorState>` that renders when the data hook returns an error. Pattern from BrowseShowsPage: check for error state before rendering content.

- [ ] **Step 7: Enhance dog cards with registration numbers**

Find the dog card component used by BrowseDogsPage. Add registration number badges below the breed line. Display as muted background pills (e.g., `<span className="bg-muted px-2 py-0.5 rounded text-xs text-muted-foreground">AKC DN12345678</span>`). Show each registration the dog has (AKC, UKC, etc.).

- [ ] **Step 8: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`

- [ ] **Step 9: Write migration tests**

Test that:

- PageShell wrapper renders
- Breadcrumbs show "Dogs" with link
- ErrorState renders when hook returns error
- EmptyState renders when no dogs
- Dog cards show registration numbers when available

- [ ] **Step 10: Run all tests**

Run: `cd apps/myk9show && pnpm vitest run --reporter=verbose` (run full suite to catch regressions)

- [ ] **Step 11: Commit**

```bash
git commit -m "refactor(myk9show): migrate BrowseDogsPage to shared primitives

- Replace hand-rolled wrapper/header/search/filters with PageShell/PageHeader/SearchBar/FilterChips
- Add missing ErrorState with retry
- Replace hand-rolled empty states with EmptyState primitive
- Add registration numbers to dog cards
- Use 'Gender' label on filter chips"
```

---

## Task 2: Migrate BrowseClubsPage (Phase 2)

**Files:**

- Modify: `apps/myk9show/src/pages/BrowseClubsPage.tsx` (292 lines)
- Reference: `apps/myk9show/src/pages/BrowseShowsPage.tsx` (golden template)
- Reference: Task 1 output (BrowseDogsPage — same pattern)

- [ ] **Step 1: Read BrowseClubsPage.tsx** — note the `useBrowseClubsData` hook, PanelProvider/PanelStack usage, gradient search card

- [ ] **Step 2: Replace page wrapper and header**

PageShell + PageHeader (breadcrumbs: `[{ label: 'Clubs', href: '/clubs' }]`). Keep "Create Club" action button. Keep `PanelProvider`/`PanelStack` wrapping (needed for club creation flow).

- [ ] **Step 3: Replace search, filters, view toggle, results count**

Same pattern as Task 1. Remove the gradient card styling (`hover:shadow-xl`, `hover:border-primary/30`). Use standard `<SearchBar>`, `<FilterChips>` (organization, location), `<ViewToggle>` (cards default), `<ResultsCount>`.

- [ ] **Step 4: Replace empty states, add ErrorState**

Same pattern as Task 1.

- [ ] **Step 5: Fix spacing** — change `space-y-8` to `space-y-6` (PageShell handles this)

- [ ] **Step 6: Run typecheck + lint**

- [ ] **Step 7: Write migration tests**

Same pattern as Task 1 tests adapted for clubs.

- [ ] **Step 8: Run all tests**

- [ ] **Step 9: Commit**

```bash
git commit -m "refactor(myk9show): migrate BrowseClubsPage to shared primitives

- Replace hand-rolled wrapper/header/search/filters with shared components
- Remove gradient search card embellishments
- Add missing ErrorState with retry
- Normalize spacing to space-y-6 via PageShell"
```

---

## Task 3: Migrate UserManagementPage (Phase 3)

**Files:**

- Modify: `apps/myk9show/src/pages/admin/UserManagementPage.tsx` (378 lines)
- Reference: `apps/myk9show/src/pages/BrowseShowsPage.tsx` (golden template)

This page keeps its admin-specific patterns (stats, expandable filters, bulk actions) but gets structural standardization.

- [ ] **Step 1: Read UserManagementPage.tsx** — note inline `style={{}}` attributes, `SF_FONT_FAMILY` constant, `EASE_TIMING` constant, the expandable filter panel pattern, stats section, error card

- [ ] **Step 2: Replace page wrapper**

Replace `<div className="min-h-screen bg-background"><div className="container mx-auto px-8 pt-8 pb-12 max-w-8xl">` with `<PageShell>` (which uses `max-w-7xl`).

- [ ] **Step 3: Replace header**

Replace hand-rolled header div (with inline SF Pro styles) with `<PageHeader breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Users', href: '/admin/users' }]} title="User Management" actions={...} />`. Remove all `style={{fontFamily: SF_FONT_FAMILY, ...}}` attributes. Remove `SF_FONT_FAMILY` and `EASE_TIMING` constants if no other consumers.

- [ ] **Step 4: Replace search bar**

Replace raw `<Input>` with inline styling and clear button with `<SearchBar>`.

- [ ] **Step 5: Replace error card with ErrorState**

Replace the hand-rolled error card (custom X icon, reload button) with `<ErrorState message={errorMessage} onRetry={handleRetry} />`.

- [ ] **Step 6: Add EmptyState for zero-result filters**

Add `<EmptyState>` when search/filter produces zero results. Currently missing.

- [ ] **Step 7: Add ViewToggle** (table default, cards available)

Add `<ViewToggle modes={CARD_TABLE_MODES} active={viewMode} onChange={setViewMode} />`. Will need `useViewPreference('users', 'table')`. Cards view can be a simple card grid of user cards (name, email, role badge, status). Table view stays as-is.

- [ ] **Step 8: Keep admin patterns intact**

Verify `UserManagementStats`, expandable `UserFilters` panel, bulk selection, and pagination are unchanged and still render correctly inside the new PageShell structure.

- [ ] **Step 9: Run typecheck + lint**

- [ ] **Step 10: Write migration tests**

Test breadcrumbs, ErrorState, EmptyState, and that admin-specific patterns (stats, filters, bulk actions) still render.

- [ ] **Step 11: Run all tests**

- [ ] **Step 12: Commit**

```bash
git commit -m "refactor(myk9show): migrate UserManagementPage to shared primitives

- Replace raw wrapper with PageShell (max-w-7xl)
- Add PageHeader with breadcrumbs (Admin / Users)
- Replace hand-rolled error card with ErrorState
- Add EmptyState for zero-result filters
- Add ViewToggle (table default, cards available)
- Remove inline SF Pro font styles — Tailwind only
- Keep admin-specific patterns: stats, expandable filters, bulk actions"
```

---

## Task 4: Migrate TrialDetailsPage + ClassDetailsPage (Phase 4)

This is the largest task. TrialDetailsPage converts from sidebar to flat vertical and gets decomposed.

**Files:**

- Modify: `apps/myk9show/src/pages/TrialDetailsPage.tsx` (706 lines)
- Create: `apps/myk9show/src/pages/TrialDetailsPage.types.ts`
- Create: `apps/myk9show/src/hooks/useTrialStats.ts`
- Create: `apps/myk9show/src/hooks/useTrialTemplates.ts`
- Modify: `apps/myk9show/src/pages/ClassDetailsPage/index.tsx` (360 lines)
- Reference: `apps/myk9show/src/pages/ShowDetailsPage.tsx` (golden detail template)

### TrialDetailsPage

- [ ] **Step 1: Read TrialDetailsPage.tsx thoroughly** — understand the RecordPageLayout usage, sidebar content, tab structure, inline statistics, template creation logic, useRememberedTab usage, loading/error/not-found states

- [ ] **Step 2: Extract types** to `TrialDetailsPage.types.ts`

Move any trial-specific type definitions out of the main file.

- [ ] **Step 3: Extract useTrialStats hook**

Move the inline statistics calculation logic into `src/hooks/useTrialStats.ts`. The hook should accept trial/class/entry data and return computed statistics. Write tests for the hook.

- [ ] **Step 4: Extract useTrialTemplates hook**

Move the inline template creation logic into `src/hooks/useTrialTemplates.ts`. Write tests.

- [ ] **Step 5: Run tests for extracted hooks**

- [ ] **Step 6: Commit extractions**

```bash
git commit -m "refactor(myk9show): extract useTrialStats and useTrialTemplates from TrialDetailsPage"
```

- [ ] **Step 7: Replace RecordPageLayout with flat vertical**

Replace `<RecordPageLayout>` with:

```tsx
<PageShell>
  <PageHeader
    breadcrumbs={[
      { label: 'Shows', href: '/shows' },
      { label: showName, href: `/shows/${showId}` },
      { label: trialName, href: `/shows/${showId}/trials/${trialId}` },
    ]}
    title={trialName}
    actions={/* Edit button, prev/next nav */}
  />
  <DetailHero
    name={trialName}
    subtitle={trialType}
    metadata={[
      { label: trialDate, icon: Calendar },
      { label: judgeName, icon: User },
    ]}
    badge={{ label: statusLabel, variant: statusVariant }}
    secondaryActions={/* prev/next trial navigation */}
  />
  <PrimaryTabs tabs={tabDefs} value={activeTab} onValueChange={setTab}>
    {/* existing TabsContent panels */}
  </PrimaryTabs>
</PageShell>
```

Sidebar content redistribution:

- Properties (name, date, type, status, judge) → DetailHero
- Associations (show link, prev/next) → PageHeader breadcrumbs + DetailHero secondaryActions
- Settings → Settings tab (if one exists)

- [ ] **Step 8: Replace useRememberedTab with useUrlTab**

```tsx
// Before:
const [activeTab, setActiveTab] = useRememberedTab('trial-details', 'classes');
// After:
const TAB_IDS = ['classes', 'entries', 'scoring', 'settings'] as const;
const [activeTab, setTab] = useUrlTab(TAB_IDS, 'classes');
```

- [ ] **Step 9: Add tab icons and count badges**

Define tab config with Lucide icons:

```tsx
const tabDefs: PrimaryTabDef[] = [
  { id: 'classes', label: 'Classes', icon: ListChecks, count: classCount },
  { id: 'entries', label: 'Entries', icon: ClipboardList, count: entryCount },
  { id: 'scoring', label: 'Scoring', icon: Trophy },
  { id: 'settings', label: 'Settings', icon: Settings },
];
```

- [ ] **Step 10: Replace loading/not-found states**

Replace hand-rolled spinner with `<LoadingSkeleton variant="cards" count={3} />`.
Replace legacy CSS not-found (`myk9-action-button`) with `<NotFoundState entityName="Trial" backTo={`/shows/${showId}`} backLabel="Back to Show" />`.

- [ ] **Step 11: Verify file is under 500 lines**

Run: `wc -l apps/myk9show/src/pages/TrialDetailsPage.tsx`
Target: under 500 lines. If still over, extract more logic.

- [ ] **Step 12: Run typecheck + lint**

- [ ] **Step 13: Commit TrialDetailsPage migration**

```bash
git commit -m "refactor(myk9show): migrate TrialDetailsPage to flat vertical layout

- Replace RecordPageLayout sidebar with PageHeader/DetailHero/PrimaryTabs
- URL-sync tabs via useUrlTab
- Replace loading spinner with LoadingSkeleton
- Replace legacy CSS not-found with NotFoundState
- Add tab icons and count badges
- File reduced from 706 to ~400 lines"
```

### ClassDetailsPage

- [ ] **Step 14: Read ClassDetailsPage/index.tsx** — understand its RecordPageLayout usage and tab structure

- [ ] **Step 15: Apply same flat vertical pattern**

Replace `RecordPageLayout` with `PageShell` + `PageHeader` (breadcrumbs: `Shows / [Show] / [Trial] / [Class]`) + `DetailHero` + `PrimaryTabs`. Replace useRememberedTab with useUrlTab. Use shared loading/error/not-found states.

- [ ] **Step 16: Run typecheck + lint**

- [ ] **Step 17: Write migration tests for both pages**

Test breadcrumbs, DetailHero content, tab URL sync, loading/not-found states.

- [ ] **Step 18: Run all tests**

- [ ] **Step 19: Commit ClassDetailsPage**

```bash
git commit -m "refactor(myk9show): migrate ClassDetailsPage to flat vertical layout"
```

---

## Task 5: Migrate DogDetailsPage (Phase 5)

**Files:**

- Modify: `apps/myk9show/src/pages/DogDetailPage.tsx` (82 lines — thin wrapper)
- Modify: `apps/myk9show/src/components/dogs/DogDetailsMain/DogDetailsTabs.tsx` (229 lines — actual tab component)
- Reference: `apps/myk9show/src/pages/ShowDetailsPage.tsx` (golden detail template)

- [ ] **Step 1: Read DogDetailPage.tsx and DogDetailsTabs.tsx** — understand the wrapper pattern, tab definitions, premium gating, useRememberedTab usage

- [ ] **Step 2: Add PageHeader to DogDetailPage**

Add `<PageHeader breadcrumbs={[{ label: 'Dogs', href: '/dogs' }, { label: dogName }]} title={dogName} actions={/* Edit button */} />`.

- [ ] **Step 3: Add DetailHero**

```tsx
<DetailHero
  name={dog.name}
  subtitle={`${dog.breed} · ${dog.gender}`}
  metadata={[{ label: `Born: ${dog.birthDate}` }, { label: `Owner: ${dog.ownerName}` }]}
  badge={{
    label: dog.isActive ? 'Active' : 'Inactive',
    variant: dog.isActive ? 'success' : 'default',
  }}
/>
```

Include registration numbers as additional metadata or as a custom section within the hero. Display as muted pills: `AKC DN12345678`, `UKC R234-567`.

- [ ] **Step 4: Replace DogDetailsTabs with PrimaryTabs**

Replace the custom tab styling in `DogDetailsTabs.tsx` with `<PrimaryTabs>`. Replace `useRememberedTab('dog-details', 'registrations')` with `useUrlTab(TAB_IDS, 'overview')`.

Tab definitions with icons:

```tsx
const tabDefs: PrimaryTabDef[] = [
  { id: 'overview', label: 'Overview', icon: FileText },
  { id: 'health', label: 'Health', icon: Activity },
  { id: 'titles', label: 'Titles', icon: Crown },
  { id: 'entries', label: 'Entries', icon: ClipboardList },
];
```

- [ ] **Step 5: Move premium gates from disabled tabs to tab content**

Currently, premium-locked tabs show as disabled with a tooltip. Change: all tabs are always clickable. Inside the tab content, show an upgrade prompt if the feature is premium-locked. This is better UX — users can see what the tab contains and are motivated to upgrade.

- [ ] **Step 6: Run typecheck + lint**

- [ ] **Step 7: Write migration tests**

Test breadcrumbs, DetailHero with registration numbers, tab URL sync, premium tab content (not disabled trigger).

- [ ] **Step 8: Run all tests**

- [ ] **Step 9: Commit**

```bash
git commit -m "refactor(myk9show): migrate DogDetailsPage to flat vertical with PrimaryTabs

- Add PageHeader with breadcrumbs
- Add DetailHero with registration numbers
- Replace custom tab styling with PrimaryTabs
- URL-sync tabs via useUrlTab
- Move premium gates from disabled tabs to tab content"
```

---

## Task 6: Migrate ClubDetailsPage (Phase 6)

**Files:**

- Modify: `apps/myk9show/src/pages/ClubDetailPage.tsx` (58 lines — thin wrapper)
- Modify: Club details component (find via ClubDetailPage imports)
- Reference: Task 5 output (DogDetailsPage — same pattern)

- [ ] **Step 1: Read ClubDetailPage.tsx and its delegated component** — understand tab structure, header layout

- [ ] **Step 2: Add PageHeader**

Breadcrumbs: `[{ label: 'Clubs', href: '/clubs' }, { label: clubName }]`. Edit action button.

- [ ] **Step 3: Add DetailHero**

```tsx
<DetailHero
  name={club.name}
  subtitle={club.organization}
  metadata={[
    { label: club.location, icon: MapPin },
    { label: `${club.memberCount} members`, icon: Users },
  ]}
/>
```

- [ ] **Step 4: Replace tab styling with PrimaryTabs**

Replace inline Tailwind tab overrides with `<PrimaryTabs>`. Replace any localStorage tab state with `useUrlTab`.

Tab definitions:

```tsx
const tabDefs: PrimaryTabDef[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'shows', label: 'Shows', icon: Theater },
];
```

- [ ] **Step 5: Run typecheck + lint**

- [ ] **Step 6: Write migration tests**

- [ ] **Step 7: Run all tests**

- [ ] **Step 8: Commit**

```bash
git commit -m "refactor(myk9show): migrate ClubDetailsPage to flat vertical with PrimaryTabs"
```

---

## Task 7: Tab Standardization Sweep (Phase 7)

Final pass — update all remaining pages to use PrimaryTabs/SubTabs and clean up dead CSS.

**Files:**

- Modify: `apps/myk9show/src/pages/ShowDetailsPage.tsx`
- Modify: `apps/myk9show/src/pages/BrowseShowsPage.tsx`
- Modify: `apps/myk9show/src/components/dogs/DogDetails/Competitions/CompetitionsTabs.tsx` (84 lines)
- Modify: `apps/myk9show/src/components/dogs/DogDetails/HealthRecords/HealthRecordsTraditionalView.tsx` (320 lines)
- Modify: `apps/myk9show/src/pages/admin/permissions/RoleEditPage.tsx` (459 lines)
- Modify: `apps/myk9show/src/pages/admin/permissions/UserRoleManagementPage.tsx` (466 lines)
- Modify: `apps/myk9show/src/components/common/FilterableFieldGrid.tsx` (migrate off useRememberedTab)
- Delete CSS: `apps/myk9show/src/styles/myk9-dog-details.css` (tab rules only, lines ~339-532)
- Delete CSS: `apps/myk9show/src/styles/myk9-club-details.css` (tab rules only, lines ~169-220)
- Delete: `apps/myk9show/src/hooks/useRememberedTab.ts` (after all consumers migrated)

### Sub-tab migrations

- [ ] **Step 1: Migrate CompetitionsTabs to SubTabs**

Read `CompetitionsTabs.tsx` (84 lines). Replace `.myk9-sub-tabs`/`.myk9-sub-tab` class usage with `<SubTabs>` component. Keep local state (sub-tabs don't URL-sync).

- [ ] **Step 2: Migrate HealthRecordsTraditionalView to SubTabs**

Same pattern as CompetitionsTabs.

- [ ] **Step 3: Commit sub-tab migrations**

```bash
git commit -m "refactor(myk9show): migrate CompetitionsTabs and HealthRecords to SubTabs"
```

### Primary tab migrations

- [ ] **Step 4: Migrate ShowDetailsPage tabs to PrimaryTabs + useUrlTab**

Read `ShowDetailsPage.tsx`. Replace the current tab config array + custom `TabsTrigger` styling with `<PrimaryTabs>`. Replace tab state (currently uses a mix of URL params and local state) with `useUrlTab`.

- [ ] **Step 5: Migrate BrowseShowsPage tabs to PrimaryTabs + useUrlTab**

Read `BrowseShowsPage.tsx`. Same pattern — replace tab styling with `<PrimaryTabs>`.

- [ ] **Step 6: Migrate RoleEditPage tabs to PrimaryTabs**

Read `RoleEditPage.tsx`. Replace default ShadCN tab styling with `<PrimaryTabs>`.

- [ ] **Step 7: Migrate UserRoleManagementPage tabs to PrimaryTabs**

Same pattern.

- [ ] **Step 8: Commit primary tab migrations**

```bash
git commit -m "refactor(myk9show): migrate ShowDetails, BrowseShows, RoleEdit, UserRoleManagement to PrimaryTabs"
```

### Cleanup

- [ ] **Step 9: Migrate FilterableFieldGrid off useRememberedTab**

Read `FilterableFieldGrid.tsx`. It uses `useRememberedTab` for a hide/show-empty-fields toggle (not tab state). Replace with direct `useState` + `localStorage`:

```typescript
const [hideEmpty, setHideEmpty] = useState(() => {
  try {
    return localStorage.getItem(`myk9:field-grid:${sectionKey}`) === 'true';
  } catch {
    return false;
  }
});
const toggleHideEmpty = () => {
  const next = !hideEmpty;
  setHideEmpty(next);
  try {
    localStorage.setItem(`myk9:field-grid:${sectionKey}`, String(next));
  } catch {}
};
```

- [ ] **Step 10: Delete orphaned tab CSS rules**

From `myk9-dog-details.css`: delete `.myk9-dog-tabs`, `.myk9-dog-tab`, `.myk9-sub-tabs`, `.myk9-sub-tab` rules and all their variants (`:hover`, `[data-state=active]`, media queries). Keep non-tab CSS in the file.

From `myk9-club-details.css`: delete `.myk9-club-tabs`, `.myk9-club-tab` rules and variants. Keep non-tab CSS.

- [ ] **Step 11: Delete useRememberedTab.ts**

Verify no imports remain: `grep -r "useRememberedTab" apps/myk9show/src/`. If clean, delete `apps/myk9show/src/hooks/useRememberedTab.ts`.

- [ ] **Step 12: Verify no `!important` tab overrides remain**

Run: `grep -r '!important' apps/myk9show/src/styles/ | grep -i tab`
Expected: zero results.

- [ ] **Step 13: Run typecheck + lint**

- [ ] **Step 14: Run full test suite**

Run: `cd apps/myk9show && pnpm vitest run --reporter=verbose`

- [ ] **Step 15: Commit cleanup**

```bash
git commit -m "refactor(myk9show): complete tab standardization — delete dead CSS and useRememberedTab

- Remove .myk9-dog-tabs, .myk9-sub-tabs, .myk9-club-tabs CSS rules
- Migrate FilterableFieldGrid off useRememberedTab
- Delete useRememberedTab hook
- Zero !important tab overrides remain"
```

---

## Final Verification

- [ ] **Step 1: Run full quality checks**

```bash
pnpm typecheck && pnpm lint
cd apps/myk9show && pnpm vitest run
```

- [ ] **Step 2: Verify success criteria**

1. Every list page uses PageShell, PageHeader, SearchBar, EmptyState, ErrorState
2. Every detail page uses PageShell, PageHeader, DetailHero, PrimaryTabs
3. Zero custom tab CSS (grep for `.myk9-dog-tabs`, `.myk9-club-tabs`, `.myk9-sub-tabs`)
4. Zero `!important` tab overrides
5. All primary tabs URL-synced (test `?tab=` on each detail page)
6. TrialDetailsPage under 500 lines
7. All pages have error states
8. Dog cards show registration numbers
9. typecheck + lint pass
10. All tests pass

- [ ] **Step 3: Final commit if any remaining changes**
