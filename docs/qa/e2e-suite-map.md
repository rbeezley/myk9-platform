# E2E Suite Map

This map classifies current Playwright specs into operational suites for the proactive QA system. The classification is conservative: specs that look like probes, historical phase proofs, or one-off debugging stay out of blocking gates until they are reviewed.

## Categories

- `pr-smoke`: fast, stable, high-signal checks suitable for local PR confidence.
- `nightly`: valuable coverage that is broader, slower, data-dependent, or better run on a schedule.
- `feature-audit`: replay when touching the named feature or during `/qa-feature`.
- `manual-debug`: local investigation tools; do not block CI.
- `candidate-delete`: likely stale, duplicated, or superseded; review before deleting.

## Recommended Commands

### Suite Map Drift

Run after adding, deleting, moving, or reclassifying E2E specs:

```bash
pnpm qa:e2e-map:check
```

### PR Smoke

```bash
cd apps/myk9show
pnpm test:e2e:clean \
  src/test/e2e/simple-connectivity.spec.ts \
  src/test/e2e/uat/secretary/qa-regression-proof.spec.ts \
  --grep "load home page without authentication|Secretary QA regression proof" \
  --project=chromium --workers=1
```

### Nightly health

Nightly health is the scheduled, read-only routine: deterministic Vitest registration service/store checks followed by the committed Playwright route-health sweep. It does not create entries, score dogs, submit results, or exercise other stateful workflows.

Scheduled Nightly runs should use the managed command, which removes its
temporary worktree when the checks finish:

```bash
pnpm qa:nightly:run
```

The command prepares a detached `origin/main` worktree, runs the health phases,
and removes the worktree on success or failure. Dirty local WIP in the primary
checkout does not block Nightly. Use `pnpm qa:nightly:prepare` only when a
manual multi-phase run needs to continue beyond the managed health command;
finish that run with the cleanup command printed by preparation.

Run both health phases with:

```bash
pnpm qa:nightly:health
```

The command runs the promoted registration service/store checks that used to be stale Playwright wrappers:

```bash
cd apps/myk9show
npx vitest run \
  src/test/unit/entryStore.multiClass.test.ts \
  src/test/services/entries/entryLimitChecker.waitlists.test.ts \
  src/test/services/APIErrorInterceptor.registrationRecovery.test.ts \
  src/hooks/useInfiniteScroll.performanceCaching.test.ts
```

### Separate Playwright regression

The broader curated Playwright suite is a separate, stateful regression routine. It runs weekly and on manual dispatch only against the disposable local Supabase lifecycle documented in [`../operations/isolated-e2e-regression.md`](../operations/isolated-e2e-regression.md). It remains CI-variable-gated and must never point at shared staging.

For a local invocation, run it only after the target and shared-system approval are confirmed:

```bash
MYK9_PLAYWRIGHT_REGRESSION_ENABLED=true \
MYK9_PLAYWRIGHT_REGRESSION_TARGET=isolated \
pnpm qa:playwright:regression
```

The command uses the curated regression spec list in `apps/myk9show/playwright.ci.config.ts`, with one worker, zero retries, and `--fail-on-flaky-tests`. Wave 1 repairs on 2026-05-12, follow-up repairs on 2026-05-13, and the cross-role plus online-entry repairs on 2026-05-14 promoted the current list. Last verified with retries disabled on 2026-06-18 (Lane 3.2): `50 passed (2.9m)`. Prior: 2026-05-23 `44 passed (2.4m)` (6 additional specs promoted since then).

The health command's Playwright phase is the committed route-health sweep spec (promoted 2026-06-06):

```bash
cd apps/myk9show
pnpm test:e2e:clean \
  src/test/e2e/route-health-by-role.spec.ts \
  --project=chromium --workers=1 --timeout=90000 --retries=0
```

The spec covers public, exhibitor, secretary, judge, club-admin, and admin route groups with live seeded show `dededede-0000-0000-0000-000000000010` (`QA_SECRETARY_SHOW_ID` override supported). Per route it checks: render-not-blank, console errors (budget 0, minus documented noise), replication errors (QA-CONSOLE-ERROR-011 regression guard), owned 4xx/5xx, and 375px horizontal overflow on marked routes (`/` and `/admin/dashboard`). Log durable issues in `docs/qa/findings.md`.

#### Cross-browser sweep (advisory)

