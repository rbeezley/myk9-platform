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
- [ ] 4.3 Record the approved remote rehearsal as a separate operator-gated follow-up; do not claim G9 completion from local checks.
