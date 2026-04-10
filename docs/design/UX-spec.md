# UX Specification: myK9 Platform

**Source:** [PRD.md](./PRD.md)
**Date:** 2026-01-13
**Scope:** myK9Show (show management) + myK9Q (ringside scoring)

---

## Pass 1: Mental Model

### myK9Show (Show Management)

**Primary user intent:** "I want to organize and run a dog show smoothly from setup to results."

**Likely misconceptions:**
- "I need internet to do anything" → System works offline; sync happens when connected
- "Changes are lost if I lose connection" → All changes saved locally first
- "I have to finish setup in one session" → Progress saved automatically
- "Results update only when I manually refresh" → Real-time sync when online

**UX principle to reinforce:** **Offline-first confidence** — User should never worry about connectivity. System should feel like a local app that happens to sync.

### myK9Q (Ringside Scoring)

**Primary user intent:** "I want to score dogs quickly and accurately without fumbling with technology."

**Likely misconceptions:**
- "I need to wait for sync before the next entry" → Scores save instantly, sync in background
- "Timer needs manual tracking" → Timer auto-tracks and warns at thresholds
- "I can accidentally lose scores" → All scores persisted immediately to local storage
- "I need admin access to fix mistakes" → Steward/Judge can edit within their scope

**UX principle to reinforce:** **Speed and confidence** — Every tap should feel instant. No spinners for local operations. Visual confirmation of every action.

### Cross-App Mental Model

**Shared expectation:** Both apps are part of one system. Data entered in myK9Show appears in myK9Q without manual transfer.

**Likely misconception:** "These are separate apps with separate data" → Unified database, shared via license key.

---

## Pass 2: Information Architecture

### All User-Visible Concepts

**Show Management Domain:**
- Show/Event
- Club/Organization
- Venue/Location
- Date/Schedule
- Ring
- Class/Division
- Level (Novice, Open, Master, etc.)
- Sport Type (Scent Work, Fast CAT, Rally, etc.)

**Entry Domain:**
- Entry
- Entry Number
- Dog
- Handler/Exhibitor
- Registration
- Scratch/Withdrawal

**Scoring Domain:**
- Score/Result
- Time/Duration
- Faults/Deductions
- Qualifying (Q) / Non-Qualifying (NQ)
- Placement (1st, 2nd, etc.)

**People Domain:**
- Exhibitor
- Steward
- Judge
- Administrator

**System Domain:**
- Sync Status
- Offline Mode
- License Key

---

### Grouped Structure

#### 1. Event Setup (Admin-focused)
| Concept | Visibility | Rationale |
|---------|------------|-----------|
| Show/Event | Primary | Core organizing unit |
| Venue | Primary | Required for logistics |
| Date/Schedule | Primary | Required for planning |
| Ring | Primary | Required for operations |
| Class/Division | Primary | Required for entries |
| Level | Secondary | Within class context |
| Sport Type | Secondary | Inferred from class |
| Club/Organization | Hidden | Set once, rarely changed |
| License Key | Hidden | System-managed |

#### 2. Entry Management (Admin + Exhibitor)
| Concept | Visibility | Rationale |
|---------|------------|-----------|
| Entry | Primary | Main data object |
| Entry Number | Primary | Key identifier in ring |
| Dog | Primary | Subject of entry |
| Handler | Secondary | Usually same as exhibitor |
| Scratch | Secondary | Exception handling |
| Registration | Hidden | Pre-show only |

#### 3. Ring Operations (Steward + Judge)
| Concept | Visibility | Rationale |
|---------|------------|-----------|
| Entry List | Primary | What they manage |
| Current Entry | Primary | Focus of attention |
| Entry Status | Primary | Pending/In Ring/Scored |
| Timer | Primary | For timed events |
| Score Entry | Primary | Core task |
| Result | Primary | Q/NQ outcome |
| Faults | Secondary | For deduction-based sports |
| Sync Status | Secondary | Awareness indicator |

#### 4. Results & Reporting (All roles)
| Concept | Visibility | Rationale |
|---------|------------|-----------|
| Placements | Primary | Main output |
| Class Results | Primary | Grouped view |
| Individual Score | Secondary | Detail on demand |
| Export | Hidden | Admin tool |

---

## Pass 3: Affordances

### Core Action Affordances

