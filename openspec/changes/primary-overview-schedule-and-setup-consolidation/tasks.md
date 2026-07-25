## 1. Schedule projection

- [x] 1.1 Add a compact Overview schedule presentation that reuses `useScheduleTimeline`/`DayTimelineData`, groups by trial date and number, and exposes the existing complete Classes link.
- [x] 1.2 Preserve honest loading, retry/error, and empty states and add responsive/touch-friendly summary rows for single- and multi-trial shows.
- [x] 1.3 Pass manager authorization into the Overview schedule so authorized managers can edit start times through the existing replication-backed editor while exhibitors/public viewers remain read-only.

## 2. Overview consolidation

- [x] 2.1 Make the compact schedule the primary Overview content while retaining judges, officials, and venue/directions as secondary compact sections.
- [x] 2.2 Ensure schedule and detail labels identify trial date/number and class/trial destinations without Setup terminology.
- [x] 2.3 Keep Show Desk, Classes, My Entries, and `/at-show` as the existing owner surfaces; do not add duplicate operational workflows.

## 3. Navigation and compatibility

- [x] 3.1 Remove Setup from visible show-management navigation at desktop and touch widths while leaving all other canonical sections reachable.
- [x] 3.2 Convert `/shows/:showId/setup` to a safe compatibility redirect to Overview (preserving a relevant anchor when one exists) and verify old readiness/deep links do not dead-end.
- [x] 3.3 Update affected setup/workbench copy and comments so the remaining capability ownership is clear.

## 4. Tests

- [x] 4.1 Add component tests for schedule grouping, trial/date labels, compact rows, complete-schedule linking, and manager-versus-exhibitor edit visibility.
- [x] 4.2 Add route/navigation tests for Setup removal, compatibility redirect, and preservation of the remaining management sections.
- [x] 4.3 Add regression coverage for schedule loading/error/empty states and multiple trials.

## 5. Verification and delivery

- [x] 5.1 Run focused myK9Show tests for changed schedule, Overview, and routing modules plus `git diff --check`.
- [x] 5.2 Run app typecheck/build or the narrowest equivalent, review the diff for duplicate surfaces and intent regressions, and record evidence.
- [ ] 5.3 Open the implementation PR with the OpenSpec change linked, wait for required CI/review checks, and merge only after the acceptance criteria pass.
- [ ] 5.4 Archive and sync the OpenSpec change after merge, update tracking documentation, and clean up the feature worktree/branch.