`.github/workflows/nightly-health.yml` runs the same spec a second time on WebKit after the chromium
gate, via `MYK9_NIGHTLY_HEALTH_PROJECTS`:

```bash
cd apps/myk9show
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5399 pnpm test:e2e:clean \
  src/test/e2e/route-health-by-role.spec.ts \
  --project=webkit --project=mobile-safari --workers=1 --timeout=120000 --retries=0
```

Every automated Playwright run in this repo installed chromium only until 2026-08-23, so four of the five
projects in `playwright.config.ts` had never executed — including the configuration most exhibitors are
on at a show. `mobile-safari` (`devices['iPhone 13']`) was added for that case; WebKit is where IndexedDB,
service workers, and storage eviction diverge most from Chromium, and offline-first depends on all three.

The job is **advisory** (`continue-on-error: true`) for its first scheduled runs. A local dry run against
staging on 2026-08-23 was clean — all six role groups passed on both WebKit projects — so no backlog of
pre-existing divergences is expected. Promote it to a real gate by dropping that key once a few scheduled
runs are green; the contract test in `scripts/qa/nightly-health-workflow.test.ts` pins the current shape,
so promotion is a deliberate edit in two places, not drift.

Note when running this by hand: set `PLAYWRIGHT_BASE_URL`, not `PLAYWRIGHT_PORT`. `PLAYWRIGHT_PORT` moves
the dev server but leaves `baseURL` on 5173, so every route fails with "Could not connect to the server."

The dormant `src/test/e2e/cross-browser/*.spec.ts` family is a separate, older attempt at this and stays
out of the active suite; it is not a prerequisite for the sweep above.

### Feature Audit

```bash
cd apps/myk9show
pnpm test:e2e:clean src/test/e2e/entities/<spec>.spec.ts --project=chromium --workers=1
```

### QA Discovery

Discovery is allowed to find failures. It is not the trusted Nightly gate. Use it when intentionally hunting for bugs in a domain, then fix low-risk local issues or log durable findings in `docs/qa/findings.md`.

Current CRUD discovery batch covers dog, club, people, class, trial, and show CRUD, including the show soft-delete proof:

```bash
pnpm qa:discovery:crud
```

Compatibility alias for prior QA notes:

```bash
pnpm qa:discovery:crud:full
```

### Route measurement sweep

Measurement only — no assertions, no gate. Visits every route in
`measurementSweepRoutes.ts` in both themes and writes contrast, touch-target,
accessible-name and overflow findings to `test-results/measurement-sweep/`.
Rank its output by how many routes a finding spans, not by severity: one page
with a small control is a page nit, one colour pair failing across nine routes
is a single token edit.

```bash
cd apps/myk9show
MYK9_MEASUREMENT_SWEEP=1 pnpm exec playwright test src/test/e2e/qa/measurementSweep.spec.ts \
  --project=chromium --reporter=list --retries=0 --workers=1
```

### Manual Debug

```bash
cd apps/myk9show
pnpm test:e2e:clean src/test/e2e/<spec>.spec.ts --project=chromium --headed --workers=1
```

## PR Smoke

PR smoke is intentionally small. Its purpose is to confirm the app boots, auth still works, and the current strict secretary regression proof still has signal; it is not intended to catch every workflow regression.

| Spec                                                                   | Why                                        |
| ---------------------------------------------------------------------- | ------------------------------------------ |
| `apps/myk9show/src/test/e2e/simple-connectivity.spec.ts`               | App boots and basic page load works.       |
| `apps/myk9show/src/test/e2e/uat/secretary/qa-regression-proof.spec.ts` | Current strict secretary regression proof. |
| `apps/myk9show/src/test/e2e/uat/secretary/critical-path.spec.ts`       | Stable secretary UAT critical path. Also in REGRESSION_SPECS, so it appears under Nightly Active too.|
| `apps/myk9show/src/test/e2e/my-entries-page-ui.spec.ts`                | Exhibitor entries page regression coverage. Also in REGRESSION_SPECS, so it appears under Nightly Active too.|

## Nightly Active

These specs run on a schedule. Do not add to this table until the relevant promotion rule passes: run the spec alone, run the full active Nightly command for that runner with retries disabled where applicable, then update this map.

