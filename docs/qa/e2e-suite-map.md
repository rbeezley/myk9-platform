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

### Nightly

Nightly has three phases: deterministic Vitest registration service/store checks, stable Playwright smoke, then an agent/browser route-health sweep.

Scheduled Nightly runs must be isolated from the primary checkout:

```bash
pnpm qa:nightly:prepare
```

Run the phases below from the generated detached `origin/main` worktree, using the generated `.qa-nightly.env` values for `PLAYWRIGHT_PORT`, `PLAYWRIGHT_BASE_URL`, and `PLAYWRIGHT_HMR_PORT`. Dirty local WIP in the primary checkout does not block Nightly once this isolated baseline exists. Abort only if the isolated `origin/main` baseline cannot be prepared, dependencies cannot bootstrap, the app cannot bind the generated port, or the global 30-minute wall-clock budget is exceeded.

Phase 1 runs promoted registration service/store checks that used to be stale Playwright wrappers:

```bash
cd apps/myk9show
npx vitest run \
  src/test/unit/entryStore.multiClass.test.ts \
  src/test/services/entries/entryLimitChecker.waitlists.test.ts \
  src/test/services/APIErrorInterceptor.registrationRecovery.test.ts \
  src/hooks/useInfiniteScroll.performanceCaching.test.ts
```

Phase 2 runs stable Chromium checks. Wave 1 repairs on 2026-05-12, follow-up repairs on 2026-05-13, and the cross-role plus online-entry repairs on 2026-05-14 promoted the following stable checks. This command was verified with retries disabled on 2026-05-23: `44 passed (2.4m)`.

```bash
cd apps/myk9show
pnpm test:e2e:clean \
  src/test/e2e/simple-connectivity.spec.ts \
  src/test/e2e/basic/registrationSmoke.spec.ts \
  src/test/e2e/browse-shows-to-details.spec.ts \
  src/test/e2e/cross-role-workflows.spec.ts \
  src/test/e2e/uat/secretary/qa-regression-proof.spec.ts \
  src/test/e2e/uat/secretary/critical-path.spec.ts \
  src/test/e2e/uat/secretary/disposable-entry.spec.ts \
  src/test/e2e/uat/secretary/evidence.spec.ts \
  src/test/e2e/secretary/show-creation-wizard.spec.ts \
  src/test/e2e/secretary/classCreation.spec.ts \
  src/test/e2e/registration/secretaryExistingUsers.spec.ts \
  src/test/e2e/registration/secretaryNewUsers.spec.ts \
  src/test/e2e/registration/index.spec.ts \
  src/test/e2e/registration/singleDogSingleClass.spec.ts \
  src/test/e2e/registration/exhibitorSelfRegistration.spec.ts \
  src/test/e2e/secretary-entry-walk.spec.ts \
  src/test/e2e/secretary/show-wizard-officials.spec.ts \
  src/test/e2e/registration/entryCreationCore.spec.ts \
  src/test/e2e/public-shows-responsive.spec.ts \
  src/test/e2e/route-health-by-role.spec.ts \
  --project=chromium --workers=1 --timeout=90000 --retries=0
```

Phase 3 is the committed route-health sweep spec (promoted 2026-06-06):

```bash
cd apps/myk9show
pnpm test:e2e:clean \
  src/test/e2e/route-health-by-role.spec.ts \
  --project=chromium --workers=1 --timeout=90000 --retries=0
```

The spec covers public, exhibitor, secretary, judge, club-admin, and admin route groups with seeded show `4584f257-19b5-4016-aae6-5e7827b769cb`. Per route it checks: render-not-blank, console errors (budget 0, minus documented noise), replication errors (QA-CONSOLE-ERROR-011 regression guard), owned 4xx/5xx, and 375px horizontal overflow on marked routes (`/` and `/admin/dashboard`). Log durable issues in `docs/qa/findings.md`.

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

## Nightly Active

These specs are in the current scheduled Nightly routine. Do not add to this table until the relevant promotion rule passes: run the spec alone, run the full active Nightly command for that runner with retries disabled where applicable, then update this map.

### Vitest

