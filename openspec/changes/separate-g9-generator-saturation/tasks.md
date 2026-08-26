## 1. Safety contracts

- [x] 1.1 Add assertion-first contracts for scoring-worker detection, cancellation, rollback quiet-window requirements, and fail-before-reseed behavior.
- [x] 1.2 Add workflow contracts proving cleanup drains before reseed and preflights CPU/IO telemetry.

## 2. Generator topology

- [x] 2.1 Expand shard assignment and aggregation contracts from four 25-session shards to eight 12/13-session shards while preserving all global sequences.
- [x] 2.2 Update the manual workflow and documentation to run eight standard free runners without changing the G9 workload or thresholds.

## 3. Platform evidence

- [x] 3.1 Ensure the workflow preflights CPU/IO counter families and keeps runtime telemetry fail-closed.
- [x] 3.2 Verify the aggregate artifact contract includes exactly one complete platform observation.

## 4. Verification

- [x] 4.1 Run focused load tests, discovery, typecheck, diff checks, and strict OpenSpec validation.
- [x] 4.2 Review the diff for shared-target safety, secret leakage, workload weakening, and files over 500 lines.
- [x] 4.3a Record approved rehearsal run 32904006355: preflight passed, canonical reseed failed before load, and read-only recovery proof confirmed `514|504|0` with zero scoring workers.
- [x] 4.3b Fix the newly exposed packet object/metadata cleanup ordering and ambiguous cleanup SQL with assertion-first regression coverage.
- [ ] 4.3 Record the approved remote rehearsal as a separate operator-gated follow-up; do not claim G9 completion from local checks.

## 5. Authorized local performance follow-up

- [x] 5.1 Reproduce idle-window dilution and multi-trial request fan-out with failing deterministic tests.
- [x] 5.2 Scope generator metrics to active load and reject legacy unscoped capacity attribution.
- [x] 5.3 Batch class-visibility reads without changing cascade, RLS, offline enrichment, or workload thresholds.
- [x] 5.4 Intercept automatic writes in the readiness diagnostic and record safe request counts.
- [x] 5.4a Reproduce a cached scoresheet blocked on stalled sync; render cached class/entry/trial data immediately, refresh only its trial/show entries in the background, and retain forced cold/retry hydration.
- [x] 5.5 Verify regression suites, app/test types, lint, build, guarded browser readiness, and strict OpenSpec validation; review the diff.
- [x] 5.6a Restore the diagnostic's single unscored entry after explicit approval, with guarded transaction, quiet-window proof, and independent `514|504|0` verification.
- [x] 5.6b Obtain explicit approval to publish the branch and open a PR, excluding private rehearsal diagnostics and repair SQL.
- [x] 5.7 Run pre-publish typecheck/lint/tests and independent review, including a regression for correction followed by the next cached entry. Publication does not authorize merging or starting a load run.
- [x] 5.6 Obtain separate approval for unchanged full G9 validation still required. Keep MYK9-126/MYK9-109 open. Approved 2026-08-26; passing evidence remains required.

## 6. Post-merge request attribution

- [x] 6.1 Measure bounded, write-guarded cold startup, first sheet, next cached sheet and background windows separately on the merged revision.
- [x] 6.2 Attribute repeated requests to existing sync/query owners and reproduce confirmed avoidable work with failing tests before a minimal fix.
- [x] 6.3 Run focused regression tests, typecheck/lint, build and the same guarded browser comparison; preserve offline/RBAC behavior and private evidence.
- [x] 6.4 Report remaining evidence gates; obtain separate publication/merge and full G9 approval as needed. PR #1807 merged; one unchanged full G9 approved 2026-08-26.
- [x] 6.4a Obtain approval to publish the scoped post-upload refresh patch, excluding private rehearsal notes and artifacts. Merge and full G9 remain separately gated.

## 7. Bounded generator follow-up

- [x] 7.1 Compare guarded single-session development and production-build frontend work; retain separate API counts and do not infer capacity.
- [x] 7.2 Reproduce idle dev-server CPU overhead, add a failing config regression, and remove forced polling while retaining polling opt-in.
- [x] 7.3 Verify native watcher events, guarded readiness, focused regression tests, types/lint, and record diagnostic limits.
- [x] 7.4a Obtain approval to publish the generator follow-up patch, excluding private diagnostic notes and artifacts. Approved 2026-08-26.
- [x] 7.4 Obtain separate merge approval for the generator follow-up patch; keep further full G9 execution separately gated. Approved 2026-08-26.
