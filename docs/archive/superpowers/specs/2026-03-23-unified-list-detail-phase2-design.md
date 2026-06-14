# Unified List/Detail System -- Phase 2 (Full Audit)

**Date:** 2026-03-23
**Status:** Draft
**Scope:** Migrate all remaining list and detail pages to the shared primitives established in Phase 1 (BrowseShowsPage + ShowDetailsPage), plus standardize all tab bars into two patterns.
**Prerequisite:** Phase 1 spec (`docs/superpowers/specs/2026-03-15-unified-list-detail-system-design.md`)

---

## Problem

Phase 1 established shared primitives (`PageShell`, `PageHeader`, `DetailHero`, `SearchBar`, `FilterChips`, `EmptyState`, `ErrorState`, etc.) and proved them on BrowseShowsPage and ShowDetailsPage. But the remaining pages use none of these primitives:

| Page               | Shared Primitives Used | Key Gaps                                                      |
| ------------------ | ---------------------- | ------------------------------------------------------------- |
| BrowseDogsPage     | 0                      | No error state, hand-rolled search/filters/empty states       |
| BrowseClubsPage    | 0                      | No error state, gradient embellishments, inconsistent spacing |
| UserManagementPage | 0                      | Inline SF Pro styles, no breadcrumbs, wider max-width         |
| TrialDetailsPage   | 0                      | Sidebar layout, legacy CSS classes, 706 lines                 |
| DogDetailsPage     | 0                      | Orphaned tab CSS in stylesheets, localStorage tabs            |
| ClubDetailsPage    | 0                      | Orphaned tab CSS in stylesheets                               |
| ClassDetailsPage   | 0                      | Uses RecordPageLayout sidebar                                 |

Additionally, the codebase has 4 distinct tab styling patterns (`.myk9-dog-tabs`, `.myk9-club-tabs`, `.myk9-sub-tabs`, ShadCN default) with inconsistent state management (URL params, localStorage, React state).

## Goals

1. Every list and detail page uses the shared primitives -- no hand-rolled wrappers, headers, or state components.
2. Two standardized tab styles replace the 4 existing patterns.
3. All primary tabs are URL-synced for deep-linking and browser back/forward.
4. All detail pages use the flat vertical layout (PageHeader, DetailHero, Tabs).
5. TrialDetailsPage decomposed below 500 lines.
6. Dog cards display registration numbers and organization for quick identification.

## Non-Goals

- Redesigning tab panel content (business logic within tabs stays unchanged)
- Building new page factory abstractions (each page migrated individually)
- Changing BrowseShowsPage or ShowDetailsPage (already the golden templates -- Phase 7 only updates their tab styling)
- Migrating UserDetailsView (admin panel/dialog, not a full page -- defer to future work)

## Departures from Phase 1

Phase 1 assumed "Dogs (Cards only)" and "Trials: Cards, no alternative." This spec expands both:

- Dogs: Cards default, Table available (useful for users with many dogs)
- Trials: Cards default, Table available (consistent with the card/table pattern everywhere else)
- People: Table default, Cards available (Phase 1 did not specify)

These are deliberate scope expansions that improve consistency across all entities.

---

## Design Decisions

### Flat Vertical Layout Everywhere

All detail pages converge on the same layout: PageHeader (breadcrumbs + actions) at the top, DetailHero (entity name, metadata, status, primary action) below it, then full-width tabs. No sidebar layouts.

TrialDetailsPage currently uses `RecordPageLayout` with a sidebar for properties and associations. This sidebar content moves into the DetailHero (name, date, type, status, prev/next navigation) and the Overview tab (judges, associations, settings). The sidebar layout is removed.

### Two Tab Styles

**Primary Tabs** (page-level navigation on all detail and browse pages):

- Underline indicator (blue active border-bottom)
- Icon + label + optional count badge on each trigger
- URL-synced via `?tab=` search param
- Horizontal scroll on mobile with `overflow-x-auto`
- 48px minimum touch target height
- Implemented as a `PrimaryTabs` component wrapping Base UI Tabs

**Sub-Tabs** (nested within a tab panel):

