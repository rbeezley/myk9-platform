# Daily commit review — 2026-11-01

source: codex. **Retry completed; no new confirmed defects. Existing work and proof gaps remain.**
Report path: `docs/qa/codex-daily-commit-review-2026-11-01.md`.
Reviewed baseline: `3f92928d9fec44c44c4a960fecd691f19929ba00`.

## Coverage and checks

Shared boundary: `ae29a74010496cb4660c963cd80aaf1e5e614215`, exclusive;
window start 2026-10-31T05:10:33Z, end 2026-11-01T14:18:04Z. Reviewed all
74 commits through the baseline, affecting 552 files. No fallback or coverage gap.
Three owner-authorized review agents covered entries/payments/results, replication,
and UI/tooling; parent covered ringside SQL/RBAC, integrations and reconciliation.
Complete relevant execution paths, actual types, subsequent fixes, merged PR
references, findings registry, prior memory and full Linear records/comments were
checked. Archived-inclusive searches reused canonical IDs. No application changes.

The initial attempt stopped after one commit with dependency installation stalled
(exit 130), leaving 71 commits and historical reconciliation unreviewed. Its precise
partial cursor/report were retained in `67442153f`. This retry installed dependencies
successfully and covered that suffix plus the three later commits. Earlier failures
included registry DNS errors; these are environment limitations, not product defects.

Fresh focused checks: **121 test files, 1,444 tests passed** (batch totals; not a full-suite verdict).

| Scope                                                       | Files / tests | Proof log                                                                                                                                 |
| ----------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Entries, registration, notes, reports, nationals            | 70 / 726      | `apps/myk9show/.logs/ncr-entries-verbose.log`                                                                                             |
| Ringside controls, stale class, exhibitor dogs, leaderboard | 15 / 147      | `.logs/retry-ringside-verbose.log`                                                                                                        |
| Replication package and app abort/hydration                 | 12 / 90       | `.logs/review-replication.log`, `.logs/review-app-replication.log`                                                                        |
| UI, trial type, clocks, review tooling                      | 24 / 481      | `apps/myk9show/.logs/ncr-ux.log`, `ncr-ux-trialtype.log`; root `.logs/ncr-ux-tooling.log`, `ncr-ux-clock-core.log`, `ncr-ux-clock-ui.log` |

Range `git diff --check` passed. Initial nonverbose entries/ringside and full
replication runs were interrupted after quiet output (exit 130); no broad pass
claimed. MYK9-1196 documents buffered nonverbose output. One supported diagnostic
with `--maxWorkers=2 --reporter=verbose` passed entries and ringside; no new harness
defect established. Entries took 80.84s with ongoing useful output; ringside 25.13s.
No browser viewport/zoom replay, live SQL, deployment, payments, shared fixtures,
load generation, full app suite or broad dependency compatibility build was run.
Historical production proof below is attributed to canonical issues, not rerun here.

## P0

None confirmed.

## P1

