# Daily commit review — 2026-10-20

source: codex. **Partial review: 16 of 112 commits completed; 96 remain.**
No new confirmed product defect in the completed range. Two historical findings
now have closure proof; four existing verification gates remain blocked.

## Boundary and scope

- Starting shared cursor, exclusive: `3fab98f7d8ea27eff6e8793aff8612ed679f6474`,
  window end `2026-10-15T02:21:46Z`. No starting gap and no 24-hour fallback.
- Completed contiguous endpoint: `48e3616c09d243d4f7c0c7b4f5b7c7ac991af880`,
  window end `2026-10-15T13:29:59Z`: 16 commits, 197 changed paths.
- Frozen fetched main / verification baseline:
  `f04de4f1789c90a99347ab070451c67f5b623178` (`2026-10-20T14:25:59Z`).
- Coverage gap: the 96 commits after the completed endpoint through that baseline
  remain unreviewed. Targeted inspection of later fixes does not count as whole-commit
  review. The shared cursor advances only to the completed endpoint.
- Isolated worktree: `/private/tmp/myk9-ncr-20261020`, branch
  `codex/ncr-review-20261020`. No application changes, commit, push, deployment,
  shared fixture, payment, browser or database mutation.

Reviewed commits, oldest first:

| Commit    | PR    | Scope                                       |
| --------- | ----- | ------------------------------------------- |
| fa1e4d590 | #3026 | Stamp-race test identity cleanup            |
| 91a8a42c1 | #3028 | Atomic scope stamp and row ownership        |
| ac172ed0c | #3030 | Local calendar dates                        |
| da03a770a | #3029 | Shows, clubs and judge date windows         |
| 7be5255e7 | #3024 | Offline dog-owner names                     |
| 54d66c7d3 | #3021 | Lifecycle send results and retries          |
| 91aaaf125 | #3031 | Judge qualification expiry                  |
| ea271e537 | #3032 | Unmounted class-sync completion             |
| d6d256976 | #3033 | Show-zone day-of fee parity                 |
| 37af7affb | #3034 | Late owner-cache response isolation         |
| 48c22f92d | #3035 | Offline/relogin queue tests                 |
| c5ccc0052 | #3036 | Decision-email failure notification         |
| 00bf621e5 | #3037 | Durable check-in/status mutation ordering   |
| 47192df11 | #3039 | Consolidated person creation                |
| 39da500e2 | #3040 | Expired-token offline mutation identity     |
| 48e3616c0 | #3017 | Held no-number entries, packets and scoring |

Review followed the finding lifecycle contract, product intent, actual TypeScript
schemas, current source and later corrections, prior memory, QA ledger and exact
canonical Linear descriptions/comments. Held-entry SQL, access masks, score-write
guards, registration-change invalidation, packet omission and capacity behavior
received source review; SQL tests were read, not executed.

## P2 — unresolved verification prerequisites

All items below are source: codex; last reconciled 2026-10-20 against the frozen
baseline above; owner Richard Beezley. Confidence is high in the missing recorded
proof, not evidence of a newly failing product. Source severity Medium; historical
stronger product severities remain separate in their canonical issues.

