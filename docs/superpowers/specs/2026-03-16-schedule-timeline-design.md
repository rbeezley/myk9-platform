# Schedule Timeline Design Spec

> Replaces the flat-text Schedule section on the Show Overview tab and adds an expanded timeline to the Trial detail page.

## Problem

The current Schedule section on the Show Overview tab displays a comma-separated list of class names under each trial. This gives exhibitors no sense of run order, timing, or progress. Exhibitors need to answer two questions:

1. **Before entering:** "What elements run and when? Do I need to be there at 8 AM or can I arrive later?"
2. **Day-of:** "Where are they in the trial? Has my element started yet?"

## Solution

Two components sharing a visual language (vertical spine with status-colored dots):

1. **`ScheduleTimeline`** — compact overview on the Show Overview tab
2. **`TrialTimeline`** — expanded detail on the Trial detail page

## Audience

Exhibitors. The timeline helps them plan their day (pre-entry) and track live progress (day-of).

## Sport Compatibility

Designed for scent sports (Scent Work, Nose Work, Scent Detection) but works for agility, obedience, and any sport using the element/level class hierarchy. The grouping concept (element) adapts naturally:

- **Scent Work:** Container, Buried, Interior, Exterior
- **Agility:** Standard, Jumpers (by course type or jump height)
- **Obedience:** Exercises grouped by class/level, with judges running concurrent rings

---

## Component 1: ScheduleTimeline (Show Overview Tab)

Replaces the existing `ScheduleSummary` component in the Schedule section.

### Layout

- **Day heading** — orange text, e.g., "Saturday, April 4, 2026"
- **Trial grid** — same-day trials in a **2-column grid** (stacks to 1 column on mobile)
- **Trial label** — "Trial N" with the trial's `planned_start_time` (e.g., "Trial 1 · 8:00 AM")
- **Vertical spine** — line with status-colored dots per element
- **Element cards** — compact cards to the right of the spine

### Element Card Contents

| Field        | Source                                               |
| ------------ | ---------------------------------------------------- |
| Element name | Distinct `element` values from trial's classes       |
| Start time   | Earliest `start_time` among classes for this element |
| Level range  | Abbreviated range, e.g., "Nov–Mst"                   |
| Status badge | Derived from child class statuses (see Status Logic) |

### Multi-Trial Layout

When a day has 2+ trials, they display side-by-side in a 2-column CSS grid. Each trial has its own independent spine. On mobile (<640px), the grid collapses to a single column.

Days are separated by a horizontal divider.

### Navigation

Clicking any element card navigates to the **trial detail page**: `/shows/:showId/trials/:trialId`.

### Data Source

Creates a new `useScheduleTimeline` hook (query key: `['shows', showId, 'schedule-timeline']`). The existing `useScheduleSummary` hook and `ScheduleClassRow` type don't include `start_time`, `status`, or `planned_start_time` — extending them would change the shape of data used by other consumers. The new hook queries:

```
trials: date, trial_number, planned_start_time
  → classes: name, element, level, start_time, status, total_entries_count
```

Groups classes by element within each trial, ordered by earliest `start_time`. Raw class statuses must be passed through `normalizeClassStatus()` from `@myk9/core` before status derivation (DB stores `'no-status'`, `'in-progress'`, etc.; the app uses `'Scheduled'`, `'In Progress'`, etc.).

The existing `ScheduleSummary` component and its `useScheduleSummary` hook remain in the codebase until `ScheduleTimeline` fully replaces them — then both should be removed along with the existing test at `src/test/components/ScheduleSummary.test.tsx`.

---

## Component 2: TrialTimeline (Trial Detail Page)

### Layout

- **Judge header** — avatar initials (colored circle), judge name, ring number if applicable. Separated by a subtle bottom border.
- **Vertical spine per judge** — same spine style as overview, with status dots
- **Element accordion cards** — expandable cards for each element

### Accordion Behavior

**Collapsed state (default):**

| Field             | Display                                    |
| ----------------- | ------------------------------------------ |
| Expand arrow      | ▶ (collapsed) / ▼ (expanded)               |
| Element name      | e.g., "Container"                          |
| Start time        | Earliest class start time for this element |
| Progress fraction | e.g., "1/4" or "5/5 ✓"                     |

**Expanded state (auto for in-progress elements):**

Nested list with a left border line showing each level:

| Field            | Display                                          |
| ---------------- | ------------------------------------------------ |
| Level name       | e.g., "Novice", "Advanced"                       |
| Entry count      | Number of entries for that class                 |
| Status indicator | ✓ (complete), ● (in progress), blank (upcoming)  |
| Active highlight | In-progress level gets a subtle amber background |

### Navigation

Clicking a **level row** in the expanded accordion navigates to the **class detail page**: `/shows/:showId/trials/:trialId/classes/:classId`.

### Data Source

Creates a `useTrialTimeline` hook (query key: `['trials', trialId, 'timeline']`). Classes don't have a `judge_id` column directly — judge-to-class mapping lives in the `judge_assignments` table (`person_id`, `class_id`). The query joins:

```
classes (for this trial): id, name, element, level, start_time, status, total_entries_count
  → judge_assignments: person_id, class_id
  → people: first_name, last_name (for judge display name)
```

Groups results by judge (`person_id`), then by `element` within each judge, ordered by `start_time`. Raw class statuses must be passed through `normalizeClassStatus()` before status derivation.

Classes with no `judge_assignments` row are grouped under an "Unassigned" section.

---

## Status Logic

### Element Status Derivation