| Action | Visual/Interaction Signal |
|--------|---------------------------|
| Create new (show, entry, etc.) | Prominent "+" button or "New X" |
| Select from list | Tappable rows with hover/press state |
| Edit existing | Inline edit or pencil icon |
| Delete/Scratch | Red destructive action, requires confirmation |
| Save | Implicit (auto-save) + visual confirmation |
| Navigate back | Left arrow or swipe gesture |
| Change status | Toggle or segmented control |
| Start timer | Play button with clear "Start" label |
| Stop timer | Stop button replaces Start |
| Submit score | Primary action button at form bottom |
| Sync data | Automatic; status indicator only |

### Affordance Rules

- **If user sees a card/row:** They can tap to see details or select it
- **If user sees a form field:** It's editable (unless visually disabled)
- **If user sees a primary colored button:** It's the main action
- **If user sees red:** It's destructive or an error
- **If user sees green/teal:** It's success or primary brand
- **If user sees a spinner:** System is working; wait (rare for local ops)
- **If user sees a badge/pill:** It's status information, not actionable
- **If user sees time:** It's the timer value; tapping timer area controls it

### Role-Specific Affordances

| Role | Primary Actions Available |
|------|---------------------------|
| Admin | Create, Edit, Delete, Assign, Export |
| Exhibitor | Register, View, Scratch own entries |
| Steward | Call entry, Mark status, Reorder queue |
| Judge | Score, Time, Submit result |

---

## Pass 4: Cognitive Load

### Friction Points Identified

| Moment | Type | Simplification |
|--------|------|----------------|
| "Which class to score?" | Choice | Default to assigned ring; highlight current class |
| "Is this score saved?" | Uncertainty | Instant visual confirmation ("Saved ✓") |
| "What's the max time?" | Uncertainty | Show max time prominently near timer |
| "Did my sync work?" | Uncertainty | Subtle but visible sync indicator |
| "Which entry is next?" | Choice | Auto-highlight next entry; steward can override |
| "Q or NQ for this score?" | Choice | Auto-calculate from rules where possible |
| "How do I scratch an entry?" | Uncertainty | Action available in entry context menu |
| "Where are my results?" | Uncertainty | Results tab always visible; real-time updates |

### Defaults Introduced

| Default | Rationale |
|---------|-----------|
| Auto-advance to next entry after scoring | Reduces navigation clicks |
| Timer auto-stops at max time | Prevents over-timing, captures exact value |
| Entries sorted by entry number | Familiar convention |
| Current ring auto-selected for Judge/Steward | Based on assignments |
| Q/NQ calculated from score rules | Reduces decision burden |
| Dark mode matches system preference | No manual toggle needed |

### Progressive Disclosure

| Level 1 (Always Visible) | Level 2 (On Demand) | Level 3 (Settings/Admin) |
|--------------------------|---------------------|--------------------------|
| Entry list | Entry details | Entry edit form |
| Timer + Score input | Fault breakdown | Scoring rules reference |
| Sync indicator | Sync history | Manual sync trigger |
| Class results | Individual scoresheets | Export options |

---

## Pass 5: State Design

### Entry List (myK9Q)

| State | User Sees | User Understands | User Can Do |
|-------|-----------|------------------|-------------|
| Empty | "No entries yet" message | Class has no registrations | Navigate to different class |
| Loading | Skeleton rows (brief) | Data loading from cache | Wait (< 500ms) |
| Success | Entry rows with numbers/names | Ready to score | Tap to select, scroll to browse |
| Partial | Entries with sync indicator | Some data still syncing | Use available entries, wait for sync |
| Error | Error banner + retry | Sync failed | Tap to retry, continue offline |

### Timer (myK9Q)

| State | User Sees | User Understands | User Can Do |
|-------|-----------|------------------|-------------|
| Ready | "0:00" + Start button | Timer not started | Tap Start |
| Running | Counting time + Stop button | Dog is being timed | Tap Stop, watch time |
| Warning | Yellow highlight (approaching max) | Time running low | Continue or stop |
| Expired | Red highlight + auto-stop | Max time reached | Record result |
| Stopped | Final time displayed | Run complete | Clear or record |

### Score Entry Form (myK9Q)

| State | User Sees | User Understands | User Can Do |
|-------|-----------|------------------|-------------|
| Empty | Blank form with prompts | Ready to enter score | Fill in fields |
| Valid | Filled form, enabled submit | Ready to save | Submit |
| Invalid | Error highlights on fields | Something wrong | Fix errors |
| Submitting | Brief loading on button | Saving in progress | Wait (< 200ms) |
| Saved | Success confirmation | Score recorded | Move to next entry |

### Sync Status (Both Apps)