- Segmented pill style (iOS-inspired)
- Icon + label (no count badges)
- Local React state only (not URL-synced)
- Resets to first sub-tab when parent tab changes
- Compact height for nesting
- Implemented as a `SubTabs` component wrapping Base UI Tabs

Both components use Tailwind classes only -- no custom CSS files, no `!important` overrides.

**State management hook -- `useUrlTab`:**

- Reads `?tab=` from the current URL search params
- Writes back on tab change via `setSearchParams`
- Falls back to a configurable default when no param present
- Validates against an allowed list of tab IDs (ignores invalid values)
- Replaces `useRememberedTab` (localStorage-based) everywhere

### View Mode Defaults

| Entity  | Default View | Also Available  |
| ------- | ------------ | --------------- |
| Shows   | Cards        | Table, Calendar |
| Trials  | Cards        | Table           |
| Classes | Table        | Cards           |
| Entries | Table        | --              |
| Dogs    | Cards        | Table           |
| Clubs   | Cards        | Table           |
| People  | Table        | Cards           |

View preference persists via the existing `useViewPreference` hook (localStorage per-tab key). Note: `useViewPreference` supports `'cards' | 'table'` only. The Shows Calendar view is a separate toggle (existing `ShowCalendar` component loaded via lazy import), not a view mode managed by this hook.

### Terminology

Dog filter labels use "Gender" (not "Sex") throughout the application.

---

## Migration Phases

Each phase is an independent, shippable unit of work. Phase 0 creates the shared tab components that later phases depend on. Page migrations are ordered by complexity (simplest first) so patterns are proven before tackling the harder migrations.

### Phase 0: Create Shared Tab Components

Before any page migration, create the new tab primitives that all phases reference:

- `PrimaryTabs` component (wraps Base UI Tabs with underline style, icon+label+badge pattern, horizontal scroll on mobile, 48px touch targets)
- `SubTabs` component (wraps Base UI Tabs with segmented pill style)
- `useUrlTab` hook (reads/writes `?tab=` search param with validation and default fallback)

These go in `apps/myk9show/src/components/common/` (tab components) and `apps/myk9show/src/hooks/` (hook). Unit tests for all three before proceeding.

### Phase 1: BrowseDogsPage (List)

**Remove:**

- Raw `div` wrapper that duplicates PageShell
- `Breadcrumb` component (different from PageHeader)
- Raw `Input` with manual search icon (h-10, rounded-lg)
- `FilterBar` component (different abstraction from FilterChips)
- Hand-rolled view toggle button array
- Inline `span` for results count
- Hand-rolled `Card`+`CardContent` empty states

**Replace with:**

- `PageShell`
- `PageHeader` with breadcrumbs (`Home / Dogs`) and "Add Dog" action button
- `SearchBar` (h-12, rounded-xl, 48px touch target)
- `FilterChips` (breed, gender)
- `ViewToggle` (cards default, table available)
- `ResultsCount`
- `EmptyState` (shared primitive, two variants: no data vs. filtered-to-zero)

**Add:**

- `ErrorState` with retry button (currently missing entirely)

**Dog card enhancement:**

- Add registration number badges below breed line (e.g., "AKC DN12345678", "UKC R234-567")
- Badges use muted background pill style for scannability

**Unchanged:** `BrowseDogsSkeleton` (entity-specific skeleton), `useBrowseDogsData` hook, all data fetching.

### Phase 2: BrowseClubsPage (List)

**Remove:**

- Raw `div` wrapper
- `Breadcrumb` component
- Gradient search card with `hover:shadow-xl` effects
- `FilterBar` component
- Hand-rolled view toggle (grid/list modes)
- Inline results count `span`
- Hand-rolled empty states
- `space-y-8` (inconsistent with `space-y-6`)

**Replace with:**

- `PageShell` (`space-y-6`)
- `PageHeader` with breadcrumbs (`Home / Clubs`) and "Create Club" action
- `SearchBar` (standard, no gradient)
- `FilterChips` (organization, location)
- `ViewToggle` (cards default, table available)
- `ResultsCount`
- `EmptyState`

**Add:**

- `ErrorState` with retry (currently missing)

