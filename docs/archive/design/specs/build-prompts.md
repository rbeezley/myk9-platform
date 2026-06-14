# Build-Order Prompts: myK9 Platform

## Overview

Sequential prompts for building the myK9 Platform UI—comprising myK9Q (ringside scoring for tablets) and myK9Show (show management for desktop). These prompts are optimized for UI generation tools like v0, Bolt, or Claude.

## Build Sequence

### Foundation
1. **Design Tokens** - CSS variables, colors, typography, spacing
2. **Shared Types** - TypeScript interfaces for entries, scores, sync status

### myK9Q (Ringside Scoring)
3. **Sync Indicator** - Connectivity status badge
4. **Entry Row** - Tappable entry item for lists
5. **Timer Component** - Stopwatch with auto-stop and warning states
6. **Score Entry Card** - Form for recording results
7. **Entry List** - Scrollable list with all states
8. **Main Scoring Screen** - Full layout combining all components

### myK9Show (Show Management)
9. **Stat Card** - Dashboard metric display
10. **Schedule Row** - Day schedule item
11. **Show Dashboard** - Full admin layout

### Polish
12. **State Variations** - Empty, loading, error states for all components
13. **Responsive Adaptations** - Tablet and mobile adjustments

---

## Prompt 1: Design Tokens

### Context
Foundation CSS variables for the myK9 Platform design system. Both myK9Q and myK9Show share these tokens for visual consistency. The palette uses warm backgrounds (off-white/cream in light mode, warm charcoal in dark mode) with teal as the primary accent color.

### Requirements

**Color Tokens (Light Mode):**
- `--background`: #F8F7F4 (warm off-white)
- `--card`: #FEFDFB (subtle cream)
- `--primary`: #14b8a6 (teal)
- `--primary-foreground`: #ffffff
- `--muted`: #f6f6f6
- `--muted-foreground`: #6b7280
- `--border`: #e5e7eb
- `--destructive`: #ef4444
- `--success`: #22c55e
- `--warning`: #f97316

**Color Tokens (Dark Mode):**
- `--background`: #1a1a1e (warm charcoal)
- `--card`: #26292e (elevated surface)
- `--primary`: #14b8a6 (teal—same as light)
- `--muted`: #26292e
- `--muted-foreground`: #9ca3af
- `--border`: #4a5568

**Typography:**
- Page Title: 1.5rem, weight 600
- Section Title: 1.125rem, weight 600
- Body: 1rem, weight 400
- Caption: 0.875rem, weight 400
- Entry Number: 1.25rem, weight 700
- Timer Display: 2rem, weight 600, monospace

**Spacing Scale:**
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px

**Border Radius:**
- Default: 8px (0.5rem)
- Pill/Badge: 9999px

### Constraints
- Output as CSS custom properties in `:root` and `.dark` selectors
- Include `color-scheme: light dark` for system preference detection
- Do not include any components—tokens only

---

## Prompt 2: Shared TypeScript Types

### Context
TypeScript interfaces for data structures used across myK9Q and myK9Show. These types represent entries, scores, and sync status that components will consume.

### Requirements

**Entry Interface:**
```typescript
interface Entry {
  id: string;
  entryNumber: number;
  dogName: string;
  handlerName: string;
  status: 'pending' | 'in_ring' | 'scored' | 'scratched';
  classId: string;
}
```

**Score Interface:**
```typescript
interface Score {
  entryId: string;
  result: 'find' | 'no_find' | 'q' | 'nq';
  timeSeconds: number;
  faults: number;
  notes?: string;
}
```

**Sync Status:**
```typescript
type SyncStatus = 'synced' | 'syncing' | 'pending' | 'offline' | 'error';
```

**Timer State:**
```typescript
interface TimerState {
  status: 'ready' | 'running' | 'warning' | 'expired' | 'stopped';
  elapsedSeconds: number;
  maxSeconds: number;
}
```

### Constraints
- Types only—no implementation
- Export all interfaces for consumption by components