**The two subsections run on different schedules, in different workflows.** The Vitest block belongs to the nightly read-only health routine (`nightly-health.yml`, daily 06:00 UTC). Every Playwright entry below is a member of `REGRESSION_SPECS` in `apps/myk9show/playwright.ci.config.ts`, which runs in **Playwright Regression** (`nightly-e2e.yml`) — **weekly**, Mondays 07:00 UTC, against an isolated Supabase target, and gated separately on `MYK9SHOW_REGRESSION_CI_ENABLED`. Reading the heading as "this ran last night" overstates the Playwright half by up to seven days; that workflow was red for four consecutive weeks in August 2026 without anyone noticing.

### Vitest

| Spec                                                                               | Why                                                            |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `apps/myk9show/src/test/services/APIErrorInterceptor.registrationRecovery.test.ts` | Registration retry, conflict, and network-error handling.      |
| `apps/myk9show/src/test/services/entries/entryLimitChecker.waitlists.test.ts`      | Entry limit and waitlist service scenarios.                    |
| `apps/myk9show/src/hooks/useInfiniteScroll.performanceCaching.test.ts`             | Registration large-result caching, prefetch, and cache bounds. |
| `apps/myk9show/src/test/unit/entryStore.multiClass.test.ts`                        | Multi-class entry store scenarios converted from E2E.          |
| `apps/myk9show/src/test/unit/entryStore.test.ts`                                   | Core entry store workflow and audit trail.                     |

### Playwright

| Spec                                                                        | Why                                                                  |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `apps/myk9show/src/test/e2e/browse-shows-to-details.spec.ts`                | Public browse-to-detail navigation.                                  |
| `apps/myk9show/src/test/e2e/cross-role-workflows.spec.ts`                   | Current public, secretary, exhibitor, and judge route smoke.         |
| `apps/myk9show/src/test/e2e/dogPanelAccessibleNames.spec.ts`                | Add/Edit dog control accessible names, three viewports (MYK9-88).    |
| `apps/myk9show/src/test/e2e/authentication-validation.spec.ts`              | Broader authentication validation in the scheduled regression suite. |
| `apps/myk9show/src/test/e2e/route-health-by-role.spec.ts`                   | Route-health sweep: 6 role groups, console/network/overflow.         |
| `apps/myk9show/src/test/e2e/secretary/classCreation.spec.ts`                | Narrow class-creation route/template smoke.                          |
| `apps/myk9show/src/test/e2e/secretary/show-creation-wizard.spec.ts`         | Stable secretary show wizard smoke.                                  |
| `apps/myk9show/src/test/e2e/simple-connectivity.spec.ts`                    | App boots and secretary sign-in works.                               |
| `apps/myk9show/src/test/e2e/slice2-dog-workspace-evidence.spec.ts`          | Maintained read-only dog workspace regression evidence.              |
| `apps/myk9show/src/test/e2e/admin/userRosterDrilldown.spec.ts`              | Admin roster-to-person drill-down and reversible URL state.          |
| `apps/myk9show/src/test/e2e/my-entries-page-ui.spec.ts`                     | Exhibitor entries page regression coverage.                          |
| `apps/myk9show/src/test/e2e/show/atShowJudgeScoring.spec.ts`                | At-show judge scoring authorization path.                            |
| `apps/myk9show/src/test/e2e/show/atShowOfflineScoring.spec.ts`              | At-show offline scoring round-trip.                                  |
| `apps/myk9show/src/test/e2e/uat/secretary/entry-management-cockpit.spec.ts` | Secretary registration focus across layouts.                         |
| `apps/myk9show/src/test/e2e/uat/secretary/critical-path.spec.ts`            | Stable secretary UAT critical path.                                  |
| `apps/myk9show/src/test/e2e/uat/secretary/disposable-entry.spec.ts`         | Stable secretary disposable entry management.                        |
| `apps/myk9show/src/test/e2e/uat/secretary/evidence.spec.ts`                 | Stable secretary evidence pass.                                      |
| `apps/myk9show/src/test/e2e/uat/secretary/qa-regression-proof.spec.ts`      | Strict secretary regression proof.                                   |
| `apps/myk9show/src/test/e2e/myEntriesZoomReflow.spec.ts`                    | Exhibitor My Shows zoom/reflow guard.                                |
| `apps/myk9show/src/test/e2e/offline-cold-boot.spec.ts`                      | Offline cold-boot role hydration (MYK9-200 / MYK9-203).              |

## Nightly Candidates / Repair Queue