**Unchanged:** `BrowseClubsSkeleton`, `useBrowseClubsData` hook, `PanelProvider`/`PanelStack` for club creation flow.

### Phase 3: UserManagementPage (List, Admin)

**Remove:**

- Raw `div` with `max-w-8xl` (wider than every other page)
- Hand-rolled header with inline `style={{}}` for SF Pro font family, letter-spacing, timing functions
- Missing breadcrumbs
- Raw `Input` with inline styling and clear button
- Hand-rolled error card with custom reload button
- Missing empty state for zero-result filters

**Replace with:**

- `PageShell` (`max-w-7xl`)
- `PageHeader` with breadcrumbs (`Admin / Users`) and action buttons
- `SearchBar` (standard)
- `ErrorState` with retry (replaces hand-rolled error card)
- `EmptyState` for zero-result filters

**Add:**

- `ViewToggle` (table default, cards available)

**Keep as-is (admin-specific patterns):**

- `UserManagementStats` section between header and table
- Expandable `UserFilters` panel (toggled by "Filters" button)
- Bulk selection via `useBulkSelection` + `ShowBulkActionsBar`
- Pagination controls
- All inline font style overrides removed -- Tailwind font classes only

### Phase 4: TrialDetailsPage (Detail)

This is the largest migration. The page converts from a sidebar layout to flat vertical and is decomposed to stay under 500 lines.

**Remove:**

- `RecordPageLayout` (3-column sidebar layout)
- Hand-rolled spinner loading state
- Legacy CSS classes (`myk9-action-button`, `myk9-action-button-primary`) in not-found state
- `useRememberedTab` (localStorage tab state)
- Tab styling without icons or count badges
- Inline template creation logic (extract to hook)
- Inline statistics calculation logic (extract to hook)

**Replace with:**

- `PageShell`
- `PageHeader` with breadcrumbs (`Shows / [Show Name] / [Trial Name]`) and Edit action
- `DetailHero` with: trial name, date, trial type, status badge, prev/next trial navigation, judge info
- `PrimaryTabs` with icons, count badges, URL-synced via `useUrlTab`
- `LoadingSkeleton` (matches detail layout shape)
- `NotFoundState` (shared primitive)
- `ErrorState`

**Extract to reduce file size:**

- `useTrialStats` hook (statistics calculation currently inline)
- `useTrialTemplates` hook (template creation logic currently inline)
- Trial-specific type definitions to sibling `types.ts`

**Sidebar content redistribution:**

- Properties (name, date, type, status, judge) move to DetailHero
- Associations (show link, prev/next nav) move to PageHeader breadcrumbs + DetailHero
- Settings move to a Settings tab

**Unchanged:** Edit panel, delete dialog, tab panel content components.

### Phase 4b: ClassDetailsPage (Detail)

ClassDetailsPage also uses `RecordPageLayout`. Apply the same flat vertical conversion:

- Replace `RecordPageLayout` with `PageShell` + `PageHeader` (breadcrumbs: `Shows / [Show] / [Trial] / [Class]`) + `DetailHero` + `PrimaryTabs`
- Use shared loading/error/not-found states

This can be done in the same phase as TrialDetailsPage since the pattern is identical.

### Phase 5: DogDetailsPage (Detail)

**Remove:**

- Inline Tailwind tab overrides on `TabsList`/`TabsTrigger` (components use Tailwind, not the `.myk9-dog-tabs` CSS class -- those CSS rules are orphaned dead code cleaned up in Phase 7)
- Premium feature gating via disabled tab triggers with tooltips
- `useRememberedTab` (localStorage)

**Replace with:**

- `PageHeader` with breadcrumbs (`Dogs / [Dog Name]`) and Edit action
- `DetailHero` with: dog name, breed, gender, registration numbers (AKC/UKC badges), owner name, active/inactive status badge
- `PrimaryTabs` (standard underline, icons, URL-synced)
- Premium gates move from disabled tabs to within tab content (tab is always clickable; content shows upgrade prompt if feature is premium-locked)

**Unchanged:** Tab content components (Overview, Health, Titles, Entries), edit panel.

