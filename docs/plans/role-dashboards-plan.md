# Role-Based Dashboards Plan

**Purpose:** Give each role a sidebar-driven "command center" dashboard modeled after the Secretary Mission Control pattern.

**Status:** Plan only.

**Related plans:** [judge-analytics-plan.md](judge-analytics-plan.md), [availability-persistence-plan.md](availability-persistence-plan.md)

---

## Current State

### What Exists

| Component             | Secretary                             | Judge                                   | Exhibitor                            | Admin                             |
| --------------------- | ------------------------------------- | --------------------------------------- | ------------------------------------ | --------------------------------- |
| `*Layout` wrapper     | SecretaryLayout                       | **None**                                | ExhibitorLayout                      | AdminLayout                       |
| `*Sidebar`            | SecretarySidebar (5 groups, 12 items) | **None**                                | ExhibitorSidebar (4 groups, 8 items) | AdminSidebar (5 groups, 15 items) |
| Dashboard page        | PipelineDashboard (Mission Control)   | JudgeDashboard (standalone, no sidebar) | ExhibitorDashboard (inside layout)   | AdminDashboard                    |
| Route prefix          | `/secretary/*`                        | `/judge/*` (no layout parent)           | `/exhibitor/*`                       | `/admin/*`                        |
| Collapsible sidebar   | Yes (hover-to-expand)                 | N/A                                     | No                                   | No                                |
| Show/context selector | ShowContextRow + TrialContextRow      | None                                    | None                                 | None                              |
| INTENT word           | "That was easy"                       | "Invisible technology"                  | "This respects my time"              | "The platform is healthy"         |

### Shared Infrastructure Already In Place

- **`SidebarLayout`** (`components/layout/SidebarLayout.tsx`) — The reusable core. All three existing `*Layout` wrappers delegate to it. Props: `sidebar`, `children`, `sidebarWidth`, `isCollapsible`, `hoverToExpand`, `collapsedWidth`, `mobileOpen`, `mobileMenuLabel`.
- **Sidebar pattern** — All three existing sidebars share identical structure: header (icon + title), NavGroups with items (icon + title + description), active route highlighting, footer (role badge + access level).
- **`EmbeddedPageWrapper`** — Strips standalone page styling when embedding shared pages (shows, dogs, people) inside a sidebar layout.

### Key Insight

The layout infrastructure is already reusable. The gap is:

1. Judge has no layout wrapper or sidebar
2. Exhibitor layout exists but the dashboard content is basic (stats cards + entry list)
3. No shared context-row pattern (show selector + stats) — only secretary has it

---

## Design Principles

Each dashboard must serve its role's INTENT:

| Role      | Intent                  | Dashboard Should Feel Like...                                  |
| --------- | ----------------------- | -------------------------------------------------------------- |
| Secretary | "That was easy"         | A command center. Everything at my fingertips.                 |
| Judge     | "Invisible technology"  | A brief glance before I focus on the dog. Minimal, fast.       |
| Exhibitor | "This respects my time" | My personal hub. My dogs, my entries, my results — no hunting. |

**Important:** Don't force the Secretary's complexity onto simpler roles. The judge sidebar should be slim. The exhibitor sidebar should be focused on their dogs and entries.

---

## Implementation Plan

### Phase 1: Judge Dashboard Layout (Highest Impact)

The judge currently has no sidebar or layout wrapper. This is the biggest gap.

#### Step 1a: Create JudgeLayout

**New file:** `apps/myk9show/src/components/judge/JudgeLayout.tsx`

```typescript
// Same pattern as SecretaryLayout
const JudgeLayout: React.FC = () => (
  <SidebarLayout
    sidebar={<JudgeSidebar />}
    sidebarWidth={240}
    collapsedWidth={56}
    isCollapsible={true}
    hoverToExpand={true}
    mobileMenuLabel="Judge Console"
  >
    <Outlet />
  </SidebarLayout>
);
```

#### Step 1b: Create JudgeSidebar

**New file:** `apps/myk9show/src/components/judge/JudgeSidebar.tsx`

Keep it minimal — judges want "invisible technology," not a nav tree.

```
JudgeSidebar
├── Header: Scale icon + "Judge Console"
├── Nav Groups:
│   ├── Overview
│   │   └── Dashboard (home view — today's assignments)
│   ├── Scoring
│   │   └── Active Classes (link to assigned classes)
│   ├── My Info
│   │   ├── My Stats (season analytics — from judge-analytics-plan)
│   │   └── Qualifications
│   └── Browse
│       ├── Shows
│       └── People
└── Footer: "Judge Access" + "Scoring and evaluation privileges"
```

**~6 items total** — intentionally fewer than secretary's 12. Judges shouldn't have to think about navigation.

#### Step 1c: Restructure Judge Routes

**Edit:** `apps/myk9show/src/routes/judgeRoutes.tsx`