These specs may become Nightly coverage, but they are not in the scheduled command yet. Keep the reason current so the queue stays repairable instead of becoming a graveyard.

| Spec                                                                        | Why                                                                                           |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/myk9show/src/test/e2e/auth/signUpUI.spec.ts`                          | Auth UI validation and happy path.                                                            |
| `apps/myk9show/src/test/e2e/complete-user-journey.spec.ts`                  | End-to-end user journey, broad and data-dependent.                                            |
| `apps/myk9show/src/test/e2e/cross-browser/basic-functionality.spec.ts`      | Compatibility signal, not needed per PR.                                                      |
| `apps/myk9show/src/test/e2e/cross-browser/functionality.spec.ts`            | Broad browser workflow matrix.                                                                |
| `apps/myk9show/src/test/e2e/cross-browser/performance.spec.ts`              | Performance checks belong outside PR smoke.                                                   |
| `apps/myk9show/src/test/e2e/cross-browser/quirks.spec.ts`                   | Browser-specific behavior checks.                                                             |
| `apps/myk9show/src/test/e2e/cross-browser-compatibility.spec.ts`            | Legacy all-in-one browser/device matrix.                                                      |
| `apps/myk9show/src/test/e2e/database-record-validation.spec.ts`             | DB state validation.                                                                          |
| `apps/myk9show/src/test/e2e/payment/paymentFlow.spec.ts`                    | Payment smoke.                                                                                |
| `apps/myk9show/src/test/e2e/payment/phase3-5-comprehensive-payment.spec.ts` | Broad payment suite.                                                                          |
| `apps/myk9show/src/test/e2e/phase5-complete-integration.spec.ts`            | Broad historical integration suite.                                                           |
| `apps/myk9show/src/test/e2e/phase5-simple-integration.spec.ts`              | Integration coverage.                                                                         |
| `apps/myk9show/src/test/e2e/registration/exhibitorSelfRegistration.spec.ts` | Needs an isolated fixture with an open entry window; the default Heartland fixture is closed. |
| `apps/myk9show/src/test/e2e/scoring/scoringWorkflow.spec.ts`                | Obsolete myK9Show scoring UI; rewrite myK9Q-first.                                            |
| `apps/myk9show/src/test/e2e/show/showManagement.spec.ts`                    | Obsolete all-in-one show workflow; split/rewrite.                                             |
| `apps/myk9show/src/test/e2e/basic/registrationSmoke.spec.ts`                | Public registration route/auth/navigation smoke. Listed as Nightly Active until 2026-08-30 but selected by no config array and named by no script.|
| `apps/myk9show/src/test/e2e/public-shows-responsive.spec.ts`                | Public Browse Shows mobile layout and touch targets. Listed as Nightly Active until 2026-08-30 but selected by no config array and named by no script.|
| `apps/myk9show/src/test/e2e/registration/index.spec.ts`                     | Maintained registration spec inventory guard. Listed as Nightly Active until 2026-08-30 but selected by no config array and named by no script.|
| `apps/myk9show/src/test/e2e/registration/secretaryExistingUsers.spec.ts`    | Stable secretary existing-user registration guard. Listed as Nightly Active until 2026-08-30 but selected by no config array and named by no script.|
| `apps/myk9show/src/test/e2e/registration/secretaryNewUsers.spec.ts`         | Secretary mail-in person, dog, and dog-registration path. Listed as Nightly Active until 2026-08-30 but selected by no config array and named by no script.|
| `apps/myk9show/src/test/e2e/registration/singleDogSingleClass.spec.ts`      | Focused one-dog, one-class registration path. Listed as Nightly Active until 2026-08-30 but selected by no config array and named by no script.|
| `apps/myk9show/src/test/e2e/secretary-entry-walk.spec.ts`                   | Secretary entry creation. Listed as Nightly Active until 2026-08-30 but selected by no config array and named by no script.|
| `apps/myk9show/src/test/e2e/secretary/show-wizard-officials.spec.ts`        | Officials and judges picker smoke. Listed as Nightly Active until 2026-08-30 but selected by no config array and named by no script.|

## Feature Audit

| Spec                                                                        | Feature                                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/myk9show/src/test/e2e/a11y-smoke.spec.ts`                             | Public landing-page accessibility smoke.                                                                |
| `apps/myk9show/src/test/e2e/admin/health-remediation.spec.ts` | Real admin health/dashboard keyboard recovery links with fixture-backed reads. |
| `apps/myk9show/src/test/e2e/admin/sportRules.spec.ts`                       | Admin sport-rules read-only surface and authoring-control absence.                                      |
| `apps/myk9show/src/test/e2e/club-roster-alignment.spec.ts`                  | Club profile and roster count alignment.                                                                |
| `apps/myk9show/src/test/e2e/browse-clubs-page.spec.ts`                      | Public club browse/detail.                                                                              |
| `apps/myk9show/src/test/e2e/classes-page-ui.spec.ts`                        | Classes page UI.                                                                                        |
| `apps/myk9show/src/test/e2e/club-admin/clubAdminJourney.spec.ts`            | Club-admin membership, officer, and payments journey.                                                   |
| `apps/myk9show/src/test/e2e/club-surface-integrity.spec.ts`                 | Read-only MYK9-62 club browse/detail, tabs, validated navigation, payment checklist, and 375px re-walk. |
| `apps/myk9show/src/test/e2e/entry-intent-sign-in-redirect.spec.ts`          | Signed-out entry intent sign-in redirect.                                                               |
| `apps/myk9show/src/test/e2e/sign-in-fits-one-screen.spec.ts`               | Sign-in front door fits the viewport without scrolling, with and without the PWA install banner.        |
| `apps/myk9show/src/test/e2e/exhibitor/postPaymentLifecycle.spec.ts`         | Exhibitor post-payment and secretary withdrawal/refund lifecycle audit.                                 |
| `apps/myk9show/src/test/e2e/entities/classCRUD.spec.ts`                     | Class CRUD.                                                                                             |
| `apps/myk9show/src/test/e2e/entities/classesUI.spec.ts`                     | Classes UI.                                                                                             |
| `apps/myk9show/src/test/e2e/entities/clubCRUD.spec.ts`                      | Club CRUD.                                                                                              |
| `apps/myk9show/src/test/e2e/entities/clubsUI.spec.ts`                       | Clubs UI.                                                                                               |
| `apps/myk9show/src/test/e2e/entities/dogCreationWorkflow.spec.ts`           | Dog creation workflow.                                                                                  |
| `apps/myk9show/src/test/e2e/entities/dogCRUD.spec.ts`                       | Dog CRUD.                                                                                               |
| `apps/myk9show/src/test/e2e/entities/dogsUI.spec.ts`                        | Dogs UI.                                                                                                |
| `apps/myk9show/src/test/e2e/entities/entriesUI.spec.ts`                     | Entry management UI.                                                                                    |
| `apps/myk9show/src/test/e2e/entities/peopleCRUD.spec.ts`                    | People CRUD.                                                                                            |
| `apps/myk9show/src/test/e2e/entities/peopleUI.spec.ts`                      | People UI.                                                                                              |
| `apps/myk9show/src/test/e2e/entities/phase2ShowDayRewalk.spec.ts`           | Phase 2 show-day re-walk.                                                                               |
| `apps/myk9show/src/test/e2e/judge/judgeJourney.spec.ts`                     | Judge assignments, stats, check-in, and results dashboard audit.                                        |
| `apps/myk9show/src/test/e2e/entities/registrationUI.spec.ts`                | Registration wizard UI.                                                                                 |
| `apps/myk9show/src/test/e2e/registration/wizardVisualQA.spec.ts`            | Registration wizard visual and responsive baselines.                                                    |
| `apps/myk9show/src/test/e2e/registration/dogPickerSearch.spec.ts`           | Exhibitor registration dog search and selection persistence.                                             |
| `apps/myk9show/src/test/e2e/entities/reportsUI.spec.ts`                     | Reports UI.                                                                                             |
| `apps/myk9show/src/test/e2e/entities/secretaryEntryCreationUI.spec.ts`      | Secretary entry creation.                                                                               |
| `apps/myk9show/src/test/e2e/entities/secretaryShowWorkbenchUI.spec.ts`      | Secretary show workbench.                                                                               |
| `apps/myk9show/src/test/e2e/secretary/entryApprovalAndWaitlistGate.spec.ts` | Secretary approval, move-up, and waitlist decision gate audit.                                          |
| `apps/myk9show/src/test/e2e/entities/showCRUD.spec.ts`                      | Show CRUD.                                                                                              |
| `apps/myk9show/src/test/e2e/entities/showsUI.spec.ts`                       | Shows UI.                                                                                               |
| `apps/myk9show/src/test/e2e/shell-integrity-responsive.spec.ts`             | Responsive shell interaction integrity.                                                                 |
| `apps/myk9show/src/test/e2e/entities/showWizardUI.spec.ts`                  | Show wizard UI.                                                                                         |
| `apps/myk9show/src/test/e2e/slice4-exhibitor-trust-evidence.spec.ts`        | Read-only exhibitor trust and responsive evidence walk.                                                 |
| `apps/myk9show/src/test/e2e/slice5-a11y-keyboard.spec.ts`                   | Exhibitor accessibility and keyboard-only evidence walk.                                                |
| `apps/myk9show/src/test/e2e/slice5-cross-surface-reconciliation.spec.ts`    | Read-only exhibitor cross-surface consistency evidence.                                                 |
| `apps/myk9show/src/test/e2e/slice5-journey-matrix.spec.ts`                  | Exhibitor viewport and theme journey evidence.                                                          |
| `apps/myk9show/src/test/e2e/slice5-regression-paths.spec.ts`                | Read-only exhibitor regression paths.                                                                   |
| `apps/myk9show/src/test/e2e/slice5-runtime-cleanliness.spec.ts`             | Read-only exhibitor console and network cleanliness evidence.                                           |
| `apps/myk9show/src/test/e2e/entities/trialCRUD.spec.ts`                     | Trial CRUD.                                                                                             |
| `apps/myk9show/src/test/e2e/entities/trialsUI.spec.ts`                      | Trials UI.                                                                                              |
| `apps/myk9show/src/test/e2e/people-page-ui.spec.ts`                         | People page UI.                                                                                         |
| `apps/myk9show/src/test/e2e/real-auth-browse-shows.spec.ts`                 | Authenticated browse shows.                                                                             |
| `apps/myk9show/src/test/e2e/qa/roleJourneyVisualQa.spec.ts`                 | MYK9-17 role/viewport/theme visual QA matrix.                                                           |
| `apps/myk9show/src/test/e2e/qa/appToasterA11y.spec.ts`                       | App toaster rich-color contrast and close-control accessibility.                                        |
| `apps/myk9show/src/test/e2e/qa/measurementSweep.spec.ts`                    | Route-wide contrast/touch-target/name/overflow sweep; writes findings, asserts nothing. Opt-in: needs `MYK9_MEASUREMENT_SWEEP=1` or every group skips. |
| `apps/myk9show/src/test/e2e/show-creation-wizard-detailed.spec.ts`          | Detailed show wizard.                                                                                   |
| `apps/myk9show/src/test/e2e/show-details-sidebar-navigation.spec.ts`        | Show details navigation.                                                                                |
| `apps/myk9show/src/test/e2e/show/atShowJudgeAuditReplay.spec.ts`            | Scheduled judge scoring replay: conflict re-upload, quick-advance, shared-staging escape proof.         |
| `apps/myk9show/src/test/e2e/show/atShowMultiDeviceOfflineSync.spec.ts`      | At-show two-device offline sync-merge audit with guarded writes.                                        |
| `apps/myk9show/src/test/e2e/show/phase4CrossRoleSeams.spec.ts`              | Phase 4 fixture-backed cross-role seam audit.                                                           |
| `apps/myk9show/src/test/e2e/show/showConflictSurfacing.spec.ts`             | Show replication conflict surfacing.                                                                    |
| `apps/myk9show/src/test/e2e/show-live-sync.spec.ts`                         | Show live-sync live Realtime smoke (data/Realtime-dependent; run when touching show live-sync).         |
| `apps/myk9show/src/test/e2e/show-presence.spec.ts`                          | Show presence live Realtime smoke (data/Realtime-dependent; run when touching show presence).           |
| `apps/myk9show/src/test/e2e/shows-page-ui-improvements.spec.ts`             | Shows page UI improvements.                                                                             |
| `apps/myk9show/src/test/e2e/trials-page-ui.spec.ts`                         | Trials page UI.                                                                                         |
| `apps/myk9show/src/test/e2e/user-creation-validation.spec.ts`               | User creation validation.                                                                               |
| `apps/myk9show/src/test/e2e/admin/payout-ledger-responsive.spec.ts`         | Payout ledger row geometry at audited widths; fixture-backed reads.                                     |
| `apps/myk9show/src/test/e2e/legal-page-styles.spec.ts`                      | Legal page theme colors and dividers reaching rendered styles.                                          |
| `apps/myk9show/src/test/e2e/registrationProgressResponsive.spec.ts`         | Registration progress legibility across 3 viewports x light/dark.                                       |

