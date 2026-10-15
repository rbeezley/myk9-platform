# Verification

## Plan coverage

Coverage85/100 →100/100 after explicitly addressing target/build matching, server/browser egress, natural expiry, queue ownership, cold contexts, secret-free artifacts and failure/teardown boundaries. This is plan coverage, not a passing execution claim.

| Requirement                                          | Evidence in plan                                        |
| ---------------------------------------------------- | ------------------------------------------------------- |
| No shared data changes                               | Design1/2/6; tasks1.2/2.1/4.1                           |
| Canonical NULL/gaps and terminal states across roles | Design4; tasks2.2/2.3                                   |
| Real over-hour offline expiry and same-owner upload  | Design5; tasks3.1–3.3                                   |
| No false passing/skipped proof                       | Risks; tasks4.1/4.2                                     |
| Review/CI/merge/closure/archive gates                | Design6/Migration Plan; tasks4.3/4.4/Workflow follow-up |

## Validation Profile

- Risk: high verification boundary, unchanged production behavior.
- Validation: actual isolated browser/SQL/auth/replication journey, focused guard tests, explicit proof typecheck, whole app shuffled before new tests push, required CI/independent review.
- Rationale: the missing acceptance is boundary behavior; mocks cannot substitute for real natural expiry/upload.

Executed so far:16 isolation guard/lifecycle tests pass; Playwright discovers exactly two proof tests; proof tsconfig passes. Whole-app shuffled rerun passed:2,996 files /29,123 tests, EXIT0 (2 skipped files,11 skipped tests,1 todo). The initial run exposed two new-workflow artifact-contract failures; guard id/condition and per-directory zip exclusions were corrected, then25 focused artifact tests and the full rerun passed. Root typecheck/lint, proof typecheck, format, map, ratchet and strict OpenSpec validation pass. In-flight diagnostics used --warn because the primary has an unrelated audit-boundary edit; all overlaps were inspected: #3048 and an older MYK9-1131 branch add disjoint test-index rows. No implementation paths overlap. No shared application data has been written.

## First isolated attempt and review corrections

Run38797380231 at caf2a4f61 prepared/seeded the local target, verified isolation, built the app and compiled the proof tests. Playwright then rejected a named ESM import of root CommonJS tooling on Node22.12, before discovering any test. This is not browser passing evidence. Secret verification and disposable stop both passed. Exact Node22.12 local discovery reproduced the same error red; loading the unchanged root guard with createRequire made both tests discover successfully, EXIT0.

Independent Claude review recorded three findings. The RPC success/conflict assertion now filters scoring payloads after the online baseline; the workflow checks out and verifies the exact PR head. The midnight concern was checked against migration20261006014300: the canonical seed supplies seven consecutive days, so selecting today's class survives a preparation midnight crossing. Its date query is retained with an explanatory comment. The corrected head still needs a fresh independent verdict and actual browser proof.

Corrected-harness validation: exact Node22.12 discovers both tests in the dedicated project, proof typecheck EXIT0, artifact contracts25 passed, root lint EXIT0 (36 existing warnings), ratchet/format/strict OpenSpec pass. Whole-app shuffled rerun:2,996 files /29,123 tests passed, EXIT0;2 skipped files,11 skipped tests,1 todo.