| Spec                                                                               | Why                                                            |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `apps/myk9show/src/test/services/APIErrorInterceptor.registrationRecovery.test.ts` | Registration retry, conflict, and network-error handling.      |
| `apps/myk9show/src/test/services/entries/entryLimitChecker.waitlists.test.ts`      | Entry limit and waitlist service scenarios.                    |
| `apps/myk9show/src/hooks/useInfiniteScroll.performanceCaching.test.ts`             | Registration large-result caching, prefetch, and cache bounds. |
| `apps/myk9show/src/test/unit/entryStore.multiClass.test.ts`                        | Multi-class entry store scenarios converted from E2E.          |

### Playwright

| Spec                                                                        | Why                                                          |
| --------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `apps/myk9show/src/test/e2e/basic/registrationSmoke.spec.ts`                | Public registration route/auth/navigation smoke.             |
| `apps/myk9show/src/test/e2e/browse-shows-to-details.spec.ts`                | Public browse-to-detail navigation.                          |
| `apps/myk9show/src/test/e2e/cross-role-workflows.spec.ts`                   | Current public, secretary, exhibitor, and judge route smoke. |
| `apps/myk9show/src/test/e2e/public-shows-responsive.spec.ts`                | Public Browse Shows mobile layout and touch targets.         |
| `apps/myk9show/src/test/e2e/route-health-by-role.spec.ts`                   | Route-health sweep: 6 role groups, console/network/overflow. |
| `apps/myk9show/src/test/e2e/registration/entryCreationCore.spec.ts`         | Core entry store workflow and audit trail.                   |
| `apps/myk9show/src/test/e2e/registration/exhibitorSelfRegistration.spec.ts` | Exhibitor online-entry journey through receipt.              |
| `apps/myk9show/src/test/e2e/registration/index.spec.ts`                     | Maintained registration spec inventory guard.                |
| `apps/myk9show/src/test/e2e/registration/secretaryExistingUsers.spec.ts`    | Stable secretary existing-user registration guard.           |
| `apps/myk9show/src/test/e2e/registration/secretaryNewUsers.spec.ts`         | Secretary mail-in person, dog, and dog-registration path.    |
| `apps/myk9show/src/test/e2e/registration/singleDogSingleClass.spec.ts`      | Focused one-dog, one-class registration path.                |
| `apps/myk9show/src/test/e2e/secretary-entry-walk.spec.ts`                   | Stable secretary entry wizard confirmation walk.             |
| `apps/myk9show/src/test/e2e/secretary/classCreation.spec.ts`                | Narrow class-creation route/template smoke.                  |
| `apps/myk9show/src/test/e2e/secretary/show-creation-wizard.spec.ts`         | Stable secretary show wizard smoke.                          |
| `apps/myk9show/src/test/e2e/secretary/show-wizard-officials.spec.ts`        | Officials and judges picker smoke.                           |
| `apps/myk9show/src/test/e2e/simple-connectivity.spec.ts`                    | App boots and secretary sign-in works.                       |
| `apps/myk9show/src/test/e2e/uat/secretary/critical-path.spec.ts`            | Stable secretary UAT critical path.                          |
| `apps/myk9show/src/test/e2e/uat/secretary/disposable-entry.spec.ts`         | Stable secretary disposable entry management.                |
| `apps/myk9show/src/test/e2e/uat/secretary/evidence.spec.ts`                 | Stable secretary evidence pass.                              |
| `apps/myk9show/src/test/e2e/uat/secretary/qa-regression-proof.spec.ts`      | Strict secretary regression proof.                           |

## Nightly Candidates / Repair Queue

These specs may become Nightly coverage, but they are not in the scheduled command yet. Keep the reason current so the queue stays repairable instead of becoming a graveyard.