| Stable ID                                                                                                | Status / first seen                                     | Remaining proof and impact                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [MYK9-1196](https://linear.app/myk9-platform/issue/MYK9-1196), NCR-2026-10-15-01                         | blocked / 2026-10-15                                    | Complete the 96-commit gap and stopped app selection. This limits review assurance. Updated Linear with this exact range, commands, results and closure criteria.                                                                                                                                   |
| [MYK9-834](https://linear.app/myk9-platform/issue/MYK9-834)                                              | blocked / 2026-09-26                                    | Passcode judge refocus, expired-token offline reload, local score persistence and reconnect/upload proof, or explicit owner-approved replacement. Existing Done state preserved; latest completion assertion does not supply this detailed proof.                                                   |
| [MYK9-1011](https://linear.app/myk9-platform/issue/MYK9-1011)                                            | blocked / 2026-10-04                                    | Deployed AskQ DQ-filter and statistics-chart walk with a published/released DQ fixture. Earlier persistence/reload/undo evidence remains valid; do not repeat fixed export/badge defects.                                                                                                           |
| [MYK9-639](https://linear.app/myk9-platform/issue/MYK9-639), NCR-2026-09-19-01/-02 and NCR-2026-09-20-01 | blocked / original issue 2026-09-17; residuals 09-19/20 | Authorized Stripe TEST one/two-hop replay through both callers: root paid once, one order, no unintended refund, financial/authoritative/offline readback and negative controls. Historical High/P1 money defect is distinct from this P2 proof prerequisite. Abandoned #2386 approach is excluded. |

Exact affected code/line anchors, observed-versus-expected evidence, acceptance
criteria and closure contracts remain directly in these canonical Linear issues.
No new symptom justifies a duplicate, reopening, or additional product allegation.
The current run did not execute the missing browser/payment gates.

## P2 — newly resolved

**[MYK9-1250](https://linear.app/myk9-platform/issue/MYK9-1250)** /
NCR-2026-10-17-01, source Medium, source: codex, first seen 2026-10-17,
last reconciled 2026-10-20. Shared-device replication cleanup could delete account
B's clean cached rows when account A's sync finished after an identity switch.
Original exact anchors and deterministic reproduction are in Linear.

Fix [#3108](https://github.com/rbeezley/myk9-platform/pull/3108) pins cleanup to
the syncing identity. The October 19 owner comment explicitly accepts deterministic
engine proof instead of an unreliable manually timed browser switch. All six
`syncReplicatedTable.cleanupOwner.test.ts` cases passed again at this run's baseline,
including the race and legitimate same-account cleanup controls. This meets the
recorded replacement proof gate; resolution is not inferred from merge alone.
Owner Richard Beezley; confidence high. No Linear state change made.

## P3 — newly resolved

**[MYK9-1225](https://linear.app/myk9-platform/issue/MYK9-1225)** /
QA-TIME-DISPLAY-001, source Low, source: codex, first seen 2026-10-15,
last reconciled 2026-10-20. Secretary run-sheet display truncated stored 61.23
seconds to 1:01.22. Exact formatter/consumer line references and original failing
assertion are in Linear.

The October 19 closure comment records final-source isolated proof at
`93fc01542ec8d21a1d74cc3d8c216cba0785ab86`:
[Actions run 39297518950](https://github.com/rbeezley/myk9-platform/actions/runs/39297518950).
SQL held 61.23, reloaded secretary showed 1:01.23 and judge showed 01:01.23 for the
same fresh disposable entry; six browser cases passed with zero retries and cleanup
was recorded. Fix #3091 and real-consumer assertions support this evidence.
This is previously executed closure proof reconciled now, not a browser run by this
audit. Owner Richard Beezley; confidence high. No Linear state change made.

## Checks and limits

- Bootstrap passed.
- App focused batch: 21 files / 258 tests passed, exit 0, 10.38 seconds.
- Replication stamp batch: 2 files / 19 tests passed, exit 0.
- Replication queue-owner and cleanup-owner batch: 2 files / 9 tests passed, exit 0.
- Total: **25 files / 286 tests passed**.
- Commands used `pnpm vitest run --sequence.shuffle --sequence.seed=20261020 --maxWorkers=4`.
  App/stamp file inventories and output are in this worktree's `.logs/`.
- Second app batch: 30 selected files stayed at RUN header for over 30 seconds;
  stopped per repository instruction, exit 130. No verdict and no retry loop.
  Quiet output does not establish a harness defect. MYK9-1196 owns the prerequisite.
- Completed-range `git diff --check` passed.
- No full suite, typecheck, lint, behavioral SQL, browser or production verification.

One rejected candidate: the first owner-cache change allowed a late account response
to repopulate the cache; subsequent #3034 fixes that within the reviewed range.
It is not a current finding. Existing resolved MYK9-1212 remains historical and is
not counted as newly resolved again.

Counts: **new 0; unchanged 0; resolved 2; duplicate 0; rejected 1; blocked 4**.
No P0/P1 finding reported. Linear: created 0, modified 1 (MYK9-1196), closed 0,
reopened 0. The boundary and memory record this partial range, not a clean full run.
