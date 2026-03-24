# Class Details Page Redesign

**Date:** 2026-03-24
**Status:** Design approved, pending implementation
**Scope:** Structural + visual refresh of the Class Details page in myK9Show

---

## Problem

The Class Details page is the weakest of the three detail pages (Show, Trial, Class). It suffers from:

1. **Information duplication** — Judge and Trial Date appear in both the hero and the info grid
2. **Buried results** — The entries/results table (the most important content for both secretaries and exhibitors) sits below a large info card and expandable sections
3. **Visual flatness** — Cards and sections lack the polish of Show Details (QuickInfoCards, two-column layout, sidebar)
4. **No requirements reference** — Class requirements (hides, distractions, time limits, area size) from the `class_requirements` table aren't surfaced, despite being critical for Scent Work classes

## Audience

Both roles use this page equally:

- **Secretary** — entering scores, managing entries, checking class logistics. Intent: "That was easy."
- **Exhibitor** — checking results, viewing placement, understanding class setup. Intent: "This respects my time."

## Design Decisions

### Layout: Compact Header + Full-Width Results

Chosen over sidebar layout and tabbed layout. The page becomes three zones stacked vertically:

1. **Compact Header** — hero merged with class info (metadata strip)
2. **Stats Row** — 3 stat cards with progress bars
3. **Results Table** — full-width, dominant section

### Header: Metadata Strip

The hero and class info merge into one component. No data duplication.

**Top row:**

- Class name (element + level, e.g., "Detective Unknown")
- Status badge (Scheduled, In Progress, Completed)
- Section label (e.g., "Section A")
- Actions: Edit button + overflow menu (delete)

**Metadata strip** (bordered horizontal row below, like Show Details QuickInfoCards):

- Judge
- Trial name
- Date
- Entry Fee
- Max Entries
- Time Limit

If officials (Gate Steward, Table Steward, etc.) are assigned, they appear as additional metadata in the strip or as a subtle secondary line under the judge field.

**Removed from header:** "Enter Scores" button moves to the results table.

### Stats Row

Three stat cards using the existing `StatCard` and `StatsGrid` components from `@myk9/ui`:

| Stat           | Icon               | Color          | Subtitle                                    | Progress           |
| -------------- | ------------------ | -------------- | ------------------------------------------- | ------------------ |
| Entries        | Users (Lucide)     | primary (blue) | "{completed} completed · {pending} pending" | completed / total  |
| Qualified Rate | Award (Lucide)     | emerald        | "{qualified} qualified · {nq} NQ"           | qualified / scored |
| Avg Score      | BarChart3 (Lucide) | purple         | "Out of {max} · Class average"              | score / max        |

Stats only render when there are entries. Empty state shows nothing (no empty stat cards).

### Results Table

The primary content section. Full-width card with:

**Table header bar:**

- Title: "Entries & Results" + entry count
- Actions: Requirements button (opens drawer), Enter Scores (primary CTA), + Add Entry

**Columns:**

- Armband #
- Handler name
- Dog name
- Status (new column — see below)
- Score
- Time
- Q/NQ badge
- Placement
- Row actions (overflow menu: edit, delete)

**Dog Status column** — operational status badges:

- Checked In (green)
- In Ring (blue/active)
- On Deck (amber)
- Conflict (red)
- Not Checked In (muted)

**Table footer:**

- Entry count summary
- Keyboard shortcut hint (Ctrl+S to save)
- Submit Results button (when scores are pending)

### Requirements Drawer

A slide-out sheet (using shadcn/ui Sheet component) triggered by the "Requirements" button on the results table header.

**Content:** Read-only rules reference from the `class_requirements` table, queried by organization + element + level. This is a port of myK9Q's `ClassRequirementsDialog` adapted to a sheet layout.

**Header:**

- Title: "Class Requirements"
- Badges: Organization (AKC/UKC/ASCA), Element, Level

**Requirement cards** (each with Lucide icon, colored icon background, value, and subtitle):

