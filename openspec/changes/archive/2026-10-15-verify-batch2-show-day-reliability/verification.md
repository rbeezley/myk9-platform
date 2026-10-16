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

## Approved redesign

Owner approved the simpler proof design. Native loopback WebSockets replace the proxy; only credential-free socket origins/paths and frame counts are recorded. The endurance proof requires no received frames during offline time. Every role assertion is scoped to Willow's row; the actual hand-placement list verifies gapped 1/2 positions and terminal read-only controls. Concurrency is keyed by source SHA with cancellation disabled. Main #3048 is integrated.

Validation after redesign: proof typecheck and exact Node22.12 discovery of2 tests passed;16 isolation tests,25 artifact contracts, full root typecheck/lint, format, ratchet and strict OpenSpec passed. Whole-app shuffled run:2,997 files /29,127 tests passed, EXIT0 (2 skipped files,11 skipped tests,1 todo). Natural browser acceptance remains pending.

Run38812001389 reached the actual null-order browser case. All three scoped role UI assertions passed, including the cold exhibitor's truthful pending line, but the replica assertion incorrectly expected null. The established rowToEntry mapper maps SQL NULL to undefined for optional runOrder. Correct the expectation to that verified shape while retaining the exact SQL NULL assertion. The serial61-minute case did not run. Artifact secret verification and disposable cleanup both passed. This is a harness expectation correction, not evidence of an application defect or full acceptance pass.

Run38813146628 passed actual NULL, gapped and in-ring cross-role cases, with SQL/replica and hand-placement evidence. The pulled case stopped because its judge row is intentionally inside a collapsed native Not running disclosure; the test must expand that existing group before asserting the row. This is a harness navigation correction, not a product failure. Completed and natural-expiry proof remain unexecuted. Review also requested a positive online socket/frame control and test-body origin assertions; those controls are added.

Run38814485269 confirmed the pulled judge disclosure/navigation and staff state. It then stopped on the exhibitor copy: the intentional role-specific pulled label is “I won't be running this class”, not “Pulled” (EXHIBITOR_STATUS_LABELS). Match that exact established label while keeping no-position checks. Also observe only POST scoring RPC responses, avoiding null payloads on CORS preflights. Completed and natural-expiry proof remain pending; secret verification/cleanup passed.

## Passing isolated execution

# Isolated show-day acceptance evidence — 2026-10-15

Owner request: verify MYK9-1204 and MYK9-992 in an isolated environment without shared data changes, then close if all criteria pass. The owner approved the simpler native-socket, row-scoped, per-source-SHA design. This is the explicitly authorized replacement for the shared/deployed fixture check.