| State | User Sees | User Understands | User Can Do |
|-------|-----------|------------------|-------------|
| Synced | Green checkmark (subtle) | All data up to date | Nothing needed |
| Syncing | Animated sync icon | Upload/download in progress | Wait, continue working |
| Pending | Orange dot | Local changes not yet synced | Continue working; will sync |
| Offline | Gray cloud-off icon | No internet connection | Work offline confidently |
| Error | Red warning icon | Sync problem | Tap to see details/retry |

### Show Setup (myK9Show)

| State | User Sees | User Understands | User Can Do |
|-------|-----------|------------------|-------------|
| Empty | Setup wizard prompt | New show needs configuration | Start wizard |
| Draft | Incomplete indicators | Show not ready for entries | Continue setup |
| Ready | Green "Ready" badge | Show can accept entries | Open registration |
| Active | "In Progress" badge | Show happening now | Monitor/score |
| Complete | "Completed" badge | Show finished | View results, export |

---

## Pass 6: Flow Integrity

### Flow Risks

| Risk | Where | Mitigation |
|------|-------|------------|
| Judge scores wrong entry | Score entry screen | Prominent entry number + dog name at top |
| Steward marks wrong status | Entry list | Confirm before status change affects ring flow |
| Admin deletes active show | Show management | Require confirmation + prevent if entries exist |
| User thinks data is lost | After network drop | Persistent "offline mode" indicator + reassurance |
| Timer started for wrong entry | Timer screen | Show entry info next to timer |
| Exhibitor enters wrong class | Registration | Validate dog eligibility before confirming |
| Results viewed before complete | Results screen | Show "X of Y scored" progress indicator |

### Visibility Decisions

**Must be visible:**
- Current entry number and dog name (always during scoring)
- Timer value (always during timed events)
- Sync status (always, but subtle when healthy)
- Role indicator (so user knows their permissions)
- Offline mode indicator (when disconnected)
- Unsaved changes indicator (if any exist)

**Can be implied:**
- License key (system-managed, never shown)
- Database sync details (just show status)
- Other users' activities (unless collaboration feature added)
- Scoring rules (show only when relevant)
- Max time (show only during timed events)

### UX Constraints for Visual Phase

1. **No full-screen loaders** — Local operations must feel instant
2. **No modals for routine actions** — Inline editing preferred
3. **Destructive actions require confirmation** — But non-destructive don't
4. **Timer must be visible during entire scoring** — No scrolling away
5. **Entry context always visible** — Number + name on every score-related screen
6. **Offline must feel like online** — Same UX, just with sync indicator change
7. **Touch-first design** — Large tap targets (44px minimum)
8. **Glanceable status** — Colors convey meaning; no reading required
9. **Consistent navigation** — Back always works; breadcrumbs for deep flows

---

## Visual Specifications

*Now that all 6 passes are complete, visual specifications follow.*

### Design System Foundation

#### Color Palette

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| Background | #F8F7F4 (warm off-white) | #1a1a1e (warm charcoal) | App background |
| Card | #FEFDFB (subtle cream) | #26292e | Elevated surfaces |
| Primary | #14b8a6 (teal) | #14b8a6 | Primary actions, links |
| Success | #22c55e | #22c55e | Positive states |
| Warning | #f97316 | #fb923c | Approaching limits |
| Destructive | #ef4444 | #dc2626 | Errors, delete actions |
| Muted | #6b7280 | #9ca3af | Secondary text |

#### Accent Color Options (User-selectable)

| Accent | Primary Color | Hover |
|--------|---------------|-------|
| Green (default) | #14b8a6 | #0d9488 |
| Blue | #3b82f6 | #2563eb |
| Orange | #f97316 | #ea580c |
| Purple | #8b5cf6 | #7c3aed |

#### Typography

| Element | Size | Weight | Usage |
|---------|------|--------|-------|
| Page Title | 1.5rem | 600 | Main headings |
| Section Title | 1.125rem | 600 | Card headers |
| Body | 1rem | 400 | General text |
| Caption | 0.875rem | 400 | Secondary info |
| Entry Number | 1.25rem | 700 | Prominent identifiers |
| Timer Display | 2rem | 600 | Timer value |

#### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Tight gaps |
| sm | 8px | Related elements |
| md | 16px | Section padding |
| lg | 24px | Card padding |
| xl | 32px | Page margins |

### Component Specifications

#### Entry Row (myK9Q)
```
┌─────────────────────────────────────────────┐
│ [#23]  Buddy the Golden        [Status Tag] │
│        Handler: Jane Smith                  │
└─────────────────────────────────────────────┘
```
- Height: 72px minimum (touch-friendly)
- Entry number: Bold, primary color
- Status tag: Colored pill (Pending=gray, In Ring=blue, Scored=green)
- Tap anywhere to select

