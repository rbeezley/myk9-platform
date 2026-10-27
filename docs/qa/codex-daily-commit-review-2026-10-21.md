# Daily commit review — 2026-10-21

source: codex. **Partial review: 20 of 131 commits completed; 111 remain.** No new confirmed defect in the completed prefix. This is not a clean verdict on all current main.

## Boundary and scope

- Start exclusive: `48e3616c09d243d4f7c0c7b4f5b7c7ac991af880`; previous window end `2026-10-15T13:29:59Z`.
- Reviewed end inclusive: `a21694dd70a551c0d93e8b51cdfa74fdd7da47ea`; window end `2026-10-15T23:49:14Z`.
- Frozen main and focused-test baseline: `61def04ba7719a7dea008fe0d72d7376dd7d88db`.
- No initial boundary gap and no 24-hour fallback. The remaining `(a21694dd7,61def04ba]` is explicitly uncovered. Exploratory reads beyond the prefix do not advance coverage.
- Reviewed 226 changed paths: dog registrations and sibling merge, held-entry ownership/adoption, email lifecycle, review parser, navigation rail/master-detail, wizard account ownership, isolated show-day verification and accompanying documentation.
- No application edits, commits, pushes, deployments, shared database writes, real emails, payment operations or browser sessions.

## P2 — unresolved evidence requirements

All entries below: source codex, last reconciled 2026-10-21, owner Richard Beezley, baseline above. These are existing verification requirements, not newly reproduced product defects. Confidence is high in the remaining written requirements; runtime behavior was not freshly exercised.