## Manual Debug

| Spec                                                                         | Why                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| `apps/myk9show/src/test/e2e/auth-test.spec.ts`                               | Authentication probe with unclear overlap.              |
| `apps/myk9show/src/test/e2e/debug-authentication.spec.ts`                    | Explicit debug spec.                                    |
| `apps/myk9show/src/test/e2e/debug-role-assignment.spec.ts`                   | Explicit debug spec.                                    |
| `apps/myk9show/src/test/e2e/debug-show-add-button.spec.ts`                   | Explicit debug spec.                                    |
| `apps/myk9show/src/test/e2e/debug-show-edit.spec.ts`                         | Explicit debug spec.                                    |
| `apps/myk9show/src/test/e2e/debug-user-flow.spec.ts`                         | Explicit debug spec.                                    |
| `apps/myk9show/src/test/e2e/seed.spec.ts`                                    | Seed/data probe, not a quality gate.                    |
| `apps/myk9show/src/test/e2e/simple-show-edit-debug.spec.ts`                  | Explicit debug spec.                                    |
| `apps/myk9show/src/test/e2e/test-user-edit-panel-authenticated.spec.ts`      | Authenticated panel probe.                              |
| `apps/myk9show/src/test/e2e/test-user-edit-panel.spec.ts`                    | Panel probe.                                            |
| `apps/myk9show/src/test/e2e/test-user-profile-edit.spec.ts`                  | Profile edit probe.                                     |
| `apps/myk9show/src/test/e2e/show/secretaryCockpitSharedSync.spec.ts`         | Opt-in shared-staging writer; never run in ordinary CI. |
| `apps/myk9show/src/test/e2e/slice2-debug.spec.ts`                            | Temporary career investigation probe.                   |
| `apps/myk9show/src/test/e2e/slice3b-entitlement-transition-evidence.spec.ts` | Deliberate staging grant/revoke evidence walk.          |
| `apps/myk9show/src/test/e2e/slice5-premium-capability-states.spec.ts`        | Deliberate staging write-and-cleanup evidence walk.     |
| `apps/myk9show/src/test/e2e/load-readiness.spec.ts`                          | Opt-in read-only diagnostic; skipped unless LOAD_READINESS_DIAGNOSTIC=true.|
| `apps/myk9show/src/test/e2e/load-request-phases.spec.ts`                     | Opt-in bounded request-phase diagnostic; same explicit gate.|
| `apps/myk9show/src/test/e2e/secretary-task-walk.seed.spec.ts`                | Step-driven audit instrument; its own header says not a CI spec.|