---

## Prompt 3: Sync Indicator Component

### Context
A small status badge showing the current sync/connectivity state. Appears in the header of both myK9Q and myK9Show screens. Users glance at this to understand if their data is up-to-date or if they're working offline.

### Requirements
- Size: 24x24px icon with optional label
- Position: Top-right of screen header
- Icon-based with color coding

**Visual per State:**
| State | Icon | Color | Label (optional) |
|-------|------|-------|------------------|
| Synced | Checkmark (✓) | Success green (#22c55e) | "Synced" |
| Syncing | Rotating arrows (↻) | Primary teal (#14b8a6), animated | "Syncing..." |
| Pending | Filled circle (●) | Warning orange (#f97316) | "Pending" |
| Offline | Cloud with X (☁✕) | Muted gray (#6b7280) | "Offline" |
| Error | Warning triangle (⚠) | Destructive red (#ef4444) | "Sync Error" |

### States
- Default (any of the 5 sync states): Shows appropriate icon/color
- Hover (on Error state only): Shows tooltip "Tap to retry"
- Tap (on Error state): Triggers retry action

### Interactions
- Synced/Syncing/Pending/Offline: Display only, not interactive
- Error: Tappable to trigger manual retry
- Long-press (any state): Shows detailed sync info tooltip

### Constraints
- Component receives `status: SyncStatus` as prop
- Animation for syncing state should use CSS, not JavaScript
- Must be accessible (screen reader announces status changes)

---

## Prompt 4: Entry Row Component

### Context
A tappable row representing one dog entry in the scoring queue. Used in myK9Q's entry list. Shows entry number prominently, dog name, handler, and current status. Designed for quick scanning and large touch targets on tablets.

### Requirements
- Height: 72px minimum (touch-friendly)
- Width: 100% of container
- Padding: 16px horizontal, 12px vertical
- Border-radius: 8px
- Background: Card color (#FEFDFB light, #26292e dark)
- Border-bottom: 1px solid border color for list separation

**Layout:**
```
┌────────────────────────────────────────────────┐
│ [#23]  Buddy the Golden Retriever  [In Ring]  │
│        Handler: Jane Smith                     │
└────────────────────────────────────────────────┘
```

- Entry number: Left-aligned, bold (1.25rem, weight 700), primary teal color
- Dog name: Next to number, body text (1rem)
- Handler: Below, caption size (0.875rem), muted color
- Status badge: Right-aligned pill

**Status Badge Colors:**
| Status | Background | Text |
|--------|------------|------|
| Pending | Muted gray (#f6f6f6 / #26292e) | Muted foreground |
| In Ring | Primary teal (#14b8a6) with 10% opacity | Primary teal text |
| Scored | Success green (#22c55e) with 10% opacity | Success green text |
| Scratched | Destructive red with 10% opacity | Destructive red text |

### States
- Default: Standard appearance as described
- Hover: Subtle background highlight (darken 2% light mode, lighten 2% dark mode)
- Pressed: Slightly darker than hover, subtle scale (0.99)
- Selected/Current: Left border accent (3px primary teal), slightly elevated background

### Interactions
- Tap anywhere: Selects entry for scoring
- Long-press: Opens context menu (Scratch, Move to top, View details)
- Swipe left: Reveals "Scratch" action button

### Constraints
- Props: `entry: Entry`, `isSelected: boolean`, `onSelect: () => void`
- Do not include list container—just the single row component
- Scratched entries should appear with reduced opacity (0.6)

---

## Prompt 5: Timer Component

### Context
A large stopwatch display for timed dog sports (Scent Work, Fast CAT). Used in myK9Q during active scoring. Shows elapsed time prominently, max time for reference, and a single Start/Stop button. Auto-stops when max time is reached with visual warning as time runs low.

### Requirements
- Container: Card-style with padding (24px)
- Timer display: 2rem font, monospace, centered, format "M:SS.cc" (e.g., "2:34.56")
- Max time label: Below timer, caption size, muted color, format "Max time: M:SS"
- Button: Full-width primary button, height 48px

**Layout:**
```
┌─────────────────────────────────────────────┐
│              2:34.56                        │
│         Max time: 3:00                      │
│                                             │
│    [          STOP          ]               │
└─────────────────────────────────────────────┘
```

### States
| State | Timer Background | Timer Text | Button |
|-------|------------------|------------|--------|
| Ready | Card default | Muted | "START" (primary) |
| Running | Card default | Foreground | "STOP" (destructive outline) |
| Warning | Warning orange 10% opacity | Warning orange | "STOP" (destructive outline) |
| Expired | Destructive red 10% opacity | Destructive red | "CLEAR" (secondary) |
| Stopped | Card default | Foreground | "CLEAR" (secondary) |

- Warning state triggers at 80% of max time (e.g., at 2:24 for 3:00 max)
- Expired state triggers when elapsed >= max time

### Interactions
- Tap Start: Begins timer, button becomes Stop
- Tap Stop: Freezes timer at current value, button becomes Clear
- Tap Clear: Resets to 00:00.00, button becomes Start
- Timer auto-stops at max time: Transitions to Expired state

### Constraints
- Props: `maxTimeSeconds: number`, `onTimeRecorded: (seconds: number) => void`
- Timer updates at 10ms intervals for centiseconds
- Must work offline (no server calls)
- Haptic feedback on Stop (if device supports)

---

## Prompt 6: Score Entry Card Component

### Context
A form card for recording the result of a dog's performance. Used in myK9Q after/during timing. Shows entry context at top, then result selection (Find/No Find or Q/NQ), captured time, optional fault count, and notes. Primary submit button at bottom.

### Requirements
- Container: Card with padding (24px), border-radius 8px
- Entry context header: Entry number + dog name, section title size (1.125rem, weight 600)
- Form fields: Standard spacing (16px gap between fields)

**Layout:**
```
┌─────────────────────────────────────────────┐
│ Entry #23: Buddy                            │
├─────────────────────────────────────────────┤
│ Result:  (●) Find  ( ) No Find              │
│                                             │
│ Time:    [  2:34.56  ]     (readonly)       │
│                                             │
│ Faults:  [ - ]  0  [ + ]                    │
│                                             │
│ Notes:   [___________________________]      │
├─────────────────────────────────────────────┤
│            [ Submit Score ]                 │
└─────────────────────────────────────────────┘
```

**Field Specifications:**
- Result: Radio button group, horizontal layout, large touch targets (44px height each)
- Time: Read-only input showing captured timer value, monospace font
- Faults: Numeric stepper with - and + buttons, min 0, max 99
- Notes: Single-line text input, optional
- Submit: Full-width primary button, height 48px

### States
- Empty: Form shown with no values, Submit disabled
- Partially filled: Submit remains disabled until Result selected
- Valid: All required fields (Result) filled, Submit enabled
- Submitting: Button shows loading spinner, form disabled
- Submitted: Brief success state (checkmark icon), then auto-advances

### Interactions
- Radio selection: Tap to select Find or No Find
- Stepper: Tap +/- to increment/decrement faults
- Notes: Tap to focus and type
- Submit: Saves score, triggers success feedback, advances to next entry

### Constraints
- Props: `entry: Entry`, `capturedTime: number`, `onSubmit: (score: Score) => void`
- Entry context must always be visible (not scrollable)
- Submit action saves to local storage immediately (offline-first)

---

## Prompt 7: Entry List Component

### Context
A scrollable list of Entry Row components showing all entries in the current class. Used in myK9Q's main screen. Includes section headers, handles all data states (empty, loading, error), and highlights the current/next entry.

### Requirements
- Container: Full height of available space, scrollable
- Entries: Using Entry Row component from Prompt 4
- Current entry: Highlighted with selection state
- "Up Next" section: Separates scored from pending entries

**Layout:**
```
┌─────────────────────────────────────────────┐
│ ── Current ──                               │
│ [Entry Row - #23 Buddy - In Ring] ←selected │
│                                             │
│ ── Up Next ──                               │
│ [Entry Row - #24 Max - Pending]             │
│ [Entry Row - #25 Luna - Pending]            │
│ [Entry Row - #26 Rocky - Pending]           │
│                                             │
│ ── Scored ──                                │
│ [Entry Row - #21 Bear - Scored]             │
│ [Entry Row - #22 Daisy - Scored]            │
└─────────────────────────────────────────────┘
```

**Section Headers:**
- Font: Caption size (0.875rem), muted color, uppercase
- Padding: 8px horizontal, 16px top, 8px bottom
- Sticky positioning when scrolling

### States
| State | Display |
|-------|---------|
| Empty | Centered message: "No entries in this class", muted icon (empty box) |
| Loading | 3-4 skeleton rows with shimmer animation |
| Success | Entry rows as described |
| Partial | Entry rows + subtle sync indicator on unsynced entries |
| Error | Error banner at top with retry button, cached entries below if available |

### Interactions
- Scroll: Standard touch scrolling with momentum
- Pull-to-refresh: Triggers manual sync
- Tap entry: Selects for scoring (scrolls to visible if needed)

### Constraints
- Props: `entries: Entry[]`, `currentEntryId: string | null`, `listState: 'empty' | 'loading' | 'success' | 'partial' | 'error'`, `onSelectEntry: (id: string) => void`, `onRefresh: () => void`
- Virtualize list if > 50 entries for performance
- Maintain scroll position on re-render

---

## Prompt 8: myK9Q Main Scoring Screen

### Context
The primary screen for ringside scoring in myK9Q. Combines all previous components into a complete layout optimized for tablet use in landscape orientation. Header shows ring info and sync status, main area split between timer/scoring on left and entry list on right.

### Requirements
- Full viewport layout
- Header: 56px height, fixed at top
- Main area: Remaining height, split layout

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ [←] Ring 1 - Novice Interior              [Sync: ✓]        │ ← Header
├─────────────────────────────────────────────────────────────┤
│                           │                                 │
│  ┌─────────────────────┐  │  ── Current ──                  │
│  │     Timer: 1:45     │  │  [#23 Buddy - In Ring]          │
│  │    [   STOP   ]     │  │                                 │
│  └─────────────────────┘  │  ── Up Next ──                  │
│                           │  [#24 Max - Pending]            │
│  ┌─────────────────────┐  │  [#25 Luna - Pending]           │
│  │ #23 Buddy           │  │                                 │
│  │ (●) Find ( ) No Find│  │  ── Scored ──                   │
│  │ Time: 1:45          │  │  [#21 Bear - Scored]            │
│  │ Faults: [0]         │  │  [#22 Daisy - Scored]           │
│  │ [  Submit Score  ]  │  │                                 │
│  └─────────────────────┘  │                                 │
│                           │                                 │
└─────────────────────────────────────────────────────────────┘
   Left Panel (50%)            Right Panel (50%)
```

**Header Specifications:**
- Back button: Left-aligned, icon + "Back" or just arrow
- Title: Centered, "Ring X - Level Element" format
- Sync indicator: Right-aligned, using Sync Indicator component

**Panel Layout:**
- Left: Timer + Score Card, vertically stacked, centered
- Right: Entry List, full height
- Divider: 1px border between panels

### States
- No class selected: Show class picker instead of timer/entries
- Scoring active: Full layout as shown
- All entries scored: Success message, option to review or finish

### Interactions
- Back button: Returns to ring/class selection
- All component interactions as defined in individual prompts
- Keyboard shortcuts (for external keyboard): Space = Start/Stop timer, Enter = Submit score

### Constraints
- Optimized for iPad landscape (1024x768 minimum)
- Left panel should not scroll; right panel scrolls
- Timer must remain visible during scoring
- Entry context in score card must match selected entry in list

---

## Prompt 9: Stat Card Component

### Context
A dashboard metric card for myK9Show showing a single statistic with label. Used on the show dashboard to display counts like total entries, active rings, and scoring progress.

### Requirements
- Size: Flexible width (min 120px), height ~80px
- Background: Card color
- Border-radius: 8px
- Padding: 16px

**Layout:**
```
┌──────────────┐
│   Entries    │  ← Label (caption size, muted)
│     47       │  ← Value (1.5rem, weight 600)
└──────────────┘
```

### States
- Default: Label + value displayed
- Loading: Value shows skeleton line
- Empty: Value shows "—" (em dash)

### Interactions
- Tap: Optional navigation to detail view (prop-controlled)

### Constraints
- Props: `label: string`, `value: string | number`, `isLoading?: boolean`, `onClick?: () => void`
- Value should truncate with ellipsis if too long

---

## Prompt 10: Schedule Row Component

### Context
A row showing a scheduled event in myK9Show's daily schedule. Displays time, ring, and class information. Used in the dashboard schedule list.

### Requirements
- Height: 48px
- Padding: 12px horizontal
- Border-bottom: 1px solid border color

**Layout:**
```
┌─────────────────────────────────────────────┐
│ 8:00 AM   Ring 1: Novice Interior           │
└─────────────────────────────────────────────┘
```

- Time: Fixed width (~80px), muted color
- Ring + Class: Remaining width, body text

### States
- Upcoming: Standard appearance
- In Progress: Left accent border (3px primary teal), subtle background highlight
- Completed: Muted text color, optional checkmark

### Interactions
- Tap: Opens ring detail/scoring view

### Constraints
- Props: `time: string`, `ringName: string`, `className: string`, `status: 'upcoming' | 'in_progress' | 'completed'`, `onClick: () => void`

---

## Prompt 11: myK9Show Dashboard Screen

### Context
The main admin dashboard for myK9Show. Shows high-level show stats, today's schedule, and quick actions. Designed for desktop use with responsive tablet support.

### Requirements
- Full viewport layout
- Header: App name, show name, user avatar/menu
- Main: Grid layout with stat cards, schedule, actions

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ [≡] Summer Scent Trial 2024           [Sync: ✓] [Avatar]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                    │
│  │ Entries  │ │  Rings   │ │ Results  │                    │
│  │    47    │ │    4     │ │  23/47   │                    │
│  └──────────┘ └──────────┘ └──────────┘                    │
│                                                             │
│  Today's Schedule                                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 8:00 AM   Ring 1: Novice Interior        ● In Progress│  │
│  │ 8:00 AM   Ring 2: Novice Container                   │   │
│  │ 10:00 AM  Ring 1: Open Interior                      │   │
│  │ 10:00 AM  Ring 2: Open Container                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Quick Actions                                              │
│  [ + Add Entry ]  [ View Full Results ]  [ Export ]         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Stat Cards Row:**
- 3 cards in a row, equal width, gap 16px
- Cards use Stat Card component

**Schedule Section:**
- Section title: "Today's Schedule" (section title size)
- List of Schedule Row components
- Max 6 visible, "View All" link if more

**Quick Actions:**
- Row of outline/secondary buttons
- Gap 12px between buttons

### States
- Loading: Skeleton for stats and schedule
- Empty show: Prompt to start setup wizard
- Active show: Full layout as shown
- Completed show: Stats show finals, actions change to "Export Results"

### Interactions
- Hamburger menu: Opens navigation drawer
- Avatar: Opens user menu (profile, settings, logout)
- Stat cards: Navigate to detail views
- Schedule rows: Open ring management
- Quick action buttons: Trigger respective flows

### Constraints
- Desktop-first (min 1024px width)
- Tablet: Stack stat cards vertically
- Mobile: Single column, hamburger navigation

---

## Prompt 12: State Variations

### Context
Comprehensive empty, loading, and error states for all data-driven components. Ensures users always understand the system status and can take action when needed.

### Requirements

**Empty States (when no data):**

| Component | Message | Icon | Action |
|-----------|---------|------|--------|
| Entry List | "No entries in this class" | Empty clipboard | "Add Entry" button (admin only) |
| Schedule | "No events scheduled today" | Calendar | "View full schedule" link |
| Results | "Scoring hasn't started yet" | Clock | None |

- Center content vertically and horizontally
- Icon: 48px, muted color
- Message: Body text, muted color
- Action: Primary button or link

**Loading States:**

| Component | Skeleton Pattern |
|-----------|------------------|
| Entry Row | Rectangle (height 72px) with shimmer |
| Stat Card | Rectangle (height 80px) with shimmer |
| Schedule Row | Rectangle (height 48px) with shimmer |
| Score Card | Form field placeholders with shimmer |

- Shimmer animation: Left-to-right gradient sweep, 2 second duration
- Show 3-4 skeleton items for lists
- Maintain layout structure during load

**Error States:**

| Severity | Display | Action |
|----------|---------|--------|
| Recoverable | Banner at top, content below | "Retry" button |
| Blocking | Full-screen overlay | "Retry" or "Go Back" buttons |
| Offline | Subtle indicator, cached content | Continue working |

- Error banner: Destructive red background (10% opacity), red text, red border
- Include brief error message: "Couldn't load entries. Check your connection."

### Constraints
- All states must be accessible (screen reader announcements)
- Loading states should appear after 200ms delay (avoid flash)
- Error states must provide actionable next steps

---

## Prompt 13: Responsive Adaptations

### Context
Responsive layout adjustments for myK9Q (tablet-first) and myK9Show (desktop-first) to support various device sizes.

### Requirements

**myK9Q Breakpoints:**

| Width | Layout Change |
|-------|---------------|
| > 1024px | Two-panel layout (timer/score left, entries right) |
| 768-1024px | Two-panel, reduced padding |
| < 768px | Stacked layout (timer/score top, entries bottom as tabs) |

**myK9Show Breakpoints:**

| Width | Layout Change |
|-------|---------------|
| > 1280px | Full dashboard, three stat cards inline |
| 1024-1280px | Reduced padding, stat cards wrap |
| 768-1024px | Two-column grid, navigation as tabs |
| < 768px | Single column, hamburger navigation, stat cards stack |

**Touch Target Adjustments:**
- Mobile: Minimum 48px touch targets (increase from 44px)
- Increase button padding on small screens
- Swipe gestures only on touch devices

**Typography Scaling:**
- Reduce heading sizes by ~10% on mobile
- Timer display: 1.75rem on mobile (from 2rem)

### Constraints
- Use CSS media queries, not JavaScript detection
- Test with actual touch devices, not just resized browsers
- Maintain functionality at all breakpoints (no hidden features)

---

## Implementation Notes

### Recommended Build Order

1. Start with **Design Tokens** (Prompt 1) and **Types** (Prompt 2)—these are dependencies for everything
2. Build **Sync Indicator** (Prompt 3)—small, reusable, tests your token setup
3. Build **Entry Row** (Prompt 4)—core list item, appears in both apps
4. Build **Timer** (Prompt 5)—standalone, complex state logic
5. Build **Score Card** (Prompt 6)—depends on knowing entry shape
6. Build **Entry List** (Prompt 7)—composes Entry Row, adds list behavior
7. Build **Main Scoring Screen** (Prompt 8)—composes all myK9Q components
8. Build **Stat Card** and **Schedule Row** (Prompts 9-10)—myK9Show building blocks
9. Build **Show Dashboard** (Prompt 11)—composes myK9Show components
10. Add **State Variations** (Prompt 12)—polish pass
11. Add **Responsive** (Prompt 13)—final polish

### Testing Checkpoints

After each prompt, verify:
- [ ] Component renders in light and dark mode
- [ ] All specified states are implemented
- [ ] Touch targets meet 44px minimum
- [ ] No hardcoded colors (uses tokens)
- [ ] Accessible (keyboard nav, screen reader)