#### Timer Component (myK9Q)
```
┌─────────────────────────────────────────────┐
│              2:34.56                        │
│         Max time: 3:00                      │
│                                             │
│    [  STOP  ]  or  [  START  ]              │
└─────────────────────────────────────────────┘
```
- Timer value: Large, centered, monospace
- Max time: Smaller, muted text below
- Button: Full-width primary action
- Warning state: Yellow background when 80% of max time
- Expired state: Red background, auto-stopped

#### Score Entry Card (myK9Q)
```
┌─────────────────────────────────────────────┐
│ Entry #23: Buddy                            │
├─────────────────────────────────────────────┤
│ Result:  ( ) Find  ( ) No Find              │
│                                             │
│ Time:    [  2:34  ]                         │
│                                             │
│ Faults:  [  0  ]                            │
│                                             │
│ Notes:   [___________________________]      │
├─────────────────────────────────────────────┤
│              [ Submit Score ]               │
└─────────────────────────────────────────────┘
```
- Entry context always at top
- Radio buttons for binary choices
- Numeric steppers for counts
- Primary button for submit

#### Sync Indicator
```
Synced:    ✓ (green, subtle)
Syncing:   ↻ (animated, teal)
Pending:   ● (orange dot)
Offline:   ☁✕ (gray)
Error:     ⚠ (red, tappable)
```
- Position: Top-right of screen or in header
- Size: 24px icon
- Tooltip on hover/long-press

### Screen Layouts

#### myK9Q: Main Scoring Screen
```
┌─────────────────────────────────────────────┐
│ [←] Ring 1 - Novice Interior    [Sync: ✓]  │
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │              Timer: 1:45                │ │
│ │           [    STOP    ]                │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ #23 Buddy - In Ring                     │ │
│ │ Result: (●) Find  ( ) No Find           │ │
│ │ Time: 1:45                              │ │
│ │ Faults: [ 0 ]                           │ │
│ │ [          Submit Score          ]      │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ── Up Next ──                               │
│ #24 Max - Pending                           │
│ #25 Luna - Pending                          │
└─────────────────────────────────────────────┘
```

#### myK9Show: Show Dashboard
```
┌─────────────────────────────────────────────┐
│ [≡] Summer Scent Trial        [●] [Avatar] │
├─────────────────────────────────────────────┤
│                                             │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│ │ Entries  │ │  Rings   │ │ Results  │     │
│ │    47    │ │    4     │ │   23/47  │     │
│ └──────────┘ └──────────┘ └──────────┘     │
│                                             │
│ Today's Schedule                            │
│ ┌─────────────────────────────────────────┐ │
│ │ 8:00 AM  Ring 1: Novice Interior        │ │
│ │ 8:00 AM  Ring 2: Novice Container       │ │
│ │ 10:00 AM Ring 1: Open Interior          │ │
│ │ ...                                     │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Quick Actions                               │
│ [ + Add Entry ]  [ View Results ]           │
└─────────────────────────────────────────────┘
```

### Responsive Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| Mobile | < 640px | Single column, stacked |
| Tablet | 640-1024px | Two columns, side panel |
| Desktop | > 1024px | Full dashboard, multi-panel |

**myK9Q primary target:** Tablet (iPad-optimized for ringside)
**myK9Show primary target:** Desktop (admin workflows)

### Interaction Specifications

| Interaction | Behavior |
|-------------|----------|
| Entry tap | Select for scoring, show detail |
| Entry long-press | Context menu (scratch, reorder) |
| Swipe entry left | Quick scratch action |
| Timer tap | Toggle start/stop |
| Pull-to-refresh | Manual sync trigger |
| Form submit | Haptic feedback on success |

### Accessibility Requirements

- Color contrast: 4.5:1 minimum for text
- Touch targets: 44x44px minimum
- Focus indicators: Visible ring on keyboard navigation
- Screen reader: All interactive elements labeled
- Motion: Respect prefers-reduced-motion
- Font scaling: Support 200% text zoom

---

## Appendix: Mapping to PRD Requirements

| PRD Requirement | UX Pass | Visual Specification |
|-----------------|---------|----------------------|
| F3: Offline-first | Pass 1, 5 | Sync indicator, instant feedback |
| F4: PWA | Pass 6 | Install prompt, offline banner |
| F12-15: Replication | Pass 5 | Sync states design |
| F17-19: Multi-tenant | Pass 2 | Hidden license key concept |
| Scoring rules | Pass 4 | Auto-calculate Q/NQ |
| Entry management | Pass 3 | Status affordances |
