# Exhibitor Dashboard: Progressive Disclosure + Live Show Status

**Date:** 2026-03-09
**Status:** Phase 3 Complete
**INTENT alignment:** Exhibitor — _"This respects my time"_

---

## Design Principle: Context-Aware Dashboards

**All role dashboards** (exhibitor, secretary, judge) follow the same pattern:

1. **Auto-detect mode**: The dashboard detects whether there's an active show today and switches layout automatically — show day surfaces live/operational content, non-show day surfaces planning/management content.
2. **Manual override**: A small toggle in the header (e.g., "Show Day | Planning" pill/switch) lets the user flip modes when they need the other view. The override persists for the current session but resets to auto-detect on next visit.
3. **No data loss**: Both modes access the same data — the mode only controls layout priority and which sections are expanded vs collapsed.

This pattern applies consistently:

| Role      | Show Day Mode                                          | Planning Mode                               |
| --------- | ------------------------------------------------------ | ------------------------------------------- |
| Exhibitor | Live ring progress, next up, check-in                  | Upcoming entries, results, show discovery   |
| Secretary | Check-in overview, class progress, gate, announcements | Entry management, registrations, financials |
| Judge     | Current class, run order, scoring interface\*          | Upcoming assignments, calendar              |

_\*Scoring stays in myK9Q (offline-first requirement), but judge's myK9Show dashboard can show read-only class progress._

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
| Mode override        | Session-scoped toggle, auto-reset   | Users occasionally need the other view; auto-detect is the right default            |

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

## Phase 5: Exhibitor Check-In (from myK9Q)

**Goal:** Let exhibitors check in to classes from myK9Show, reusing myK9Q's proven patterns and keeping the UI familiar.

### What myK9Q Has (Reuse Sources)

| myK9Q File                                                  | What It Does                                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/constants/statusConfig.ts`                             | Status definitions: icons, colors, labels for all `EntryStatus` values                               |
| `src/services/entry/entryStatusManagement.ts`               | `updateEntryCheckinStatus()` — Supabase update + immediate sync trigger                              |
| `src/components/ui/CheckInStatusBadge.tsx`                  | Clickable badge showing current status with icon                                                     |
| `src/pages/EntryList/components/EntryListDialogs.tsx`       | Popup menu for status selection (Checked-in, Conflict, Pulled, etc.)                                 |
| `src/pages/EntryList/hooks/useEntryListActions.ts`          | Optimistic update via replication → server sync                                                      |
| `src/pages/Admin/hooks/useSelfCheckinSettings.ts`           | Cascade logic: show → trial → class override for self-check-in                                       |
| `src/services/replication/tables/ReplicatedEntriesTable.ts` | Offline-first entry sync with conflict resolution (client wins for check-in, server wins for scores) |

### Status State Machine (from myK9Q)

```
no-status → checked-in → at-gate / come-to-gate → in-ring → completed
     ↑                                                  ↓
     └──────────────── reset ───────────────────────────┘

Also: no-status → conflict
      no-status → pulled
