# CRM-Inspired UX Improvements Plan

Implementation plan for patterns identified in [crm-ux-inspiration.md](../crm-ux-inspiration.md).
Organized into 4 phases: Quick Wins, Record Pages, Interactive Data, and Intelligence Layer.

---

## Phase 1: Quick Wins (1 session each)

Low-effort changes that immediately improve the feel of the app.

### 1.1 Quick Filters Above Tables

**Goal:** Move the 3-4 most-used filter dropdowns out of the collapsible panel into a persistent row above every browse page table.

**Pages to update:**

- `BrowseShowsPage.tsx` — Status | Organization | Date Range
- `BrowseDogsPage.tsx` — Breed | Sex | Status
- `BrowsePeoplePage.tsx` — Role | Location
- `BrowseClubsPage.tsx` — Organization type

**Implementation:**

1. Create `QuickFilterBar` component — horizontal row of compact Select dropdowns
2. Keep "Advanced Filters" button that expands full filter panel (existing behavior)
3. Quick filters sync with advanced panel state (same hook, same URL params)
4. Active filter count badge on "Advanced Filters" button

**Files:** Each browse page + new `src/components/common/QuickFilterBar.tsx`

---

### 1.2 Highlight Widgets on Detail Pages

**Goal:** Add 4 StatCard metrics to the top of every detail page, visible without scrolling.

**Metrics per record type:**
| Record | Stat 1 | Stat 2 | Stat 3 | Stat 4 |
|--------|--------|--------|--------|--------|
| Dog | Total Shows | Titles Earned | Qualifying Rate | Career High Score |
| Show | Total Entries | Classes | Days Until Show | Revenue |
| Person (judge) | Shows Judged | Upcoming | Avg Class Size | Qualification Status |
| Person (exhibitor) | Active Dogs | Entries This Season | Titles This Year | Win Rate |
| Trial | Classes | Entries | Qualified Rate | Judges |
| Class | Entries | Qualified | Avg Score | Time Limit |

**Implementation:**

1. Reuse existing `StatCard` from `src/components/ui/stat-card.tsx`
2. Create a `RecordStatsRow` wrapper — responsive 4-column grid that collapses to 2x2 on mobile
3. Add to each detail page between the header/hero and the tabs
4. Data comes from existing queries (no new API calls needed for most)

**Files:** Each detail page's Main component + new `src/components/common/RecordStatsRow.tsx`

---

### 1.3 Quick-Action Buttons on Record Headers

**Goal:** Surface the 2-3 most common actions as prominent buttons at the top of every record page (HubSpot pattern).

**Actions per record type:**
| Record | Action 1 | Action 2 | Action 3 |
|--------|----------|----------|----------|
| Show | Add Entry | Edit Show | Print |
| Dog | Enter Show | Edit Dog | View Owner |
| Person | Assign to Show | Edit Person | View Dogs |
| Trial | Add Class | Edit Trial | Print Run Order |
| Class | Add Entry | Edit Class | Print Score Sheet |

**Implementation:**

1. Create `RecordActions` component — horizontal button row with primary + secondary variants
2. Place in record header area, right-aligned on desktop, full-width on mobile
3. Wire to existing handlers (panel opens, dialogs, navigation)

**Files:** Each detail page header + new `src/components/common/RecordActions.tsx`

---

### 1.4 Remembered Tab Preferences

**Goal:** When navigating back to a record page, return to the last-viewed tab instead of always resetting to the first tab.

**Implementation:**

1. Create `useRememberedTab(pageKey: string, defaultTab: string)` hook
2. Stores last-selected tab per page key in `localStorage`
3. Falls back to URL param `?tab=` if present, then localStorage, then default
4. Replace direct tab state management in each detail page

**Files:** New `src/hooks/useRememberedTab.ts`, update each detail page

---

### 1.5 "Show Only Filled Fields" Toggle