| Spec                                                                        | Why                                                |
| --------------------------------------------------------------------------- | -------------------------------------------------- |
| `apps/myk9show/src/test/e2e/admin/templateManagement.spec.ts`               | Admin workflow coverage.                           |
| `apps/myk9show/src/test/e2e/auth/signUpUI.spec.ts`                          | Auth UI validation and happy path.                 |
| `apps/myk9show/src/test/e2e/authentication-validation.spec.ts`              | Broader auth validation.                           |
| `apps/myk9show/src/test/e2e/complete-user-journey.spec.ts`                  | End-to-end user journey, broad and data-dependent. |
| `apps/myk9show/src/test/e2e/cross-browser/basic-functionality.spec.ts`      | Compatibility signal, not needed per PR.           |
| `apps/myk9show/src/test/e2e/cross-browser/functionality.spec.ts`            | Broad browser workflow matrix.                     |
| `apps/myk9show/src/test/e2e/cross-browser/performance.spec.ts`              | Performance checks belong outside PR smoke.        |
| `apps/myk9show/src/test/e2e/cross-browser/quirks.spec.ts`                   | Browser-specific behavior checks.                  |
| `apps/myk9show/src/test/e2e/cross-browser-compatibility.spec.ts`            | Legacy all-in-one browser/device matrix.           |
| `apps/myk9show/src/test/e2e/database-record-validation.spec.ts`             | DB state validation.                               |
| `apps/myk9show/src/test/e2e/payment/paymentFlow.spec.ts`                    | Payment smoke.                                     |
| `apps/myk9show/src/test/e2e/payment/phase3-5-comprehensive-payment.spec.ts` | Broad payment suite.                               |
| `apps/myk9show/src/test/e2e/phase5-complete-integration.spec.ts`            | Broad historical integration suite.                |
| `apps/myk9show/src/test/e2e/phase5-simple-integration.spec.ts`              | Integration coverage.                              |
| `apps/myk9show/src/test/e2e/scoring/scoringWorkflow.spec.ts`                | Obsolete myK9Show scoring UI; rewrite myK9Q-first. |
| `apps/myk9show/src/test/e2e/show/showManagement.spec.ts`                    | Obsolete all-in-one show workflow; split/rewrite.  |

## Feature Audit