## Candidate Delete

| Spec                                                                 | Review Question                                                                        |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `apps/myk9show/src/test/e2e/phase2-quick-test.spec.ts`               | Superseded by maintained secretary/show wizard and entity UI specs?                    |
| `apps/myk9show/src/test/e2e/phase2-show-management-workflow.spec.ts` | Superseded by current show wizard, shows UI, and secretary UAT specs?                  |
| `apps/myk9show/src/test/e2e/phase2-validation-smoke.spec.ts`         | Superseded by focused validation/unit tests and current wizard specs?                  |
| `apps/myk9show/src/test/e2e/show-details-issue.spec.ts`              | If issue is fixed, move any assertion into show details/navigation specs.              |
| `apps/myk9show/src/test/e2e/show-details-performance.spec.ts`        | Keep only if it has a maintained performance threshold.                                |
| `apps/myk9show/src/test/e2e/cross-browser-compatibility.spec.ts`     | Likely duplicated by `src/test/e2e/cross-browser/*`; preserve unique assertions first. |

Suite-map reconciliation on 2026-08-02 removed the stale admin
templateManagement entry: the file no longer exists and its maintained
read-only coverage is now admin/sportRules.spec.ts.

## Visual Snapshot Artifacts

These are tracked Playwright snapshot assets, not executable specs. They are intentionally excluded from suite-map drift detection.

| Path                                                                               | Status                                                                                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `apps/myk9show/src/test/e2e/__snapshots__/secretary/show-creation-wizard.spec.ts/` | Keep while visual snapshot coverage for the show wizard is still useful; remove with that suite. |
