# Codex daily commit review — 2026-11-11

## Window and baseline

source: codex. Source review: **103 total / 103 reviewed / 0 unreviewed**.
Window: (`85ad5fc2b84d26ecf376b416af9773ac05cc4641`, `6413224a250ad58b9278f2bd73bc730984d6b982`], 2026-11-07T02:59:54Z through 2026-11-11T00:05:32Z.
Frozen baseline: `6413224a250ad58b9278f2bd73bc730984d6b982`; fresh fetch before filing still matched it. No preceding gap or 24-hour fallback.
Report path: `docs/qa/codex-daily-commit-review-2026-11-11.md`.

This full continuation replaces the earlier November 11 incomplete checkpoint's coverage claim. November 8–10 incomplete checkpoints did not advance the shared cursor and are not treated as reviewed coverage. Latest memory and retained worktrees were inspected; no unpublished report-and-cursor commit was identified for recovery. Older incomplete evidence/worktrees remain separate. Work used the retained dedicated `codex/nightly-review-20261111` worktree, never stamped the primary checkout, and did not modify application code.

## Review and verification

All 103 commits were inventoried and reviewed in related batches through the frozen target. Coverage reconciliation found 901 rename-aware net paths, 902 raw net path names, and 904 unique names across individual commits. All paths were covered. The two transient implementations, AskQ `systemPrompt.ts` and Show Desk `FocusedClassSettings.tsx`, were inspected through introduction and removal; the third union-only name was a renamed lifecycle-email test whose assertions were retained. Generated AskQ content and dependency changes received semantic review; mechanical lockfile formatting was not treated as product logic.

Coverage groups: scoring reset/cancel/return, score audit and replication; ringside cards, status, combined sections, run-order and offline state; Show Desk rail, checklist, menus, inline fields and filters; entry/payment confirmation, mail-in registration, dog filters, agreement and only-dog defaults; authentication and show-wizard draft persistence; error/recovery wording, reports and print geometry; AskQ authorization/classification/guides; edge functions, migrations, SQL tests, E2E fixtures, mutation harness and review gates; documentation and agent rules. Actual types, callers and later fixes were checked. Three delegated source reviews and additional test-diff passes were reconciled with the parent review; test success alone was not used to mark commits reviewed.

Focused checks on the baseline:

| Check                                     | Completed result                                                  |
| ----------------------------------------- | ----------------------------------------------------------------- |
| Replication                               | 13 files / 341 tests passed                                       |
| Scoring UI                                | 34 files / 455 tests passed                                       |
| Scoring/replication app callers           | 16 files / 94 tests passed                                        |
| QA tooling                                | 10 files / 182 tests passed                                       |
| AskQ and confirmation email               | 55 files / 554 tests passed; 1 file / 8 live opt-in tests skipped |
| Instruction and lesson guards             | 2 files / 11 tests passed                                         |
| Core duration                             | 1 file / 115 tests passed                                         |
| Wizard, authentication and related paths  | 75 files / 666 tests passed                                       |
| Lifecycle/registration selection          | 20 files / 170 tests passed                                       |
| Original judge-supplies error/retry tests | 1 file / 5 tests passed                                           |
| Original DogCard run-order grip guard     | 1 file / 1 test passed; 8 unrelated tests filtered out            |

These are batch execution counts, with overlapping test coverage, not distinct-test totals. Bootstrap/package builds passed. Standalone diagnostics using current implementations reproduced mixed-section cancellation, stale Pull Undo callback behavior and the paused supplies query state. Exact commands, selections, logs, proofs and per-commit/file ledgers are retained in the automation's `reports/2026-11-11-full/` evidence directory.

