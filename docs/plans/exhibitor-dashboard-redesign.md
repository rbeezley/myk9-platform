# Exhibitor Dashboard: Progressive Disclosure + Live Show Status

**Date:** 2026-03-09
**Status:** Phase 2 Complete
**INTENT alignment:** Exhibitor — _"This respects my time"_

---

## Problem

The exhibitor dashboard shows everything at once — 4 stat cards, 2 content tabs, 3 quick action cards — with no hierarchy. On show day, exhibitors (on mobile, one hand on a leash) have no sense of where they are in the schedule. The dashboard treats "planning mode" (weeks before) and "awareness mode" (day-of) identically.

## Solution

Context-aware dashboard that auto-detects show day and promotes what matters now. Option B approach: extract reusable components from the existing mobile `ExhibitorDashboard` so they work on the main dashboard, a future ringside page, or any surface.

## Architecture Decisions

| Decision             | Choice                              | Rationale                                                                           |
| -------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| Show day detection   | Auto-detect from entry dates        | Zero config, respects exhibitor's time                                              |
| Live data source     | React Query polling (30s)           | Simple, reliable, fits existing patterns. Upgrade to Realtime later if needed       |
| Component extraction | Option B — reusable pieces          | Future flexibility for ringside page, widgets, myK9Q sharing                        |
| Ring progress data   | Read `entries` table scoring fields | myK9Q already syncs `is_scored`, `is_in_ring`, `scoring_completed_at` to same table |

## Data Available for Ring Progress

The `entries` table already has everything we need (populated by myK9Q scoring sync):

- `is_in_ring` (boolean) — dog currently being scored
- `ring_entry_time` (timestamp) — when dog entered ring
- `is_scored` (boolean) — scoring complete
- `scoring_completed_at` (timestamp) — when scored
- `entry_status`: `checked-in` → `competing` → `completed`
- Class status: `check-in` → `in-progress` → `completed`
- Show status: `in_progress` — the trigger for show day mode

---

## Phase 1: Data Layer + Show Day Detection

**Goal:** `useShowDayData` hook that answers "does this exhibitor have a show today, and what's happening?"

### Files to Create

#### `apps/myk9show/src/hooks/queries/useShowDayData.ts`

```typescript
// Returns:
interface ShowDayData {
  isShowDay: boolean;
  activeShows: ActiveShowInfo[]; // [EXPANDED] array for multi-show support
  activeShow: ActiveShowInfo | null; // currently selected show (first by default)
  myClasses: ShowDayClass[]; // exhibitor's classes today, sorted by estimated time
  nextUp: ShowDayClass | null; // next unscored class
  completedToday: ShowDayClass[]; // already scored
  stats: { total: number; completed: number; qualified: number };
  // [ADDED] Loading and error states
  isLoading: boolean;
  error: Error | null;
  isStale: boolean; // true when last poll failed but we have cached data
  lastUpdated: Date | null; // timestamp of last successful poll
}

interface ShowDayClass {
  classId: string;
  className: string;
  element: string;
  level: string;
  ringNumber: number | null;
  judgeName: string;
  dogCallName: string;
  dogId: string;
  armband: string;
  entryId: string;
  // Ring progress (from entries table)
  totalEntries: number;
  scoredEntries: number; // count of is_scored=true in this class
  currentDogInRing: string | null; // call_name where is_in_ring=true
  myRunningOrder: number | null;
  estimatedTimeMinutes: number | null; // rough calc from position * avg time
  // Status
  checkInStatus: string;
  isScored: boolean;
  resultStatus: string | null; // 'qualified' | 'nq' | etc.
  classStatus: string; // 'check-in' | 'in-progress' | 'completed'
}

interface ActiveShowInfo {
  showId: string;
  showName: string;
  location: string;
  clubName: string;
  trialDate: string;
}
```

**Query strategy:**

- Fetch entries for shows where `start_date <= today <= end_date` and `status = 'in_progress'` (or show date is today even if not yet marked in_progress)
- Join entries → classes → trials → shows to get ring/judge/class info
- Join entries in same class to get `scoredEntries` count and `currentDogInRing`
- Poll every 30s using `cacheStrategies.realtime`
- Only runs the polling query when `isShowDay = true`; otherwise a lightweight date-check query on 60s interval

**[ADDED] Timezone handling:**

