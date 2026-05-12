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

Add myK9Q only for ringside changes:

```bash
cd apps/myk9q
pnpm test:e2e -- --project=chromium
```

### Nightly

Nightly has two phases: stable Playwright smoke, then an agent/browser route-health sweep.

Wave 1 repairs on 2026-05-12 promoted the following stable Chromium checks. This command was verified with retries disabled: `25 passed (1.1m)`.

```bash
cd apps/myk9show
pnpm test:e2e:clean \
  src/test/e2e/simple-connectivity.spec.ts \
  src/test/e2e/basic/registrationSmoke.spec.ts \
  src/test/e2e/browse-shows-to-details.spec.ts \
  src/test/e2e/uat/secretary/qa-regression-proof.spec.ts \
  src/test/e2e/uat/secretary/critical-path.spec.ts \
  src/test/e2e/uat/secretary/disposable-entry.spec.ts \
  src/test/e2e/uat/secretary/evidence.spec.ts \
  src/test/e2e/secretary/show-creation-wizard.spec.ts \
  src/test/e2e/secretary/classCreation.spec.ts \
  src/test/e2e/registration/secretaryExistingUsers.spec.ts \
  --project=chromium --workers=1 --timeout=90000 --retries=0
```

Then run:

```text
/audit-pages full
```

The route-health sweep should cover public, exhibitor, secretary, judge, club-admin, and admin route groups as far as local credentials and seeded IDs allow. It checks render, console errors, owned 4xx/5xx network responses, unresolved skeletons, obvious broken UI, and 375px mobile sanity. Log durable issues in `docs/qa/findings.md`.

### Feature Audit

```bash
cd apps/myk9show
pnpm test:e2e:clean src/test/e2e/entities/<spec>.spec.ts --project=chromium --workers=1
```

### Manual Debug

```bash
cd apps/myk9show
pnpm test:e2e:clean src/test/e2e/<spec>.spec.ts --project=chromium --headed --workers=1
```

## PR Smoke

| Spec                                                                   | Why                                                   |
| ---------------------------------------------------------------------- | ----------------------------------------------------- |
| `apps/myk9show/src/test/e2e/simple-connectivity.spec.ts`               | App boots and basic page load works.                  |
| `apps/myk9show/src/test/e2e/uat/secretary/qa-regression-proof.spec.ts` | Current strict secretary regression proof.            |
| `apps/myk9q/tests/e2e/auth.spec.ts`                                    | myK9Q authentication smoke; run for ringside changes. |
| `apps/myk9q/tests/e2e/core-features.spec.ts`                           | myK9Q core ringside smoke; run for ringside changes.  |

## Nightly Active

These specs are in the current scheduled Nightly Playwright command. Do not add to this table until the promotion rule passes: run the spec alone, run the full active Nightly command, then update this map.

| Spec                                                                     | Why                                                |
| ------------------------------------------------------------------------ | -------------------------------------------------- |
| `apps/myk9show/src/test/e2e/basic/registrationSmoke.spec.ts`             | Public registration route/auth/navigation smoke.   |
| `apps/myk9show/src/test/e2e/browse-shows-to-details.spec.ts`             | Public browse-to-detail navigation.                |
| `apps/myk9show/src/test/e2e/registration/secretaryExistingUsers.spec.ts` | Stable secretary existing-user registration guard. |
| `apps/myk9show/src/test/e2e/secretary/classCreation.spec.ts`             | Narrow class-creation route/template smoke.        |
| `apps/myk9show/src/test/e2e/secretary/show-creation-wizard.spec.ts`      | Stable secretary show wizard smoke.                |
| `apps/myk9show/src/test/e2e/simple-connectivity.spec.ts`                 | App boots and secretary sign-in works.             |
| `apps/myk9show/src/test/e2e/uat/secretary/critical-path.spec.ts`         | Stable secretary UAT critical path.                |
| `apps/myk9show/src/test/e2e/uat/secretary/disposable-entry.spec.ts`      | Stable secretary disposable entry management.      |
| `apps/myk9show/src/test/e2e/uat/secretary/evidence.spec.ts`              | Stable secretary evidence pass.                    |
| `apps/myk9show/src/test/e2e/uat/secretary/qa-regression-proof.spec.ts`   | Strict secretary regression proof.                 |

## Nightly Candidates / Repair Queue

These specs may become Nightly coverage, but they are not in the scheduled command yet. Keep the reason current so the queue stays repairable instead of becoming a graveyard.