| Canonical ID                                                                                          | Status / first seen / source label                                                     | Observed versus required proof and next action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [MYK9-834](https://linear.app/myk9-platform/issue/MYK9-834)                                           | blocked / 2026-09-26 / Medium                                                          | Passcode judge offline reload proof remains unlinked in the full issue and latest comments. Preserve owner Done state. Supply deployed refocus → expired offline reload → durable local score → reconnect upload evidence, including identity-switch/signout/revocation controls, or explicit owner acceptance of an alternative. Batch-two signed-in, already-loaded judge proof is narrower: `apps/myk9show/src/test/e2e/verification/showDayReliability.spec.ts:205`, expiry assertion at 268 and upload at 297; no cold reload. Impact: assurance gap for show-day recovery, not evidence of score loss. |
| [MYK9-639](https://linear.app/myk9-platform/issue/MYK9-639), NCR-2026-09-19-01/-02, NCR-2026-09-20-01 | blocked / original 2026-09-17, residual 09-19/20 / Medium; historical High/P1 separate | Remains In Review. Oct20 records 25 payment-loader and two caller-composition passes against deployed `90030fbf7a9abfa1ec9e62329b56deaa865c9b3a`. Still requires authorized Stripe TEST one/two-hop checkout and secretary payment-link replay, retries and reversed/deleted controls, exactly one root/order, no unintended refund, plus My Shows, My Payments, financial report, persisted and offline readback. Existing full issue owns exact file references and execution contract. Impact: end-to-end financial assurance gap. Abandoned #2386 is not required scope.                                 |

## P2 — newly resolved in this audit ledger

- [MYK9-1196 / NCR-2026-10-15-01](https://linear.app/myk9-platform/issue/MYK9-1196), source Medium, first seen 2026-10-15, last reconciled 2026-10-21, Richard: Oct20 closure evidence distinguishes original `(8f6c1b49a,54f1db465]` coverage, already behind the cursor, from normal subsequent audit backlog. Approved-Mac harness diagnosis found no defect; the previously interrupted 58-file selection passed 809 tests in 37.65 seconds using verbose reporting on `f04de4f17`. Prior control runs recorded 178 app files/1,886 tests and 10 replication files/310 tests. Accept recorded focused proof and preserve Done. Do not repeatedly reopen this finite issue for newer commits.
- [MYK9-1011](https://linear.app/myk9-platform/issue/MYK9-1011), source Medium residual proof, first seen 2026-10-04, last reconciled 2026-10-21, Richard: Oct20 21:07 owner explicitly accepted isolated verification instead of remaining live chart/AskQ walkthrough and closed Done. Evidence records 87 DQ-specific tests within 32 files/319 tests at deployed `90030fbf7a9abfa1ec9e62329b56deaa865c9b3a`, deployment run 39489970462; earlier live persistence/reload/undo proof remains valid. Live chart/AskQ was not run here or silently claimed. DISQ/DQ registry mapping remains provisional and owner-accepted, not certified.

## Subsequent fixes and excluded signals

Adoption restore/conflict races introduced earlier in the window have subsequent fixes in [#3052](https://github.com/rbeezley/myk9-platform/pull/3052); current adoption tests pass. Registration-number-needed concurrency is already owned by MYK9-1212 and subsequently redesigned in #3112 with ACL hardening #3113; do not refile superseded implementations. Previously resolved MYK9-1250, MYK9-1225, MYK9-1212 and MYK9-1255 are not counted again. Historical 390px dog activity overlap remains inconclusive without fresh geometry; it is not a confirmed defect or a resolved finding.

## Verification

All runs executed in the isolated audit worktree against frozen current main, with shuffled seed 20261021 and verbose reporting; all returned exit 0:

| Selection               | Files | Tests | Evidence under `.logs/`                          |
| ----------------------- | ----: | ----: | ------------------------------------------------ |
| App first batch         |    36 |   498 | app-selection.txt, app-tests.log                 |
| Replication adoption    |     2 |    13 | replication-selection.txt, replication-tests.log |
| Root review/SQL harness |     4 |   237 | root-selection.txt, root-tests.log               |
| App second batch        |    19 |   244 | app-second-selection.txt, app-second-tests.log   |
| Root second batch       |     2 |    51 | root-second-selection.txt, root-second-tests.log |

Total: 1,043 passing test executions across 63 file executions; selections overlap, so this is not a unique test count. Root tests continued reporting progress during their 35.23-second run; no stalled test or inconclusive test verdict this run. Prefix `git diff --check` passed. Bootstrap completed. No full suite, typecheck, lint, live SQL, browser geometry or payment verification. SQL and long-running isolated E2E were source-reviewed, not executed. Recorded external closure proofs are distinguished above from fresh tests.

## Accounting and handoff

New 0; unchanged 0; newly resolved 2; duplicate 0; rejected 0; blocked 2. No P0/P1/P3 unresolved finding reported. Linear created 0, modified 0, closed 0, reopened 0: all remaining actionable requirements already have full canonical contracts; no new finding warrants filing. Exact known issues were read directly, which resolves archived records as well. No duplicate was created.

Shared cursor stamped only through `a21694dd7` in primary and audit checkout. Report and logs remain in `/private/tmp/myk9-ncr-20261021`; no commit or push. Next run starts after the shared cursor, not frozen main. Full requested review remains incomplete.

## Completed commit inventory

```text
9936b9b22 fix(batch1): complete registration dates and unpublished entry summaries (#3003)
1c17f5305 feat(ringside): a passcode judge re-entering after a dead session can upload the earlier session's scores for the same show (MYK9-1205) (#3041)
d23b2b285 chore(batch1): record applied types and verified closure (#3043)
72438af2e fix(registrations): a registration stored as a bare "AKC" shows and saves as its full label (MYK9-1207) (#3045)
d95ab0ac2 fix(dogs): an offline dog create merged onto an existing dog keeps its other registrations (MYK9-1151) (#3046)
28c1cb1ac fix(review-gate): a review is clean only by the contract sentence's exact shape, and parsed JSON findings override the prose (MYK9-1209) (#3044)
7e73c5fa1 docs(plan): sidebar labeled icon rail and browse pane
66aca6553 feat(lifecycle-emails): "Registration number needed" email for a held entry, with Send reminder (MYK9-1162) (#3042)
968624173 docs(plan): verify sidebar browse-pane plan, patch gaps
3659beb6a docs(qa): prepare batch 2 show-day verification (#3047)
ee709ba0f docs(plan): record shows-pane spike; build the labeled rail first
f2a31107a test(e2e): number-first Add Dog to a held entry and back onto the run sheet; guide card 5; spec matches design (MYK9-1162) (#3048)
63e52535c feat(nav): the desktop sidebar is a labeled icon rail; every page gains 152px (MYK9-1214) (#3050)
8a471a4a6 chore(openspec): archive number-first-add-dog; promote its specs (MYK9-1162) (#3051)
3a80aea41 fix(replication): passcode score adoption waits for a backup restore and re-surfaces a half-adopted conflict (MYK9-1211) (#3052)
245431673 test(dogs): hold the auto-upload so an unconfirmed registration add stays queued (MYK9-1201) (#3053)
1c25218d7 docs(plan): Supabase native local dev spike — migrations and 153 SQL tests pass without Docker
6863e7bad feat(shows): Shows list beside the show; Today / Upcoming / Past replace the next-show rail link (MYK9-1213) (#3054)
5f5ba655f test(e2e): the results journey clicks Print only once the toast stack has cleared (MYK9-1215) (#3056)
a21694dd7 test(show-day): verify queue and offline expiry in isolation (#3049)
```

Run recorded: 2026-10-21T10:03:56Z
