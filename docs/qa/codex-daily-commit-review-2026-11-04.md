# Daily commit review — 2026-11-04

source: codex. **Catch-up complete through the reviewed baseline; existing acceptance work remains.**
Report path: `docs/qa/codex-daily-commit-review-2026-11-04.md`.
Reviewed baseline: `5d62483f2846807707df13235994f326fbebca87`.

## Coverage and checks

Shared boundary `6b7dd4fd055b22dd5bbed18c8ddb9a9391892455` exclusive;
window start 2026-11-01T15:17:35Z, end 2026-11-04T15:18:10Z.
All **64 commits** reviewed. No gap before this range; no 24-hour fallback.
The recovered partial reviewed its first commit, `9fe0696aa`; this catch-up
reviewed the remaining 62 commits through the initially frozen `1472eaa39865f07de755d6c13c6ab2ecf8d69b0b`,
then inspected and tested the one arriving fix `5d62483f2` (#3594).
Final fetch at 15:28 UTC still showed that baseline and the original shared cursor.
Commits arriving after this cutoff belong to the next run.

Recovered unpublished report commit `f0415f472` from the retained dedicated
worktree and branch `codex/nightly-review-20261104`. Its earlier push failed with
GitHub `fatal error in commit_refs_rules`; that was a publication failure, not a
completed cursor advance. This report replaces its partial coverage statement.
Publication SHA, remote readback and cleanup are recorded outside this commit in memory.

Read lifecycle, tracker, prior reports/memory, scorecard, findings registry and intent.
Inspected complete relevant implementations and actual types, later fixes and merged
PR references; archived-inclusive Linear searches and full canonical issue/comment
reads prevented duplicate filing. Reviewed money/card attribution SQL and grants,
replication/version and identity races, offline recovery, checkout scoping, check-in,
show settings/uses, ringside controls, class changes, AskQ evidence checks, dependency
updates, browser-test/fixture changes, QA runners/workflows and documentation.
Compared copied SQL functions and view definitions with their predecessors; retained
columns were unchanged except the intended masked card-paid addition.

Focused checks (overlapping batches, not a full-suite or aggregate-unique-test claim):

| Scope                                            | Files / tests | Result and evidence                                                         |
| ------------------------------------------------ | ------------- | --------------------------------------------------------------------------- |
| Original ASCA area-count/RPC prefix              | 4 / 23        | PASS, 1.42s; original retained report                                       |
| Changed app unit tests                           | 97 / 1300     | PASS, 25.41s; `catchup-app-tests.log`                                       |
| Replication recovery/schema                      | 3 / 19        | PASS; `catchup-replication-tests.log`                                       |
| Replication stamp races                          | 1 / 17        | PASS; `catchup-stamp-races.log`                                             |
| QA scripts/workflows                             | 17 / 293      | PASS, 22.01s; `catchup-script-tests.log`                                    |
| AskQ support/quote evidence                      | 2 / 38        | PASS; `catchup-askq-vitest.log`                                             |
| Ringside dialogs/max time                        | 2 / 9         | PASS; `catchup-ringside-tests.log`                                          |
| Independent check-in characterization at 1472eaa | 1 / 10        | Expected regression reproduced: 9 pass, 1 fail; `catchup-checkin-proof.log` |
| Check-in after #3594                             | 1 / 11        | PASS; `catchup-checkin-fixed.log`                                           |
| #3594 check-in/workbench/signals/actions         | 8 / 88        | PASS; `catchup-latest-tests.log`                                            |

Logs live under the review worktree `.logs/` and are retained with automation evidence
before cleanup. The temporary characterization test was removed from source and
retained only as evidence. Bootstrap passed after an initial sandbox Git-lock denial.
An initial Deno attempt could not run Vitest-based AskQ tests; using their correct
Vitest runner passed. This was a runner invocation error, not a product finding.
Full-range whitespace checks flagged only intentional context lines inside mutant
`.patch` fixtures; the final two-file documentation diff is checked separately.
No fresh browser, live SQL/restore, production replay, deployment, payment, refund,
notification, shared-fixture operation or full app-suite run. Historical acceptance
below is attributed to its canonical evidence, not represented as rerun here.

## P0

None confirmed.

## P1

- [MYK9-1637](https://linear.app/myk9-platform/issue/MYK9-1637): **newly resolved in this ledger**, source High.
  Secretary/exhibitor card attribution, desk collection and refund-cap defect;
  first seen Nov 1, prior last reproduction Nov 1, reconciled Nov 4; no new recurrence.
  #3528 / `27d94b45f` plus recorded 18 SQL mutant controls, applied migration
  `20261101213300`, grants, backfill and deployed artifact satisfy the original
  owner-amended scope. Current review baseline above; confidence high. Richard/Claude
  ownership retained. Exact closure proof and acceptance remain in the full issue and
  reconciliation `6150c570-05b9-42c9-9c50-ca2f9e213289`; no next action in accepted scope.
- [MYK9-1661](https://linear.app/myk9-platform/issue/MYK9-1661), stable **NCR-2026-11-01-01**:
  **newly resolved in this ledger**, source High. Entrant multi-show cart/checkout identity;
  #3549 / `02845c891` and #3575 / `99f764f1d` cancel follow-up (MYK9-1673).
  Recorded deployed `6db0887c8` proof at 390×844 and 1280×900 covers distinct show totals,
  reload/direct/equal-price/409 controls, database readback and cleanup. First Nov 1;
  last defect dates preserved in issue, reconciliation Nov 4, no new recurrence.
  High confidence; owner retained; no next action. Exact closure evidence in canonical
  issue and reconciliation `0e88854a-a865-460d-a6f8-f7beac236da5`; Done preserved.

## P2 / Medium

- [MYK9-1690](https://linear.app/myk9-platform/issue/MYK9-1690): **unchanged acceptance gate; local defect repaired by subsequent commit**.
  Classification: secretary check-in state defect / remaining browser verification.
  Source Medium; canonical P2. First known Nov 3; reproduced Nov 4 at `1472eaa39865f07de755d6c13c6ab2ecf8d69b0b`;
  last reviewed Nov 4 at final baseline; one additional nightly reproduction, not a live incident.
  Affects Check-in desk, pending filter, individual/bulk check-in and later ringside state,
  phone and desktop. Prior `apps/myk9show/src/components/entries/management/checkInDesk/CheckInDesk.tsx:69`
  and `useCheckInDeskActions.ts:11,25` retained checked-in IDs indefinitely.
  Proof: check in Alice/Poppy, acknowledge the checked-in entry, rerender the same mounted
  desk with authoritative no-status: observed Checked in, expected Not checked in.
  Independent characterization failed exactly that assertion (9 other tests passed).
  Impact: a reset entrant can disappear from the pending check-in queue; no data loss asserted.
  Confidence high. Existing MYK9-1689/#3591 deferral and MYK9-1690 already owned this cause;
  no new ID minted. #3594 / `5d62483f2` clears succeeded IDs after awaited refresh
  (`useCheckInDeskActions.ts:31–37`) and respects later ringside statuses
  (`CheckInDesk.tsx:74–83`); 11 focused and 88 expanded tests pass.
  Richard/Claude owns acceptance. Next action/exact closure proof: qualifying deployed
  phone/desktop walkthrough of new doors and legacy redirects, individual/bulk check-in
  then at-gate/in-ring/no-status, pending filter and offline queue; record fixture/session
  cleanup and satisfy all six original criteria after a fresh full issue read.
  In Review retained, not Done from local tests. Full evidence contract posted in comment
  `97176b2d-b4c4-4f73-8a7c-405857e8735b`; canonical priority set to Medium.
- [MYK9-1633](https://linear.app/myk9-platform/issue/MYK9-1633): **newly resolved in this ledger**, source Medium.
  First Oct 31; prior last reproduction Nov 1; reconciled Nov 4, zero new recurrence.
  Replicated owned-row version regression/recovery and concurrent-write protection;
  #3530 / `670157dca`, owner-amended mid-fetch acknowledgement control, existing mutation,
  deployment/runbook proof, and fresh 19 recovery/schema plus 17 stamp-race tests pass.
  High confidence; owner retained. Done preserved; no restore experiment required.
  Exact closure/next-action disposition in reconciliation `fd330d2c-c458-41fe-bf65-8a31d7140e69`.
- [MYK9-879](https://linear.app/myk9-platform/issue/MYK9-879): **newly resolved in this ledger**,
  P2 residual verification / historical High. Recorded Nov 3 four real sandbox charges,
  six entry allocations, webhook/secretary/outsider checks and cleanup satisfy the named
  payment matrix; physical Android Chrome Pay remains a separate control. Canonical
  first/last defect dates unchanged; Nov 4 reconciliation, no recurrence. Owner retained;
  confidence high for that scoped proof. Done preserved; full proof/closure in issue and
  `f9339100-7dd2-4a51-89d9-db24040678bc`; no next action in accepted scope.
- [MYK9-1539](https://linear.app/myk9-platform/issue/MYK9-1539): **newly resolved in this ledger**,
  source Medium. Entrant My Shows cold offline route and money readback; #3553 / `07403bbe4`.
  Deployed `894352f88` real-service-worker direct/query reload, four MYK9-639 matrix cases,
  reconnect and signed-out/different-account controls plus cleanup recorded.
  First/last defect dates retained in issue; Nov 4 reconciliation, no recurrence.
  High confidence; owner retained; Done preserved. Exact closure and no remaining action
  recorded in `aae6fdb0-aaf1-46b5-924a-1efbd06636d6`.
- [MYK9-834](https://linear.app/myk9-platform/issue/MYK9-834): **newly resolved in this ledger**,
  source Medium. First Sep 26; last stale audit hold Nov 1; passing proof Nov 3,
  reconciliation Nov 4, no new recurrence. Judge offline reload/expired token/score durability:
  deployed `894352f88`, local 64.56 survives reload, server 63.45/v9 becomes 64.56/v11,
  queues drain without sign-in/manual reload; identity controls and cleanup recorded.
  Controlled desktop proof, not a natural-hour/tablet claim. Richard owns evidence;
  high confidence in recorded scope. Done preserved; stale reminder superseded by actual
  proof `d8688f23-1cd6-46b5-be03-ea71b2d3c3df`. Reconciliation
  `68258bf4-82d5-4f7e-b1f3-7ecff9a0c141`; no further accepted-scope action.
- [MYK9-1393](https://linear.app/myk9-platform/issue/MYK9-1393), **SA-2026-10-24-02**:
  **newly resolved in this ledger**, P2 residual verification / original P3 Low.
  First Oct 24; stale hold Nov 1 superseded by actual Nov 1 passing hosted TEST proof;
  reconciliation Nov 4, no new recurrence. Club-admin aged-session Connect step-up:
  one prompt, automatic retry, real hosted submission/return to same club Payments and
  naturally updated same-account mapping; unrelated rows unchanged. Served `9fe0696aa`,
  Connect v29. Owner Richard accepted TEST environment and retained fixtures. High
  confidence; no live payout claim. Exact closure `513aa7ff-4c09-4ead-b15c-c68f31031516`;
  reconciliation `aec0f040-beff-4dd8-8c5a-498e765650ce`. Done preserved; no next action.

## P3 / Low

- [MYK9-1660](https://linear.app/myk9-platform/issue/MYK9-1660): **unchanged**, dependency
  reproducibility improvement; source Low, canonical P3. First Nov 1, last Nov 4;
  one additional nightly confirmation. At final baseline,
  `supabase/functions/push-trigger-class-status/index.ts:2` and
  `supabase/functions/push-trigger-announcement/index.ts:2` still import `npm:web-push@3`.
  Expected reviewed exact 3.6.7; observed future major-range resolution can change
  subsequent builds. Organizer notification fanout/build workflow; viewport independent.
  High confidence on source fact; no delivery outage asserted. Owner/Claude handoff
  retained in canonical issue. Next action: pin named imports and inspect other occurrences.
  Acceptance/exact closure: reviewed merged source, exact dependency resolution,
  relevant Deno/build/fanout-timeout checks, qualifying deployed artifact readback where
  required by issue. Do not rerun 500 sends or reopen MYK9-1380's accepted historical scope.
  Full reconciliation `c57c1083-6c8e-4d4b-ab94-3e0acea03e80`.

## Counts and persistence

New 0; unchanged 2; newly resolved in ledger 7; duplicate 0; rejected 0; blocked findings 0.
The remaining browser acceptance gate is included under unchanged, not counted twice.
No unresolved review coverage remains through the baseline. Existing issues were reused;
no duplicate or new issue created. Linear issues modified/reconciled: **MYK9-1690,
MYK9-1660, MYK9-1637, MYK9-1661, MYK9-1633, MYK9-879, MYK9-1539, MYK9-834, MYK9-1393**.
Previously accepted MYK9-1380 and MYK9-1456 proof and MYK9-639's completed money scope
remain historical; MYK9-1539 closes the separately tracked offline gate. MYK9-1625 and
MYK9-1631 retain their original ASCA acceptance; no recurrence established.

Fixes found in subsequent commits include #3503 ASCA tile/SQL repair, #3528 card-money
attribution, #3530 replication recovery, #3549/#3575 cart scoping/cancel, #3553 offline
My Shows and #3594 check-in authoritative-state handoff. Fixes or PRs created by this
run: none. No application changes. The only repository mutation is this report plus
its matching cursor in one docs-only commit. Exact push/readback status is recorded
outside the commit; a prepared local report alone is not evidence of publication.

## Boundary

`daily-commit-review`: `5d62483f2846807707df13235994f326fbebca87`,
window end `2026-11-04T15:18:10Z`, runner `codex-daily-commit-review`,
run date `2026-11-04`. All 64 commits through this SHA reviewed; no later commit stamped.

## Reviewed commit inventory

```text
9fe0696aa feat(at-show): ASCA Interior Advanced/Excellent offer 1 or 2 areas; seeds start at 1 (MYK9-1625, MYK9-1631) (#3503)
bf6f77621 test(a11y): Class Status dialog contrast in every accent and mode (MYK9-1638) (#3529)
27d94b45f fix(entries): card money counts as received on an entry form (MYK9-1637) (#3528)
670157dca fix(replication): a full sync heals owned rows after a server version regression (MYK9-1633) (#3530)
7f973ee52 docs(agents): add the MYK9-639 and MYK9-1393 test fixtures to the standing-approvals test-club list (#3532)
81a52d582 fix(ci): reserve Supabase's host ports before local stacks start (MYK9-1623) (#3531)
de0365aba feat(qa): a clean codex round anchors the next fix-range review (MYK9-1603) (#3534)
759b5a8bf feat(orchestrate): cloud-session stall watcher; a missed deadline is a local takeover (MYK9-1602) (#3533)
03e1cd723 fix(seed): show-day fixtures are named as fixtures and retire when a new one is minted (MYK9-1595) (#3535)
a8bfedd8a docs(agents): an escaped bug's fix names the check that should have caught it (MYK9-1649) (#3538)
73c4555f1 feat(lessons): every lesson names the check that enforces it (MYK9-1651) (#3540)
26e62d406 feat(openspec): every changed scenario names the test that proves it (MYK9-1648) (#3537)
b1e71a70c fix(qa): the mutation runner measures every target, not just the first (MYK9-1652) (#3539)
7c7500a06 fix(qa): mutation tests actually run against the mutants (MYK9-1657) (#3543)
b262dfa53 feat(qa): planted-bug audit for show-day checks Stryker cannot reach (MYK9-1653) (#3541)
bdc56487b fix(deps): raise overrides to patched fast-uri, undici, brace-expansion, sharp (MYK9-1643) (#3542)
33ad5c385 test(MYK9-1644): pin cart fee clamping, edges and currency format (#3536)
c240cc358 feat(qa): golden replay of a real v3 trial against our placement code (MYK9-1647) (#3544)
909f7d488 docs(qa): retain partial November 2 review and precise cursor
906feb5bb ci: pin the Supabase CLI to 2.122.0 instead of latest (MYK9-1662) (#3548)
62b36858d test(check-in): pin the status each check-in writer sends (MYK9-1658) (#3546)
053374043 test: missing-values fixture for My Shows, check-in gate and nationals leaderboard (MYK9-1655) (#3554)
02845c891 fix(cart): wizard Submit & pay opens the submitted show's cart (MYK9-1661) (#3549)
d92c374d6 fix(ringside): a stale null user is never a reconnect verdict (MYK9-834) (#3550)
b1f5f1ce1 test: never-synced offline step in the role walk and the offline cold-boot e2e (MYK9-1655) (#3556)
07403bbe4 fix(pwa): offline document shell for My Shows, including query-string deep links (MYK9-1539) (#3553)
894352f88 fix(ringside): empty and not-on-device entry lists use the fixed Up, never history (MYK9-1500) (#3555)
d1e2a7cdc ci: run the myK9Show unit suite under TZ=Pacific/Honolulu, non-required (MYK9-1655) (#3552)
881bdd99e ci: dispatch-only workflow that runs the 4 SQL placement planted-bug mutants (MYK9-1659) (#3557)
d87f3e9b5 fix(at-show): Ringside menu's panel escapes the sticky header so Close sits above the announcement feed (MYK9-1666) (#3558)
57a961f48 test(entries): decision email after a partial refund asks for the net balance (MYK9-1604) (#3559)
d9dad9ba0 ci(qa): ignore supabase/.branches so the SQL planted-bug run starts (MYK9-1659) (#3563)
b32c23499 feat(at-show): exhibitors see each dog's ringside place in the show-dogs list (MYK9-1578) (#3560)
4a64bbe1b fix(deps)(deps): Bump the npm-minor-patch group with 5 updates (#3545)
9ac8ab800 docs(qa): record SQL planted-bug verdicts, 4/4 caught (MYK9-1659) (#3564)
1a7f9d8e4 ci: run the TZ=Pacific/Honolulu unit suite nightly, not on every push (MYK9-1671) (#3565)
3cc7fea3e fix(qa): make run-sql-local port probe injectable so the port-pair test is deterministic (#3566)
58f8b2031 chore(types): regenerate Supabase types after the MYK9-1578 migration (#3567)
b53ba7c4a fix(my-shows): remaining isPastShowEntry callers use the trial-zone rule (#3571)
af60bcaef fix: recover when the offline database is newer than the running build (MYK9-1663) (#3570)
90bc875ad MYK9-1642: dispatch hourly database export from pg_cron (#3568)
f84099481 test(e2e): scope disposable-entry armband locator to checklist (MYK9-1669) (#3569)
ea2ef70d3 docs(qa): retain partial November 3 review and precise cursor
ea42358db fix(entries): one armband Assign control on the entry form (MYK9-1672) (#3574)
99f764f1d Carry the checkout's show on the Stripe cancel URL (MYK9-1673) (#3575)
6db0887c8 feat(pwa): installed app starts at redirect-only /app (MYK9-1674) (#3576)
ddd07a70d feat(messages): search and sort show announcements in Message Center (MYK9-1667) (#3577)
2bc5b842e docs(user-guides): correct exhibitor, ringside and club admin guides from the Nov 1 review (MYK9-1676) (#3578)
dce28fa26 docs(user-guides): recapture J-04/J-05 and reconcile screenshot capture dates (MYK9-1677) (#3579)
4c8a13eb0 fix(askq): app help finds guide answers about timing, areas and the timer (MYK9-1678) (#3580)
eab5f42cd feat(askq): app help accepts answers by server-verified guide quotes (MYK9-1679) (#3581)
aa4e8bf3a docs(qa): record MYK9-879 checkout rehearsal results
67d7fa2d7 fix(at-show): recover from unresolvable judge identity on the scoresheet (MYK9-1675) (#3583)
031a50b2c fix(scoring): read the discard guard's dirty value at navigation time (MYK9-1552) (#3582)
36e117ba2 Fix Ringside menu return state and accessibility (MYK9-1508) (#3584)
8376de92b feat(show-edit): Venue & policies tab (MYK9-1682) (#3585)
ca66dffe8 Show the offline-copy prompt only in the window around the show (MYK9-1621) (#3586)
f91534e4e Hide class checklist and print tracking until used (MYK9-1620) (#3587)
b772c4431 MYK9-1683: About tab, Show Desk rename, remove header chevron (#3588)
8ddaaf182 feat(show-edit): This show uses… switches (MYK9-1685) (#3589)
d9149d2f1 Change class from the entry form's row menu (MYK9-1614) (#3590)
c25e3fc19 Add Check-in desk view to Entry Forms (MYK9-1689) (#3591)
1472eaa39 feat(entries): one verb set on the entry form with help text (MYK9-1687) (#3593)
5d62483f2 Check-in desk doors; delete People at show roster (MYK9-1690) (#3594)
```
