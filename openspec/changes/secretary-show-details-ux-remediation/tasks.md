## 1. Evidence And Source Inventory

- [x] 1.1 Re-read `docs/ux-audits/secretary-elderly-novice-2026-07-08.md`, `docs/INTENT.md`, and the current Setup/Show Desk implementation before editing.
- [x] 1.2 Inventory the show-scoped entry sources used by `ShowManagementShell`, `ShowWorkbenchShowDeskPage`, Show Map helpers, closeout summary, and `ShowDeskPeopleRoster`.
- [x] 1.3 Determine whether the audited zero-entry mismatch is caused by seed data shape, replicated read scope, query mapping, or divergent display filters.
- [x] 1.4 Inventory premium readiness state sources used by `PremiumDownloadCard`, `LandingPageCard`, `PublishReadinessBlock`, `SetupAdaptiveHeader`, and `setupReadinessSignals`.
- [x] 1.5 Inventory Show Desk next-action and pending-signal helpers before changing labels or routes.

## 2. Show Desk State And Action Remediation

- [x] 2.1 Centralize or align Show Desk entry/count derivation so hero, Show Map, closeout, and People at show agree for the same show scope.
- [x] 2.2 Preserve offline-first/show-day read paths for persistent show-day data; document any unavoidable online-only exception in code comments and the PR.
- [x] 2.3 Fix `result pending closeout` behavior so the signal deep-links to a resolving closeout or Results & Check-In target, or is not rendered as actionable without a target.
- [x] 2.4 Fix next-best report actions so `Print Check-In Sheet` is not recommended for zero-entry classes unless the UI clearly explains there are no entries to print.
- [x] 2.5 Keep broad entry edits, report printing, result verification, final submission, and messaging owned by their existing canonical pages.

## 3. Setup Readiness And Navigation Remediation

- [x] 3.1 Add or update a premium readiness classifier that returns one state for not-published, published-current, and published-stale.
- [x] 3.2 Wire Setup readiness, Publish readiness, and the premium card copy/actions to the shared premium readiness state.
- [x] 3.3 Ensure premium readiness CTAs land on a visible publish or republish affordance when action is needed.
- [x] 3.4 Clarify Setup schedule row labels or routes so trial-opening rows say they open trial details and class-looking rows open the relevant class context.
- [x] 3.5 Improve narrow-width show management section discovery using the existing `SHOW_MANAGEMENT_SECTIONS` source of truth.
- [x] 3.6 Align Show Desk Tools summary copy with the sections/actions actually visible in the drawer.

## 4. Focused Tests

- [x] 4.1 Add assertion-first tests for the audited count mismatch: roster-visible exhibitors/classes must not coexist with a zero-entry Show Desk summary for the same show scope.
- [x] 4.2 Add tests for pending-signal routing or suppression when no resolving target exists.
- [x] 4.3 Add tests for next-best report action suppression or explanatory copy for zero-entry classes.
- [x] 4.4 Add unit tests for premium readiness states: not-published, published-current, and published-stale.
- [x] 4.5 Add component or source tests proving mobile section navigation exposes all `SHOW_MANAGEMENT_SECTIONS` routes without duplicating owner workflows.
- [x] 4.6 Add tests for Setup schedule row destination labels/routes and Tools summary copy where the implementation changes them.

## 5. Verification

- [x] 5.1 Run focused Vitest files for the changed helpers/components from `apps/myk9show`.
- [x] 5.2 Run `pnpm openspec validate --changes "secretary-show-details-ux-remediation"` and fix artifact issues.
- [x] 5.3 Run a relevant TypeScript check or narrower package check if implementation touches shared types or query helpers.
- [ ] 5.4 Run a manual secretary re-walk of `/shows/:showId/setup` and `/shows/:showId/show-desk` on mobile, desktop, and tablet.
- [ ] 5.5 Update `docs/ux-audits/secretary-elderly-novice-2026-07-08.md` or add a follow-up audit note only with actual verification evidence from the remediation pass.

## 6. Shipping And Tracking

- [x] 6.1 Update the single `OPEN-TODOS.md` pointer for this OpenSpec change when implementation status changes.
- [ ] 6.2 Open a PR with `Tracked in openspec change: secretary-show-details-ux-remediation` in the body.
- [ ] 6.3 Wait for required CI and review; address actionable failures or review comments.
- [ ] 6.4 Merge the PR before archiving this OpenSpec change.
- [ ] 6.5 Archive the change only after merge evidence exists, then run the archive/sync validation required by `openspec-archive-change`.

Rationale: This remediation touches show-day secretary guidance, offline-sensitive entry/count derivation, and canonical show workbench navigation. It needs focused unit/component tests, OpenSpec validation, a manual multi-viewport re-walk, CI/review/merge evidence, and tracking updates before archive.
