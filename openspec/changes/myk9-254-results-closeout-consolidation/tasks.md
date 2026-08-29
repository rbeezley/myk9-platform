## 1. Shared Facet Presentation

- [x] 1.1 Add failing focused tests for visibility-only and check-in-only override-tree modes, including accessible names, touch targets, facet-specific reset/count labels, shared selection, and absence of the other concern; verify the targeted Vitest file fails for the missing mode behavior.
- [x] 1.2 Refactor the shared override tree and override-count helper to render one facet at a time while preserving selected-class behavior; verify the focused override-tree and utility tests pass.

## 2. Show Desk Ownership

- [x] 2.1 Add focused component tests for the Self check-in Show Desk tool covering saved data, selected-class bulk enable/disable, stale selections, loading, read failure with retry, and isolation from the rest of Show Desk; verify the targeted Vitest files fail before implementation.
- [x] 2.2 Implement the Self check-in tool with existing settings queries/mutations and an inline bulk-action bar, then add it to Show Desk Tools; verify focused component and Show Desk page tests pass.

## 3. Results and Navigation Consolidation

- [x] 3.1 Update focused Results, Show Details/navigation, Show Desk closeout, admin-help, and route/E2E expectations from “Results & Check-In” to “Results”; verify tests fail against the old labels.
- [x] 3.2 Remove self check-in presentation and bulk actions from Results while preserving visibility/release and the Submit Results forward link; update canonical labels and help metadata, then verify all focused tests pass.

## 4. Verification and Shipping

- [x] 4.1 Run OpenSpec validation, focused Vitest suites, myK9Show typecheck or build, and `git diff --check`; record any unrelated broad-check failure separately.
- [ ] 4.2 Re-walk Results and Show Desk Self check-in at mobile and desktop widths, verifying loading/error states and preserving the rest of Show Desk; record visual evidence.
- [x] 4.3 Run implementation verification and code review, fix blocking findings, and verify no acceptance-criteria gaps remain.
- [ ] 4.4 Commit and push the feature branch, open a PR linked to MYK9-254 and this OpenSpec change, and verify required CI checks pass after the user approves the shared-system writes.
- [ ] 4.5 After merge, update MYK9-254 with implementation and verification evidence, move it to Done when its evidence gate is satisfied, archive the OpenSpec change, sync/archive tracking artifacts, and clean up the branch/worktree.

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: This is a multi-component myK9Show workflow relocation with no schema, authorization, route-path, or shared persistence change; focused unit coverage, app typecheck/build, and responsive browser verification cover the blast radius.
