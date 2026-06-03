# Entry Approval / Check-In UX Audit

Date: 2026-06-03
App: myK9Show local dev at `http://127.0.0.1:5174`
User: seeded secretary account
Show: `June 2026` (`4584f257-19b5-4016-aae6-5e7827b769cb`)

## Audit Scope

Flow audited: secretary entry approval and check-in path, focused on the consolidation question:

Does this duplicate an existing page? If so, why is duplication justified instead of a link?

Answer: the canonical surface is `Entry Management`. The workbench should stay a signal/deep-link surface, not reimplement entry tables or show-wide bulk actions. That direction is already reflected in code comments, but the captured flow still has routing and context gaps.

## Captured Steps

1. `/secretary/check-in` shortcut
   - Screenshot: `01-check-in-redirect-show-desk.png`
   - Health: Weak. The shortcut landed on the secretary dashboard, not a show-specific check-in context.

2. Show-specific workbench
   - Screenshot: `02-show-specific-workbench.png`
   - Health: Mixed. It surfaces `4 entries waiting for check-in`, but does not show an obvious path to resolve that signal.

3. Entry Management overview
   - Screenshot: `03-entry-management-overview.png`
   - Health: Good. It shows the selected show, 5 total entries, 5 accepted entries, 5 issues, and inline check-in states.

4. Entry card check-in statuses
   - Screenshot: `04-entry-card-checkin-statuses.png`
   - Health: Good but dense. Individual run statuses are visible and editable-looking.

5. Entry actions menu
   - Screenshot: `05-entry-actions-menu.png`
   - Health: Good. The canonical bulk action exists: `Check In All`.

## Strengths

- `Entry Management` has the right ownership boundary: entry review, payment status, email, armband assignment, and check-in are all together.
- The workbench does not duplicate the entry table, which fits the current consolidate-don't-duplicate phase.
- The entry cards clearly show class-level acceptance and check-in status together.
- The bulk `Check In All` action exists in the canonical page, which is exactly where show-wide entry operations should live.

## UX Risks

1. The `/secretary/check-in` shortcut is not secretary-fast.
   - Evidence: step 1 lands on the dashboard. A secretary who chooses "check-in" during show-day pressure now has to infer which show row to open.
   - Recommendation: route `/secretary/check-in` to the last/selected show's Show Desk when available, or directly to `Entry Management` with a check-in/issues filter when the target show can be resolved.

2. The workbench signal is not actionable enough.
   - Evidence: step 2 shows `4 entries waiting for check-in`, but the visible header does not include a `Manage entries` deep-link for that check-in signal.
   - Recommendation: add a deep-link from the check-in pending signal to `Entry Management` with show and check-in/issue filters applied. Do not add a second check-in table to the workbench.

3. The Show Map count model is confusing.
   - Evidence: step 2 shows `5 entries`, `0 classes`, and `4 entries waiting for check-in`. That can read as contradictory because entries usually belong under classes.
   - Recommendation: either explain why classes are absent for this draft/setup state, or make the check-in signal link directly to the canonical list where the secretary can see the affected entries.

4. `Issues (5)` and `Payment Due` compete with check-in urgency.
   - Evidence: step 3 shows 5 issue rows, but the main visible issue label is payment due while the show-desk signal is check-in.
   - Recommendation: preserve one page, but allow deep-links that activate the relevant issue lens, such as `?tab=entries&issue=check-in` or equivalent existing filter state.

## Accessibility Risks

- Several status controls are small pills/dropdowns inside dense cards. They appear near or under the 44px touch-target guideline and should be checked on tablet.
- The sidebar is icon-only. Active state is visible, but labels are not visible from the screenshot; confirm accessible names and keyboard focus order.
- The muted beige/gray controls have low visual emphasis. Contrast should be checked for disabled-looking controls that are actually actionable, especially check-in status pills.
- Screenshot evidence cannot prove keyboard operability, focus visibility, screen-reader names, or final WCAG compliance.

## Recommendations

1. Keep `Entry Management` as the canonical approval/check-in surface.
2. Make Show Desk pending check-in signals deep-link into `Entry Management` with the relevant show and filter state.
3. Fix `/secretary/check-in` so it never strands a show-day secretary on the broad dashboard when a target show is knowable.
4. Add a narrow regression test for the redirect/deep-link path: `/secretary/check-in` -> selected show action surface, plus Show Desk check-in signal -> filtered Entry Management.
5. Do not build a separate check-in table inside Show Desk unless the canonical entry page cannot support the task.

## Evidence Limits

- This was a screenshot-led UX audit against local dev and seeded data.
- No mutations were performed.
- I did not verify keyboard-only operation, screen-reader output, or contrast numerically.
- The audited show is in `Draft`, which may affect whether the workbench should show classes; that state should be confirmed before treating the count mismatch as a production bug.