Wrap judge routes in `JudgeLayout`:

```typescript
// Before: standalone routes
<Route path="/judge/dashboard" element={<JudgeDashboard />} />
<Route path="/judge/check-in" element={<JudgeCheckInDashboard />} />

// After: layout parent
<Route path="/judge" element={<JudgeLayout />}>
  <Route path="dashboard" element={<JudgeDashboard />} />
  <Route path="check-in" element={<JudgeCheckInDashboard />} />
  <Route path="stats" element={<JudgeStatsPage />} />
  <Route path="qualifications" element={<JudgeQualificationsPage />} />
  <Route path="shows" element={<EmbeddedPageWrapper><BrowseShowsPage /></EmbeddedPageWrapper>} />
  <Route path="people" element={<EmbeddedPageWrapper><BrowsePeoplePage /></EmbeddedPageWrapper>} />
</Route>

// Scoring routes stay standalone (no sidebar — eyes on dog)
<Route path="/shows/:showId/trials/:trialId/classes/:classId/judge" element={<JudgeScoringPage />} />
```

**Critical:** Scoring pages must NOT use the sidebar layout. When a judge is scoring, the full screen is dedicated to the dog. The sidebar is only for the "between classes" workflow.

**[ADDED] Route Guards:** Wrap the `/judge` parent route with `ProtectedRoute` requiring judge role, matching the pattern from `secretaryRoutes.tsx` and `adminRoutes.tsx`. Non-judges navigating to `/judge/*` should redirect to their appropriate dashboard.

#### Step 1d: Enhance JudgeDashboard Content

**Edit:** `apps/myk9show/src/pages/JudgeDashboard.tsx`

Remove the standalone page padding (now provided by layout). Add:

- **Assignment Context Row** — Similar to ShowContextRow but for "Today's Show" with assignment-level stats (classes assigned, entries to judge, scored so far)
- **Integrate analytics** from `judge-analytics-plan.md` as a tab or section

**[ADDED] Data Hook:** Create `useJudgeDashboardData(personId)` hook that fetches:

- Today's assignments via `judge_assignments` joined with `shows`/`classes` (filter by today's date + status in ['invited','confirmed'])
- Upcoming assignments (next 30 days)
- Summary stats (classes count, entries count, scored count)

Use React Query with `cacheStrategies.dynamic` (1min) — judge dashboard should be relatively fresh.

**[ADDED] Mobile Behavior:** JudgeLayout inherits SidebarLayout's mobile support via `mobileMenuLabel="Judge Console"`. On mobile, sidebar collapses to a hamburger menu (same as SecretaryLayout). No additional mobile work needed — SidebarLayout handles it.

**[ADDED] Loading/Error/Empty States:**

- **Loading:** Skeleton cards + skeleton assignment list
- **Error:** "Unable to load assignments" with retry
- **Empty:** "No assignments today. Check your upcoming schedule below." — keep it calm, not alarming

### Phase 2: Exhibitor Dashboard Enhancement

ExhibitorLayout and ExhibitorSidebar already exist. The gap is dashboard content richness.

#### Step 2a: Add Context to ExhibitorSidebar

**Edit:** `apps/myk9show/src/components/exhibitor/ExhibitorSidebar.tsx`

Current sidebar items are likely generic. Ensure these are present:

```
ExhibitorSidebar
├── Overview
│   └── Dashboard
├── My Dogs
│   └── Dog Profiles (list of my dogs, quick link to each)
├── Shows & Entries
│   ├── My Entries (upcoming + past)
│   ├── Find Shows (browse available shows)
│   └── Results (my results history)
├── Browse
│   ├── Dogs
│   ├── People
│   └── Clubs
└── Footer: "Exhibitor Access"
```

#### Step 2b: Enrich ExhibitorDashboard

**Edit:** `apps/myk9show/src/pages/ExhibitorDashboard.tsx`

Add a "My Dogs" context section — exhibitors think in terms of their dogs:

- **Dog Quick Cards** — Each owned dog as a compact card with: photo, call name, breed, upcoming entries count, recent result
- **Upcoming Entry Timeline** — Chronological list of entries grouped by show date
- **Results Summary** — Q/NQ breakdown across all dogs (reuse recharts pie pattern from dog stats)

Intent: "This respects my time" — everything about MY dogs and MY entries on one screen, no clicking around.

**[ADDED] Data Hook:** Create `useExhibitorDashboardData(personId)` hook that fetches:

- My dogs via `useOwnerDogsWithQuery(personId)` (already exists)
- My entries via `entries` table filtered by `handler_id` or `owner_id`
- Upcoming shows with my entries (join entries → classes → trials → shows)
- Results summary (Q/NQ counts across all entries)

Use React Query with `cacheStrategies.moderate` (5min) — exhibitor data changes less frequently than secretary pipeline.

**[ADDED] Loading/Error/Empty States:**

