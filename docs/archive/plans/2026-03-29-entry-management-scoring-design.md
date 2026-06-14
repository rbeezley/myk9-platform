# Entry Management Page: Trial/Class Filters + Inline Scoring

**Date:** 2026-03-29
**Status:** Design approved, ready for implementation

## Problem

Secretaries must drill through Show > Trial > Class detail pages to score entries. Three separate entry tables exist (MyEntriesTab, TrialEntriesTable, ClassResultsTable) with different columns and capabilities. Instead of unifying those tables, enhance the existing Entry Management page to be the secretary's command center for both entry processing and scoring.

## Decision

Enhance `/secretary/entries/:showId` with cascading trial/class filters. When filtered to a class, enable inline scoring. The existing detail page entry tabs remain unchanged — they serve browsing/discovery. Entry Management becomes the secretary power tool.

## Design

### Filter Bar

Two cascading dropdowns added above existing search/status filters:

- **Trial filter:** Lists all trials for the show (date + name). "All Trials" to clear.
- **Class filter:** Disabled until trial selected. Lists classes for that trial (element + level + section). "All Classes" shows trial roster.

Existing status/payment filters stack with trial/class filters. The registration-workflow tab bar (All/Pending/Accepted/Waitlist/Move-Ups/Scratches/Issues) hides when a trial or class filter is active.

Filters sync to URL query params (`?trial={id}&class={id}`) for shareable/bookmarkable links.

### View Modes

Three view modes based on filter state:

#### 1. Show Level (no trial/class filter) — Registration Workflow
Current behavior unchanged. Registration columns, status tabs, bulk actions, comp/armband dialogs.

#### 2. Trial Level (trial selected, no class) — Read-Only Roster

Columns:
- **Armband** — ArmbandBadge
- **Dog** — name with breed subtitle
- **Handler** — handler name
- **Class** — element + level, clickable to apply class filter
- **Check-In** — CheckInStatusBadge
- **Scoring** — "Scored" (green) / "Pending" (muted) / "—"

Grouped by class with collapsible headers showing "4/12 scored" summary. Table only (no card view). Stats cards show trial numbers: Total Entries, Scored, Pending, Checked In, Absent.

#### 3. Class Level (class selected) — Inline Scoring

Columns:
- **Armband** — ArmbandBadge
- **Dog & Handler** — dog name + handler subtitle
- **Check-In** — CheckInStatusBadge (clickable)
- **Qualification** — editable (Q/NQ/ABS/EX)
- **Search Time** — editable TimeInput (Tab/Enter advances)
- **Faults** — editable number input
- **Notes** — editable text
- **Clear** — erase button (visible when row has edits)

SubTabs: Pending/Completed/All with badge counts. SearchBar + ViewToggle (cards/table) + Submit button with edit count. Registration UI hides; action bar shows "Back to Trial" and "Submit Scores."

### Navigation & Deep Links

From detail pages into Entry Management:
- **ShowDetailsPage** — existing "Manage Entries" button → `/secretary/entries/{showId}`
- **TrialDetailsPage** — "Manage Entries" → `/secretary/entries/{showId}?trial={trialId}`
- **ClassDetailsPage** — "Score in Entry Management" → `/secretary/entries/{showId}?trial={trialId}&class={classId}`

Breadcrumb above filters: `All Entries > Trial 1 (Mar 29) > Novice Interior`. Each segment clickable to widen filter. Browser back works naturally.

### Implementation Strategy

**Extract from ClassResultsTable:**
- `useClassResults` hook — already exists, manages scoring state/edits/submission
- Scoring column definitions → shared `scoringColumns.ts`
- SubTabs scoring logic (isEntryScored, badge counts) — already generic

**ClassResultsTable stays:** Remains on ClassDetailsPage, shares underlying hook and columns.

**New code:**
- Trial/class filter dropdowns in `useEntryManagementFilters`
- Conditional view switching (registration vs roster vs scoring) based on filter state
- Trial roster columns + class grouping with collapsible headers
- Breadcrumb filter navigation component

**Testing:**
- Unit tests for filter logic and view-mode switching
- Unit tests for scoring column reuse
- Existing `useClassResults` tests cover scoring behavior

### What This Replaces

This does NOT replace the detail page entry tabs. Those serve exhibitors, public users, and judges browsing show/trial/class information. Entry Management is the secretary-only operational tool.

The TODO "Unify entries table columns and capabilities across detail pages" is resolved by this approach — instead of forcing three tables into one shared component, we give secretaries a single powerful page and leave the browsing views purpose-built for their audiences.
