# Phase 4: Scoring Day Redesign — Design Document

**Date:** February 24, 2026
**Status:** Design Complete — Ready for Implementation Planning
**Depends on:** Phase 1 (Multi-Sport Templates), Phase 3 (Pipeline Dashboard)
**Enables:** Faster scoring workflow, better day-of-trial experience

---

## Overview

Phase 4 redesigns the scoring day experience with two views: a card grid overview showing all classes at a glance, and a keyboard-optimized class scoring panel for entering results. The goal is zero unnecessary clicks during the time-pressured scoring window.

---

## Scoring Day Overview (Card Grid)

The overview displays every class in the trial as a card. Not a Kanban board — classes run in parallel, not through sequential stages. The grid answers: "Where are we right now across all classes?"

### Card anatomy

Each card shows:

```
┌─────────────────────────────┐
│ Interior Novice A           │
│ ◐ In Progress               │
│ 15 of 32 scored             │
│ ████████░░░░░░░░ 47%        │
│ Judge: Smith                │
│ Next: Dog #16 — "Bella"     │
└─────────────────────────────┘
```

- **Class name** (element + level + section)
- **Status**: Not Started / In Progress / Complete
- **Progress**: scored count / total entries, with progress bar
- **Judge** assigned to this class
- **Next dog**: the next entry in running order that hasn't been scored

### Card states

| State | Visual | Meaning |
|-------|--------|---------|
| Not Started | Gray | No entries scored yet |
| In Progress | Blue | At least one entry scored, not all |
| Complete | Green | All entries have results |
| Blocked | Red/amber | Cannot start (dependency or missing config) |

### Blocked state

A class card shows blocked with a specific message when:
- No judge assigned: "Assign a judge to start scoring"
- No running order: "Generate running order first"
- No entries: "No entries in this class"
- Missing configuration: "Set time limits to enable scoring"

Clicking a blocked card navigates to the relevant configuration screen.

### Card interactions

- **Click card** → opens the class scoring panel for that class
- **Cards auto-refresh** via realtime subscription (scores entered on myK9Q appear without page reload)

### Layout

Responsive grid. Desktop: 3-4 cards per row. Tablet: 2 per row. Cards are sorted by: status (in progress first, then not started, then complete), then by class order.

---

## Class Scoring Panel

The detailed scoring view for a single class. Optimized for speed — keyboard-driven, minimal clicks.

### Layout

```
┌──────────────────────────────────────────────────┐
│ ← Back to Overview    Interior Novice A    32/32 │
├──────────────────────────────────────────────────┤
│ Running Order  │  Scoresheet                     │
│                │                                 │
│ ✓ #1 Rex    Q │  Dog: #16 Bella                  │
│ ✓ #2 Max   NQ │  Handler: Jane Smith             │
│ ✓ #3 Luna   Q │  Time Limit: 2:30                │
│ ...            │                                 │
│ ► #16 Bella    │  [Timer]  [Faults]  [Result]    │
│   #17 Rocky    │                                 │
│   #18 Daisy    │  [Submit & Next →]              │
│                │                                 │
└──────────────────────────────────────────────────┘
```

**Left panel:** Running order list with status indicators (Q/NQ/ABS/scored). Current dog highlighted. Click any dog to jump to their scoresheet.

**Right panel:** The scoresheet for the selected dog. Sport-specific fields driven by the template (Phase 1). Timer controls, fault entry, result submission.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| Enter | Submit score and advance to next dog |
| Q | Mark qualifying |
| N | Mark non-qualifying |
| A | Mark absent |
| T | Start/stop timer |
| ↑/↓ | Navigate running order |
| Esc | Back to overview |

### Auto-advance

After submitting a score, the panel automatically advances to the next unscored dog in running order. The secretary never needs to manually select the next entry during normal flow.

---

## Scribesheets

Printable scoring sheets for judges working without devices.

### Blank scribesheet

Generated before scoring day starts. One page per entry in running order.

Contains:
- Class header (element, level, section, date, judge)
- Dog info (armband number, registered name, breed, handler)
- Sport-specific scoring fields (matching the digital scoresheet layout)
- Timer record area
- Fault checkboxes
- Result: Q / NQ / ABS
- Signature line

### Populated scribesheet

Generated after scoring is complete. Same layout as blank, filled with recorded data. Used for:
- Judge review before results are finalized
- Record keeping and archival
- Dispute resolution

### Format

PDF export. Batch print all scribesheets for a class or for the entire trial. Layout matches the sport template's scoresheet configuration — AKC, UKC, and ASCA scribesheets have different fields.

---

## Realtime Sync

Scoring Day relies on realtime data flow between myK9Q (ringside scoring) and myK9Show (secretary overview).

- Scores entered on myK9Q sync via `@myk9/replication`
- Secretary's card grid updates automatically (Supabase realtime subscription)
- Progress bars, "next dog," and status indicators refresh without page reload
- Conflict resolution: last-write-wins with timestamp, matching existing replication strategy

---

## Database Changes

### No new tables required

Scoring Day uses existing tables:
- `entries` (with scoring fields already integrated)
- `classes` (status, configuration)
- `results` (individual scores)
- `trials` (pipeline_stage from Phase 3)

### Changes to existing tables

**`classes`** — Add `scoring_status` column ('not_started' | 'in_progress' | 'complete', computed from entry results but cached for quick reads)

---

## Validation Test

After Phase 4, a secretary should be able to:
1. Open Scoring Day from the pipeline and see all classes as cards with live progress
2. Click into a class and score entries using keyboard shortcuts without touching the mouse
3. See scores from myK9Q tablets appear on the overview in realtime
4. Print blank scribesheets before the trial and populated scribesheets after
5. A blocked class should show a clear message explaining what needs to be configured first

---

*Source: Brainstorming session 2026-02-24.*