[Proof run](https://github.com/rbeezley/myk9-platform/actions/runs/38815521555) passed both tests, no skips or retries. [Synthetic screenshots and SQL/IndexedDB/identity evidence](https://github.com/rbeezley/myk9-platform/actions/runs/38815521555/artifacts/12014086941). Source/build `58ae5c5fc5e586edb31ccdaa35349129d539bcbf` matches actual checked-out git metadata, build stamp and both browser assertions. GitHub's report CI commit field is a synthetic merge SHA; it is not the tested source. Exact source metadata is retained.

MYK9-992: all five actual SQL cases passed across secretary, judge and fresh exhibitor contexts. NULL/checked-in/unscored displayed “Position pending: running order not posted yet”. Gapped 31/101 displayed Cooper then Willow, exhibitor “2nd up”, hand-placement positions 1/2. In-ring, pulled and completed rows showed state only, without a queue position or raw 101; manual terminal sections were read-only. Pulled exhibitor copy was “I won't be running this class”. SQL business/version fields remained unchanged by the read-only UI comparisons; judge IndexedDB matched each SQL state. Existing converted-surface/guide sweep is preserved in MYK9-992's October 5 comment and #2727; #2824 supplies the null-position fix. Preparation #3047 reran 5 files/76 checks and 13 files/217 converted display/print checks (overlap; do not sum), queue-owner 3 and canonical queue 56.

MYK9-1204: genuine native Chromium offline interval began 2026-10-15T22:17:59.535000+00:00; score evidence at 2026-10-15T23:19:00.192000+00:00, monotonic elapsed 3660657.0 ms. All 61 real-minute progress marks were recorded. Token expiry metadata 1792106278 was past at save; persisted account remained the same. Positive online socket/frame control passed, navigator was offline and received socket frames during the interval were 0. Score Q/61.23 seconds saved through the real UI within the asserted 15-second bound. IndexedDB had 2 durable mutations, all owned by the original judge. SQL remained exactly the unscored baseline version 10 while offline. Reconnect refreshed the same account, scoring RPC returned HTTP200 with no score conflict, final SQL became qualified/61.23/completed/version 12; queue emptied to 0, clean/synced replica version 12. Cold exhibitor Result Q/61.2s and secretary Qualified both passed. Existing engine tests exercise getSession errors, same-owner upload, different-owner hold and no-owner refusal; #3040 already repaired this established replication path.

Isolation: runner-only passwords; guarded loopback Supabase and matching build; external browser HTTP/container public egress blocked; no shared application fixture, payment, notification, migration or deployment. Existing migrations/seeds applied only to the disposable local database. Credential verification, artifact upload and stop --no-backup all passed. Local browser/server probe contexts were closed. This loaded-page proof does not test PWA offline cold boot or passcode identity adoption (separate issues).

Validation: full shuffled app 2,997 files/29,127 tests, root typecheck/lint, proof typecheck/exact Node22.12 discovery, 16 isolation guards, 25 artifact contracts, format/ratchet/strict OpenSpec passed; standard CI38815521598 successful. Final independent review and PR3049 merge are still pending. Both Linear issues remain In Progress until those gates pass; archive follows closure.

Main moved through #3052/#3053 during endurance. #3052 changes adoption/backup restore for a dead passcode owner, not this same-owner path; final review must assess compatibility. No source changes were pushed during this successful hour.

## Final evidence review corrections

Independent Claude review of the passing run confirmed the natural-expiry upload, five queue-state cases, isolation and privacy. Two P3 evidence corrections are recorded here before closure; neither requires changing the browser harness or production behavior.

**CLI provenance:** successful run38815521555 used `supabase/setup-cli@v3` resolved to action SHA `45a513f8c64c0bc8e0e3dfe572b5c95be85f6359`, input `latest`, setup22:12:56–22:13:01UTC. That exact action resolves `supabase@latest` from the public npm registry, installs it, calls the executable's `--version` and requires success, but does not print the returned version. Registry metadata retrieved after the run reports latest **2.121.0**, published2026-10-14T15:46:41.163Z; metadata last modified2026-10-15T14:52:27.598Z, before this run's setup. Thus **2.121.0 is reconstructed from unchanged registry/action provenance, not a directly retained binary-version line**. Source: `https://registry.npmjs.org/supabase` and the exact action source. Node22.12.0 and pnpm9.15.9 are directly logged. The workflow's latest input may resolve differently in a future run; reproducing this environment requires selecting2.121.0. Source-SHA pinning proves which application was tested, not immutable external infrastructure. No invented version or claim that a future latest run has identical infrastructure is made.

**Separate observed product defect:** [QA-TIME-DISPLAY-001](../../../../docs/qa/findings.md#qa-time-display-001) records secretary run-sheet centisecond truncation. Actual completed attachment: SQL61.23, judge01:01.23, secretary1:01.22, exhibitor61.2s (intentional one-decimal display). Fresh pure formatter reproduction returns1:01.22 for61.23 because `Math.floor((secs % 1) * 100)` truncates a floating-point fraction. The underlying SQL/replica score remains61.23 and ranking/data are not alleged corrupted. This is an open P3 display defect, retained report-only for triage under quality-finding-lifecycle; awaiting an approved Linear-creation batch. Do not claim exact secretary time parity. MYK9-992's queue-position/state comparisons and MYK9-1204's score persistence/upload acceptance still pass; this proof did not assert centisecond display parity. Closure of those issues does not close this finding.

Only documentation changes follow tested source58ae5c5fc; the executable/workflow/config source remains identical. The existing completed 61-minute run is retained rather than reinterpreted as a test of a new runtime. Fresh independent review and standard CI must pass on the documentation tip before merge. Earlier review-limit escalation remains recorded; this bounded close-out addresses the two identified evidence corrections without another structural patch or owner override.

## Completeness / correctness / coherence before merge

- Completeness:12/14 tasks complete. Required remaining gates are4.3 (exact-head independent review/CI/merge) and4.4 (fresh full-issue read/evidence/Done); archive remains blocked until both finish.
- Correctness: both full Linear contracts mapped to existing merged fixes/regressions and actual passing isolated browser/SQL/replica/expiry evidence. No delta specs (`skip_specs:true`). The secretary centisecond display finding is explicitly outside the two closure contracts and remains open.
- Coherence: existing isolation lifecycle, native browser transport, established auth/replication mutations and canonical queue reused. No new user surface or alternative ordering rule. Shared application data unchanged.

## Final verification and closure — 2026-10-15

| Dimension    | Final result                                                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completeness | 14/14 tasks complete; both full Linear descriptions re-read after merge; evidence posted and Done verified.                                                     |
| Correctness  | Both actual isolated browser tests passed with zero skips/retries; existing engine, surface/guide sweep and display/print regression evidence retained.         |
| Coherence    | Approved native-socket/row-scoped design and established isolation/auth/replication/canonical queue paths followed; no product behavior or delta specs changed. |

Implementation PR [#3049](https://github.com/rbeezley/myk9-platform/pull/3049) merged as `a21694dd70a551c0d93e8b51cdfa74fdd7da47ea` at 23:49:14 UTC. Final head `905248bdb00fdd8f76b58bdd930aa1710c260ef5` received [clean independent Claude review](https://github.com/rbeezley/myk9-platform/pull/3049#issuecomment-6204473116) and [passing standard CI](https://github.com/rbeezley/myk9-platform/actions/runs/38824067757). Pinned-head watcher EXIT 0; required checks all green. The only outstanding non-required check was automatic endurance repeat38824067545. It is preserved, but is not required for this documentation-only tip: executable/workflow/config files are identical to tested source58ae. Its result is not claimed here. The completed run38815521555 supplies the actual acceptance evidence.

MYK9-1204 moved to Done at 23:50:12 UTC; MYK9-992 at 23:50:16 UTC. Fresh get_issue reads confirmed both statuses. Each closure comment maps all criteria and states the owner's explicit isolated-environment replacement authorization, tested source, real timing/SQL/queue results, merge/review/CI, cleanup and limitations. No remaining acceptance work for these issues. QA-TIME-DISPLAY-001 remains open separately for triage; no centisecond display parity or PWA cold-boot/passcode-adoption proof is claimed.

All owned local browser/probe contexts are closed. Successful proof VM stopped without backup. Synthetic screenshots/JSON and independent review are preserved outside the worktree. Unrelated primary audit files are preserved. Archive is a documentation follow-up after implementation merge and tracker closure; no spec sync is needed (`skip_specs:true`). The required verification/merge gates are complete; the redundant automatic repeat remains independent of this archive's acceptance.
