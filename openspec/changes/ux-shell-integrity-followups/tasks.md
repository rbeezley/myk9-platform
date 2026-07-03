## 1. Overlay and Primitive Inventory

- [x] 1.1 Inventory dropdown, popover, searchable popover, select, sheet, dialog, and alert-dialog import sites touched by the Phase 3 shell plan.
- [x] 1.2 Verify shared dropdown teardown keeps `modal={false}` behavior where appropriate and does not block the next click after Escape or outside-click close.
- [x] 1.3 Spot-check high-risk select/combobox primitives that render full-screen backdrops and adjust teardown or modal behavior without breaking keyboard/focus expectations.
- [x] 1.4 Keep the benign ResizeObserver loop suppression narrow and covered by unit tests so unrelated runtime errors still surface.

## 2. Workbench Context and Canonical Routes

- [x] 2.1 Rehome Manage Classes inside the show workbench shell with show header, section tabs, and a true show-scoped breadcrumb.
- [x] 2.2 Remove `navigate(-1)` as the primary Manage Classes back path and replace it with explicit links to canonical show/workbench destinations.
- [x] 2.3 Confirm Manage Classes waitlist links still deep-link to `/shows/:showId/entry-management?tab=waitlist&trial=:trialId`.
- [x] 2.4 Confirm Move-ups and Pulls remain top-level Entry Management peers and legacy exception URLs normalize correctly.

## 3. Accessible and Honest Controls

- [x] 3.1 Complete the icon-only button appendix sweep for remaining shell/workflow files and add accessible names that describe each action.
- [x] 3.2 Sweep disabled primary buttons in the Phase 3 file set and add adjacent plain-English reasons where missing.
- [x] 3.3 Re-check public show page `<title>`, progressbar names, status dots, pagination selects, bulk checkboxes, and action menus with axe/component coverage where practical.
- [x] 3.4 Remove or wire any remaining visible dead controls in the swept files.

## 4. Role-Scoped Chrome

- [x] 4.1 Verify command-palette role filtering for exhibitor-only, secretary/admin, and mixed-role sessions.
- [x] 4.2 Finish Browse Shows mobile table-mode gating so exhibitors default to cards and table controls appear only in explicit table mode.
- [x] 4.3 Consolidate `/profile` and `/account` to one primary profile/account destination with advanced/destructive settings grouped under "Advanced settings".
- [x] 4.4 Verify staff-only ArmbandLookup, preview-as-exhibitor, "Show day"/"Ringside" labels, and removed My Stats nav remain scoped as intended.

## 5. Contrast Tokens and Chips

- [x] 5.1 Extend token contrast tests for dark primary, warning, info, muted, and chip tint pairs following the existing success-token pattern.
- [x] 5.2 Sweep chip/badge/pill components so status surfaces remain visible and readable in light and dark themes.
- [x] 5.3 Fix heritage/public page contrast failures in both themes without introducing a duplicate public page variant.
- [x] 5.4 Fix ringside light-mode "No Status" chip and muted trial-header contrast on outdoor-tablet surfaces.
- [x] 5.5 Triage literal-color sites named by the matrix, documenting legitimate fixed-light families and adding `dark:` guards or token usage where needed.

## 6. Responsive and Semantic Primitives

- [x] 6.1 Finish app-chrome and ringside card touch-target fixes so shared controls are at least 44px by 44px on touch viewports.
- [x] 6.2 Finish workbench hero truncation with `min-w-0`, stable action layout, and full-title disclosure.
- [x] 6.3 Dock toasts to a safe viewport area that does not cover primary actions.
- [x] 6.4 Finish named singleton fixes: Manage Classes mobile CTA, results-control mobile toggles, ringside heart/action overlap, Copy-Link/Headline overlap, Show Desk truncation, and My Entries tablet truncation.
- [x] 6.5 Re-run runtime overflow and target-size checks for 375px, 768px, and 1280px widths.

## 7. Focused Testing

- [x] 7.1 Add or update component tests for workbench shell rendering, role-filtered command search/chrome, Browse Shows mobile table-mode gating, and primitive semantics.
- [x] 7.2 Add or update Playwright coverage for overlay teardown: open row actions, dismiss, immediately click `New Entry`, and verify the wizard receives the click.
- [x] 7.3 Add or update Playwright coverage for ringside exit paths if existing coverage does not already pin the completed 3.C behavior.
- [x] 7.4 Add or update axe/runtime checks for unlabeled controls, serious/critical contrast issues, clipped primary actions, and sub-44px shared chrome.
- [x] 7.5 Run focused Vitest/RTL tests for changed files.
- [x] 7.6 Run focused Playwright specs for overlay, ringside, and responsive matrix checks, stopping and reporting if a runner hangs longer than 60 seconds.
- [x] 7.7 Run `pnpm typecheck` and `pnpm lint` after TypeScript/UI changes are complete.

## 8. Tracking, Review, and Closeout

- [x] 8.1 Update `docs/plan-ux-walk-remediation-2026-07.md` Phase 3 checkboxes/progress notes to match completed work.
- [x] 8.2 Update `OPEN-TODOS.md` or another relevant tracking doc if the implementation closes a tracked backlog item.
- [x] 8.3 Run `pnpm openspec validate ux-shell-integrity-followups --strict`.
- [ ] 8.4 Open a PR for the implementation branch and request review for the user-visible shell behavior.
- [ ] 8.5 Monitor CI/review, fix actionable failures, merge when green, and archive the OpenSpec change after implementation is complete.