| Requirement    | Icon          | Color   | Example Value         | Subtitle                               |
| -------------- | ------------- | ------- | --------------------- | -------------------------------------- |
| Time Limit     | Clock         | blue    | "2:00 – 3:00"         | "Range allowed · No 30-second warning" |
| Hides          | Target        | red     | "1 – 3"               | "Number unknown to handler"            |
| Distractions   | AlertTriangle | amber   | "2 – 3"               | "Placed in search area"                |
| Area Size      | MapPin        | emerald | "200 – 400 sq ft"     | "Per search area"                      |
| Search Areas   | LayoutGrid    | purple  | "1 – 2"               | "Blank area possible"                  |
| Required Calls | MessageSquare | pink    | "Alert + Finish"      | "AKC standard calls"                   |
| Max Height     | Ruler         | slate   | "24 inches"           | Only shown when applicable             |
| Arrangement    | Package       | slate   | Container layout info | Only for Container/Buried Novice A     |

Cards only render when the field has data. The drawer adapts to the organization — AKC shows "Required Calls," UKC shows "Final Response."

**Footer:** Source attribution (e.g., "Source: AKC Scent Work Regulations")

### What Gets Removed

- **Class Information Card** (8-item grid) — absorbed into the header metadata strip
- **Expandable sections for Timing and Fees** — redundant with header; extra time limits (timeLimit2, timeLimit3) move to the requirements drawer or are accessible via Edit
- **Expand All / Collapse All buttons** — no longer needed
- **Separate DetailHero + ClassInfo** pattern — replaced by unified compact header

### What Gets Added

- **Dog status column** in entries table
- **Requirements drawer** (ported from myK9Q's ClassRequirementsDialog)
- **Requirements button** on the results table header

## Components Affected

### Modified

- `pages/ClassDetailsPage/index.tsx` — restructured layout
- `components/classes/ClassDetailsMain.tsx` — simplified to stats + results
- `components/classes/ClassResultsTable.tsx` — add status column, move Enter Scores + Add Entry here, add Requirements button
- `components/common/DetailHero.tsx` — may need metadata strip variant, or build new compact header component

### New

- `components/classes/ClassRequirementsSheet.tsx` — slide-out requirements drawer
- `hooks/queries/useClassRequirements.ts` — React Query hook for `class_requirements` table lookup

### Removed

- `components/classes/ClassExpandableSections.tsx` — no longer needed
- `components/classes/ClassInfo.tsx` — absorbed into header
- `components/classes/ExpandableSection.tsx` — if not used elsewhere

### Potentially Affected

- `components/classes/OfficialsSection.tsx` — officials move to header metadata

## Data Requirements

### Existing Data (no migration needed)

- `class_requirements` table — already seeded for AKC, UKC, ASCA via migration 030
- `classes` table — already has all fields (element, level, status, judge, fees, time limits, etc.)
- Class entries — already queried and displayed

### New Query

- `useClassRequirements(organization, element, level)` — lookup from `class_requirements` table
- Dog status data — depends on existing entry status fields; may need check-in status from show-day operations (future enhancement if not yet available)

## Future Enhancements (Out of Scope)

- **Drag-and-drop run order** — reordering entries in the table to set run order. Requires run order management system, real-time updates, and potentially the notification pipeline.
- **Inline score editing** — editing scores directly in the table cells rather than via dialog.
- **Mobile-specific layout** — the metadata strip wraps naturally, but a mobile-optimized view could collapse it further.

## Intent Alignment

| Decision                 | Intent Check                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Results table prominence | Secretary: "That was easy" — scores are right there, no scrolling. Exhibitor: "This respects my time" — results visible immediately. |
| Compact header           | Both: reduces cognitive load, no duplicate information.                                                                              |
| Requirements as drawer   | Secretary: reference when needed, doesn't clutter the workspace. Exhibitor: understand class rules without leaving the page.         |
| Dog status column        | Secretary: "I can see everything" — knows who's checked in, who's in the ring.                                                       |
| Lucide icons throughout  | Consistent with platform visual language, no emoji.                                                                                  |

## Visual Mockups

Brainstorming mockups are preserved in `.superpowers/brainstorm/` for reference:

- `class-layout-options.html` — layout comparison (sidebar vs compact)
- `header-design.html` — header treatment options (strip vs pills)
- `stats-and-results.html` — full page flow mockup
- `requirements-drawer.html` — drawer design