**Goal:** On record detail sections with many optional fields, add a toggle to hide empty fields (Pipedrive's signature pattern).

**Implementation:**

1. Create `CollapsibleFieldSection` component with a "Hide empty" toggle
2. Fields with null/undefined/empty string values are hidden when toggle is on
3. Toggle state persisted in localStorage per section
4. Show count: "Showing 8 of 14 fields"

**Files:** New `src/components/common/CollapsibleFieldSection.tsx`, apply to dog info cards, show details grid, class details sections

---

## Phase 2: Three-Panel Record Pages (2-3 sessions)

The biggest structural change — unify all detail pages into a consistent three-panel layout.

### 2.1 RecordPageLayout Component

**Goal:** Create a reusable layout component that all detail pages share.

**Structure:**

```
+--------------------------------------------------+
| Breadcrumb                          [Actions]     |
+--------------------------------------------------+
| [Stat1] [Stat2] [Stat3] [Stat4]                  |
+--------------------------------------------------+
| Left Sidebar    | Center Content   | Right Sidebar|
| (Properties)    | (Tabs)           | (Associations)|
| 280px fixed     | Flex             | 300px fixed   |
|                 |                  |               |
| Collapsible     | Overview         | Related       |
| field sections  | Activity         | records as    |
|                 | History          | preview cards |
| Independent     | Custom tabs      |               |
| scroll          | Independent      | Independent   |
|                 | scroll           | scroll        |
+--------------------------------------------------+
```

**Responsive behavior:**

- Desktop (>1280px): Three columns
- Tablet (768-1280px): Two columns (left sidebar collapses to top, right sidebar becomes tab)
- Mobile (<768px): Single column (properties above tabs, associations as final tab)

**Implementation:**

1. Create `src/components/layout/RecordPageLayout.tsx`
   - Props: `breadcrumbs`, `stats`, `actions`, `properties`, `tabs`, `associations`
   - Each panel scrolls independently
   - Left sidebar sections are collapsible (remembers state)
2. Create `PropertySection` — label-value pairs with inline edit support
3. Create `AssociationCard` — compact preview of a related record with link

**Files:**

- New `src/components/layout/RecordPageLayout.tsx`
- New `src/components/layout/record/PropertySection.tsx`
- New `src/components/layout/record/AssociationCard.tsx`
- New `src/components/layout/record/RecordPageLayout.types.ts`

---

### 2.2 Migrate Dog Detail Page

**Goal:** First page to adopt the new layout (dog has the richest data model).

**Left Sidebar (Properties):**

- About: Name, breed, sex, color, DOB, age
- Registration: Reg number, organization, status
- Physical: Weight, height, markings
- Health: Vaccination status, last vet visit
- Owner: Name (linked), contact

**Center (Tabs):**

- Overview (career highlights, recent activity)
- Competitions (show history, results)
- Titles (progress tracking)
- Health Records
- Training Journal
- Pedigree

**Right Sidebar (Associations):**

- Owner card (with link to person)
- Active entries (upcoming shows)
- Recent titles/awards

**Files:** Refactor `DogDetailPage.tsx`, `DogDetailsMain/index.tsx`, and sub-components

---

### 2.3 Migrate Show Detail Page

**Left Sidebar:**

- About: Name, status, organization
- Dates: Start, end, entry open, entry close
- Location: Venue, address, city, state
- Officials: Chairman, secretary, chief steward
- Fees: Pre-entry fee, day-of fee

**Center (Tabs):**

- Overview (stats, quick info)
- Trials (trial cards)
- Entries (entry table — new, from Pattern #3 in TO-DOS)
- Classes (class grid)
- Results (after show day)
- Management (secretary/admin only)

**Right Sidebar:**

- Host club card (with link)
- Judge cards (assigned judges)
- Entry stats summary

**Files:** Refactor `ShowDetailsPage.tsx`, `ShowDetailsMain.tsx`, `ShowDetailsEnhanced.tsx`

---

### 2.4 Migrate Person, Trial, Class Detail Pages

Apply the same `RecordPageLayout` pattern to remaining pages. These are simpler since they have fewer properties and associations.

**Files:** `PersonDetailPage.tsx`, `TrialDetailsPage.tsx`, `ClassDetailsPage/index.tsx`

---

## Phase 3: Interactive Data Views (2-3 sessions)

Make data exploration feel fluid and powerful.

### 3.1 Inline Editing on Properties

**Goal:** Click any property value in the left sidebar to edit it in place. No panel needed for single-field changes.

**Implementation:**

1. Create `InlineEditableField` component
   - Display mode: renders value as text
   - Edit mode (on click): renders appropriate input (text, select, date picker)
   - Save on blur or Enter, cancel on Escape
   - Optimistic update via store, replication syncs in background
   - Loading/error states
2. `PropertySection` uses `InlineEditableField` for each row
3. Keep full Edit panel accessible via "Edit All" button for batch changes

**Field type support:** Text, number, date, select/dropdown, person picker

**Files:** New `src/components/common/InlineEditableField.tsx`, update `PropertySection`

---

### 3.2 Drag-and-Drop Pipeline

**Goal:** Make the Mission Control Kanban board interactive — drag entries/classes between stages.

**Implementation:**

1. Add `@dnd-kit/core` + `@dnd-kit/sortable` (lightweight, accessible)
2. Make `ClassPipelineCard` draggable
3. Make `ClassPipelineColumn` a drop zone
4. On drop: optimistic status update via store, no confirmation dialog
5. Visual feedback: card lifts with shadow on grab, drop zone highlights, smooth settle animation
6. Undo: toast notification with "Undo" button (5 second window)

**Files:** Update `PipelineDashboard.tsx`, `ClassPipelineColumn.tsx`, `ClassPipelineCard.tsx`, new drag context provider

---

### 3.3 Global Command Palette (Cmd+K)

**Goal:** Search across all record types from one input. Find any dog, show, person, entry, or club instantly.

**Implementation:**

1. Create `CommandPalette` component (modal overlay, search input, grouped results)
2. Keyboard shortcut: Cmd+K (Mac) / Ctrl+K (Windows)
3. Results grouped by type with icons: Dogs, Shows, People, Clubs, Entries
4. Recent searches shown on empty query
5. Keyboard navigation: arrow keys, Enter to select, Escape to close
6. Search queries multiple tables via Supabase full-text search or client-side filtering of cached data

**Files:**

- New `src/components/common/CommandPalette.tsx`
- New `src/hooks/useGlobalSearch.ts`
- Register shortcut in `App.tsx`

---

### 3.4 Saved Views

**Goal:** Let users save their column selections, filters, sorts, and view mode as named views.

**Implementation:**

1. Migration: Create `saved_views` table (id, user_id, page_key, name, config JSONB, is_default, created_at)
2. Create `ViewPicker` dropdown component — shows saved views, "Save current view," "Save as..."
3. View config stores: active filters, sort column/direction, view mode, visible columns
4. Place `ViewPicker` in the toolbar of every browse page
5. Default views: system-provided views like "Closing This Week" that users can't delete

**Files:**

- New migration for `saved_views` table
- New `src/components/common/ViewPicker.tsx`
- New `src/hooks/useSavedViews.ts`
- Update each browse page toolbar

---

## Phase 4: Intelligence Layer (2-3 sessions)

These patterns make the app proactive — it tells users what to do next.

### 4.1 Activity Timeline on Records

**Goal:** Every record gets a chronological activity feed.

**Implementation:**

1. Migration: Create `activity_log` table (id, record_type, record_id, action, actor_id, metadata JSONB, created_at)
2. Create database triggers or application-level logging for key events:
   - Entry: created, status changed, payment received, checked in, scored
   - Show: created, entries opened/closed, published, completed
   - Dog: registered, entered show, scored, title earned
   - Person: role assigned, show assigned, qualification updated
3. Create `ActivityTimeline` component — vertical timeline with icon, actor, action, timestamp
4. Add as a tab in the center panel of each record page
5. Pin upcoming/overdue items to top with color coding (green=upcoming, red=overdue)

**Files:**

- New migration for `activity_log` table + RLS
- New `src/components/common/ActivityTimeline.tsx`
- New `src/hooks/useActivityLog.ts`
- Application-level event logging in stores/mutations

---

### 4.2 Progressive Tip Banners

**Goal:** Guide users to features they haven't discovered yet, triggered by milestones.

**Milestones and tips:**
| Milestone | Tip |
|-----------|-----|
| First login | "Welcome! Start by adding your dogs to your profile." |
| First dog added | "Your dog is registered! Browse shows to find your first event." |
| First show created | "Tip: You can import entries from a CSV file." |
| First show completed | "Did you know you can print run orders and score sheets?" |
| 5 shows completed | "Consider setting up automated results notifications." |
| First time on empty entries page | Show illustration of what a populated entries table looks like |

**Implementation:**

1. Migration: Create `user_milestones` table (user_id, milestone_key, achieved_at, tip_dismissed)
2. Create `TipBanner` component — dismissible banner with icon, message, optional CTA
3. Create `useMilestones` hook — checks milestones, returns applicable tip
4. Milestone tracking: increment on key actions (show created, entry submitted, etc.)
5. Tips are dismissible and never show again once dismissed

**Files:**

- New migration for `user_milestones`
- New `src/components/common/TipBanner.tsx`
- New `src/hooks/useMilestones.ts`

---

### 4.3 Smart Notifications Panel

**Goal:** A non-intrusive notification panel (Pipedrive's "Sales Assistant" pattern) that surfaces actionable insights.

**Notification types:**

- "3 entries are pending payment"
- "Entry period closes tomorrow for Sunflower KC Show"
- "Dog Buddy's vaccination expires in 30 days"
- "You have 2 unscored classes from last weekend's show"
- "New entry received for Rally Novice class"

**Implementation:**

1. Create `NotificationPanel` — slide-out from right side, accessible from bell icon in header
2. Notifications are computed from data state (not a separate notification service initially)
3. Group by urgency: Action Required (red), Attention (yellow), Informational (blue)
4. Each notification has a primary action button (e.g., "View Entries," "Renew Vaccination")
5. Mark as read / dismiss

**Files:**

- New `src/components/common/NotificationPanel.tsx`
- New `src/hooks/useSmartNotifications.ts`
- Update header/navbar to include bell icon with badge count

---

### 3.5 Kanban View Mode on Browse Pages [ADDED]

**Goal:** Add Kanban as a fourth view mode on browse pages where records have a status/stage field. Completes the table/kanban/calendar trifecta from all three CRMs.

**Pages that gain Kanban:**

- **Shows** — Columns: Planning | Entries Open | Entries Closed | Show Day | Results Published | Archived
- **Entries** — Columns: Draft | Submitted | Confirmed | Checked In | Scored | Placed

**Implementation:**

1. Create `KanbanView` component — reuse the column/card pattern from existing `ClassPipelineColumn`/`ClassPipelineCard`
2. Add `'kanban'` to the `ViewMode` type alongside `'grid' | 'list' | 'table'`
3. Kanban view shares the same filters and data source as other views
4. Cards show the same fields as grid view cards (compact)
5. Drag-and-drop between columns (reuse 3.2 DnD infrastructure)

**Files:** New `src/components/common/KanbanView.tsx`, update ViewMode type, update BrowseShowsPage and entry pages

**Effort:** Medium (1 session) — mostly composition of existing patterns once 3.2 DnD is done

**Dependency:** 3.2 (Drag-and-Drop Pipeline) should land first so DnD is reusable

---

## Cross-Cutting Concerns [ADDED]

These apply to every phase and every item.

### Error Handling

- **Inline editing (3.1):** On save failure, revert to previous value, show inline error toast ("Failed to save — try again"), log to console. Never leave the field in an ambiguous state.
- **Drag-and-drop (3.2):** On status update failure, animate card back to original column, show undo-style toast ("Move failed — card returned"). Use optimistic update pattern from replication layer.
- **Command palette (3.3):** On search error, show "Search unavailable" in results area with retry button. Debounce queries (300ms) to avoid hammering Supabase.
- **Activity timeline (4.1):** Activity log writes are fire-and-forget — failures are logged but don't block the user action that triggered them. Timeline display gracefully handles empty/error states.
- **General:** All new hooks follow existing React Query error patterns (onError callbacks, error boundaries for components).

### Performance

- **activity_log table:** Add index on `(record_type, record_id, created_at DESC)`. Add retention policy — archive entries older than 2 years. Paginate timeline queries (50 per page, load more on scroll).
- **Command palette search:** Debounce 300ms. Search cached Zustand store data first (instant), then fall back to Supabase `ilike` queries. Limit results to 5 per type (25 total). Consider adding `pg_trgm` extension + GIN indexes if search volume warrants it.
- **Stat card queries:** Use existing React Query cached data where possible. For computed stats (qualifying rate, career high), add Supabase RPC functions to avoid N+1 client-side aggregation. Apply `cacheStrategies.moderate` (5min).
- **Saved views:** Views config is small JSON — no performance concern. Query uses user_id index.
- **RecordPageLayout:** Three independent scroll containers use CSS `overflow-y: auto`, no virtualization needed (content is bounded).

### Database Migrations [ADDED]

All new tables follow existing migration numbering convention (`supabase/migrations/0XX_*.sql`).

| Table             | Columns                                                                                                             | Indexes                                                                    | RLS                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `activity_log`    | id UUID PK, record_type TEXT, record_id UUID, action TEXT, actor_id UUID FK, metadata JSONB, created_at TIMESTAMPTZ | `(record_type, record_id, created_at DESC)`, `(actor_id, created_at DESC)` | SELECT: authenticated users can read logs for records they have access to. INSERT: authenticated users (application writes). No UPDATE/DELETE. |
| `saved_views`     | id UUID PK, user_id UUID FK, page_key TEXT, name TEXT, config JSONB, is_default BOOLEAN, created_at TIMESTAMPTZ     | `(user_id, page_key)`                                                      | Full CRUD scoped to own user_id (`auth.uid() = user_id`)                                                                                       |
| `user_milestones` | user_id UUID FK, milestone_key TEXT, achieved_at TIMESTAMPTZ, tip_dismissed BOOLEAN                                 | PK on `(user_id, milestone_key)`                                           | Full CRUD scoped to own user_id                                                                                                                |

### Testing Strategy [ADDED]

Each phase includes testing as part of "done". No phase is complete until its tests are written and passing.

- **Phase 1:** Unit tests for `FilterBar` (renders dropdowns from definitions, calls onStateChange, clear all resets), `useRememberedTab` (persists to localStorage, URL param override, default fallback, corrupt localStorage handling). Existing browse page tests must still pass.
- **Phase 2:** Unit tests for `RecordPageLayout` (renders 3 panels, passes children to center, renders breadcrumb/stats), `PropertySection` (renders field labels/values, renders custom render prop, renders InlineEditableField when onSave provided, handles null values, renders suffix). Existing detail page tests updated to match new structure.
- **Phase 3:** Unit tests for `InlineEditableField` (display→edit on click, Enter saves, Escape cancels, blur saves, error state, savingRef race guard, success checkmark), `KanbanView` (renders columns with headers/counts, groups items by status, renderCard prop, empty column "No items"), `ViewPicker` (renders "Views" default, view list in dropdown, save dialog open/close/disabled, delete/star handlers), `useSavedViews` (save/update/delete/setDefault/apply/clear, localStorage persistence, corrupt data handling). DnD: manual testing (drag interactions are hard to unit test reliably).
- **Phase 4:** Unit tests for `ActivityTimeline` (renders events in chronological order, pagination/load more, empty state, pinned upcoming/overdue events with color coding, event type icons), `useActivityLog` (fetches paginated events, handles error state, filters by record type/id), `TipBanner` (renders with icon/message/CTA, dismiss persists via localStorage/milestone table, animate-in on mount, never shows after dismissal), `useMilestones` (checks milestone conditions from data state, returns applicable tip, respects dismissals), `useSmartNotifications` (computes notifications from data — pending payments, closing entries, expiring vaccinations, unscored classes; groups by urgency; mark-as-read persists), `NotificationPanel` (renders grouped notifications with urgency indicators, action buttons navigate, bell icon shows badge count).
- **Quality gate:** Every session ends with `pnpm typecheck && pnpm lint && pnpm test` passing.

### Accessibility [ADDED]

- **Inline editing (3.1):** `role="button"` + `aria-label="Edit [field name]"` on display mode. Focus moves to input on activation. `aria-live="polite"` region announces save success/failure.
- **Drag-and-drop (3.2):** @dnd-kit provides built-in keyboard DnD (Space to grab, arrows to move, Space to drop) and screen reader announcements. Ensure custom announcements describe the stage change.
- **Command palette (3.3):** `role="combobox"` + `aria-expanded` + `aria-activedescendant` for results. `role="option"` on each result. Focus trap within modal.
- **Activity timeline (4.1):** `role="feed"` with `aria-label="Activity timeline"`. Each entry is an `article` with timestamp.
- **CollapsibleFieldSection (1.5):** `aria-expanded` on toggle, `aria-controls` linking to content region.

### Incremental Migration Strategy [ADDED]

Record pages are migrated one at a time. During migration:

- Old and new layouts coexist — no big-bang switch.
- `RecordPageLayout` is purely a layout container; it doesn't own data fetching. Each page continues to use its existing hooks/queries.
- Existing sub-components (DogInfoCards, ShowDetailsEnhanced, etc.) are reused inside the new layout's panels — they are repositioned, not rewritten.
- If a migration introduces regressions, the page can revert to the old layout by swapping the import (the old components aren't deleted until all pages are migrated and stable).

### File Size Management [ADDED]

- `RecordPageLayout.tsx` — Types in `RecordPageLayout.types.ts`, sub-components in `record/` folder (PropertySection, AssociationCard, RecordStatsRow). Main file stays under 300 lines.
- `CommandPalette.tsx` — Search logic in `useGlobalSearch.ts` hook, result rendering in `CommandPaletteResults.tsx`. Main file under 200 lines.
- `ActivityTimeline.tsx` — Event rendering in `ActivityTimelineEvent.tsx`, data fetching in `useActivityLog.ts`. Main file under 200 lines.

---

## Implementation Order and Dependencies

```
Phase 1 (Quick Wins) — no dependencies, can be done in any order
  1.1 Quick Filters ─────────────────────────────────────────────┐
  1.2 Highlight Widgets ─────────────────────────────────────────┤
  1.3 Quick-Action Buttons ──────────────────────────────────────┤
  1.4 Remembered Tabs ──────────────────────────────────────────┤
  1.5 Show Only Filled Fields ──────────────────────────────────┘
                                                                 │
Phase 2 (Record Pages) — sequential                              │
  2.1 RecordPageLayout component ◄───────────────────────────────┘
       │
  2.2 Dog Detail migration ◄─── uses 2.1, 1.2, 1.3, 1.5
       │
  2.3 Show Detail migration ◄── uses 2.1
       │
  2.4 Person/Trial/Class ◄───── uses 2.1

Phase 3 (Interactive Data) — mostly independent
  3.1 Inline Editing ◄────────── requires 2.1 (PropertySection)
  3.2 Drag-and-Drop Pipeline ── independent
  3.3 Command Palette ────────── independent
  3.4 Saved Views ────────────── independent
  3.5 Kanban View Mode ◄──────── requires 3.2 (reuses DnD) [ADDED]

Phase 4 (Intelligence Layer) — independent of each other
  4.1 Activity Timeline ◄─────── requires 2.1 (adds tab)
  4.2 Tip Banners ────────────── independent
  4.3 Smart Notifications ────── independent
```

---

## Effort Estimates

| Item                        | Effort      | Sessions           |
| --------------------------- | ----------- | ------------------ |
| **Phase 1 total**           | Low         | 3-4 sessions       |
| 1.1 Quick Filters           | Low         | 1                  |
| 1.2 Highlight Widgets       | Low         | 0.5                |
| 1.3 Quick-Action Buttons    | Low         | 0.5                |
| 1.4 Remembered Tabs         | Low         | 0.5                |
| 1.5 Show Only Filled Fields | Low         | 0.5                |
| **Phase 2 total**           | Medium-High | 4-5 sessions       |
| 2.1 RecordPageLayout        | Medium      | 1-2                |
| 2.2 Dog Detail migration    | Medium      | 1                  |
| 2.3 Show Detail migration   | Medium      | 1                  |
| 2.4 Remaining pages         | Medium      | 1                  |
| **Phase 3 total**           | Medium-High | 5-7 sessions       |
| 3.1 Inline Editing          | Medium      | 1                  |
| 3.2 Drag-and-Drop Pipeline  | Medium      | 1                  |
| 3.3 Command Palette         | Medium      | 1                  |
| 3.4 Saved Views             | Medium      | 1-2                |
| 3.5 Kanban View Mode        | Medium      | 1 [ADDED]          |
| **Phase 4 total**           | Medium-High | 3-4 sessions       |
| 4.1 Activity Timeline       | High        | 1-2                |
| 4.2 Tip Banners             | Low         | 0.5                |
| 4.3 Smart Notifications     | Medium      | 1-2                |
| **Grand total**             |             | **15-20 sessions** |

---

## Visual Design Specs [ADDED]

Every new component must match our existing design language. This section defines the visual treatment for each new pattern using our established tokens.

### Design System Quick Reference

| Token         | Value                                                                | Usage                  |
| ------------- | -------------------------------------------------------------------- | ---------------------- |
| Font          | Montserrat                                                           | All UI text            |
| Card bg       | `bg-card/95 backdrop-blur-sm`                                        | Elevated surfaces      |
| Card radius   | `rounded-xl`                                                         | All cards              |
| Card shadow   | `shadow-sm` → `hover:shadow-md`                                      | Resting → hover        |
| Card hover    | `hover:-translate-y-0.5 transition-all duration-300`                 | Lift effect            |
| Primary       | `var(--primary)` / teal `#14b8a6`                                    | Actions, active states |
| Icon bg       | `p-2 bg-primary/10 rounded-lg`                                       | Icon containers        |
| Muted text    | `text-sm text-muted-foreground`                                      | Secondary info         |
| Label         | `text-xs font-medium text-muted-foreground uppercase tracking-wider` | Section headers        |
| Border        | `border-border/50`                                                   | Subtle dividers        |
| Button height | `h-11` (44px)                                                        | Touch target minimum   |
| Easing        | `cubic-bezier(0.25, 0.46, 0.45, 0.94)`                               | All transitions        |
| Glass         | `backdrop-filter: blur(20px)`                                        | Premium overlays       |

### Component Visual Specs

#### QuickFilterBar (1.1)

```
Container: flex items-center gap-3 px-0 py-2
           (no background — sits inline above the table, not in a card)

Each filter dropdown:
  - Use existing Select component (rounded-lg, border-border, bg-input)
  - Compact size: h-9 text-sm
  - Label inside placeholder: "Status", "Breed", etc.
  - When active: border-primary/40, bg-primary/5

"Advanced Filters" button:
  - variant="outline" size="sm"
  - SlidersHorizontal icon from lucide
  - Badge count: bg-primary text-primary-foreground rounded-full
    min-w-5 h-5 text-xs (overlaid on button, top-right)

Active filter chips (below bar):
  - Existing Badge component with variant="secondary"
  - X icon to remove, "Clear all" link at end
```

#### RecordStatsRow (1.2)

```
Container: grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6

Cards: Reuse StatCard exactly as-is:
  bg-card/95 backdrop-blur-sm border-border/50 shadow-sm
  hover:shadow-md hover:-translate-y-0.5 transition-all duration-300

  Icon: p-2 bg-primary/10 rounded-lg
        h-4 w-4 text-primary

  Label: text-xs font-medium text-muted-foreground uppercase tracking-wider
  Value: text-3xl font-bold
  Subtitle: text-sm text-muted-foreground mt-1
```

#### RecordActions (1.3)

```
Container: flex items-center gap-2 (right-aligned in header)
           On mobile: flex-wrap w-full gap-2

Primary action: Button variant="default" (teal bg)
Secondary actions: Button variant="outline"
Overflow: MoreHorizontal icon button → DropdownMenu

All buttons: size="default" (h-11, 44px touch target)
Icons: h-4 w-4 in gap-2 with text
```

#### CollapsibleFieldSection (1.5)

```
Container: rounded-xl border border-border/50 bg-card/95

Header (clickable):
  flex items-center justify-between p-4
  cursor-pointer hover:bg-muted/30 transition-colors

  Title: text-sm font-semibold
  Right side: flex items-center gap-3
    Count: text-xs text-muted-foreground ("8 of 14")
    Toggle: Switch component (existing) labeled "Hide empty"
    Chevron: ChevronDown, rotate-180 when expanded
             transition-transform duration-200

Content:
  Animate expand/collapse with accordion-down/up keyframes
  divide-y divide-border/30

  Each field row:
    flex items-center justify-between py-2.5 px-4
    Label: text-sm text-muted-foreground w-1/3
    Value: text-sm font-medium text-foreground
    Empty value: text-sm text-muted-foreground/50 italic ("Not set")
```

#### RecordPageLayout (2.1)

```
Full layout:
  flex flex-col h-[calc(100vh-4rem)]  (below header)

Top bar:
  flex items-center justify-between px-6 py-3
  border-b border-border/30
  Left: Breadcrumb (existing component)
  Right: RecordActions

Stats row:
  px-6 py-4
  border-b border-border/30
  RecordStatsRow inside

Three-panel body:
  flex flex-1 overflow-hidden

  Left sidebar:
    w-[280px] min-w-[280px] border-r border-border/30
    overflow-y-auto
    bg-card/50  (slightly different from center to create depth)
    p-4 space-y-4
    CollapsibleFieldSection components stacked

  Center panel:
    flex-1 overflow-y-auto
    p-6
    Tabs component (existing) at top
    Tab content below

  Right sidebar:
    w-[300px] min-w-[300px] border-l border-border/30
    overflow-y-auto
    bg-card/50
    p-4 space-y-4
    AssociationCard components stacked

Responsive:
  lg (< 1280px): Hide right sidebar, add "Related" as last tab
  md (< 768px):  Left sidebar collapses to horizontal card row above tabs
                 Properties shown as compact 2-col grid
```

#### AssociationCard (2.1)

```
Container:
  rounded-xl border border-border/50 bg-card/95
  p-3 space-y-2
  hover:shadow-sm hover:border-primary/20 transition-all duration-200
  cursor-pointer (links to record)

Header:
  flex items-center gap-2
  Icon: p-1.5 bg-primary/10 rounded-lg, h-3.5 w-3.5 text-primary
  Title: text-sm font-semibold truncate
  ArrowUpRight icon: h-3 w-3 text-muted-foreground (link indicator)

Content:
  text-xs text-muted-foreground
  1-2 lines of key info (e.g., "Golden Retriever | 3 years old")

Badge (optional):
  Existing Badge component, variant="secondary", positioned top-right
  For status indicators (e.g., "Active", "2 entries")
```

#### InlineEditableField (3.1)

```
Display mode:
  flex items-center gap-2 py-1.5 px-2 -mx-2
  rounded-lg
  hover:bg-muted/30 cursor-pointer transition-colors duration-150
  group

  Value: text-sm font-medium
  Edit icon: Pencil h-3 w-3 text-muted-foreground
             opacity-0 group-hover:opacity-100 transition-opacity

Edit mode:
  Same position/size as display mode (no layout shift)
  Input: border-primary/40 ring-2 ring-primary/20
         text-sm font-medium
         auto-focus, auto-select text

  Saving: Spinner icon replaces edit icon, opacity pulse on value

  Error: border-destructive/40 ring-2 ring-destructive/20
         text-xs text-destructive below field, fade-in

  Success: Brief green check icon (0.5s), then back to display mode
```

#### CommandPalette (3.3)

```
Overlay:
  fixed inset-0 bg-background/60 backdrop-blur-sm z-[1000]
  animate-in fade-in duration-150

Dialog:
  fixed top-[20%] left-1/2 -translate-x-1/2
  w-full max-w-xl
  rounded-xl border border-border/50
  bg-card shadow-xl
  overflow-hidden

Search input:
  border-0 border-b border-border/30
  h-14 px-4 text-lg
  placeholder="Search dogs, shows, people..."
  bg-transparent focus:ring-0
  Search icon: h-5 w-5 text-muted-foreground absolute left-4

Results area:
  max-h-80 overflow-y-auto py-2

  Group header:
    px-4 py-2
    text-xs font-medium text-muted-foreground uppercase tracking-wider
    flex items-center gap-2
    Icon: h-3.5 w-3.5

  Result item:
    px-4 py-2.5
    flex items-center gap-3
    hover:bg-muted/50 rounded-lg mx-2
    transition-colors duration-100

    Active (keyboard): bg-primary/10 text-primary

    Icon: p-1.5 bg-primary/10 rounded-lg
    Title: text-sm font-medium
    Subtitle: text-xs text-muted-foreground
    Right: text-xs text-muted-foreground (type badge)

Footer:
  border-t border-border/30 px-4 py-2
  flex items-center gap-4
  text-xs text-muted-foreground
  Keyboard hints: "↑↓ navigate  ↵ open  esc close"
  Each key: px-1.5 py-0.5 bg-muted rounded text-xs font-mono
```

#### ActivityTimeline (4.1)

```
Container: space-y-0 relative
  Left border line: absolute left-[19px] top-0 bottom-0 w-px bg-border/50

Each event:
  flex gap-4 py-3 relative

  Timeline dot:
    w-[10px] h-[10px] rounded-full mt-1.5
    bg-primary (for positive events)
    bg-warning-orange (for attention events)
    bg-destructive (for negative events)
    bg-muted-foreground/30 (for neutral/system events)
    ring-4 ring-card (creates gap between dot and line)

  Content:
    flex-1 min-w-0

    Header: flex items-center gap-2 flex-wrap
      Action text: text-sm font-medium
      Actor: text-sm text-muted-foreground
      Timestamp: text-xs text-muted-foreground ml-auto

    Detail: text-sm text-muted-foreground mt-0.5

  Upcoming/pinned events:
    bg-primary/5 -mx-4 px-4 py-3 rounded-lg border-l-2 border-primary

  Overdue events:
    bg-destructive/5 -mx-4 px-4 py-3 rounded-lg border-l-2 border-destructive

Load more:
  Button variant="ghost" size="sm" centered
  "Load older activity"
```

#### TipBanner (4.2)

```
Container:
  flex items-start gap-3 p-4 rounded-xl
  bg-primary/5 border border-primary/20
  mb-4 (space before content)
  animate-in slide-in-from-top-2 duration-300

  Icon: Lightbulb h-5 w-5 text-primary mt-0.5
  Content: flex-1
    Title: text-sm font-semibold
    Message: text-sm text-muted-foreground mt-0.5
    CTA: Button variant="link" size="sm" className="p-0 h-auto mt-1"
  Dismiss: X icon button, ghost variant, h-8 w-8
           hover:bg-primary/10
```

#### NotificationPanel (4.3)

```
Same pattern as existing SlideOverPanel:
  Right-anchored, 400px wide, full height
  bg-card border-l border-border/50

Header:
  flex items-center justify-between px-6 py-4 border-b border-border/30
  Title: text-lg font-semibold "Notifications"
  Badge: count in bg-primary text-xs rounded-full

Notification groups:
  px-4 py-3
  Group header: text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2

  Each notification:
    p-3 rounded-xl border border-border/50
    hover:bg-muted/30 transition-colors
    mb-2

    Urgency indicator: 3px left border
      Action Required: border-l-destructive
      Attention: border-l-warning-orange
      Info: border-l-primary

    Content:
      Title: text-sm font-medium
      Detail: text-xs text-muted-foreground mt-0.5
      Time: text-xs text-muted-foreground mt-1

    Action button: Button variant="ghost" size="sm" mt-2
```

#### KanbanView (3.5)

```
Follows existing ClassPipelineColumn/ClassPipelineCard patterns:

Container: flex gap-4 overflow-x-auto pb-4 -mx-2 px-2

Column:
  min-w-[280px] max-w-[320px] flex-shrink-0
  rounded-xl bg-muted/30 border border-border/30

  Header:
    px-4 py-3 border-b border-border/30
    flex items-center justify-between
    Title: text-sm font-semibold
    Count: text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5

  Body:
    p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-16rem)]

Card (in column):
  rounded-lg border border-border/50 bg-card p-3
  hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200
  cursor-grab active:cursor-grabbing

  Dragging state:
    shadow-lg scale-105 opacity-90 rotate-1
    ring-2 ring-primary/30

  Drop target:
    Column gets: ring-2 ring-primary/20 ring-inset bg-primary/5
    Placeholder: h-20 rounded-lg border-2 border-dashed border-primary/30
```

### Dark Mode Considerations

All new components use CSS variable-based colors (`var(--background)`, `var(--card)`, etc.), which automatically adapt to dark mode. No hardcoded colors.

Specific dark mode adjustments:

- Glass overlays: increase blur from 20px to 40px
- CommandPalette overlay: `bg-background/80` (more opaque in dark)
- Timeline line: `bg-border/30` (subtler in dark)
- Notification urgency borders: same semantic colors, they contrast well on dark

### Motion & Animation Standards

All new components follow these animation rules:

| Interaction     | Duration | Easing          | Transform                    |
| --------------- | -------- | --------------- | ---------------------------- |
| Card hover      | 300ms    | `--myk9-ease`   | `-translate-y-0.5`           |
| Button press    | 150ms    | ease-out        | `translate-y-0` (reset lift) |
| Panel slide     | 300ms    | `--myk9-ease`   | `translateX(0)`              |
| Fade in         | 150ms    | ease-out        | `opacity: 0 → 1`             |
| Collapse/expand | 200ms    | ease-out        | accordion keyframes          |
| Drag lift       | 150ms    | `--myk9-spring` | `scale(1.05)`                |
| Drop settle     | 200ms    | `--myk9-ease`   | `scale(1)`                   |

`prefers-reduced-motion: reduce` — all animations collapse to 100ms, no transforms.

---

## Design Principles (Apply Throughout)

From the CRM research, these principles guide every implementation:

1. **Activity-first** — Always answer "what do I need to do next?" before "what happened?"
2. **One-screen test** — Any core task completable from a single screen
3. **Color for semantics** — Reserve color for status; keep chrome monochrome
4. **Optimistic updates** — UI responds immediately; sync in background
5. **Progressive disclosure** — Collapsible sections over separate pages; inline editing over panels for simple changes
6. **Function and aesthetics are the same thing** — Polish isn't a nice-to-have
7. **Match the system** — Every new component uses existing tokens, spacing, and interaction patterns. No new colors, no new fonts, no new shadow scales. [ADDED]
