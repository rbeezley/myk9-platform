# Plan verification

## Validation Profile

- Risk: high for operational proof; low for expected repository prose/tooling diff.
- Validation: full operational browser/SQL journey plus focused existing regression tests; reclassify any product correction by actual diff.
- Rationale: auth expiry and durable queue upload need the real boundary proof; unchanged application source does not require repeating an unrelated broad local suite.

Coverage: 85/100 → 100/100 of planned evidence. Initial gaps were natural token expiry versus simulated time, durable queue inspection before reconnect, same-user binding, and teardown on failure. Design Decisions 3–5 and Risks now explicitly cover them. Actual task completion is separate and remains pending; owner approval is a hard dependency.

| Requirement                                              | Coverage | Plan evidence                               |
| -------------------------------------------------------- | -------- | ------------------------------------------- |
| Next coherent in-review batch; full descriptions         | Covered  | Proposal, task1.1                           |
| Engine expired-token/same-owner/different-owner/no-owner | Covered  | Design Context/Decision4; tasks1.3/3.2/3.3  |
| Real browser over 1 hour offline, score then upload      | Covered  | Decision4; tasks3.1–3.3                     |
| Queue NULL/gaps across roles with SQL/replica            | Covered  | Decision3; tasks2.1/2.2                     |
| Completed/in-ring/pulled controls                        | Covered  | Decision3; task2.3                          |
| Approval, fixture isolation, failure and cleanup         | Covered  | Decisions2/5 and Risks; tasks1.2/4.1        |
| Honest deployed build and closure evidence               | Covered  | Migration Plan; tasks4.2–4.4                |
| PR review/CI/merge/archive                               | Covered  | Migration Plan; tasks4.3/Workflow follow-up |

Executed: main baseline7e73c5fa1, served28c1cb1ac; five app files/76 tests passed, EXIT 0; dist freshness passed. Read-only SQL confirmed current demo class and two baseline entries, no Ranger entry. Standard in-flight gate stops on unrelated primary README/audit-boundary edits; scoped warning-mode diagnostic completed with no overlap among 194 sources; this resolves path contention without claiming the standard primary-checkout gate passed. Manual In Progress survey found only unrelated merged performance work on ringside. No primary edits were modified. Owner approval pending.

Package verification: queue-owner 3/3 passed and canonical runQueue56/56 passed. Initial package command used the root with a package-relative log path and did not run; corrected invocation from packages/replication passed. This is a harness invocation correction, not a product failure.

## Executed read-only result — 2026-10-15

Owner chose “Prepare checks without shared-data writes.” Live tasks remain blocked, not waived. No entry was created, scored, checked in or reordered, and the 61-minute live score/upload case was not run. Both issues remain In Progress; no archive is permitted yet.

- App engine/queue regression:5 files / 76 tests, EXIT 0.
- Original converted app/display/print surfaces:13 files / 217 tests, EXIT 0 (some overlap with the first run; these are test executions, not a unique-test total).
- Package queue owner:1 file / 3 tests, EXIT 0; canonical queue:2 files / 56 tests, EXIT 0.
- Deployed read-only role views: judge Willow “Up next”, Cooper “Then”; secretary both entries, zero checked in/scored; cold exhibitor Willow scheduled 9 AM, “I am not there yet”. All match SQL.
- Actual judge replica: two clean rows, runOrder 1/2, checkInStatus no-status, isScored false, serverVersion 1, zero pending mutations. Local recordVersion 8 is a replica revision, not the server row version.
- Before/after SQL: original selected business/version fields unchanged; Ranger count 0. All three owned sessions closed; no local server started.
- Preparation corrections: package log initially addressed from wrong cwd; secretary overview does not expose dog rows, so canonical class-details route was used; ringside fullscreen has no main element, so body was read. Initial guard blocked the heartbeat read; verified its SQL STABLE SELECT implementation and existing sharedStagingWriteGuard allowlist, then allowed that exact RPC while retaining mutation blocks. These are harness corrections, not product failures. Earlier failed preparations are not counted as passing live evidence. Existing hero preload warning remains unrelated.

## Verification scorecard

| Dimension    | Status                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Completeness | 5/14 tracked tasks complete; read-only preparation complete, full live tasks blocked by owner boundary                                  |
| Correctness  | Existing focused regressions pass; baseline deployed facts agree with SQL/replica; expiry-upload and missing queue-state cases unproven |
| Coherence    | Existing UI/replication/auth paths preserved; no new product surface or data mutation                                                   |

Critical before full completion/archive: execute tasks 2/3 on an explicitly authorized fixture or obtain a specific owner-approved replacement acceptance, then perform full delivery/closure tasks 4.3/4.4. The read-only preparation PR is eligible to merge as documentation; it does not claim full implementation verification or issue closure. See docs/qa/batch2-show-day-verification.md for exact commands, evidence and resume procedure.
