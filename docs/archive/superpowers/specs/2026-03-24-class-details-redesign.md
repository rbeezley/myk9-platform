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

**Responsive behavior:** On mobile, the metadata strip wraps to 2-3 columns maintaining 14px minimum font size. All text meets WCAG AA contrast. No interactive elements in the strip require touch targets (values are display-only).

**Removed from header:** "Enter Scores" button moves to the results table.

### Stats Row

Three stat cards using the existing `StatCard` and `StatsGrid` components from `@myk9/ui`:

| Stat           | Icon               | Color          | Subtitle                                    | Progress           |
| -------------- | ------------------ | -------------- | ------------------------------------------- | ------------------ |
| Entries        | Users (Lucide)     | primary (blue) | "{completed} completed · {pending} pending" | completed / total  |
| Qualified Rate | Trophy (Lucide)    | emerald        | "{qualified} qualified · {nq} NQ"           | qualified / scored |
| Avg Score      | BarChart3 (Lucide) | purple         | "Out of {max} · Class average"              | score / max        |

**Conditional behavior:** Preserve existing Scent Work logic — Scent Work classes show Entries + Qualified Rate (2 cards). Non-Scent-Work classes show all 3. Stats only render when there are entries. Empty state shows nothing (no empty stat cards).

### Results Table

The primary content section. Full-width card with:

**Table header bar:**

- Title: "Entries & Results" + entry count
- Actions: Requirements button (opens drawer), Enter Scores (primary CTA, navigates to `/scoring/secretary/classes/${classId}`), + Add Entry

**Enter Scores behavior:** This is the same navigation button currently in the page header, relocated to the results table where it contextually belongs. It navigates to the existing scoring page — no behavioral change.

**Columns:**

- Armband #
- Handler name
- Dog name
- Score
- Time
- Q/NQ badge
- Placement
- Row actions (overflow menu: edit, delete)

**Table footer:**

- Entry count summary
- Keyboard shortcut hint (Ctrl+S to save)
- Submit Results button (when scores are pending)

### Requirements Drawer

A slide-out panel using the existing `SlideOverPanel` component (`components/panels/SlideOverPanel.tsx`), which is the established panel pattern in the app (used by `ClassEditPanel`, `ShowEditPanel`, etc.). Triggered by the "Requirements" button on the results table header.

**Content:** Read-only rules reference from the `class_requirements` table, queried by organization + element + level. This is a port of myK9Q's `ClassRequirementsDialog` adapted to a panel layout.

**Organization resolution:** The parent show's `organization` field is already available via `useShowStore` in the page's data flow. The requirements panel receives `organization`, `element`, and `level` as props from the parent page.

**Header:**

- Title: "Class Requirements"
- Badges: Organization (AKC/UKC/ASCA), Element, Level

**Requirement cards** (each with Lucide icon, colored icon background, value, and subtitle):

| Requirement    | Icon          | Color   | Example Value         | Subtitle                                     |
| -------------- | ------------- | ------- | --------------------- | -------------------------------------------- |
| Time Limit     | Clock         | blue    | "2:00 – 3:00"         | "Range allowed · No 30-second warning"       |
| Hides          | Target        | red     | "1 – 3"               | "Number unknown to handler"                  |
| Distractions   | AlertTriangle | amber   | "2 – 3"               | "Placed in search area"                      |
| Area Size      | MapPin        | emerald | "200 – 400 sq ft"     | "Per search area"                            |
| Search Areas   | MapPin        | purple  | "1 – 2"               | "Blank area possible"                        |
| Required Calls | Speech        | pink    | "Alert + Finish"      | "AKC standard calls" (UKC: "Final Response") |
| Max Height     | Ruler         | slate   | "24 inches"           | Only shown when applicable                   |
| Arrangement    | Package       | slate   | Container layout info | Container, Buried, or Handler Disc. Novice A |

Icons aligned with myK9Q's `ClassRequirementsDialog` for cross-app consistency. Cards only render when the field has data. The drawer adapts to the organization — AKC shows "Required Calls," UKC shows "Final Response."

**Footer:** Source attribution (e.g., "Source: AKC Scent Work Regulations")

### What Gets Removed

- **Inline info grid in `ClassDetailsMain.tsx`** (the 8-item grid at lines ~158-195) — absorbed into the header metadata strip
- **`ClassExpandableSections` component** — expandable sections for Timing, Fees, Officials, Requirements all removed; data is either in the header strip, the requirements drawer, or accessible via Edit
- **`SectionToggleControls` component** — Expand All / Collapse All buttons no longer needed
- **Separate DetailHero + info grid pattern** — replaced by unified compact header