- [MYK9-1637](https://linear.app/myk9-platform/issue/MYK9-1637): **unchanged**, source High;
  card money is not recorded as received on a form. Card-paid forms retain
  `paid_amount=0`; desk add-ons can remain unowed and Paid in full can collect the
  card amount again. Secretary/exhibitor card, payment-link, desk and refund flows;
  no viewport dependency. High confidence from complete payment/trigger paths and
  canonical reproduction. First/last seen Nov 1; second independent observation,
  not a live incident. Online payments are not live; owner gates this before live
  cutover. Richard/active Claude claim owns `docs/plan-card-money-received.md`.
  Preserve MYK9-1634's completed mail-in scope. Closure: existing card attribution,
  cross-form links, desk-only refund cap and reversal criteria, mutation-checked
  behavioral SQL, independent review and applied/deployed proof. No fix by this run.

## P2 / Medium

- [MYK9-1633](https://linear.app/myk9-platform/issue/MYK9-1633): **unchanged**, source Medium;
  owned cached serverVersion31 rejects restored serverVersion2 after forced sync.
  Fresh passing characterization at `packages/replication/src/syncReplicatedTable.foreignVersionHeal.test.ts:114,123`;
  guard `packages/replication/src/core/ReplicatedTableBatch.ts:84`. Persistent
  show-day data can stay stale after restore; high confidence. First Oct 31, last
  Nov 1, second audit observation. Backlog/unassigned ownership gap. Next/closure:
  explicit recovery converges in one sync/operator action, retains own-write and
  shared-device race controls MYK9-1050/1148, and documents restore procedure.
  MYK9-1632 only fixed ownerless rows; preserve that completed scope.
- [MYK9-639](https://linear.app/myk9-platform/issue/MYK9-639): **blocked proof**, source
  Medium residual / High historical. Secretary payment settlement/report workflow;
  first Sep 17, last Nov 1, eighth recent observation. Richard owns exact deployed
  FinancialReport/retry/reversed/deleted/offline matrix. Fresh 11 report tests pass;
  recorded four TEST settlements and payer4/unrelated0 readback retained. Those do
  not prove the remaining matrix. Preserve Done historical scope; no new money
  failure asserted. Closure requires that exact matrix or explicit owned substitute.
- [MYK9-834](https://linear.app/myk9-platform/issue/MYK9-834): **blocked proof**, source
  Medium. Same-user offline ringside identity/score durability; first Sep 26, last
  Nov 1, eighth recent observation. Richard owns deployed refocus → expired-session
  offline reload → durable score → reconnect/upload plus identity-switch,
  sign-out and revocation controls. No fresh exact rehearsal; preserve historical
  Done. Closure is that rehearsal or owned substitute, not unrelated passing tests.
- [MYK9-1393](https://linear.app/myk9-platform/issue/MYK9-1393): **blocked proof**, source
  Low/P3 historical, P2 residual browser verification. Connect step-up prompt/replay;
  first Oct 24, last Nov 1, fourth nightly observation. Gates already deployed;
  Richard/operator owns exact once-only prompt and Stripe replay walk. Oct 31
  owner accepted hosted TEST environment, not an unexecuted packet as proof.
  Preserve In Review; closure requires the browser packet, not another deployment.
- [MYK9-1460](https://linear.app/myk9-platform/issue/MYK9-1460): **newly resolved in audit**,
  source High historical. First Oct 28, last Nov 1, fourth observation. Fresh full
  issue read found Oct 31 owner acceptance replacing next-load rehearsal with
  catalog-zero, behavioral SQL, rolled-back timing and production no-alert proof.
  Honor that explicit proof disposition; no new load required or performed.

## P3 / Low

- [MYK9-1380](https://linear.app/myk9-platform/issue/MYK9-1380): **blocked proof**,
  source Low; notification fanout capacity and actual stalled-library timeout.
  First Oct 23, last Nov 1, eighth observation. Richard/operator owns separately
  approved hundreds-subscriptions sent/failed/expired/truncated accounting and
  wall-time/timeout proof. Bounds are deployed; no measured delivery defect here.
  Preserve In Review until exact capacity/timeout proof or owner disposition.
- [MYK9-1456](https://linear.app/myk9-platform/issue/MYK9-1456): **blocked strict audit proof**,
  source Low; creator-versus-service applied behavior. First Oct 27, last Nov 1,
  fourth observation. Richard owns applied actor controls or explicit acceptance
  of catalog proof as substitute. Applied guard definition, paging and deployment
  retained; historical Done preserved. No new product recurrence asserted.
- [MYK9-1479 / NCR-2026-10-29-01](https://linear.app/myk9-platform/issue/MYK9-1479):
  **newly resolved in audit**, source Low; first Oct 29, last Nov 1, third observation.
  Dead entry surfaces removed by #3392 / `85f99aafb`; current importer search empty,
  recorded importer audit/typecheck/lint and 3,211 files / 31,000 tests satisfy
  deletion proof. No deployment required for this finite cleanup contract.
- [MYK9-1480 / NCR-2026-10-29-02](https://linear.app/myk9-platform/issue/MYK9-1480):
  **newly resolved in audit**, source Low; first Oct 29, last Nov 1, third observation.
  Current wrong-index-name search empty; recorded applied schema readback and owner
  acceptance of quoted historical text satisfy documentation proof. Do not rewrite history.
- [MYK9-1573 / NCR-2026-10-31-01](https://linear.app/myk9-platform/issue/MYK9-1573):
  **newly resolved in audit**, source Low; first Oct 31, last Nov 1, second nightly.
  Nationals untimed ranking/display fixed by `02d19312b` / #3514. Fresh 17 builder
  and 2 view tests cover null/zero/partial times, ranking and labels. Recorded
  mutation proof plus deploy 41267600721 (`d25f9cfda`, includes fix) completes
  proof; intentional fully-timed differing-run behavior remains distinct.
- [MYK9-1574 / NCR-2026-10-31-02](https://linear.app/myk9-platform/issue/MYK9-1574):
  **newly resolved in audit**, source Low; first Oct 31, last Nov 1, second nightly.
  Missing trial-type notice/clone/editor fixed by `0acd880c9` / #3518. Fresh six
  files / 46 tests pass; recorded deploy 41267600721 includes fix. Role-gated
  notice and repair/clone proof meet scope. Preserve Done, no state change.

All findings above use this report's baseline and source codex. Existing full
canonical issues and reconciliation comments carry exact reproduction, affected
files/routes, acceptance and closure contracts; no new stable IDs minted. Proof
blocked items are verification prerequisites, not newly confirmed product defects.

## Counts and persistence

New 0; unchanged 2; resolved 5; duplicate 0; rejected 2; blocked findings 5.
Rejected hypotheses: nullable SQL auth bypass (non-null guard prevents it), and
combined-class menu miswrite (controls explicitly hidden). Neither filed.
MYK9-1598's owner-accepted theoretical stale-class risk was read and not re-raised.
MYK9-1196 was reconciled as diagnostic context, not counted as a defect.

Linear issues created: none. Reconciliation comments posted on 13 canonical issues:
MYK9-639, 834, 1196, 1380, 1393, 1456, 1460, 1479, 1480, 1573, 1574, 1633, 1637.
No status changes, closures or reopens. Fixes found in subsequent commits:
#3514 and #3518, plus earlier #3392 and recorded documentation/SQL proof above.
Existing work only; fixes or PRs created by this run: none.

The report and cursor are one docs-only publication record. Final publication SHA,
remote readbacks and worktree cleanup are recorded outside this commit in automation
memory and the final run summary. Logs are local verification artifacts retained
with automation evidence; they are not a competing work queue.

## Boundary

`daily-commit-review`: `3f92928d9fec44c44c4a960fecd691f19929ba00`,
window end `2026-11-01T14:18:04Z`, runner `codex-daily-commit-review`,
run date `2026-11-01`. Later commits are not included by this stamp.

## Reviewed commit inventory

```text
ada1aa66d fix(my-shows): treat an unknown trial day as unknown, not 'not today' (MYK9-1557) (#3459)
4fcf3b650 fix(askq): reset usage state on user change; scroll on streamed text (MYK9-1559) (#3461)
3f268b7c6 docs(qa): Claude secretary task walk 2026-10-31 (UKC) and Part 2 corrections
bd5a5ebc9 docs(security): scheduled full-surface security audit 2026-10-31 (baseline 3f268b7c6)
fd47ff7d2 docs(qa): retain partial October 31 Codex review and precise cursor
f6c2ad01a fix(my-shows): decide a past show in the trial timezone (MYK9-1554) (#3468)
47d9204b7 MYK9-1506: Ringside class list matches myK9Q v3 (#3453)
63856b6ac Smart clock-time entry for start, briefing, break-until and expected times (MYK9-1504) (#3456)
89853135f fix(at-show): show-level judge assignment counts as ringside staff (MYK9-1562) (#3458)
17248b6de fix(admin): deep link offline state and non-UUID userId (MYK9-1567) (#3460)
cf920b76b fix(at-show): re-evaluate show completeness each settled sync (MYK9-1560) (#3466)
1602be342 fix(preferences): sync pending appearance changes on reconnect app-wide (MYK9-1564) (#3463)
f73b33e96 docs(plan): Wave 4 deferred-review batch and Wave 3 progress
96d074345 docs(plan): In Review verification pass for Codex — 76 issues routed
70c95bf5f chore(deps-dev)(deps-dev): bump glob from 13.0.6 to 14.0.2 (#3469)
b245ac0b8 docs(plan): order of work for the In Review verification pass
3b875d0f1 feat(at-show): Nationals Leaderboard ringside route and menu item (MYK9-1540) (#3457)
87f7189d6 docs(plan): verify-plan patch for the In Review verification pass
9f5826b1e docs(plan): MYK9-1540 merged after the snapshot; route it in this pass
3226753a5 feat(at-show): exhibitors see a limited view of every dog at their show (MYK9-1517) (#3462)
1cc9a82cf chore(types): regenerate database types after the MYK9-1540 push (#3473)
a2cd17d48 feat(at-show): stale class completes through one server action (MYK9-1514) (#3472)
66cc910d3 fix(deps)(deps): Bump the npm-minor-patch group with 12 updates (Astro held, MYK9-1542) (#3337)
943c4347c fix(entries): dog upcoming entries say waiting on payment (MYK9-1553) (#3467)
aac55b63c docs(rules): file only findings a real user could hit with real harm (#3476)
7f7c962f0 fix(deps)(deps): Bump the npm-minor-patch group with 8 updates (#3475)
6b4da6c70 fix(entries): sort each dog's entries in running order and name the exhibitor on the form (MYK9-1592) (#3477)
fcdce4e4c docs(orchestrate): size each issue to one concern per PR before dispatch (MYK9-1589) (#3478)
6ba0f521d feat(qa): Codex rounds 2+ review only the fix range; cap improbable findings at P3 (MYK9-1590) (#3479)
2df7078b5 feat(entries): entry form "To finish this form" checklist and one header menu (MYK9-1600) (#3481)
167b530eb docs(design): entry form primary work checklist mockups (MYK9-1600) (#3474)
074ab1c98 docs(issue-tracker): triage each deferred review finding at filing (MYK9-1591) (#3482)
0d5f93807 docs(qa): record in-review verification dispositions
dd5cc7e04 fix(my-shows): the Upcoming filter decides "past" in the trial's timezone (MYK9-1586) (#3484)
b9a528447 fix(preferences): seed the device appearance copy from what the device shows (MYK9-1568) (#3487)
93af9d698 fix(at-show): class card Set Max Time recovers from a pending or failed lookup; combined details show the merged status (MYK9-1569) (#3485)
ec528f5ee fix(MYK9-1517): show_dogs_limited_view requires a live, active person (#3488)
b5fc071dc test(askq): await the scroll effect after an rAF-batched token (MYK9-1599) (#3493)
becafe8a4 feat(qa): one review contract for Codex, Claude and adversarial lenses (MYK9-1613) (#3492)
aab5e695d docs: secretary feature inventory (core / optional / power)
5b0ebc2f3 fix(admin): Needs a look action links meet the 44px target floor (MYK9-1535) (#3490)
18ddb460f feat(entries): private secretary notes on an entry form, readable only by show officials (MYK9-1601) (#3483)
d57e3ee3b fix(dogs): Overview upcoming rows stack the status badge under the title on phones (MYK9-121) (#3494)
ddc0cc974 fix(panels): 48x48 SlideOverPanel close button (MYK9-1508) (#3489)
8fb92a16e fix(preferences): a theme reset applies only what settled on the device (MYK9-1606) (#3496)
ba0c24cc1 fix(scoring): axe fixes for paper-scoring view tabs and result sublabel (MYK9-1503) (#3491)
e6f17ba52 feat(entries): one Filter menu, one header Actions menu, attention-first list, add entry per exhibitor (MYK9-1594) (#3486)
05e527c03 fix(replication): the mutation upload is cancellable, and an abort releases the lock (MYK9-1550) (#3499)
73cb69cb7 fix(replication): the high-churn incremental overlap exceeds commit lag (MYK9-1497) (#3501)
5277a62b3 fix(ringside): entry-list title gets its own row on phones instead of colliding with Up (MYK9-1500) (#3502)
670520caf fix(shows): one judge-qualification rule in the show wizard and the class panel (MYK9-1580) (#3500)
6cf04a1e6 feat(at-show): ringside Class Settings links to check-in mode and results visibility (MYK9-1627) (#3505)
41ddeee00 chore(types): regenerate database types for entry_form_notes and drop the notes service's untyped cast (MYK9-1630) (#3507)
b3b79b76a fix(replication): an app-wide pass ends on offline and never starts a destructive step (MYK9-1624) (#3506)
8d4ebdbda fix(replication): an ownerless cached row takes the server copy even at a lower version (MYK9-1632) (#3508)
d5eec2d7f fix(messages): the show message composer opens empty, so a reflex Send broadcasts nothing (MYK9-1616) (#3510)
54e12358d fix(at-show): an at-show sync ends on offline, so Try again starts fresh instead of joining a hung run (MYK9-1629) (#3511)
7a0e8d780 fix(reports): reports name each registry's own sport: UKC Nosework, ASCA Scent Detection (MYK9-1582) (#3512)
02d19312b fix(results): an untimed run no longer ranks a nationals dog fastest on the time tiebreak (MYK9-1573) (#3514)
4662cbdcc test(onboarding): StepDogs waits for its dogs query before looking for Add a dog (MYK9-1628) (#3515)
1cf7ebc3f test(e2e): entry-list specs open the waitlist through the header Actions menu, not removed tabs (MYK9-1611) (#3516)
78862a94b fix(tooling): typecheck:tests sets its own 6 GB heap, so pnpm typecheck stops aborting on the Mac (MYK9-1636) (#3517)
0acd880c9 fix(scoring): a UKC/ASCA trial with no trial type says so and links to the fix; cloning fills it (MYK9-1574) (#3518)
d25f9cfda fix(secretary): show cards' Pin and action buttons wrap inside the card at 150% zoom (MYK9-1581) (#3519)
27a659c4e fix(entries): the database owns an entry form's total and payment status; waived never counts (MYK9-1634) (#3513)
3fae00237 docs(plan): archive the MYK9-1634 plan as complete
da47a959e fix(ui): changing a date keeps a typed time that is not yet a time (MYK9-1571) (#3520)
74a57415e fix(list-toolkit): view switchers are labelled "View:", not "Show:"; Email delivery says how to see scheduled emails (MYK9-1610) (#3523)
0a5c133c1 fix(classes): Edit class's wait-list copy names the real path (MYK9-1583) (#3521)
a17a959fb fix(reports): a deep-linked report from another registry shows a notice and cannot print or download (MYK9-1584) (#3522)
0ddf8f9ba fix(at-show): the class status dialog's Current marker uses foreground text, so it meets 4.5:1 in every theme (MYK9-1556) (#3524)
67442153f docs(qa): retain partial November 1 review and precise cursor
809f40cff docs(plan): card money counts as received on an entry form (MYK9-1637)
3f92928d9 docs(plan): record the desk-only refund cap decision (MYK9-1637)
```
