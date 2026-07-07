# Accessible Control Sweep

## Verified Structural Metadata

- Public landing styles: every style registered for anonymous show pages emits a native React `<title>` using `data.showName` and `data.clubName`, plus a description meta tag. Guarded by `apps/myk9show/src/features/_shared/__tests__/styledLandingMetadata.source.test.ts`.
- Status dots: `StatusDot` renders `role="status"` with a status-specific accessible name. Guarded by `apps/myk9show/src/components/schedule/__tests__/StatusDot.test.tsx`.
- Show progress: `ShowProgressBar` names its progressbar with scored/total trial context. Guarded by `apps/myk9show/src/components/shows/__tests__/ShowProgressBar.test.tsx`.
- Show-map progress cells: `ShowMapStructureCells` passes per-node `aria-label` values to progress indicators.
- Data-table pagination: shared table pagination exposes `aria-label="Rows per page"`. Guarded by `apps/myk9show/src/components/ui/data-table/__tests__/data-table-default-toolbar.test.tsx`.
- Admin user pagination: the page-size select exposes `aria-label="Rows per page"`.
- Entry Management bulk selection: select-all and row checkboxes are named (`Select all entries`, `Select <dog>`). Guarded by `apps/myk9show/src/components/entries/management/__tests__/EntriesTableView.selection.test.tsx` and `RegistrationView.multiselect.test.tsx`.
- Action menus: Entry Management row actions follow the `Actions for <dog>` convention and the overlay teardown Playwright spec exercises that trigger.
- Chip-style entry controls: My Entries check-in, Entry Management armband, entry-status, and check-in controls now expose action-specific names.
- Disabled primary actions: value-gated Entry/Class Management primary buttons now show adjacent reasons for refund amount, partial payment amount, withdrawal reason, armband number, and missing trial context.
- Dead controls: removed the inert AlertDashboard "View Details" menu item, which only logged to debug and did not open a details surface.
- Icon-only shell/workflow controls: the current scoped appendix sweep covered shared search/filter controls, sidebar close/clear controls, pagination/search performance overlays, registration dog-picker view/clear/draft controls, trial action menus, virtual-list back-to-top, My Entries result/check-in actions, Entry Management status/check-in triggers, and ringside chrome. Guarded by `apps/myk9show/src/test/a11y/iconOnlyButtonLabels.source.test.ts` plus the relevant component tests.

## Still Open

- The historical appendix still lists older line numbers across unrelated deep admin, offline, sync, template, scoring, and preference screens. This OpenSpec change closes the Phase 3 shell/workflow scope; remaining non-shell appendix debt should move as a separate a11y backlog slice if needed.