| Spec                                                                   | Feature                                                                                         |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/myk9show/src/test/e2e/browse-clubs-page.spec.ts`                 | Public club browse/detail.                                                                      |
| `apps/myk9show/src/test/e2e/classes-page-ui.spec.ts`                   | Classes page UI.                                                                                |
| `apps/myk9show/src/test/e2e/entities/classCRUD.spec.ts`                | Class CRUD.                                                                                     |
| `apps/myk9show/src/test/e2e/entities/classesUI.spec.ts`                | Classes UI.                                                                                     |
| `apps/myk9show/src/test/e2e/entities/clubCRUD.spec.ts`                 | Club CRUD.                                                                                      |
| `apps/myk9show/src/test/e2e/entities/clubsUI.spec.ts`                  | Clubs UI.                                                                                       |
| `apps/myk9show/src/test/e2e/entities/dogCreationWorkflow.spec.ts`      | Dog creation workflow.                                                                          |
| `apps/myk9show/src/test/e2e/entities/dogCRUD.spec.ts`                  | Dog CRUD.                                                                                       |
| `apps/myk9show/src/test/e2e/entities/dogsUI.spec.ts`                   | Dogs UI.                                                                                        |
| `apps/myk9show/src/test/e2e/entities/entriesUI.spec.ts`                | Entry management UI.                                                                            |
| `apps/myk9show/src/test/e2e/entities/peopleCRUD.spec.ts`               | People CRUD.                                                                                    |
| `apps/myk9show/src/test/e2e/entities/peopleUI.spec.ts`                 | People UI.                                                                                      |
| `apps/myk9show/src/test/e2e/entities/phase2ShowDayRewalk.spec.ts`      | Phase 2 show-day re-walk.                                                                       |
| `apps/myk9show/src/test/e2e/entities/registrationUI.spec.ts`           | Registration wizard UI.                                                                         |
| `apps/myk9show/src/test/e2e/entities/reportsUI.spec.ts`                | Reports UI.                                                                                     |
| `apps/myk9show/src/test/e2e/entities/secretaryEntryCreationUI.spec.ts` | Secretary entry creation.                                                                       |
| `apps/myk9show/src/test/e2e/entities/secretaryShowWorkbenchUI.spec.ts` | Secretary show workbench.                                                                       |
| `apps/myk9show/src/test/e2e/entities/showCRUD.spec.ts`                 | Show CRUD.                                                                                      |
| `apps/myk9show/src/test/e2e/entities/showsUI.spec.ts`                  | Shows UI.                                                                                       |
| `apps/myk9show/src/test/e2e/entities/showWizardUI.spec.ts`             | Show wizard UI.                                                                                 |
| `apps/myk9show/src/test/e2e/entities/trialCRUD.spec.ts`                | Trial CRUD.                                                                                     |
| `apps/myk9show/src/test/e2e/entities/trialsUI.spec.ts`                 | Trials UI.                                                                                      |
| `apps/myk9show/src/test/e2e/my-entries-page-ui.spec.ts`                | Exhibitor entries page.                                                                         |
| `apps/myk9show/src/test/e2e/people-page-ui.spec.ts`                    | People page UI.                                                                                 |
| `apps/myk9show/src/test/e2e/real-auth-browse-shows.spec.ts`            | Authenticated browse shows.                                                                     |
| `apps/myk9show/src/test/e2e/show-creation-wizard-detailed.spec.ts`     | Detailed show wizard.                                                                           |
| `apps/myk9show/src/test/e2e/show-details-sidebar-navigation.spec.ts`   | Show details navigation.                                                                        |
| `apps/myk9show/src/test/e2e/show/showConflictSurfacing.spec.ts`        | Show replication conflict surfacing.                                                            |
| `apps/myk9show/src/test/e2e/show-live-sync.spec.ts`                    | Show live-sync live Realtime smoke (data/Realtime-dependent; run when touching show live-sync). |
| `apps/myk9show/src/test/e2e/show-presence.spec.ts`                     | Show presence live Realtime smoke (data/Realtime-dependent; run when touching show presence).   |
| `apps/myk9show/src/test/e2e/shows-page-ui-improvements.spec.ts`        | Shows page UI improvements.                                                                     |
| `apps/myk9show/src/test/e2e/trials-page-ui.spec.ts`                    | Trials page UI.                                                                                 |
| `apps/myk9show/src/test/e2e/user-creation-validation.spec.ts`          | User creation validation.                                                                       |

## Manual Debug

| Spec                                                                    | Why                                                         |
| ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| `apps/myk9show/src/test/e2e/auth-test.spec.ts`                          | Authentication probe with unclear overlap.                  |
| `apps/myk9show/src/test/e2e/debug-authentication.spec.ts`               | Explicit debug spec.                                        |
| `apps/myk9show/src/test/e2e/debug-role-assignment.spec.ts`              | Explicit debug spec.                                        |
| `apps/myk9show/src/test/e2e/debug-show-add-button.spec.ts`              | Explicit debug spec.                                        |
| `apps/myk9show/src/test/e2e/debug-show-edit.spec.ts`                    | Explicit debug spec.                                        |
| `apps/myk9show/src/test/e2e/debug-user-flow.spec.ts`                    | Explicit debug spec.                                        |
| `apps/myk9show/src/test/e2e/playwright-real-auth.spec.ts`               | Real-auth investigation flow, likely environment-dependent. |
| `apps/myk9show/src/test/e2e/seed.spec.ts`                               | Seed/data probe, not a quality gate.                        |
| `apps/myk9show/src/test/e2e/simple-show-edit-debug.spec.ts`             | Explicit debug spec.                                        |
| `apps/myk9show/src/test/e2e/test-user-edit-panel-authenticated.spec.ts` | Authenticated panel probe.                                  |
| `apps/myk9show/src/test/e2e/test-user-edit-panel.spec.ts`               | Panel probe.                                                |
| `apps/myk9show/src/test/e2e/test-user-profile-edit.spec.ts`             | Profile edit probe.                                         |

## Candidate Delete

| Spec                                                                 | Review Question                                                                        |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `apps/myk9show/src/test/e2e/phase2-quick-test.spec.ts`               | Superseded by maintained secretary/show wizard and entity UI specs?                    |
| `apps/myk9show/src/test/e2e/phase2-show-management-workflow.spec.ts` | Superseded by current show wizard, shows UI, and secretary UAT specs?                  |
| `apps/myk9show/src/test/e2e/phase2-validation-smoke.spec.ts`         | Superseded by focused validation/unit tests and current wizard specs?                  |
| `apps/myk9show/src/test/e2e/show-details-issue.spec.ts`              | If issue is fixed, move any assertion into show details/navigation specs.              |
| `apps/myk9show/src/test/e2e/show-details-performance.spec.ts`        | Keep only if it has a maintained performance threshold.                                |
| `apps/myk9show/src/test/e2e/cross-browser-compatibility.spec.ts`     | Likely duplicated by `src/test/e2e/cross-browser/*`; preserve unique assertions first. |

## Visual Snapshot Artifacts

These are tracked Playwright snapshot assets, not executable specs. They are intentionally excluded from suite-map drift detection.

| Path                                                                               | Status                                                                                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `apps/myk9show/src/test/e2e/__snapshots__/secretary/show-creation-wizard.spec.ts/` | Keep while visual snapshot coverage for the show wizard is still useful; remove with that suite. |
