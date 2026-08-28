## 1. Baseline and Decisions

- [x] 1.1 Record the judge-only IA decision and accepted item (4) fail-open trade-off in the OpenSpec artifacts, then verify `pnpm openspec validate myk9-250-at-show-class-picker-followups --type change --strict` passes.
- [x] 1.2 Measure the current entry-notification path with 5,000 locally cached entries across multiple shows and at least 48 classes for one initial load plus ten sequential delivered notifications, record elapsed time and repeated entry/trial/class read counts in `benchmark-evidence.md`, and verify the evidence demonstrates whether the cost is material.

## 2. Focused Implementation

- [x] 2.1 Collapse judge-only duplication so **Your ring** is the sole known-assignment list, and verify a focused component test asserts each assigned class renders once while broader staff retains trial sections.
- [x] 2.2 Reapply delivered entry snapshots to loaded class groups without repeated entry/trial/class reads, and verify focused adapter/hook tests cover show filtering, count/next-up updates, initial-load fallback, and subscription teardown.
- [x] 2.3 Use persisted scope metadata for cold-offline empty-state truth, and verify focused tests distinguish a hydrated zero-class show from an unproven device cache while retaining conservative copy when metadata reads fail.

## 3. Verification and Delivery

- [x] 3.1 Run the focused At-Show and replication-helper unit tests, the myK9Show test suite where practical, plus app typecheck/lint, and verify all changed logic compiles and passes; stop and report any suite hang beyond 60 seconds.
- [x] 3.2 Run OpenSpec implementation verification, review the diff for unrelated changes and offline/RBAC regressions, and resolve all critical findings.
- [x] 3.3 Open a PR linked to MYK9-250 with acceptance evidence, obtain green CI and review, merge when authorized, then update Linear with the PR, merge commit, tests, risks, and acceptance result.
- [x] 3.4 After merge, sync the delta spec if approved, archive the OpenSpec change, and clean up the feature branch/worktree with worktree removal as the final command.
