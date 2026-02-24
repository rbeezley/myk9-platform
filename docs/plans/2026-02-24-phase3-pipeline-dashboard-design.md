# Phase 3: Pipeline Dashboard — Design Document

**Date:** February 24, 2026
**Status:** Design Complete — Ready for Implementation Planning
**Depends on:** Phase 1 (Multi-Sport Templates), Phase 2 (Exhibitor Platform)
**Enables:** Better secretary workflow, reduced support burden

---

## Overview

The Pipeline Dashboard replaces the current secretary dashboard (tabs and cards) with a Kanban-style view showing every trial's progress through six stages. Each stage has a checklist. Checklist items auto-complete from data state where possible. The pipeline answers the secretary's core question: "What do I still need to do?"

---

## Six Pipeline Stages

```
Trial Setup → Classes & Elements → Entry Period → Scoring Day → Results & Reports → Closed
```

### Stage 1: Trial Setup

The trial exists but isn't configured yet.

**Canned checklist items:**
- Venue assigned (auto-completes when venue is set on trial)
- Dates confirmed (auto-completes when trial dates are set)
- Judge(s) assigned (auto-completes when at least one judge is linked)
- Entry fees set (auto-completes when fee schedule exists)

**Blocking rule:** Cannot advance to Stage 2 until venue, dates, and at least one judge are assigned.

### Stage 2: Classes & Elements

Classes are being configured for this trial.

**Canned checklist items:**
- Classes created (auto-completes when at least one class exists)
- Time limits set (auto-completes when all classes have time limits)
- Hide counts configured (auto-completes when all classes have hide counts)
- Class capacity set (auto-completes when all classes have entry limits)

**Blocking rule:** Cannot advance to Stage 3 until at least one class is fully configured.

### Stage 3: Entry Period

Entries are open. The trial is accepting exhibitor registrations.

**Canned checklist items:**
- Opening date set (auto-completes when entry open date exists)
- Closing date set (auto-completes when entry close date exists)
- Entries received (auto-completes when entry count > 0)
- Entry conflicts resolved (auto-completes when no flagged conflicts exist)
- Running order generated (auto-completes when running order exists)

**Blocking rule:** Cannot advance to Stage 4 until entries are closed and running order exists.

### Stage 4: Scoring Day

The trial is being scored. This stage links to the Scoring Day view (Phase 4).

**Canned checklist items:**
- All classes started (auto-completes when every class has status ≥ 'in_progress')
- All entries scored (auto-completes when every entry has a result)
- Results reviewed (manual — secretary confirms results are correct)

**Blocking rule:** Cannot advance to Stage 5 until all entries have results.

### Stage 5: Results & Reports

Scoring is complete. Reports and submissions are being prepared.

**Canned checklist items:**
- Results published (auto-completes when results visibility is set to public)
- Catalog/judge's book exported (manual — secretary confirms export)
- Organization submission prepared (manual — secretary confirms paperwork)

**Blocking rule:** Cannot advance to Stage 6 until results are published.

### Stage 6: Closed

Trial is archived. Read-only. No further changes.

---

## Checklist Behavior

### Canned items

System-defined. Auto-complete by reading data state (e.g., "Venue assigned" completes when `trial.venue_id` is not null). Cannot be deleted. Each item links to the relevant page — clicking "Venue assigned" navigates to the venue assignment screen.

### Custom items

Secretary-added. Free-text label. Manual check/uncheck only. Visually distinct (different icon or indent). Never block stage advancement. Examples: "Confirm parking with venue," "Order ribbons," "Email volunteers."

### Navigation

Each canned checklist item doubles as a navigation link. Clicking an incomplete item opens the relevant configuration screen. Clicking a completed item opens it in view mode.

---

## Conditional Checklists

Some checklist items appear only when relevant:

- "Entry conflicts resolved" — only appears if conflicts are detected
- "Waitlist processed" — only appears if waitlist entries exist (Phase 2)
- "Premium results synced" — only appears if exhibitors with premium subscriptions entered

This prevents clutter from irrelevant items.

---

## Parallel Gate (Scoring Day)

When a trial reaches Stage 4, the pipeline shows a summary card:

```
Scoring Day: 3 of 8 classes complete
  Interior Novice A  ✓ Complete (32/32 scored)
  Interior Novice B  ✓ Complete (28/28 scored)
  Container Novice A ✓ Complete (30/30 scored)
  Exterior Novice A  ◐ In Progress (15/25 scored)
  ...4 more classes
```

Clicking the Scoring Day card opens the full Scoring Day view (Phase 4).

---

## State Persistence

### `trial_checklist_state` table

Stores the state of each checklist item per trial:

- `trial_id` — FK to trials
- `stage` — which pipeline stage (1-6)
- `item_key` — canned item identifier or custom item UUID
- `item_type` — 'canned' | 'custom'
- `label` — display text (for custom items; canned items derive label from code)
- `completed` — boolean
- `completed_at` — timestamp
- `completed_by` — user_id (for manual completions)
- `auto_completed` — boolean (true if system completed it)

Canned items are re-evaluated on page load. If the underlying data changes (e.g., venue removed), the item un-completes automatically.

### `trial_pipeline_stage` column

Added to the `trials` table. Stores current stage (1-6). Advancing a stage requires all blocking checklist items to be complete.

---

## Activity Log

A timestamped feed of all significant actions on a trial. Replaces ad-hoc "who changed what" questions.

### What gets logged

- Stage transitions: "Trial moved to Entry Period by Jane at 3:42 PM"
- Checklist completions: "Venue assigned (auto-completed)"
- Entry events: "Entry #47 added by John Handler"
- Score submissions: "Interior Novice A — Dog #12 scored Q by Judge Smith"
- Configuration changes: "Time limit for Container Advanced changed from 3:00 to 3:30"
- Custom checklist: "Custom item 'Order ribbons' checked by Jane"

### Storage

**`activity_log`** table: trial_id, action_type, description, actor_id, actor_name, metadata (jsonb), created_at.

### Display

Filterable feed in a sidebar or tab on the pipeline view. Filters by: action type, actor, date range. Most recent first. Paginated.

---

## Database Changes

### New tables

**`trial_checklist_state`** — trial_id, stage, item_key, item_type, label, completed, completed_at, completed_by, auto_completed

**`activity_log`** — trial_id, action_type, description, actor_id, actor_name, metadata (jsonb), created_at

### Changes to existing tables

**`trials`** — Add `pipeline_stage` column (integer, 1-6, default 1)

---

## Validation Test

After Phase 3, a secretary should be able to:
1. See all their trials as cards in a Kanban-style pipeline
2. Click into a trial and see its checklist with auto-completed and manual items
3. Add custom checklist items ("Order ribbons")
4. Be blocked from advancing past Entry Period until entries are closed and running order exists
5. View the Activity Log showing a timeline of everything that happened on the trial

---

*Source: Brainstorming session 2026-02-24.*