```

Type: `EntryStatus = 'no-status' | 'checked-in' | 'at-gate' | 'come-to-gate' | 'conflict' | 'pulled' | 'in-ring' | 'completed'`

### Reuse Strategy

1. **Extract to `@myk9/core`**: `EntryStatus` type and `statusConfig` (icons, colors, labels) — pure data, no UI dependencies
2. **Reuse `@myk9/replication`**: `ReplicatedEntriesTable` already handles offline check-in sync — myK9Show uses the same package
3. **Rebuild UI in Tailwind**: Match myK9Q's visual patterns (same badge colors, same icon set, same popup flow) but with shadcn/Tailwind instead of Semantic CSS

### Files to Create

#### `packages/core/src/check-in/statusConfig.ts`

- Move from `apps/myk9q/src/constants/statusConfig.ts`
- Export `EntryStatus` type, `STATUS_CONFIG` map (value → label, icon name, color)
- No React/UI dependencies — just data

#### `apps/myk9show/src/components/exhibitor/CheckInStatusBadge.tsx`

- Tailwind version of myK9Q's `CheckInStatusBadge`
- Same visual: pill with icon + status label, colored by status
- Clickable — opens status selector
- Props: `status: EntryStatus`, `onStatusChange`, `disabled` (for when self-check-in is off)

#### `apps/myk9show/src/components/exhibitor/CheckInStatusMenu.tsx`

- Dropdown/popover with status options (using shadcn Popover or DropdownMenu)
- Same options as myK9Q: Checked-in, Conflict, Pulled, At-Gate, Come-to-Gate, No Status
- Each option shows icon + label + description (from `statusConfig`)

#### `apps/myk9show/src/hooks/mutations/useCheckInMutation.ts`

- Wraps the check-in update in a React Query mutation
- Optimistic update: immediately update `@myk9/replication` cache
- Server sync: calls `entryStatusManagement.updateEntryCheckinStatus()` (extract to shared package or duplicate the thin service call)
- Rollback on failure

#### `apps/myk9show/src/hooks/queries/useSelfCheckinEnabled.ts`

- Reuse myK9Q's cascade logic: `class.self_checkin_enabled ?? trial.self_checkin_enabled ?? show.self_checkin_enabled`
- Returns `{ enabled: boolean, reason?: string }` so UI can explain why check-in is disabled

### Files to Modify

- `ClassTimelineCard.tsx` — add `CheckInStatusBadge` to each class card
- `NextUpCard.tsx` — add prominent check-in button/badge
- `ShowDayHero.tsx` — pass check-in handlers through to child components
- `show-day-types.ts` — add `checkInStatus` field to `ShowDayClass` (already defined but not populated)

### Tests

- `CheckInStatusBadge.test.tsx` — renders correct icon/color per status, fires onStatusChange
- `CheckInStatusMenu.test.tsx` — shows all options, calls handler on selection, respects disabled state
- `useCheckInMutation.test.ts` — optimistic update, rollback on failure
- `useSelfCheckinEnabled.test.ts` — cascade logic (class overrides trial overrides show)

---

## Phase 6: Exhibitor Notifications (from myK9Q)

**Goal:** Push notifications and in-app alerts for exhibitors — "you're up next!", results posted, announcements. Keep UX familiar from myK9Q.

### What myK9Q Has (Reuse Sources)

| myK9Q File                                             | What It Does                                                                                | Reuse?                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/services/pushNotificationService.ts`              | VAPID subscription management (subscribe/unsubscribe, multi-show switch, favorite armbands) | **Extract to shared package** — pure browser API, app-agnostic                           |
| `src/services/notificationService.ts`                  | Singleton: delivery queue, DND mode, quiet hours, vibration, voice, badge counts            | **Extract core logic** — notification types, queue, DND are reusable                     |
| `src/services/notificationIntegration.ts`              | Event triggers: "your turn" (N dogs ahead), results posted, class starting                  | **Adapt** — same trigger logic, different data source (React Query cache vs replication) |
| `src/services/notificationHandlers.ts`                 | Notification content builders per type (title, body, icon, action URL)                      | **Extract** — pure functions, no UI dependencies                                         |
| `src/services/notificationSoundService.ts`             | Audio playback for alerts                                                                   | **Extract** — pure browser API                                                           |
| `src/services/voiceAnnouncementService.ts`             | Text-to-speech announcements                                                                | **Extract** — pure browser API                                                           |
| `src/components/notifications/NotificationCenter.tsx`  | Full-screen slide-out inbox with filtering                                                  | **Rebuild in Tailwind** — same UX, different styling                                     |
| `src/components/notifications/NotificationBell.tsx`    | Header button with unread badge                                                             | **Rebuild in Tailwind**                                                                  |
| `src/components/notifications/ToastContainer.tsx`      | Floating toast notifications                                                                | **Rebuild in Tailwind**                                                                  |
| `src/stores/announcementStore.ts`                      | Zustand store for announcements with Supabase subscription                                  | **Reuse pattern** — same store shape, same Supabase queries                              |
| `src/contexts/NotificationContext.tsx`                 | Provider merging announcements + push notifications                                         | **Convert to Zustand store** (per myK9Show conventions)                                  |
| `src/sw-custom.js`                                     | Service worker push handling                                                                | **Adapt** — myK9Show needs its own SW config but same push handler logic                 |
| `src/config/pushNotifications.ts`                      | VAPID key config                                                                            | **Share** — same keys, same Supabase project                                             |
| `src/pages/Settings/sections/NotificationSettings.tsx` | Settings UI (master toggle, lead dogs, voice, sounds)                                       | **Rebuild in Tailwind** — same options                                                   |
| `supabase/functions/send-push-notification/`           | Edge Function sending push via web-push                                                     | **Already shared** — same Supabase project, works for both apps                          |

### Reuse Strategy