Element status is derived from its child class statuses. Raw DB statuses must first be normalized via `normalizeClassStatus()` from `@myk9/core` to canonical `CLASS_STATUS` values before applying this logic:

| Condition                                          | Element Status                       | Dot Color         |
| -------------------------------------------------- | ------------------------------------ | ----------------- |
| All classes `Completed`                            | Complete                             | Green (`#22c55e`) |
| Any class `In Progress`                            | In Progress                          | Amber (`#f59e0b`) |
| All classes `Scheduled`                            | Upcoming                             | Gray (`#64748b`)  |
| Mixed `Completed` + `Scheduled` (none in progress) | In Progress                          | Amber (`#f59e0b`) |
| All classes `Cancelled`                            | Cancelled                            | Gray (`#64748b`)  |
| Some `Cancelled`, others active                    | Derive from remaining active classes | Per above rules   |

### Spine Line

- Solid `#334155` (slate-700) connecting dots vertically
- 2px wide

### Status Badge (Overview)

Uses existing `getClassStatusDisplay()` and `getClassStatusBadgeClasses()` from `@myk9/core` for consistent styling with the rest of the app.

---

## Level Range Display

Levels are abbreviated and shown as a range using the existing progression order from `schedule-summary.ts`:

| Full      | Abbreviated |
| --------- | ----------- |
| Novice    | Nov         |
| Advanced  | Adv         |
| Open      | Open        |
| Excellent | Exc         |
| Utility   | Util        |
| Master    | Mst         |

Range format: `{lowest}–{highest}` (e.g., "Nov–Mst", "Adv–Exc").

If only one level exists, show it alone (e.g., "Nov").

---

## Component Architecture

```
ScheduleTimeline (Overview)
├── DaySection (repeats per day)
│   └── TrialSpine (2-col grid, repeats per trial)
│       └── ElementCard (repeats per element)

TrialTimeline (Trial Detail)
├── JudgeSection (repeats per judge)
│   └── JudgeSpine
│       └── ElementAccordion (repeats per element)
│           └── LevelRow (repeats per level, visible when expanded)
```

### Accordion Implementation

`ElementAccordion` uses Base UI's `Collapsible` primitive (from `@base-ui/react/collapsible`) for the expand/collapse behavior, consistent with the project's UI library choice (Base UI, not Radix).

### Shared Components

- **StatusDot** — colored circle (10px on overview, 10px on trial detail)
- **SpineLine** — vertical connecting line between dots
- **StatusBadge** — reuses existing class status badge styling

### File Organization

```
src/components/schedule/
├── ScheduleTimeline.tsx        # Overview component
├── TrialTimeline.tsx           # Trial detail component
├── DaySection.tsx              # Day heading + trial grid
├── TrialSpine.tsx              # Single trial's spine + element cards
├── ElementCard.tsx             # Compact element card (overview)
├── JudgeSection.tsx            # Judge header + spine
├── ElementAccordion.tsx        # Expandable element (trial detail)
├── LevelRow.tsx                # Single level row in accordion
├── StatusDot.tsx               # Shared status dot
├── SpineLine.tsx               # Shared spine line
└── schedule-timeline.utils.ts  # Grouping, status derivation, level formatting
```

---

## Database Changes

**None required.** All data exists across existing tables:

- `trials.planned_start_time` — trial start time
- `trials.date`, `trials.trial_number` — day grouping and trial label
- `classes.start_time` — class/element start time
- `classes.element` — element name
- `classes.level` — level name
- `classes.status` — class status (normalize via `normalizeClassStatus()`)
- `classes.total_entries_count` — entry count
- `judge_assignments.person_id` + `judge_assignments.class_id` — judge-to-class mapping
- `people.first_name` + `people.last_name` — judge display name

---

## Mobile Behavior

| Breakpoint        | Overview                      | Trial Detail         |
| ----------------- | ----------------------------- | -------------------- |
| Desktop (≥1024px) | 2-column trial grid           | Full width accordion |
| Tablet (≥640px)   | 2-column trial grid           | Full width accordion |
| Mobile (<640px)   | Single column, trials stacked | Full width accordion |

---

## Loading & Error States

- **Loading:** Skeleton shimmer matching the spine + card layout (2-3 placeholder cards with a gray spine)
- **Error:** Inline error message with retry button, consistent with existing error patterns in the app
- **Empty (no trials):** "No schedule available" message in the Schedule section

## Dark Mode

Status dot colors use Tailwind utility classes (e.g., `bg-green-500`, `bg-amber-500`, `bg-slate-500`) rather than hardcoded hex values. This ensures consistency with the existing `CLASS_STATUS_DISPLAY` dark mode variants (`darkBgClass`, `darkTextClass`). The spine line uses `bg-slate-700` (adapts via Tailwind dark mode).

## Edge Cases

- **No classes in trial:** Show trial label with "No classes scheduled" message
- **No start time on classes:** Omit time, show "TBD"
- **Single element trial:** Still renders spine with one dot (no line needed below it)
- **Trial with no judge assigned:** On trial detail, group under "Unassigned" section
- **All classes cancelled:** Element shows cancelled status, dot is gray

---

## Testing

- Unit tests for status derivation logic (all status combinations)
- Unit tests for level range formatting
- Unit tests for grouping utilities (by day, by trial, by judge, by element)
- Component tests for ScheduleTimeline with mock data
- Component tests for TrialTimeline accordion expand/collapse behavior
- Component tests for navigation (click element → trial page, click level → class page)
- Mobile responsive rendering tests
