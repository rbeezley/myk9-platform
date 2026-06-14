# Secretary Task Timeline View Plan

**Date:** 2026-05-02
**Status:** Draft — reviewed 2026-05-02, file paths verified, three implementation notes added (see below)

## Goal

Add a second view to the secretary dashboard task tab so a trial secretary can switch between the existing task list/Kanban-style workflow and a Gantt-style **Timeline** view. The feature should support the secretary intent of "That was easy" by showing schedule risk without making task management feel heavier.

Use the UI label **Timeline**, not **Gantt**. "Timeline" is more familiar, calmer, and easier for non-project-management users to understand.

## Current State

- Task UI lives in `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/TasksTab.tsx`.
- Task rows live in `TaskRow.tsx`.
- Task data comes from `apps/myk9show/src/hooks/queries/useSecretaryTasks.ts`.
- Task shape is defined in `SecretaryDashboardPage/types.ts`.
- Database table `secretary_tasks` currently supports:
  - `status`: `todo` or `done`
  - optional `show_id`
  - optional `due_date`
  - optional `priority`
  - no `start_date`
  - no dependency table
- Shared view infrastructure already exists:
  - `components/common/ViewToggle.tsx` — already includes a `'calendar'` icon option
  - `hooks/useViewPreference.ts` — currently hardcoded to `'cards' | 'table'` modes only

All paths above verified against the working tree as of 2026-05-02.

## Product Decision

Build this as an optional view inside the existing Tasks tab:

```text
Tasks   [ List | Timeline ]
```

The first version should not require new scheduling fields. It should derive a simple, useful timeline from existing due dates:

- tasks with a due date appear on the timeline
- tasks without a due date stay in a compact "No due date" section
- completed tasks are muted and can follow the existing "Show completed" behavior
- overdue and due-today tasks keep the existing urgency colors
- the timeline groups by show when "All Shows" is selected

Avoid adding dependencies, drag-rescheduling, or start dates in the first pass. Those are useful later, but they would turn a calm readiness view into a project-management tool.

## UX Behavior

### List View

Keep current behavior and visual priority:

- filter chips remain at the top
- add task remains available
- open tasks sort before completed tasks
- completed tasks remain hidden by default
- due-date urgency remains visible

### Timeline View

Render a horizontal date grid for the selected task set:

- default range: today through the latest visible due date, capped at a practical window such as 30 to 45 days
- if all tasks are overdue, include the overdue range and today
- show each dated task as a horizontal bar or pill ending on its due date
- for tasks with only a due date, use a one-day marker/bar
- group rows by show when viewing all shows
- include a small status summary near the toggle: overdue, due this week, unscheduled
- keep controls touch-friendly, with minimum 44px targets

Use calm language:

- "Timeline"
- "No due date"
- "Due today"
- "Overdue"
- "Due this week"

Do not expose scheduling jargon like "critical path", "dependency graph", or "baseline" in the UI.

## Implementation Plan

### Phase 1: Shared View Mode

1. **Create `useTaskViewPreference.ts`** as a sibling of `TasksTab.tsx` — keep `useViewPreference` narrow (it is designed for `'cards' | 'table'` and validating against a hardcoded set). The task hook exports `TaskViewMode = 'list' | 'timeline'` and its own modes config, using `localStorage` key `view-pref-secretary-tasks`. Do not modify `useViewPreference.ts`.
2. Add task view modes config near `TasksTab.tsx`:
   - `{ key: 'list', label: 'List', icon: 'list' }`
   - `{ key: 'timeline', label: 'Timeline', icon: 'calendar' }` — the `'calendar'` icon already exists in `ViewToggle.tsx`
3. Wire `ViewToggle` into the task toolbar.
4. Persist the selected task view with key `view-pref-secretary-tasks`.

### Phase 2: Timeline Data Helpers

Create sibling helpers for timeline transformation:

- `taskTimelineUtils.ts` (preferred over `TasksTab.timeline.ts` — clearer at a glance what it contains)

Helpers should cover:

- parse and validate task due dates
- split dated vs undated tasks
- calculate visible date range
- calculate task urgency bucket
- group tasks by show
- sort rows predictably

Keep date handling local-date safe. Existing `due_date` is a date-only column, so avoid timezone shifts from naive `new Date(dateString)` where possible.

### Phase 3: Timeline Components

Add focused components beside the existing task tab:

- `TaskTimelineView.tsx` — owns **both** the dated grid **and** the "No due date" section at the bottom. Do not create a separate component for undated tasks; keeping them in `TaskTimelineView` avoids an unnecessary abstraction boundary and keeps the two sections in sync on scroll/filter state.
- `TaskTimelineRow.tsx` — single task row (name + status toggle on the left; pill marker at the due-date column on the right)
- `TaskTimelineHeader.tsx` — date grid header row (day labels)
- `TaskTimelineSummary.tsx` — compact count strip: overdue · due this week · unscheduled

The timeline should reuse the same update/delete/toggle callbacks as `TaskRow` so both views operate on the same task data.

Keep files under 500 lines. Extract helpers and row components before the main view gets bulky.

### Phase 4: Editing and Empty States

Support the same core actions in both views:

- mark done/undone
- edit title, show, and due date
- delete task
- add task from the shared toolbar

Empty states:

- no tasks: "No open tasks."
- filtered show has no tasks: "No tasks for this show."
- timeline has only undated tasks: show the undated section with a quiet note, not an empty chart

### Phase 5: Future Scheduling Fields

Defer schema changes unless user testing proves the need.

Potential later migration:

- `start_date date`
- `completed_at timestamptz`
- `sort_order integer`
- optional dependency table only if secretaries explicitly need predecessor relationships

Do not add these in the first implementation unless another active requirement depends on them.

## Testing Phase

Write tests before considering the work complete.

Unit tests:

- timeline helper date parsing does not shift date-only values across timezones
- dated and undated tasks split correctly
- overdue, today, this-week, and future buckets calculate correctly
- visible date range caps long future spans
- grouping by show works for all-show and single-show filters

Component tests:

- `TasksTab` renders the view toggle
- selecting Timeline persists the preference
- Timeline view renders dated tasks and the "No due date" section
- mark done/undone calls the existing update mutation
- completed tasks stay hidden until "Show completed" is enabled
- filter chips affect both List and Timeline views

Use the custom render utilities from `src/test/utils/testUtils.tsx` rather than raw Testing Library `render`.

Verification commands:

```bash
cd apps/myk9show && npx vitest run src/pages/secretary/SecretaryDashboardPage/__tests__/TasksTab.test.tsx
pnpm typecheck
```

If the broader test suite hangs for more than 30 seconds, stop and report it per repo guidance.

## Acceptance Criteria

- Secretary can switch between List and Timeline from the dashboard task tab.
- The chosen view persists across reloads.
- Both views use the same task data and mutations.
- Timeline clearly surfaces overdue, due-soon, and unscheduled tasks.
- No duplicate task entry is required.
- No first-pass database migration is required.
- Tests cover helpers, rendering, persistence, filtering, and task status updates.