| Spec                                                                              | Why                                                |
| --------------------------------------------------------------------------------- | -------------------------------------------------- |
| `apps/myk9show/src/test/e2e/admin/templateManagement.spec.ts`                     | Admin workflow coverage.                           |
| `apps/myk9show/src/test/e2e/auth/signUpUI.spec.ts`                                | Auth UI validation and happy path.                 |
| `apps/myk9show/src/test/e2e/authentication-validation.spec.ts`                    | Broader auth validation.                           |
| `apps/myk9show/src/test/e2e/complete-user-journey.spec.ts`                        | End-to-end user journey, broad and data-dependent. |
| `apps/myk9show/src/test/e2e/cross-browser/basic-functionality.spec.ts`            | Compatibility signal, not needed per PR.           |
| `apps/myk9show/src/test/e2e/cross-browser/functionality.spec.ts`                  | Broad browser workflow matrix.                     |
| `apps/myk9show/src/test/e2e/cross-browser/performance.spec.ts`                    | Performance checks belong outside PR smoke.        |
| `apps/myk9show/src/test/e2e/cross-browser/quirks.spec.ts`                         | Browser-specific behavior checks.                  |
| `apps/myk9show/src/test/e2e/cross-browser-compatibility.spec.ts`                  | Legacy all-in-one browser/device matrix.           |
| `apps/myk9show/src/test/e2e/cross-role-workflows.spec.ts`                         | Multi-role workflows, valuable but broad.          |
| `apps/myk9show/src/test/e2e/database-record-validation.spec.ts`                   | DB state validation.                               |
| `apps/myk9show/src/test/e2e/payment/paymentFlow.spec.ts`                          | Payment smoke.                                     |
| `apps/myk9show/src/test/e2e/payment/phase3-5-comprehensive-payment.spec.ts`       | Broad payment suite.                               |
| `apps/myk9show/src/test/e2e/phase5-complete-integration.spec.ts`                  | Broad historical integration suite.                |
| `apps/myk9show/src/test/e2e/phase5-simple-integration.spec.ts`                    | Integration coverage.                              |
| `apps/myk9show/src/test/e2e/registration/entryCreationCore.spec.ts`               | Registration core workflow.                        |
| `apps/myk9show/src/test/e2e/registration/errorHandlingAndRecovery.spec.ts`        | Registration failure/recovery coverage.            |
| `apps/myk9show/src/test/e2e/registration/exhibitorSelfRegistration.spec.ts`       | Exhibitor registration journey.                    |
| `apps/myk9show/src/test/e2e/registration/index.spec.ts`                           | Registration integration index.                    |
| `apps/myk9show/src/test/e2e/registration/performanceAndCaching.spec.ts`           | Registration performance/cache checks.             |
| `apps/myk9show/src/test/e2e/registration/phase3-2-multi-class-entries.spec.ts`    | Multi-class entry coverage.                        |
| `apps/myk9show/src/test/e2e/registration/phase3-4-entry-limits-waitlists.spec.ts` | Entry limit and waitlist coverage.                 |
| `apps/myk9show/src/test/e2e/registration/secretaryNewUsers.spec.ts`               | Secretary registration for new users/dogs.         |
| `apps/myk9show/src/test/e2e/registration/singleDogSingleClass.spec.ts`            | Focused registration path, still data-dependent.   |
| `apps/myk9show/src/test/e2e/scoring/scoringWorkflow.spec.ts`                      | Judge/ringside scoring workflow.                   |
| `apps/myk9show/src/test/e2e/secretary/show-wizard-officials.spec.ts`              | Officials/judges picker proof.                     |
| `apps/myk9show/src/test/e2e/secretary-entry-walk.spec.ts`                         | Secretary entry walk.                              |
| `apps/myk9show/src/test/e2e/show/showManagement.spec.ts`                          | Show management workflow.                          |
| `apps/myk9show/src/test/e2e/unified-shows-workflows.spec.ts`                      | Unified show workflows across roles.               |

## Feature Audit