1. **Create `@myk9/notifications` package** with:
   - `pushNotificationService` (VAPID subscription lifecycle)
   - `notificationSoundService` (audio playback)
   - `voiceAnnouncementService` (TTS)
   - `notificationHandlers` (content builders)
   - Notification type definitions and configs
   - DND/quiet hours logic

2. **Rebuild UI in Tailwind** matching myK9Q's patterns:
   - Same notification bell with badge in header
   - Same slide-out inbox with type + read-status filtering
   - Same toast overlay (top-right, max 3 visible)
   - Same settings page layout (master toggle, lead dogs slider, sound preview)

3. **Adapt trigger logic** for myK9Show's architecture:
   - myK9Q monitors replication cache changes → myK9Show monitors React Query cache or Supabase realtime
   - "Your turn" alert: watch `useShowDayData` for `scoredEntries` changes approaching `myRunningOrder`
   - Results posted: watch for `isScored` transitioning to `true` on user's entries

4. **Shared Edge Function**: `send-push-notification` already deployed, keyed by subscription endpoint — works for both apps

### Files to Create (Package)

#### `packages/notifications/` (new package)

- `src/push.ts` — VAPID subscription service (from myK9Q's `pushNotificationService.ts`)
- `src/sound.ts` — notification sounds (from `notificationSoundService.ts`)
- `src/voice.ts` — voice announcements (from `voiceAnnouncementService.ts`)
- `src/handlers.ts` — notification content builders (from `notificationHandlers.ts`)
- `src/types.ts` — `NotificationType`, `NotificationPayload`, DND config types
- `src/dnd.ts` — Do Not Disturb + quiet hours logic

### Files to Create (myK9Show App)

#### `apps/myk9show/src/store/notificationStore.ts`

- Zustand store (not Context) managing notification state
- Merges announcements + push notifications (like myK9Q's `NotificationContext`)
- Persists read/dismissed state in localStorage

#### `apps/myk9show/src/components/notifications/NotificationBell.tsx`

- Tailwind version — same badge with unread count, same pulse animation

#### `apps/myk9show/src/components/notifications/NotificationCenter.tsx`

- Tailwind slide-out panel — same filtering (all/announcements/dogs), same read/unread toggle

#### `apps/myk9show/src/components/notifications/ToastContainer.tsx`

- Tailwind toasts — same positioning, same auto-dismiss behavior

#### `apps/myk9show/src/hooks/useShowDayAlerts.ts`

- Watches `useShowDayData` and triggers notifications:
  - "Your turn" when `scoredEntries` reaches `myRunningOrder - leadDogsSetting`
  - "Results posted" when `isScored` becomes true
  - "Class starting" based on schedule

#### `apps/myk9show/src/pages/Settings/NotificationSettings.tsx`

- Tailwind version of myK9Q's notification settings
- Same options: master toggle, lead dogs (1-5), voice, sounds, push permission

### Tests

- Package: unit tests for push subscription lifecycle, DND logic, handlers
- App: NotificationBell, NotificationCenter, ToastContainer rendering tests
- `useShowDayAlerts` — triggers correct notification types at correct thresholds

---

## Phase Summary (Updated)

| Phase     | What                           | New Files                          | Modified Files              | Tests                    |
| --------- | ------------------------------ | ---------------------------------- | --------------------------- | ------------------------ |
| 1 ✅      | Data hook + show day detection | 1 hook, 1 type file                | 1 (exhibitor-types)         | 1 test file (~11 tests)  |
| 2 ✅      | Reusable show day components   | 4 components (incl. StickyShowBar) | 0                           | 4 test files (~18 tests) |
| 3 ✅      | Dashboard restructure          | 1 component (CompactStatsRow)      | 1 (ExhibitorDashboard page) | 2 test files (28 tests)  |
| 4         | Edge cases + accessibility     | 0                                  | ~4 (from phases 2-3)        | ~8 additional tests      |
| 5         | Exhibitor check-in             | ~5 components/hooks + shared types | ~4 (show day components)    | ~4 test files            |
| 6         | Exhibitor notifications        | 1 new package + ~6 app files       | ~2 (layout, settings)       | ~6 test files            |
| **Total** |                                | **~18 new**                        | **~12 modified**            | **~53+ tests**           |

## Out of Scope

- Supabase Realtime subscriptions (future upgrade from polling)
- myK9Q code changes (it continues to work as-is)
- New database migrations (all needed fields exist)
- Dedicated ringside page (future — the extracted components will power it)
- Replacing myK9Q for club admin/secretary/judge roles (separate planning needed)
