## Context

`ShowOverviewTab` already renders the shared schedule timeline, officials, judges, and venue map for exhibitors and managers. `ShowWorkbenchSetupPage` renders the same show facts with manager-only schedule editing, while `ShowWorkbenchShowDeskPage` renders a separate operational class schedule with live work state. The problem is navigation and projection, not missing data.

The change must preserve the secretary intent of “that was easy” and the exhibitor intent of “I know where to be.” The Overview must remain useful to anonymous/exhibitor viewers, while Show Desk remains the owner surface for secretary actions. Core show data continues to come from the existing replicated/query layers; this change adds no persistence model.

## Goals / Non-Goals

**Goals:**

- Make Overview the clear primary place to answer “what is this show and where/when do I go?”
- Provide a compact trial/date-grouped schedule that works for exhibitors and managers.
- Keep the full operational schedule and class actions in Show Desk.
- Preserve manager schedule editing without adding a second editor.
- Make judges, officials, and venue details discoverable without a Setup peer tab.
- Keep old Setup links safe during migration.

**Non-Goals:**

- Redesign Show Desk or `/at-show`.
- Create a new schedule route, new data store, or duplicate class/entry workflow.
- Change role authorization or the replication contract.
- Remove the existing full Classes view or personal My Entries schedule.

## Decisions

### 1. Use one schedule query with two projections

Reuse `useScheduleTimeline` and its `DayTimelineData` model. Add a compact presentation mode to the existing schedule surface (or a sibling presentational component sharing the same hook) rather than introducing another query or source of truth.

The Overview projection shows trial date/number, the next few classes, start/expected time, location/ring when available, judge, and a clear “View all classes” link. Multiple trials are collapsible. The Show Desk projection remains unchanged and continues to show every class in stable operational order with state and action controls.

**Alternative rejected:** Linking exhibitors directly to Show Desk. Show Desk is secretary-only and its attention/status language is inappropriate for exhibitors.

### 2. Put manager editing on the Overview schedule card

Pass the existing manager edit capability into the Overview schedule presentation and label it explicitly as editing the scheduled start time. Continue using the existing `ClassStartTimeEditor` and replication-backed mutation path. Read-only viewers receive plain links and text.

**Alternative rejected:** Keep a separate Setup-only editor. That preserves the navigation duplication and makes the primary Overview schedule appear stale or non-authoritative.

### 3. Remove Setup from visible peer navigation, preserve compatibility

Remove `Setup` from `SHOW_MANAGEMENT_SECTIONS` so it no longer appears in desktop or mobile section navigation. The `/shows/:showId/setup` route remains mounted as a compatibility redirect to the canonical Overview (or a safe manager Overview anchor) so bookmarks and existing readiness links do not dead-end. Existing Show Desk, Entry Management, Reports, Results, and Submit Results routes remain unchanged.

**Alternative rejected:** Delete the route immediately. Existing deep links and readiness notifications would become broken links during rollout.

### 4. Keep venue and officials lightweight on Overview

Retain `VenueMap`, `ShowOfficials`, and `JudgesList` as compact Overview sections. On small screens they stack below the schedule; on larger screens they remain secondary to the schedule. The map remains a directions aid, not a new navigation destination.

**Alternative rejected:** Create a new “Show Information” tab. That would replace one peer tab with another without reducing surface area.

### 5. Treat empty, loading, and offline states as honest

The compact schedule keeps the existing loading/error/empty behavior and must not show zero classes while replicated/query data is unavailable. Local schedule edits remain instant through the established replication-backed mutation; network unavailability is represented by existing sync status rather than a blocking error.

## Risks / Trade-offs

- [Risk] Removing Setup from navigation may surprise users with old instructions or bookmarks. → Keep the route redirect, update visible labels/copy, and test direct navigation.
- [Risk] A compact schedule could hide classes needed by a secretary. → Keep the complete Classes link and leave the full Show Desk schedule unchanged.
- [Risk] Reusing an editable schedule component on Overview could expose manager controls to exhibitors. → Gate `canEditSchedule` from the existing manager authorization and test both roles.
- [Risk] Trial grouping could obscure same-day multiple trials. → Always show trial number and date; default groups open when there is only one trial and remain individually collapsible when there are several.
- [Risk] The Overview schedule may drift from Show Desk if different query layers are introduced. → Reuse `useScheduleTimeline` and existing replicated/query contracts; add projection tests rather than a second fetch path.

## Migration Plan

1. Add the compact Overview presentation and manager edit affordance.
2. Add tests for trial grouping, role visibility, empty/loading/error states, and Setup redirect.
3. Remove Setup from visible section navigation while retaining the redirect.
4. Deploy to staging and manually verify exhibitor, secretary, tablet, and multiple-trial scenarios.
5. If rollback is needed, restore Setup to the navigation list; the compatibility route and underlying data remain intact.

## Open Questions

- Whether the compact Overview card should show the first three classes or all classes for a single-trial show can be tuned after the staging walk; the initial implementation should use a responsive “upcoming/first few + View all” rule.