| Spec                                                                   | Feature                     |
| ---------------------------------------------------------------------- | --------------------------- |
| `apps/myk9show/src/test/e2e/browse-clubs-page.spec.ts`                 | Public club browse/detail.  |
| `apps/myk9show/src/test/e2e/classes-page-ui.spec.ts`                   | Classes page UI.            |
| `apps/myk9show/src/test/e2e/entities/classCRUD.spec.ts`                | Class CRUD.                 |
| `apps/myk9show/src/test/e2e/entities/classesUI.spec.ts`                | Classes UI.                 |
| `apps/myk9show/src/test/e2e/entities/clubCRUD.spec.ts`                 | Club CRUD.                  |
| `apps/myk9show/src/test/e2e/entities/clubsUI.spec.ts`                  | Clubs UI.                   |
| `apps/myk9show/src/test/e2e/entities/dogCreationWorkflow.spec.ts`      | Dog creation workflow.      |
| `apps/myk9show/src/test/e2e/entities/dogCRUD.spec.ts`                  | Dog CRUD.                   |
| `apps/myk9show/src/test/e2e/entities/dogsUI.spec.ts`                   | Dogs UI.                    |
| `apps/myk9show/src/test/e2e/entities/entriesUI.spec.ts`                | Entry management UI.        |
| `apps/myk9show/src/test/e2e/entities/peopleCRUD.spec.ts`               | People CRUD.                |
| `apps/myk9show/src/test/e2e/entities/peopleUI.spec.ts`                 | People UI.                  |
| `apps/myk9show/src/test/e2e/entities/registrationUI.spec.ts`           | Registration wizard UI.     |
| `apps/myk9show/src/test/e2e/entities/reportsUI.spec.ts`                | Reports UI.                 |
| `apps/myk9show/src/test/e2e/entities/secretaryEntryCreationUI.spec.ts` | Secretary entry creation.   |
| `apps/myk9show/src/test/e2e/entities/showCRUD.spec.ts`                 | Show CRUD.                  |
| `apps/myk9show/src/test/e2e/entities/showsUI.spec.ts`                  | Shows UI.                   |
| `apps/myk9show/src/test/e2e/entities/showWizardUI.spec.ts`             | Show wizard UI.             |
| `apps/myk9show/src/test/e2e/entities/trialCRUD.spec.ts`                | Trial CRUD.                 |
| `apps/myk9show/src/test/e2e/entities/trialsUI.spec.ts`                 | Trials UI.                  |
| `apps/myk9show/src/test/e2e/my-entries-page-ui.spec.ts`                | Exhibitor entries page.     |
| `apps/myk9show/src/test/e2e/people-page-ui.spec.ts`                    | People page UI.             |
| `apps/myk9show/src/test/e2e/real-auth-browse-shows.spec.ts`            | Authenticated browse shows. |
| `apps/myk9show/src/test/e2e/show-creation-wizard-detailed.spec.ts`     | Detailed show wizard.       |
| `apps/myk9show/src/test/e2e/show-details-sidebar-navigation.spec.ts`   | Show details navigation.    |
| `apps/myk9show/src/test/e2e/shows-page-ui-improvements.spec.ts`        | Shows page UI improvements. |
| `apps/myk9show/src/test/e2e/trials-page-ui.spec.ts`                    | Trials page UI.             |
| `apps/myk9show/src/test/e2e/user-creation-validation.spec.ts`          | User creation validation.   |

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

| Spec                                                                               | Review Question                                                                                                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Path Or Spec                                                                       | Review Question                                                                                                           |
| ---------------------------------------------------------------------------------  | ------------------------------------------------------------------------------------------------------------------------  |
| `apps/myk9show/src/test/e2e/__snapshots__/secretary/show-creation-wizard.spec.ts/` | Snapshot artifact directory, not a spec file. Confirm whether the generated images are still useful, then delete or keep. |
| `apps/myk9show/src/test/e2e/phase2-quick-test.spec.ts`                             | Superseded by maintained secretary/show wizard and entity UI specs?                                                       |
| `apps/myk9show/src/test/e2e/phase2-show-management-workflow.spec.ts`               | Superseded by current show wizard, shows UI, and secretary UAT specs?                                                     |
| `apps/myk9show/src/test/e2e/phase2-validation-smoke.spec.ts`                       | Superseded by focused validation/unit tests and current wizard specs?                                                     |
| `apps/myk9show/src/test/e2e/show-details-issue.spec.ts`                            | If issue is fixed, move any assertion into show details/navigation specs.                                                 |
| `apps/myk9show/src/test/e2e/show-details-performance.spec.ts`                      | Keep only if it has a maintained performance threshold.                                                                   |
| `apps/myk9show/src/test/e2e/cross-browser-compatibility.spec.ts`                   | Likely duplicated by `src/test/e2e/cross-browser/*`; preserve unique assertions first.                                    |
