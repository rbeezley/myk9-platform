## 1. Current-failure inventory

- [x] 1.1 Record the July 18 run revision, six historical failures, and the post-run workflow/spec changes that may supersede them.
- [x] 1.2 Run the current isolated lifecycle source tests and Playwright discovery/compile checks; classify every reproduced failure before changing implementation.

## 2. Workflow and configuration repair

- [x] 2.1 Make the Supabase setup-action contract version-resilient while retaining local lifecycle, no-shared-secret, two-run, artifact, and cleanup assertions.
- [x] 2.2 Strengthen lifecycle unit coverage so generated `VITE_SUPABASE_URL`, anon key, and `SUPABASE_SERVICE_ROLE_KEY` are required in the job environment.
- [x] 2.3 Add a bounded weekly schedule while preserving manual dispatch, the enablement variable, disposable target preparation, one worker, zero retries, and the two-run reset proof.

## 3. Curated Playwright repair

- [x] 3.1 [EXPANDED] Verify the regression enablement variable and required secret names exist without exposing values, then dispatch or run the current curated suite against the isolated target; treat a skipped/failed preparation job as a configuration failure and map every browser failure to configuration, fixture drift, stale test behavior, or product behavior.
- [x] 3.2 Repair each reproduced failure narrowly, or record an explicit rewrite/delete decision with replacement coverage; do not add retries or weaken the journey.
- [x] 3.3 Re-run the affected specs and then the full curated isolated suite until one complete dispatch succeeds.
- [x] 3.4 [EXPANDED] Add an assertion-first regression for a mutation queued after an active upload snapshot, then make the upload runner schedule one follow-up drain when the overlapping attempt is skipped.
- [x] 3.5 [EXPANDED] Trace the persisted check-in through the Web Lock and RPC boundary, add a red migration contract, and guard all derived-status placement clears against nested no-op entry updates.

## 4. Testing and verification

- [x] 4.1 Run `pnpm qa:isolated-e2e:test` and confirm the focused source/unit contracts pass.
- [x] 4.2 Run Playwright list/compile validation for the curated config and focused browser specs for any repaired journey.
- [x] 4.3 Run targeted lint/typecheck for touched TypeScript, workflow YAML validation, `git diff --check`, and `pnpm openspec validate repair-stateful-playwright-regression --type change --strict --no-interactive`.
- [x] 4.4 Review the diff for shared-system writes, shared-staging secret leakage, retries, PR-smoke expansion, and unrelated application behavior changes.
- [x] 4.5 Run the focused replication race test red before the fix and green after it, then run the broader MutationManager tests and package/app typechecks.
- [x] 4.6 Run the migration no-op guard contract red before the forward migration and green after it; use the isolated two-pass workflow as the database behavioral test.

## 5. Evidence and delivery

- [x] 5.1 Record the historical-failure disposition, schedule decision, successful dispatch URL, and residual risks in the isolated-regression runbook/evidence.
- [x] 5.2 Push the feature branch, open the MYK9-107 PR with the repository template and OpenSpec link, and complete CI/review/merge before archive. — PR #1503 merged to `main` as `91a13f92d` on 2026-07-28 after review and green CI.
- [x] 5.3 Post the implementation summary, verification results, PR/run links, risks, and acceptance-criteria result to MYK9-107; move it to Done only after the green dispatch evidence gate passes. — Linear updated with the final evidence and moved to Done on 2026-07-28.

## Validation Profile [ADDED]

- Risk: medium
- Validation: app
- Rationale: The change affects a shared CI workflow, stateful browser evidence, internal production replication scheduling, and an existing class-status trigger without changing stored data shape or public APIs; focused red-to-green scheduler/migration coverage plus a complete two-pass isolated workflow dispatch provide the decisive validation.