**Dead code cleanup:** `ClassInfo.tsx` exists in the codebase but is not currently rendered on the page. Remove it as part of this cleanup. `ExpandableSection.tsx` — check for other usages before removing.

### What Gets Added

- **Requirements panel** (ported from myK9Q's ClassRequirementsDialog, adapted to SlideOverPanel)
- **Requirements button** on the results table header

## Components Affected

### Modified

- `pages/ClassDetailsPage/index.tsx` — restructured layout
- `components/classes/ClassDetailsMain.tsx` — simplified to stats + results only
- `components/classes/ClassResultsTable.tsx` — move Enter Scores + Add Entry here, add Requirements button
- `components/common/DetailHero.tsx` — add metadata strip variant, or build new `ClassCompactHeader` component

### New

- `components/classes/ClassRequirementsPanel.tsx` — slide-out requirements panel using `SlideOverPanel`
- `hooks/queries/useClassRequirements.ts` — refactor existing `hooks/useClassRequirements.ts` to use React Query (move to `hooks/queries/`, replace `useState`/`useEffect` with `useQuery`, fix the `any` cast by adding a `ClassRequirements` type definition since `class_requirements` is not in the generated Supabase types)

### Removed

- `components/classes/ClassExpandableSections.tsx` — replaced by header strip + requirements drawer
- `components/classes/ClassInfo.tsx` — dead code, not currently rendered
- `components/classes/SectionToggleControls.tsx` — no longer needed (verify no other usages)
- `components/classes/ExpandableSection.tsx` — verify no other usages before removing

### Potentially Affected

- `components/classes/OfficialsSection.tsx` — officials move to header metadata; may become unused

## Data Requirements

### Existing Data (no migration needed)

- `class_requirements` table — already seeded for AKC, UKC, ASCA via migration 030
- `classes` table — already has all fields (element, level, status, judge, fees, time limits, etc.)
- Class entries — already queried and displayed
- Show `organization` field — available via `useShowStore`

### Hook Refactor

Refactor existing `hooks/useClassRequirements.ts` → `hooks/queries/useClassRequirements.ts`:

- Replace `useState`/`useEffect` with React Query `useQuery`
- Add explicit `ClassRequirements` TypeScript interface (the `class_requirements` table is not in the generated Supabase types, so the existing hook uses `any`)
- Keep the existing query logic: lookup by organization + element + level
- Use `cacheStrategies.static` (requirements don't change during a session)

## Future Enhancements (Out of Scope)

- **Dog status column** — showing Checked In / In Ring / On Deck / Conflict / Not Checked In badges per entry. The data pipeline for check-in status is not fully wired into the class entries query path. Requires: (1) joining check-in status from show-day operations into the entries result set, (2) defining fallback behavior when show-day ops haven't started. Deferred until the show-day operations system matures.
- **Drag-and-drop run order** — reordering entries in the table to set run order. Requires run order management system, real-time updates, and potentially the notification pipeline.
- **Inline score editing** — editing scores directly in the table cells rather than via dialog.
- **Mobile-specific layout** — the metadata strip wraps naturally, but a dedicated mobile-optimized view could improve the experience further.

## Testing

- **Unit tests for `ClassRequirementsPanel`** — renders requirement cards conditionally based on data, handles empty/null fields, adapts to organization (AKC vs UKC vs ASCA)
- **Unit tests for refactored `useClassRequirements` hook** — React Query integration, correct cache strategy, handles missing data
- **Unit tests for compact header** — renders metadata strip fields, handles missing optional fields (officials), responsive wrapping
- **Update existing `ClassDetailsPage` tests** — verify new layout renders correctly, requirements button opens panel
- **Visual spot-check** — verify metadata strip, stats row, and results table render correctly in both light and dark themes

## Intent Alignment

| Decision                 | Intent Check                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Results table prominence | Secretary: "That was easy" — scores are right there, no scrolling. Exhibitor: "This respects my time" — results visible immediately. |
| Compact header           | Both: reduces cognitive load, no duplicate information.                                                                              |
| Requirements as drawer   | Secretary: reference when needed, doesn't clutter the workspace. Exhibitor: understand class rules without leaving the page.         |
| Lucide icons throughout  | Consistent with platform visual language and myK9Q cross-app consistency, no emoji.                                                  |
| SlideOverPanel reuse     | Follows existing codebase patterns. No new panel primitives introduced.                                                              |

## Visual Mockups

Brainstorming mockups are preserved in `.superpowers/brainstorm/` for reference:

- `class-layout-options.html` — layout comparison (sidebar vs compact)
- `header-design.html` — header treatment options (strip vs pills)
- `stats-and-results.html` — full page flow mockup
- `requirements-drawer.html` — drawer design
