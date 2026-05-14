# Nightly E2E Repair Batches

## Goal

Repair quarantined Playwright specs in parallel, then promote stable specs back into the Nightly command before the 11 PM scheduled QA run.

The current scheduled Nightly gate includes the Wave 1 specs verified on 2026-05-12:

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

## Promotion Rule

For each repaired spec:

1. Run the spec alone:

   ```bash
   cd apps/myk9show
   pnpm test:e2e:clean <spec> --project=chromium --workers=1
   ```

2. Fix stale test assumptions, setup bugs, or confirmed app bugs at the root cause.
3. Re-run the spec alone.
4. Re-run the stable Nightly smoke command.
5. If both pass, update `docs/qa/e2e-suite-map.md` and the scheduled Nightly command if the spec should run tonight.
6. If the spec still depends on unstable data, mark it `manual-debug` and log durable findings in `docs/qa/findings.md`.

## Parallel Batch Plan

### Batch A — Smoke And Public Navigation

Owner scope:

- `apps/myk9show/src/test/e2e/basic/registrationSmoke.spec.ts`
- `apps/myk9show/src/test/e2e/browse-shows-to-details.spec.ts`
- `apps/myk9show/src/test/e2e/simple-connectivity.spec.ts`

Known failures:

- `registrationSmoke` asserts generic buttons/links that current UI does not guarantee.
- `browse-shows-to-details` hard-codes `127.0.0.1:5174`.
- `simple-connectivity` expects secretary login to redirect to `/`.

Promotion target:

- Restore as PR smoke only if assertions are user-critical and stable.

Testing:

```bash
cd apps/myk9show
pnpm test:e2e:clean \
  src/test/e2e/basic/registrationSmoke.spec.ts \
  src/test/e2e/browse-shows-to-details.spec.ts \
  src/test/e2e/simple-connectivity.spec.ts \
  --project=chromium --workers=1
```

### Batch B — Registration Golden Paths

Owner scope:

- `apps/myk9show/src/test/e2e/registration/singleDogSingleClass.spec.ts`
- `apps/myk9show/src/test/e2e/registration/exhibitorSelfRegistration.spec.ts`
- `apps/myk9show/src/test/e2e/registration/secretaryExistingUsers.spec.ts`
- `apps/myk9show/src/test/e2e/registration/secretaryNewUsers.spec.ts`

Known failures:

- Dry run showed rapid failures across registration workflows.
- Likely stale route, fixture, data-testid, auth, or payment expectations.

Promotion target:

- Promote `singleDogSingleClass.spec.ts` first if repaired; it is the highest-value small registration path.
- Promote exhibitor/secretary workflows only after they pass alone.

Testing:

```bash
cd apps/myk9show
pnpm test:e2e:clean \
  src/test/e2e/registration/singleDogSingleClass.spec.ts \
  src/test/e2e/registration/exhibitorSelfRegistration.spec.ts \
  src/test/e2e/registration/secretaryExistingUsers.spec.ts \
  src/test/e2e/registration/secretaryNewUsers.spec.ts \
  --project=chromium --workers=1
```

### Batch C — Registration Edge, Performance, And Meta Suites

Owner scope:

- `apps/myk9show/src/test/e2e/registration/entryCreationCore.spec.ts`
- `apps/myk9show/src/test/services/APIErrorInterceptor.registrationRecovery.test.ts` (converted from stale E2E; promoted to the Nightly Vitest phase)
- `apps/myk9show/src/test/e2e/registration/index.spec.ts`
- `apps/myk9show/src/hooks/useInfiniteScroll.performanceCaching.test.ts` (converted from stale E2E; promoted to the Nightly Vitest phase)
- `apps/myk9show/src/test/unit/entryStore.multiClass.test.ts` (converted from E2E; promoted to the Nightly Vitest phase)
- `apps/myk9show/src/test/services/entries/entryLimitChecker.waitlists.test.ts` (converted from E2E; promoted to the Nightly Vitest phase)

Known failures:

- Dry run showed broad rapid failures.
- Some checks may belong in Vitest/service tests rather than Playwright.

Promotion target:

- Keep unrepaired Playwright specs out of tonight's Nightly unless a spec becomes small, deterministic, and user-critical.
- Converted service/store checks can run in the Nightly Vitest phase instead of the browser command.

Testing:

```bash
cd apps/myk9show
npx vitest run \
  src/test/unit/entryStore.multiClass.test.ts \
  src/test/services/entries/entryLimitChecker.waitlists.test.ts \
  src/test/services/APIErrorInterceptor.registrationRecovery.test.ts \
  src/hooks/useInfiniteScroll.performanceCaching.test.ts

pnpm test:e2e:clean \
  src/test/e2e/registration/entryCreationCore.spec.ts \
  src/test/e2e/registration/index.spec.ts \
  --project=chromium --workers=1
```

### Batch D — Secretary Workflows

Owner scope:

- `apps/myk9show/src/test/e2e/secretary/classCreation.spec.ts`
- `apps/myk9show/src/test/e2e/secretary/show-creation-wizard.spec.ts`
- `apps/myk9show/src/test/e2e/secretary/show-wizard-officials.spec.ts`
- `apps/myk9show/src/test/e2e/secretary-entry-walk.spec.ts`
- `apps/myk9show/src/test/e2e/show/showManagement.spec.ts`