Two broader app selections (ringside/desk and entry/payment components) emitted only the RUN banner beyond the repository's no-progress limit and were interrupted, exit 130; neither was repeated or called passing. The historical MYK9-1196 diagnosis establishes that redirected output can buffer: these interruptions do not prove a Vitest/product defect or recurrence of that resolved prerequisite. Source review continued to completion. No fresh browser, physical Android/printer, live SQL, full-suite, live model, mutation campaign, payment, email-send, deployment, load or shared-fixture verification was performed. SQL behavioral tests were reviewed, not executed. Current narrower tests and explicitly identified historical acceptance evidence are kept distinct.

## P0 / P1

No confirmed new P0/P1 finding. Existing Linear High labels below are preserved separately from this audit's impact-based canonical P2 classification.

## P2 / Medium

- **NCR-2026-11-11-01 / [MYK9-1880](https://linear.app/myk9-platform/issue/MYK9-1880) — new.** Product concurrency/recovery; source Medium. First/last seen November 11; recurrence 1; baseline above. Exhibitor/steward Pull Undo in My Entries and single/combined Ringside, all viewports. `features/at-show/offerPullUndo.ts:40-44` and `pages/MyEntriesPage/modules/useMyEntriesDialogs.ts:165-179` restore the captured prior status without supersession validation; the current self-check-in RPC has no expected-status/version guard. Actual callback diagnostic: checked-in → Pull → another writer sets in-ring → stale Undo writes checked-in. Expected newer operator state to survive. High confidence; no score/money loss claimed. Introduced #3691; existing MYK9-1752 ordinary Undo and MYK9-1396 durable restoration remain completed history. Claude implementation unassigned. Next action/acceptance: protect both surfaces and queued/server races while preserving normal Undo. Exact closure: focused intervening-writer tests, applied concurrency proof and authorized two-role/two-device phone/desktop replay with persisted-state evidence. Full contract and verifier gap are in Linear.
- **NCR-2026-11-11-02 / [MYK9-1881](https://linear.app/myk9-platform/issue/MYK9-1881) — new.** UX/recovery; source Medium. First/last November 11; recurrence 1. Secretary Results/Show Desk verification, all widths. `features/results-tab/useClassRowSyncState.ts:151` says leaving and reopening the page brings back a dismissed conflict notice. The root provider only replays persisted conflicts on authentication/mount (`ReplicationSyncProvider.tsx:868-891`); route return reads the local class but does not replay the notice. Stable-auth, warm-offline route return deterministically leaves the gate blocked; a fresh remote-row/full sync can independently replay it, so no claim that replay is impossible. Expected advertised recovery to work. High source-proof confidence; no fresh browser claim. Introduced #3769; MYK9-1113's working reload recovery, MYK9-1818's completed wording scope and MYK9-1848's other strings remain distinct. Claude unassigned. Closure: a test follows the displayed recovery rather than directly calling resolution; browser dismissal/recovery/choice/settled-gate proof at 390×844 and desktop, including offline/reconnect.
- **[MYK9-1847](https://linear.app/myk9-platform/issue/MYK9-1847) — unchanged, remaining mixed-section defect.** Product state/UX; source Medium; existing High tracker priority retained. Issue first November 10, last November 11; mixed-pair observation count 1. All ringside roles, class picker/Your ring, phone and desktop. `AtShowClassRow.tsx:117-121` consumes `is_cancelled` inherited solely from section A through `packages/ringside/src/pages/ClassList/utils/combinedSectionState.ts`. Runtime proof: cancelled A/live B produces `is_cancelled=true` plus `class_status=in_progress`, while live A/cancelled B produces false. The card hides live B timing or loses B's cancellation. Expected accurate section state; high confidence. #3778 added this fact; the combined entry-list header already handles both sections correctly. Richard/existing Claude scope owns the fix. No duplicate issue; MYK9-1092 and MYK9-1569 historical scope preserved. Closure adds A-only/B-only/both/neither grouping/render tests and isolated phone/desktop cancel/restore across picker/header/actions. Current deployment/environment limitation and separate MYK9-1863 server work remain. Reconciliation comment `ae3dd4db-06a4-4b5d-8a34-7d067dc9e948`.
- **[MYK9-1833](https://linear.app/myk9-platform/issue/MYK9-1833) — unchanged.** Product email continuation; source High, canonical P2; existing High priority retained. First November 10, last November 11; source recurrence 2. Secretary accepts an entry then switches shows before Undo ends. `hooks/useEntryManagementActions.ts:194-200` only finds the entry in the now-current show's `entriesRef`; `useEntryManagementData.ts:366,465-475` replaced those rows, so no send/job/notice is attempted. Expected continuation bound to the saved decision or explicit recovery. High source confidence; no real send. #3749 remains current; accepted full-tab-close exception preserved. Claude unassigned. Closure: mocked delivery with actual show switch, Undo/supersession/offline controls, then authorized isolated phone/desktop job/status proof. Comment `325e0687-4a0e-4100-a0ee-d4eb5558ab93`.
- **[MYK9-1875](https://linear.app/myk9-platform/issue/MYK9-1875) — unchanged.** Product/RBAC visibility; source Medium. First November 10, last November 11; source recurrence 2. Secretary/club-admin late-entry payment card and Free entry, all widths. `SecretaryPaymentManagement.tsx:27` requires `registration:override_fees`; runtime uses effective DB permissions and the mail-in fallback omits it. The existing issue records missing live grants; this run verified the source gate, not fresh database state. Expected visibility follows the recorded owner decision. Existing #3786 remains outside the baseline; Richard/Claude owns it. Closure requires applied role/scope permission checks, a real-guard regression and phone/desktop visibility, including unrelated-exhibitor denial. Comment `e6c4c679-539f-4f36-9de6-d0c3a93b07e5`; In Progress retained.
- **NCR-2026-11-07-01 / [MYK9-1735](https://linear.app/myk9-platform/issue/MYK9-1735) — newly resolved original HTTP-failure scope.** Source Medium. First November 7, last reconciled November 11; no recurrence. Secretary judge supplies, 390×844/1280×844. #3678 handles error/no data and Retry; fresh 5/5 tests pass. Independent historical production proof `57758dda-7e59-405d-b54b-67ba00ccc0f0` at `ca05dffc1` covers HTTP400/503, recovery200 and cached rows; relevant code is unchanged through baseline. Original expected/observed behavior agrees. Richard; no remaining original acceptance action. Done preserved, no status closure performed. Separate paused-offline scope is MYK9-1882. Reconciliation `36a5475f-8125-4d0b-9a5e-d2d7e3c6b53a`.
- **[MYK9-1734](https://linear.app/myk9-platform/issue/MYK9-1734) — newly resolved acceptance gate.** Source Medium. First November 6 local, last reconciled November 11; no new device recurrence. Gate steward Android manual run-order. Owner proof `27653d0f` records stable drop beyond three seconds, persistence after reload and scrolling outside grip; closing `6308122f` references #3675 and #3679. Current grip test passes 1/1, not a substitute for Android evidence. Richard; no remaining original gate. Done and rejected #3673 hypothesis preserved. Reconciliation `ec75b1df-e1dd-4995-8203-75f0f29c4574`.

## P3 / Low

- **NCR-2026-11-11-03 / [MYK9-1882](https://linear.app/myk9-platform/issue/MYK9-1882) — new historical reconciliation.** UX offline recovery copy; source Low. First documented November 7 in MYK9-1735's implementation comment, last November 11; two documented observations, first confirmation in this audit. Secretary judge supplies, all widths. `ShowJudgeSuppliesTool.tsx:107-111` shows Loading for a paused first query with no cache; installed QueryObserver proof gives `fetchStatus=paused`, `status=pending`, `isError=false`, zero query calls. Expected truthful offline guidance and reconnect recovery, not a new offline architecture. High confidence; no lost data asserted. Original #3665 surface remains after #3678's separate HTTP-error fix. Claude unassigned. Closure: paused/loading/reconnect/cached/error tests plus 390×844 and desktop offline-to-online proof. Full contract and verifier gap filed; original MYK9-1735 stays Done.

## Counts and persistence

New 3; unchanged 3; resolved 2; duplicate 0; rejected 4 tracked hypotheses; blocked confirmed findings 0. Unresolved: five P2 and one P3. Newly resolved: two P2. Rejected hypotheses: Nationals/Rally correction prefill (intentionally excluded by the host and MYK9-1025), AskQ inverse access predicate (authenticated known-show caller and fail-closed RPC), lost Sonner stood callback (actual installed lifecycle invokes it once), and edit visits overwriting the parked create draft (full restore/hydration flow and focused proof). They were not filed as defects. Two interrupted verification selections remain limitations, not product findings or incomplete source coverage.

Created MYK9-1880, MYK9-1881, MYK9-1882. Reconciled MYK9-1847, MYK9-1833, MYK9-1875, MYK9-1735, MYK9-1734. Archived-inclusive dedup and full relevant issues/comments preceded every filing; current evidence, ownership gaps, reproduction, acceptance, exact closure proof and verifier gaps are in Linear. No filing limitation or pending filing approval. Existing tracker priorities/statuses and completed historical scope were preserved; `source: codex` is recorded in the evidence (the old Codex label is retired).

Fixes found in subsequent commits: #3726/#3727/#3733 complete reset/cancel ring-time and return behavior; #3725 prevents crediting the earlier pull flagger after upload; #3752 repairs six desk rewrite defects and removes dead code; #3779 preserves diagnostics for mixed staff roles after #3773; #3762/#3764 repair mutation-target/static-mutant measurement. Earlier versions were reviewed against final implementations and not re-filed. Existing fixes/PRs are identified above; **this audit implemented no fixes and opened no PRs**.

The report and cursor are committed as one docs-only record. Publication SHA and remote readback evidence belong in automation memory/final output, outside this commit. Older failed-run worktrees are not this run's cleanup targets.

## Boundary

`daily-commit-review`: `6413224a250ad58b9278f2bd73bc730984d6b982`; window end `2026-11-11T00:05:32Z`; runner `codex-daily-commit-review`; run date `2026-11-11`. Complete contiguous source coverage; no remaining SHA in this frozen inventory. Publication/readback SHA recorded outside this commit.

## Reviewed commit inventory

```text
12b2d3b202e8a61ee37194e7f6202e6960d05841 docs(qa): record November 7 commit review and cursor
4837d5a28890ea46be51e38ffe67e84ae82aa86b fix(judge-supplies): a failed supplies read says so and offers Try again (MYK9-1735) (#3678)
dab62f8e2ca7c4c1caf901ea81dc819005a4b73b test(ringside): pin touch-action none on the run-order grip (MYK9-1734) (#3679)
eca306e0efb3c28a4728f72d35bd7627c9324458 feat(check-in desk): one card per dog, one tap to check in, per-class status (MYK9-1736) (#3680)
9224966455dc63328fffb656443ca054917ed9b8 feat(ringside): Requirements shows the search area size (MYK9-1738) (#3682)
ca05dffc1cf70ed111f3ba4263dec2d7b673edb1 fix(scoring): a reset score puts a completed dog back to checked-in (MYK9-1737) (#3681)
365f0744421eb485ebd3d405c1bc1212da813b59 feat(check-in desk): every staff check-in status on the desk picker (MYK9-1749) (#3684)
b287ac62028ab397ace651ebf72730aaa80bb338 feat(add-entry): faster mail-in keying in the Add Entry wizard (MYK9-1742) (#3683)
f92f7f1aeecb12db1edea05b69c054087da8774d feat(ringside): menu says Messages & announcements and links to Stats (MYK9-1740) (#3687)
05ff9c825ef8b7e8cefa16f228b741a0a8309002 feat(check-in desk): put a pulled class back from its status (MYK9-1749) (#3685)
aea8bd00d3188d11eac678929832ecd4372069c0 fix(ringside): Show info says "No show contact listed" when no official has an email (MYK9-1741) (#3688)
dfe954a55ba9051deb52fb050ea714370dfcc08c fix(ringside): class list follows entries added elsewhere (MYK9-1743) (#3693)
727dfef94aad1727e51b1c6f2d4e13600fb828c8 fix: offline card becomes one self-closing toast (MYK9-1745) (#3689)
5f6a2bb972fb33a09019e0b9832b05d03795d7d8 feat(ringside): group Your ring by trial in collapsible sections (MYK9-1739) (#3694)
b3276abacd4f504434df59cab8305c7ffce6cc0d fix(at-show): entry-list refresh answers done, failed or offline (MYK9-1746) (#3686)
2c7e0585bd5bd3ed44f5819cb5e857d9572ca0f8 fix(at-show): name both sections in the combined A/B entry list header (#3692)
71d856bda691db5e86ea430bfd5c8317efdc6d59 feat(ringside): amber offline badge and scoresheet offline icon (MYK9-1744) (#3695)
fb0aeed87c573561a068e9b50be7a9652bf4d3d6 feat(check-in): confirm before Pulled and offer Undo (MYK9-1752) (#3691)
c4a268767b964a85f83e49f1df64de92f8660ead Replace Google Maps keys with keyless Get directions link; drop Places autocomplete (#3690)
f55cccf511f6d2bc070aa5ff5aad7caa3b5769b0 feat(show-overview): drop Google Maps embed, keep keyless venue card (MYK9-1756) (#3697)
22428b7abb39c259545f40174484c478d74f191d chore(ui): drop unused @radix-ui/react-collapsible dependency (#3700)
e02e891f92e65267f84b5050ff9016013c347ad2 feat(scoring): append-only score audit trail for ringside writes (MYK9-1754) (#3699)
6f58acde658011fc0565ed469760c4773cc76d64 feat(check-in desk): show who flagged a pull, with Confirm Pull and Clear (MYK9-1753) (#3698)
63e5672bf6e1611f60d709faeb9bdd01bccfd641 feat(replication): send the device save time with ringside score writes (MYK9-1758) (#3701)
b5b9217a0e83f63aa8578a9c7a06292810fca23c fix(toast): fade the lifted toast in and out instead of sliding through the action bar (MYK9-1745) (#3703)
c5c93d2fd52500c4a499bc2a59a4b046de57574d fix(ringside): tighten the top of Your ring for phones (MYK9-1739) (#3704)
107376207184074910d1a28f4b3f758868a0c15c fix(ui): Collapsible/Accordion height animation uses Base UI vars (MYK9-1760) (#3705)
a11438dab8545b517236076286c420e10f5c157a feat(scoring): audit score changes made outside ringside scoring (MYK9-1759) (#3706)
87ac2691f5abced166ed80170887ece4bd08c466 fix(deps)(deps): bump the npm-minor-patch group across 1 directory with 10 updates (#3702)
b0ed9e3549d0c29ecf6ba81945e390da963ed219 feat(check-in desk): say who flagged a pull, from the replicated row (MYK9-1757) (#3707)
c26634219783943d0962835bd090755c8367172c fix(ringside): draw the check-in status as a button with its word (MYK9-1763) (#3708)
854ae7f588da52f18cc7d6e1a2fd5b4da43343fe fix(scoring): AKC, ASCA, FastCat and Rally sheets record no find counts (MYK9-1767) (#3709)
2026e83d8f55ade8ffcdcdff0558df3484598c74 test(replication): age seeded rows so stale cleanup is not a same-millisecond tie (MYK9-1769) (#3711)
342e6e2943ab296aae0e5b27ec2b034a3d776297 docs(skills): add owner-test escape checks to role-journey walk (MYK9-1768) (#3716)
d1c3abd047737e611dc5ea5a4a3313cf1b0b8ed6 fix(reports): judge cheat sheet keeps its 1/4 in inset under Chrome Margins: None (MYK9-1772) (#3713)
ce309652252e6725e0cc0773143d441e3e7bba1d fix(ringside): make a pull obvious (toast names class, labelled Pulled / not running group, readable section badge) (#3718)
b3ff5c12c56fe85a61a88512832953a173be8a4b ci: role preflight in Page Readiness Probe and Load Rehearsal (MYK9-1243) (#3717)
b3b9d3199723f79acb04930e21e2a49149384893 fix(askq): use caller show-access predicate so club secretaries keep show context (MYK9-1776) (#3714)
b7a6ca1e3969c7c1bf6cc1f9ca09d8d6cd6b02b3 fix(at-show): Change Status dialog uses tall two-column status tiles (MYK9-1773) (#3712)
21990e6f205a81761df8f81b1456e05dd7f33312 fix(askq): render safe Markdown in answers (MYK9-1774) (#3710)
08742bf1deb9debd989cf2daf4c3f14f043bd401 fix(labels): armband labels land inside Avery die-cuts under Chrome Margins: None (MYK9-1771) (#3715)
0f8202b197eba60bae9343df1c178fe4cef835f2 Check-in desk: set any status on any show day (MYK9-1765) (#3722)
b181d394c28b679795aabec1314541f0269affb7 fix(at-show): ringside menu top-left beside Up on every screen (MYK9-1770) (#3719)
52b019c35d19a9be400bfe40ccbde1f2899b8a30 fix(askq): ground app help and role-scope guides (MYK9-1775) (#3723)
073582dd45a3e45254e93773ffdf2fb5b43a0b91 fix(check-in desk): never credit the earlier flagger after an upload ack (MYK9-1766) (#3725)
c445330317c3ac1809eac367367301dd68814006 fix(scoring): leaving an unscored scoresheet puts the dog back; clear stale ring time (MYK9-1762, MYK9-1761) (#3726)
3b6e76a6b34e105397cbfc9ede2098292f3d5ca4 fix(scoring): resetting a score clears the dog's ring time (MYK9-1778) (#3727)
c2a3dbc47b6605e95795fb82fc846562974c2820 test(labels): pin skip placement and left breathing room in print-geometry spec (MYK9-1771) (#3730)
b8f55203153b8fb6c54c5f3789bae8e6b315848d fix(scoring): the list returned to from an unscored scoresheet waits for the dog to be put back (MYK9-1779) (#3733)
e3d42915d41a05beee7db05d82d4700e3e7f23e4 docs(plan): workflow speed-up plan (MYK9-1787, MYK9-1788, MYK9-1789, MYK9-1790)
d97f2dd61ae00eb85f5d4585791c167aaa65c248 Show Desk 1/3: rail schedule and run-status entries table (MYK9-1782) (#3734)
906674b4d5dbc00f0bc609210cb150bd76a385fe chore(claude): let a session post its own adversarial-tier review gate (MYK9-1791) (#3735)
710f85d550acea1a57f132e59d8cede175599e64 test(ringside): phone-width walk gates ringside and check-in desk PRs (MYK9-1787) (#3736)
b94db65f2434e26a0cfec0624b5201902014224f docs(audit): choice audit of secretary and exhibitor flows (MYK9-1793)
daea71201640fe0d8bde030a9886c54f2c6c52ea Show Desk: class checklist as an always-visible step bar (MYK9-1783) (#3738)
c1e532979631388279d8539d933931b37fe5133a feat(ux): stop asking five questions the app can answer (MYK9-1793) (#3739)
d5670eaa01ed48d6a35ac6f009432a816883652b docs(workflow): batch by surface, second-fix stop, deploy cadence, priority at creation (MYK9-1788) (#3740)
eae2bcb0ea9378e111035160cf49876c3cc569ac fix(e2e): show-day walk opens the pulled group by count, not its name (MYK9-1792) (#3737)
717272511de99d75f2b0d9b1b0d2ff60a41cdf3a docs(workflow): skip /harden when the review floor is the Codex tier (MYK9-1789) (#3741)
1ddd4d41c97bcdb7702a33fb348be5c7a37b5e92 Show Desk filter: class status, judge, ring/area, element, level (MYK9-1785) (#3743)
b9cb72e62b5bb176d6dc53ae4ef7015529061ab3 Show Desk: class table Check-in cell opens the Check-in desk's status picker (MYK9-1797) (#3742)
bf43aaf5e11241bddf1283200bf49d3d054d1ac2 Show Desk: one Actions menu in the class header (MYK9-1796) (#3744)
d087f639649f74b787aa362ba9e59cab0dbc77d1 docs(agents): slim the always-loaded rulebook and move domain lessons to skills (MYK9-1790) (#3746)
805035796bf7bbb749c4bbdf709cb007807f5680 fix(wizard): an Add classes visit no longer overwrites a new-show draft (MYK9-1794) (#3745)
7d373eac5ea56a5fce3104ed8a0bec826842c1db Show Desk 3c: per-dog row menu replaces the Can change class list (MYK9-1798) (#3747)
dd31a24ca1ebd9d436cfb1a6fa752a095036df04 feat(ux): three choice-audit owner decisions: one sign-up password, kept agreement tick, new-show defaults (MYK9-1799) (#3748)
5b634c77dfd341a4917b94b7807dfeaa0938722b docs: secretary guide covers Hospitality plan and Email exhibitor composer; Reports intro names Show Desk (#3750)
e4af2ed0eb86a9e4dacffbf48a9ad034dc384cda feat(entries): send the acceptance or waitlist email unasked on a live show (MYK9-1800) (#3749)
fbd690be4cda6114ea3fbc28a7af7af7dc09f3b7 Entry wizard: tick an exhibitor's only dog without it counting as a started entry (#3751)
25923ec863631ff58660f523745a74e70695eafe test(scoring): mutation-test the live scoresheet rules, delete the unused validator (MYK9-1805) (#3753)
531e8d05ddde34a550823f4283f833cb3f4580a9 docs(audits): plain-language audit of secretary and exhibitor wording
a9b90e154cfd4405a05295fcc2f13e91d86b7933 refactor(scoring): delete two types only the removed score validator used (MYK9-1805) (#3754)
454d59a4ab25ddbe9b743ed9e55c036416618949 docs(agents): implementers run related tests, CI guards and lint; orchestrator checks the cloud head before writing (MYK9-1814) (#3755)
e9e73101ffb11370ef08f454c84793e7b6242f6e fix(auth): sign-in and sign-up errors in plain words, one password rule (MYK9-1815) (#3756)
cb3086f9ffa53ff149ed462bebd353524725bc56 fix(show-desk): six audit defects and the dead code the rewrite left (MYK9-1801, MYK9-1802, MYK9-1803, MYK9-1804) (#3752)
aaa9b5fbef09d5ed398f2565cc3f8db7262840fa docs(qa): sharpen club-testing verifier walks (MYK9-1831) (#3758)
18e3e11901d9c4833cf70f33830405f005f10fa7 AskQ: classify each question and answer from guides, rulebook and show data (MYK9-1825) (#3759)
0927e6fab3b23fe4daafcc10e585fda9fdc8ca58 fix(scoring): Nationals placement chips removed; an unmappable result is refused, not saved as unscored (MYK9-1806) (#3757)
c569cbced1c7d973c70fd135e69efac388be6fc8 fix(payments): refund, payment-link and record-payment errors in plain words (MYK9-1824) (#3760)
e3609faf853750fa7d707151ce1f88c80b61ee37 fix(entries): submitting an entry and the cart never show raw error text (MYK9-1823) (#3761)
30893cd55ee50bea994093fad4470eb3989d45c0 MYK9-1829: mutation targets run every importing test; static mutants killable (#3762)
247297c23ba57175eabf4b52168cf1878b0182aa chore(claude): turn off the unused skill-creator plugin (#3763)
4ef0acbb47886e475c0f128a07b2480d8a96ffb6 test(replication): kill conflict-rule mutants, target at 96.75% (MYK9-1830) (#3764)
c4ee99c29ab3dc54e6216c615f99bee938cd7b2b fix(entries): wait-list Decline and Withdraw ask before giving up the place (MYK9-1839, MYK9-1842) (#3765)
2fd558de87cd2b0ce5876080cb0bac08f625199f fix(ui): exhibitor and shared error messages say what failed and what to do (MYK9-1843) (#3766)
f3d9a2a87af94fa7e4d36f2be1ff266fe243bb80 Confirm before setting a class to Cancelled (MYK9-1840) (#3767)
f4f6a6bf93c9a0ecacf71543c2b8d114a079d568 Spell out abbreviations, label raw status and role values, drop seconds (MYK9-1845) (#3768)
7f46c716b38edfd358a3fbfd15113e32403dd08a fix(ui): secretary and show-day error messages say what failed and what to do (MYK9-1844) (#3770)
be920d74b9303e74c88ea50226770ae280fa6aa5 Reword offline, send and app-update messages in plain words (#3769)
f88e4e312b77b4ba5c8e0d77b435703dcf6e1d6b fix(classes): screens say "Judge to be announced" for a class with no judge (MYK9-1846) (#3772)
477ae403a87e457607c6e8fc796a51462e2b6a70 fix(show): hide the sync-failure Reason line from exhibitor-only accounts (MYK9-1849) (#3773)
7e62ec26ed591507cf1cff9f048dd5af86bbf1b8 fix(entries): confirm before Paid in Full: Online or Payment Due changes what a form owes (MYK9-1841) (#3776)
fca5c35dc107b2f92ecf7e794438281875a52198 fix(show): keep save diagnostics for mixed staff roles (#3779)
f88b790037673a5c3f6ca959f7d9a482d191bafa fix(payments): Refund all results say what to do in plain words, raw detail for support (MYK9-1837) (#3775)
bf81222d5fef15bcae96cae1644968e996ab8082 MYK9-1858: plain-language Pull and Withdraw wording (#3777)
4660fa42abd9e64ff7bd2d8169c029e8feb3f559 MYK9-1847: show cancelled classes as Cancelled at ringside (#3778)
d90b677a453b7b8ab06ec9323fa3f37227ecea02 feat(qa): em-dash ratchet for screen text (MYK9-1855) (#3774)
7311cd8c3bdb1bf6ccfc44aecde1e340f09f1482 Plain language P3c: last generic failure messages (#3780)
a0a7ff1f443991f56beeab6433fc6b16c23c9804 feat(show-desk): Shows list can be hidden at every width; class cards read "N of M not checked in" (MYK9-1868) (#3782)
7bf2b8e4d7d83e0481fd873fd7ef0d50031421fe fix(payments): late-entry payment card keeps two plain actions, no tabs (MYK9-1822) (#3783)
553c879372ced5f78e2ad7d5154e6ee3d310adad fix(show-desk): start-time editors keep the typed time readable and never overlap their buttons (MYK9-1866) (#3784)
c88502def252624a05978cfd6f5a8a77e093bb6a feat(show-desk): entries table rows show the armband tile and one check-in control on every row (MYK9-1869) (#3787)
6413224a250ad58b9278f2bd73bc730984d6b982 feat(show-desk): class header gets a ⋯ menu with Score this class, and class settings become inline fields (MYK9-1867) (#3789)
```