### Phase 6: ClubDetailsPage (Detail)

**Remove:**

- Inline Tailwind tab overrides (`.myk9-club-tabs` CSS rules are orphaned dead code cleaned up in Phase 7)
- Custom header layout

**Replace with:**

- `PageHeader` with breadcrumbs (`Clubs / [Club Name]`) and Edit action
- `DetailHero` with: club name, organization, location, member count badge
- `PrimaryTabs` (standard underline, icons, URL-synced)

**Unchanged:** Tab content components (Overview, Members, Shows).

### Phase 7: Tab Standardization Pass

A sweep across all remaining pages to ensure every tab bar uses one of the two standard patterns.

**Remove:**

- `.myk9-dog-tabs` CSS rules from `myk9-dog-details.css`
- `.myk9-sub-tabs` CSS rules from `myk9-dog-details.css`
- `.myk9-club-tabs` CSS rules from `myk9-club-details.css`
- All tab-related `!important` overrides
- `useRememberedTab` hook -- note: `FilterableFieldGrid` also uses this hook for a localStorage toggle (not tab state). Migrate `FilterableFieldGrid` to use `useState` + `localStorage` directly before deleting the hook.
- Per-page inline tab className overrides

**Components:** `PrimaryTabs`, `SubTabs`, and `useUrlTab` were created in Phase 0. This phase only consumes them.

**Pages updated in this pass:**

- ShowDetailsPage (already uses flat vertical; update tab styling to PrimaryTabs + useUrlTab)
- BrowseShowsPage (update tab styling to PrimaryTabs + useUrlTab)
- CompetitionsTabs (convert to SubTabs)
- HealthRecordsTraditionalView (convert to SubTabs)
- RoleEditPage (convert to PrimaryTabs)
- UserRoleManagementPage (convert to PrimaryTabs)
- Any pages migrated in Phases 4-6 that were already converted during their phase

---

## Testing

### New shared components

- `PrimaryTabs`: renders with icons, labels, count badges; active tab has underline indicator; 48px minimum touch target on triggers; horizontal scroll on overflow
- `SubTabs`: renders segmented pills; active tab has filled background; resets to first tab when parent key changes
- `useUrlTab`: reads `?tab=` from URL; writes on change; falls back to default for missing/invalid values; does not push history entry on initial render

### Per-page migration tests (each phase)

Each migrated page gets these assertions:

- Loading state renders the correct skeleton
- Error state renders `ErrorState` with retry button (new for Dogs, Clubs, Users)
- Empty state renders correct message and CTA (two variants: no data, filtered-to-zero)
- View mode toggle switches between cards and table
- Breadcrumbs render with correct hierarchy and links
- Tab navigation works and URL updates to `?tab=<id>`
- Existing functionality preserved (search, filters, bulk actions where applicable)

### Tab standardization tests

- All 9+ pages render tabs with the primary underline style
- URL `?tab=classes` deep-links to the correct tab on page load
- Browser back/forward restores tab state
- Sub-tabs within panels use segmented style
- Sub-tabs reset to first option when parent tab changes
- Invalid `?tab=` values fall back to the default tab

### What we skip

- Visual pixel matching (Tailwind handles consistency)
- Business logic within tab panels (already tested, unchanged by migration)
- End-to-end flows (existing E2E tests cover these paths)

---

## Success Criteria

1. Every list page uses `PageShell`, `PageHeader`, `SearchBar`, `EmptyState`, and `ErrorState`.
2. Every detail page uses `PageShell`, `PageHeader`, `DetailHero`, and `PrimaryTabs`.
3. Zero custom tab CSS files remain (`.myk9-dog-tabs`, `.myk9-club-tabs`, `.myk9-sub-tabs` all deleted).
4. Zero `!important` overrides on tab styling.
5. All primary tabs are URL-synced -- `?tab=overview` deep-links work on every detail page.
6. TrialDetailsPage is under 500 lines.
7. All pages have error states with retry capability.
8. Dog cards display registration numbers and organization.
9. `pnpm typecheck` and `pnpm lint` pass with zero errors.
10. All existing tests continue to pass; new tests cover migrated state handling.