Known failures:

- `show-creation-wizard` auth/navigation passed, but Step 1 form rendering timed out.
- `classCreation` failed rapidly across workflow, validation, and progress scenarios.

Promotion target:

- Promote one stable secretary creation/management proof at a time.
- Avoid duplicating assertions already covered by `qa-regression-proof.spec.ts`.

Testing:

```bash
cd apps/myk9show
pnpm test:e2e:clean \
  src/test/e2e/secretary/classCreation.spec.ts \
  src/test/e2e/secretary/show-creation-wizard.spec.ts \
  src/test/e2e/secretary/show-wizard-officials.spec.ts \
  src/test/e2e/secretary-entry-walk.spec.ts \
  src/test/e2e/show/showManagement.spec.ts \
  --project=chromium --workers=1
```

### Batch E — Secretary UAT Proofs

Owner scope:

- `apps/myk9show/src/test/e2e/uat/secretary/critical-path.spec.ts`
- `apps/myk9show/src/test/e2e/uat/secretary/disposable-entry.spec.ts`
- `apps/myk9show/src/test/e2e/uat/secretary/evidence.spec.ts`

Known failures:

- Collection blocker fixed on 2026-05-12 by changing `test.afterEach(async (fixtures, testInfo)` to `test.afterEach(async ({}, testInfo)`.
- Specs still need to run alone before promotion.

Promotion target:

- Promote `critical-path` if stable.
- Keep `evidence` manual-only if it mainly captures screenshots.

Testing:

```bash
cd apps/myk9show
pnpm test:e2e:clean \
  src/test/e2e/uat/secretary/critical-path.spec.ts \
  src/test/e2e/uat/secretary/disposable-entry.spec.ts \
  src/test/e2e/uat/secretary/evidence.spec.ts \
  --project=chromium --workers=1
```

### Batch F — Scoring And Broad Role Suites

Owner scope:

- `apps/myk9show/src/test/e2e/scoring/scoringWorkflow.spec.ts`
- `apps/myk9show/src/test/e2e/cross-role-workflows.spec.ts`
- `apps/myk9show/src/test/e2e/public-shows-responsive.spec.ts` (extracted from stale unified suite; promoted to the Nightly Playwright phase)

Known failures:

- `scoringWorkflow` failed rapidly in the broad dry run.
- `cross-role-workflows` failed rapidly across many unrelated subflows.
- `unified-shows-workflows` was retired after extracting the two useful public responsive checks.

Promotion target:

- Split broad suites before promoting.
- Prefer a small scoring smoke over the full scoring workflow if tonight's goal is meaningful signal.
- The extracted public responsive smoke can run in the Nightly Playwright phase instead of the broad unified suite.

Testing:

```bash
cd apps/myk9show
pnpm test:e2e:clean \
  src/test/e2e/scoring/scoringWorkflow.spec.ts \
  src/test/e2e/cross-role-workflows.spec.ts \
  src/test/e2e/public-shows-responsive.spec.ts \
  --project=chromium --workers=1
```

## Recommended Parallel Wave 1

Run these in parallel because they touch disjoint files and can promote high-value coverage quickly:

- Batch A: smoke/public navigation.
- Batch B: registration golden path, starting with `singleDogSingleClass.spec.ts`.
- Batch D: secretary show wizard and class creation.
- Batch E: secretary UAT proofs.

Hold Batch C and Batch F until Wave 1 has stabilized, because they are broader and more likely to need splitting rather than direct repair.

## Wave 1 Result — 2026-05-12

Promoted tonight:

- Batch A: `registrationSmoke`, `browse-shows-to-details`, and `simple-connectivity` now pass together.
- Batch B: `secretaryExistingUsers` is promoted as a narrow secretary existing-user registration guard.
- Batch D: `show-creation-wizard` and narrow `classCreation` smoke are promoted.
- Batch E: `critical-path`, `disposable-entry`, and `evidence` UAT proofs are promoted.

Still queued:

- `singleDogSingleClass` reaches payment but is not a full golden path because the AKC agreement/Next path remains suspect.
- `exhibitorSelfRegistration` and `secretaryNewUsers` document current placeholders/permissions, but are not useful Nightly gates yet.
- `show-wizard-officials` still has stale picker selectors around chairman/judges.
- `secretary-entry-walk` was repaired and promoted on 2026-05-14 after the duplicate-entry and email-CORS noise was made idempotent/mocked.
- `showManagement` moved past the `logger is not defined` helper bug but still times out in old workflows.

Verification:

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
  src/test/e2e/secretary-entry-walk.spec.ts \
  --project=chromium --workers=1 --timeout=90000 --retries=0
```

Result: `25 passed (1.1m)`.

## Testing Phase

Before considering a batch complete:

- The repaired spec passes alone.
- The stable Nightly smoke command passes.
- `docs/qa/e2e-suite-map.md` is updated with the correct suite classification.
- `OPEN-TODOS.md` is updated: remove completed repair items only after the spec is either promoted or explicitly reclassified.
- Any confirmed app issue that is not fixed immediately is logged in `docs/qa/findings.md`.