- **Loading:** Skeleton dog cards + skeleton entry list
- **Error:** "Unable to load your dashboard" with retry
- **Empty (no dogs):** "Add your first dog to get started" with CTA button
- **Empty (no entries):** "Find a show and enter your dogs" with link to show browser

#### Step 2c: Make ExhibitorLayout Collapsible

**Edit:** `apps/myk9show/src/components/exhibitor/ExhibitorLayout.tsx`

Add `isCollapsible={true}` and `hoverToExpand={true}` to match secretary pattern. Currently exhibitor and admin sidebars are fixed-width.

**[ADDED] Admin sidebar:** Intentionally left as fixed-width for now. Admin pages are data-dense (tables, analytics) and benefit from the wider sidebar always being visible. Revisit if users request it.

### Phase 3: Shared Components Extraction (Optional)

If the patterns from Phases 1-2 prove stable, extract shared pieces:

#### Step 3a: DashboardContextRow

**New file:** `apps/myk9show/src/components/layout/DashboardContextRow.tsx`

Generalize ShowContextRow/TrialContextRow into a reusable component:

```typescript
interface DashboardContextRowProps {
  icon: React.ComponentType;
  iconColor: string; // e.g., 'text-blue-400', 'text-amber-400'
  label: string; // e.g., 'Show', 'Trial', 'Assignment'
  items: { id: string; name: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  stats?: { icon: React.ComponentType; value: string | number; label: string }[];
}
```

Currently only secretary uses this. Extract only if judge or exhibitor dashboards need a similar selector.

#### Step 3b: StatChip Component

Already used in PipelineDashboard. If judge/exhibitor dashboards need stat chips, extract to `components/layout/StatChip.tsx`.

---

## What NOT To Do

- **Don't force secretary's pipeline/Kanban on other roles.** The pipeline view is secretary-specific. Judges need an assignment list. Exhibitors need a dog-centric portfolio.
- **Don't add sidebar to scoring pages.** Judge scoring is full-screen, distraction-free. The sidebar is for the "lobby" experience, not the "in-ring" experience.
- **Don't over-navigate.** Each role's sidebar should have the minimum items needed. If a judge only needs 6 links, that's perfect — don't pad it to match secretary's 12.
- **Don't extract shared components prematurely.** Phase 3 is optional and should only happen if the patterns from Phases 1-2 prove genuinely reusable. Three similar but slightly different components are fine.

---

## Files Changed (Summary)

### Phase 1: Judge Dashboard

| File                                                  | Change                                     |
| ----------------------------------------------------- | ------------------------------------------ |
| `apps/myk9show/src/components/judge/JudgeLayout.tsx`  | **New** — SidebarLayout wrapper            |
| `apps/myk9show/src/components/judge/JudgeSidebar.tsx` | **New** — 4 groups, ~6 items               |
| `apps/myk9show/src/routes/judgeRoutes.tsx`            | Restructure: layout parent + child routes  |
| `apps/myk9show/src/pages/JudgeDashboard.tsx`          | Remove standalone padding, add context row |

### Phase 2: Exhibitor Enhancement

| File                                                          | Change                                         |
| ------------------------------------------------------------- | ---------------------------------------------- |
| `apps/myk9show/src/components/exhibitor/ExhibitorSidebar.tsx` | Enrich nav items                               |
| `apps/myk9show/src/components/exhibitor/ExhibitorLayout.tsx`  | Add collapsible + hover-to-expand              |
| `apps/myk9show/src/pages/ExhibitorDashboard.tsx`              | Add dog cards, entry timeline, results summary |

### Phase 3: Shared Extraction (Optional)

| File                                                          | Change                                     |
| ------------------------------------------------------------- | ------------------------------------------ |
| `apps/myk9show/src/components/layout/DashboardContextRow.tsx` | **New** — Generalized context selector     |
| `apps/myk9show/src/components/layout/StatChip.tsx`            | **New** — Extracted from PipelineDashboard |

---

## Testing

- Verify JudgeLayout renders sidebar + content area correctly
- Verify scoring routes do NOT include sidebar
- Verify judge sidebar active route highlighting
- Verify ExhibitorLayout collapsible behavior matches secretary
- Verify mobile responsiveness for both new layouts
- Verify EmbeddedPageWrapper strips padding correctly for shared browse pages
- Edge cases: judge with no assignments (empty dashboard), exhibitor with no dogs

---

## Dependency Order

```
Phase 1 (Judge Layout) → independent, can start anytime
Phase 2 (Exhibitor Enhancement) → independent, can start anytime
Phase 3 (Shared Extraction) → after Phases 1-2 are stable

Judge Analytics Plan → fits inside Phase 1's judge dashboard
Availability Persistence → independent, but display fits in judge sidebar
```

Phase 1 and Phase 2 can be done in parallel since they touch different files.