- "Is today" comparison uses the user's device timezone (`new Date()` local date), not UTC
- Show dates stored as `TIMESTAMPTZ` in Supabase — compare `startOfDay(now)` and `endOfDay(now)` in local time against show `start_date` and `end_date`
- This means a Denver exhibitor at 11pm sees tomorrow's show correctly, and an EST user sees the same show based on _their_ local date

**[ADDED] Polling transition logic:**

- Hook runs two React Query queries with different intervals:
  - `showDayCheck`: lightweight query (just show dates for user's entries), 60s interval, always active
  - `showDayDetails`: full class/ring progress query, 30s interval, `enabled: isShowDay`
- When `showDayCheck` detects `isShowDay` transitioning false→true, `showDayDetails` auto-enables on next cycle
- React Query's `refetchOnWindowFocus: true` ensures returning to the tab gets fresh data immediately

**[ADDED] Query structure (single query, no N+1):**

```typescript
// Single Supabase query with server-side joins and aggregation
const { data } = await supabase
  .from('entries')
  .select(
    `
    id, entry_status, check_in_status, armband, running_order,
    is_scored, result_status, is_in_ring,
    dog:dogs!inner(id, call_name),
    class:classes!inner(id, name, element, level, ring_number, status,
      judge:people(first_name, last_name)),
    trial:trials!inner(id, name, date,
      show:shows!inner(id, name, location, status, start_date, end_date,
        club:clubs(name)))
  `
  )
  .eq('handler_id', userId)
  .gte('trial.date', todayStart)
  .lte('trial.date', todayEnd);

// Client-side: single pass to compute scoredEntries/totalEntries per class
// using a Map<classId, { scored: number, total: number, inRing: string | null }>
```

**[ADDED] Error handling:**

- On poll failure: keep previous cached data, set `isStale: true`, show subtle "Last updated X min ago" indicator
- On initial load failure: `error` is set, UI shows "Unable to load show day data" with retry button
- Network offline: React Query's built-in `onlineManager` pauses polling, resumes when back online

### Files to Modify

#### `apps/myk9show/src/types/exhibitor-types.ts`

- Add `ShowDayData`, `ShowDayClass`, `ActiveShowInfo` types (or create new `show-day-types.ts` if cleaner)
- Keep existing `ExhibitorDashboardData` types — they serve the mobile component

### Tests

- `apps/myk9show/src/test/hooks/useShowDayData.test.ts`
  - Returns `isShowDay: false` when no shows today
  - Returns `isShowDay: true` with correct class list when show is today
  - `nextUp` is the first unscored class by running order
  - `completedToday` only includes scored entries
  - Stats counts are correct
  - Handles entries with no running order gracefully
  - `estimatedTimeMinutes` calculates from position in queue
  - [ADDED] Returns `isLoading: true` during initial fetch
  - [ADDED] Sets `isStale: true` and keeps cached data on poll failure
  - [ADDED] Handles timezone: show starting at midnight UTC still shows as "today" for local user

---

## Phase 2: Reusable Show Day Components

**Goal:** Extract UI building blocks from the mobile `ExhibitorDashboard` into reusable components.

### Files to Create

#### `apps/myk9show/src/components/exhibitor/NextUpCard.tsx`

The hero card — designed to be readable at arm's length on mobile.

```
┌─────────────────────────────┐
│  ⬆ NEXT UP                 │
│  Container Novice A         │  ← class name, large
│  Ring 2 • Dog 5 of 12       │  ← ring progress
│  Storm • Armband #160       │  ← dog name + armband
│  ~20 min                    │  ← estimated time, prominent
│  ━━━━━━━━━━░░░░░░  42%     │  ← class progress bar
└─────────────────────────────┘
```

- Props: `ShowDayClass` data + optional `onNavigate`
- Large touch targets (48px+), high contrast
- Progress bar shows `scoredEntries / totalEntries`
- Estimated time in large font
- Tap navigates to class detail

#### `apps/myk9show/src/components/exhibitor/ClassTimelineCard.tsx`

Compact card for "later today" classes.

```
┌──────────────────────────────────┐
│  Buried Adv B • Ring 1 • ~2:30pm │
│  Ace • Armband #161              │
└──────────────────────────────────┘
```

- Props: `ShowDayClass` + compact flag
- ~64px height on mobile
- Shows check-in status badge if relevant
- Completed classes get a result badge (Q/NQ) and muted styling

#### `apps/myk9show/src/components/exhibitor/ShowDayHero.tsx`

Orchestrator component that composes `NextUpCard` + `ClassTimelineCard` list.

```typescript
interface ShowDayHeroProps {
  data: ShowDayData;
}
```

- Renders `ActiveShowInfo` header (show name, location, live indicator)
- [ADDED] Show selector tabs when `data.activeShows.length > 1` (multi-show day)
- `NextUpCard` for `data.nextUp`
- "Later Today" section with `ClassTimelineCard` for remaining unscored
- "Completed" section (collapsed by default) with result badges
- Mini stats row: "2 of 5 classes done • 1 Q"
- [ADDED] Stale data indicator: "Last updated X min ago" when `data.isStale`

#### `apps/myk9show/src/components/exhibitor/StickyShowBar.tsx` [ADDED]

Slim sticky bar that stays visible when the hero scrolls out of view on mobile.

```
┌────────────────────────────────────┐
│ 🟢 Container Nov A • Ring 2 • ~20m │
└────────────────────────────────────┘
```

- Uses `IntersectionObserver` on `ShowDayHero` — bar appears only when hero is scrolled off-screen
- ~40px height, fixed to top of viewport (below any app header)
- Shows: class name, ring, estimated time — the 3 most critical facts
- Tapping scrolls back to the hero
- Not rendered on desktop (hero is always visible in 60/40 split layout)

### Files to Delete

#### `apps/myk9show/src/components/exhibitor/ExhibitorDashboard.tsx`

The 671-line mock-data component. Its useful patterns will have been extracted into the new components above. Remove to avoid confusion with the real page at `pages/ExhibitorDashboard.tsx`.

### Tests

- `apps/myk9show/src/test/components/NextUpCard.test.tsx` — renders class info, progress bar, estimated time, handles null running order
- `apps/myk9show/src/test/components/ClassTimelineCard.test.tsx` — compact rendering, completed state with result badge, check-in badge
- `apps/myk9show/src/test/components/ShowDayHero.test.tsx` — show header, nextUp card present, later today list, completed section collapsed, stats row, stale indicator
- `apps/myk9show/src/test/components/StickyShowBar.test.tsx` [ADDED] — renders when hero not visible, hides when hero visible, shows correct class/ring/time, tap scrolls to hero

---

## Phase 3: Dashboard Redesign — Progressive Disclosure

**Goal:** Restructure `pages/ExhibitorDashboard.tsx` with context-aware layout.

### Show Day Layout (mobile-first)

```
┌─────────────────────────┐
│ 🟢 Live: AKC Scent Work │  ← ShowDayHero
│ ─────────────────────── │
│ NEXT UP                 │
│ [NextUpCard]            │
│                         │
│ Later Today             │
│ [ClassTimelineCard] x N │
│ [ClassTimelineCard] x N │
│                         │
│ Completed (1)        ▸  │  ← collapsed
├─────────────────────────┤
│ ▸ My Entries (3)        │  ← collapsed section
│ ▸ Recent Results (2)    │  ← collapsed section
│ ▸ Quick Actions         │  ← collapsed section
└─────────────────────────┘
```

### Non-Show Day Layout (mobile-first)

```
┌─────────────────────────┐
│ Exhibitor Dashboard     │
│ Welcome back, Sarah     │
├─────────────────────────┤
│ [Compact Stats Row]     │  ← 2-3 key numbers inline, not 4 cards
│  3 entries • 2 shows    │
│  • 1 dog                │
├─────────────────────────┤
│ Upcoming Entries        │  ← always visible, primary content
│ [Entry cards...]        │
├─────────────────────────┤
│ ▸ Recent Results (2)    │  ← collapsed by default
├─────────────────────────┤
│ [Compact Action Buttons]│  ← horizontal button row, not 3 big cards
│ [Find Shows] [My Dogs]  │
│ [My Entries]            │
└─────────────────────────┘
```

### Desktop Layout Adjustments

- Show Day: hero takes left 60%, "later today" sidebar right 40%
- Non-Show Day: stats row stays compact (no change from mobile), entries get more horizontal space, action buttons stay as a row

### Files to Modify

#### `apps/myk9show/src/pages/ExhibitorDashboard.tsx`

Major restructure:

1. Add `useShowDayData()` hook call
2. Conditional rendering: `showDayData.isShowDay` → show day layout vs. planning layout
3. Replace 4 `GlassCard` stat cards with compact `CompactStatsRow` (inline badges)
4. Replace 3 quick action `GlassCard`s with horizontal `Button` row
5. Make "Recent Results" tab a collapsible `<details>` or accordion section (collapsed by default)
6. Remove the `Tabs` wrapper — "Upcoming Entries" becomes always-visible primary content, "Recent Results" becomes a separate collapsible section below

**Target: 667 → ~400 lines** (components extracted, layout simplified)

### Files to Create

#### `apps/myk9show/src/components/exhibitor/CompactStatsRow.tsx`

Inline stats replacing the 4 large cards:

```
3 active entries • 2 upcoming shows • 1 dog registered
```

- Horizontal on desktop, wrapping on mobile
- Each stat is a clickable link to the relevant page
- Small badges for counts, not giant number cards

### Tests

- `apps/myk9show/src/test/pages/ExhibitorDashboard.test.tsx` — update existing tests for new layout
  - Shows ShowDayHero when `isShowDay` is true
  - Shows planning layout when `isShowDay` is false
  - Compact stats row renders correct counts
  - Results section is collapsed by default
  - Quick actions render as button row

---

## Phase 4: Polish + Edge Cases

**Goal:** Handle real-world scenarios gracefully.

### Edge Cases to Handle

1. **Multiple shows on same day** — exhibitor entered in 2 shows (rare but possible). ShowDayHero shows a show selector/tab at top.
2. **Show marked `in_progress` but no classes started yet** — "Show is starting. No classes in progress yet." with check-in reminders.
3. **All classes completed** — Hero transforms to "All done!" summary with results and Q count. Celebration-worthy but calm (per INTENT).
4. **No scoring data flowing** — If myK9Q isn't being used for this show, ring progress shows "—" instead of fake numbers. Graceful degradation to just schedule view.
5. **Show date is today but status isn't `in_progress` yet** — Still show the hero in "preview" mode: "Your show is today! Here's your schedule." No live progress until status changes.

### Accessibility

- All interactive elements 48px+ touch targets
- Progress bar has `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-label`
- Estimated time announced by screen readers
- Collapsible sections use `<details>`/`<summary>` or proper `aria-expanded`
- No hover-only interactions (per INTENT.md guardrails)

### Files to Modify

- Components from Phase 2-3 as needed for edge cases
- No new files expected

### Tests

- Edge case tests added to existing test files
- Multiple shows selector test
- All-completed celebration state test
- No scoring data graceful degradation test

---

## Quality Gate [ADDED]

Each phase must pass before proceeding to the next:

1. `pnpm typecheck` — zero errors
2. `pnpm lint` — zero errors
3. `cd apps/myk9show && pnpm test` — all tests passing (new + existing)
4. No `any` types in new code
5. All new files under 500 lines

## Phase Summary

| Phase     | What                           | New Files                                    | Modified Files              | Tests                    |
| --------- | ------------------------------ | -------------------------------------------- | --------------------------- | ------------------------ |
| 1         | Data hook + show day detection | 1 hook, 1 type file                          | 1 (exhibitor-types)         | 1 test file (~11 tests)  |
| 2         | Reusable show day components   | 4 components (incl. StickyShowBar) [UPDATED] | 0                           | 4 test files (~18 tests) |
| 3         | Dashboard restructure          | 1 component (CompactStatsRow)                | 1 (ExhibitorDashboard page) | 1 test file (~6 tests)   |
| 4         | Edge cases + accessibility     | 0                                            | ~4 (from phases 2-3)        | ~8 additional tests      |
| **Total** |                                | **6 new**                                    | **~6 modified**             | **~43 tests**            |

## Files to Delete

- `apps/myk9show/src/components/exhibitor/ExhibitorDashboard.tsx` (Phase 2 — after patterns extracted)

## Out of Scope

- Supabase Realtime subscriptions (future upgrade from polling)
- Push notifications ("you're up next!")
- myK9Q integration changes (it already syncs what we need)
- New database migrations (all needed fields exist in `entries` table)
- Dedicated ringside page (future — the extracted components will power it)
