# Codex daily commit review — 2026-10-02

Completed the full 282-commit range. This supersedes the earlier five-commit partial report. Four new findings were filed; existing canonical issues retain the other actionable work. No application code was changed.

## Coverage

- source: codex; automation `nightly-commit-review`; methodology quality-finding-lifecycle.
- Start: `780135f11b131878e35ca0b5ad295f2f93b1bb1d` exclusive, shared window end `2026-09-20T10:01:32Z`.
- Run completed at `2026-10-02T14:30:50Z`.
- End and final baseline: `342c68e0cde2fa9652b797be6240454a2462d268` inclusive, commit time `2026-10-02T14:07:31Z`. Initial verification baseline was `118bad64c3e199d3850c6f4f2938913a55776f7c`; the two newly merged forms/list commits were reviewed in a supplemental pass.
- No cursor gap and no 24-hour fallback. Remote shared cursor remained September 20; no failover stamp was overwritten. Coverage is complete through the named snapshot, not future commits.
- Reviewed changed functional contracts across app UI/forms/registration/cart/reports/premium, replication/offline/auth/show-day and packages, SQL/edge functions, QA/tooling/CI/deploy configuration, tests and documentation. Intermediate implementations were followed to their final replacements. Generated data, mechanical formatting and deleted code were inventoried rather than misrepresented as separately executed behavior.
- Four review lenses completed: parent QA/CI/tooling/e2e/performance, app, offline/packages, database/edge. An interrupted database reviewer was replaced by a complete defensive source review; its already-confirmed local SQL evidence is retained separately. OPSX implementation was not started because this is an audit.

## P0 — unresolved

### NCR-2026-10-02-03 / MYK9-939 — nullable handler bypasses withdrawal ownership

**new; source High; source: codex; owner Richard Beezley; first/last seen October 2; baseline 118bad64c.** [Canonical Linear contract](https://linear.app/myk9-platform/issue/MYK9-939).

`supabase/migrations/20260926013700_myk9_778_no_owner_withdraw_after_show_completed.sql:171–183`: a nullable handler can make the ownership predicate NULL. `IF NOT NULL` does not reject an unrelated authenticated caller. Latest full function, nullable schema and grants were checked. This predates the window but remains in the range's current redefinition; it is not falsely attributed to the completed-show guard.

Disposable local PostgreSQL with synthetic dependencies executed the exact current function: unrelated person/nonmanager + NULL handler + unrelated dog changed a confirmed entry to scratched; the non-NULL control refused with 42501. No live Supabase probe or real entry mutation. High confidence; integrity/authorization impact supports P0 per the scorecard. Next: fail closed on nullable ownership. Closure requires focused SQL null/identity/role controls, unchanged entry/history/money on refusal, migrated CI proof and authorized applied-definition/grant readback. A source patch or merge alone does not close it.

## P2 — unresolved product and test findings

### NCR-2026-10-02-01 / MYK9-938 — deleted trials return on sync

**new; Medium; source: codex; owner Richard; first/last October 2; baseline 118bad64c.** [Linear contract](https://linear.app/myk9-platform/issue/MYK9-938).

`ReplicatedTrialsTable.ts:71–96,185,209,235–253` omits tombstone filtering and `trialMappers.ts:219` writes deleted_at null. After the standard soft-delete RPC, the next ordinary replica fetch treats the returned tombstone as live. Exact current mapper proof passed; latest SQL visibility and delete bodies were read. #2660's online fallback fix does not repair replica synchronization. Impact: deleted schedule rows reappear as usable. Next: preserve/filter tombstones across ordinary sync. Closure: incremental/full/cold-cache deletion and legitimate restore controls plus controlled delete→sync→reload→Undo proof. High confidence; no live deletion performed.

### NCR-2026-10-02-02 / MYK9-937 — deploy-picker tests exceed their default budget

**new; test/harness; Medium; source: codex; owner Richard; first/last October 2; baseline 118bad64c.** [Linear contract](https://linear.app/myk9-platform/issue/MYK9-937).

`scripts/qa/pick-deploy-commit.test.ts:127,136`: 60-commit fixtures and 51 subprocess queries make both boundary tests exceed Vitest's five-second budget. Two runs failed around 5.3–5.7 seconds, including outside the restrictive sandbox. All 10 passed with an explicit 15-second diagnostic budget. Product selection behavior was not shown wrong. Next: bound fixture/process cost or justify a targeted budget. Closure: unchanged boundary assertions pass with the intended normal command and relevant CI at the fix SHA. High confidence. Historical rollback issue MYK9-896 is distinct.

### NCR-2026-10-02-04 / MYK9-940 — judge edit falsely reports Saved

**new; Medium; source: codex; owner Richard; first/last October 2; baseline 118bad64c.** [Linear contract](https://linear.app/myk9-platform/issue/MYK9-940).

`useClassEditActions.ts:57–63` swallows a required judge-assignment preparation failure and continues the independent class save. Exact unchanged current readAllForWrite→replaceClassAssignment→upsertClassJudgeAssignment→hook bodies, with a failed device read, produced zero assignment writes, one class write, one warning, old judge retained and resolved save. SetupClassDialogs:30–36 and ClassEditPanel/EditPanelWrapper interpret resolution as success and close. This is an offline queue preparation refusal, not an immediate server RPC rejection. Shared Setup exposure introduced by #2635; the older Class Details catch is retained. Next: represent required assignment failure honestly. Closure: real-hook rejection and both panel paths retain edits/no Saved/open panel, truthful partial outcome if class fields saved, successful retry and controlled mocked browser proof. High confidence; no shared judge mutation.

### MYK9-834 — same-user sign-in event removes offline ringside recovery

**unchanged canonical issue, reopened Done→Backlog; Medium; source: codex; owner Richard; first September 26, last October 2; baseline 118bad64c.** [Linear contract](https://linear.app/myk9-platform/issue/MYK9-834).

`useAuth.ts:182–183` clears the durable passcode claim on every SIGNED_IN. Actual installed auth SDK refocus/session recovery emits SIGNED_IN for the same user; `useRehydrateRingsideGrant.ts:130` returns while an in-memory role exists without repersisting. Executing the real callback and rehydration bodies left active judge role with persistedClaim null. After offline token expiry and reload, the fallback is gone and scoring requires network sign-in. #2544 introduced the event behavior; #2603's offline draft visibility fix does not address it. Next: distinguish genuine identity changes and preserve same-user recovery. Closure: same-user refocus→expired offline full reload→local score→reconnect drain, plus sign-out/different-user/revocation controls and controlled browser proof. No queued score loss or production outage claimed. Historical Urgent impact remains history; current canonical P2 is Medium.

## P2 — unresolved verification prerequisites

Both are **blocked for closure**, not newly reproduced product defects. Full execution contracts are in Linear; Richard Beezley owns both. Source historical severity High is preserved separately. No payment, refund, production change, browser fixture creation or deployment was performed.

### NCR-2026-09-20-01 / MYK9-639

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-639), reopened Done → Backlog; current Medium priority; historical High preserved separately. Remaining classification: P2 verification prerequisite. First seen 2026-09-20, last reconciled 2026-10-02; third daily reconciliation. Earlier NCR-2026-09-19-01/-02 proof requirements remain grouped here, not counted as fresh defects.

The moved-root rejection is repaired by [#2407](https://github.com/rbeezley/myk9-platform/pull/2407), replacing the abandoned #2386 approach. Current `apps/myk9show/supabase/functions/stripe-webhook/paymentReconciliationLoader.ts:198` resolves settlement via a sole live descendant. The exact loader matrix passed 25 tests; `apps/myk9show/src/features/payments/__tests__/movedRootSettlementChain.test.ts:107` passed both real balance → recovery → loader → reconciler cases.

The September 24 deployment comment records webhook v96 but explicitly says controlled Stripe TEST replay/readback is unrecorded. Expected: the completed issue contains its original deployed settlement proof. Observed: Done without that proof. Confidence high in the evidence gap; no current financial failure or loss alleged.

Next/closure: authorized one-/two-hop TEST payment through exhibitor Finish payment and secretary Request payment, one paid root/order, matching balances and Financial Report, authoritative/offline readbacks, and relevant negative controls under the current explicitly approved refund policy. An explicit owner revision of the acceptance gate is an alternative; passing helper tests alone is not closure. No new issue created.

### MYK9-648

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-648), reopened Done → Backlog, Medium priority retained. First seen 2026-09-17; last reconciled 2026-10-02; third daily reconciliation.

The source fix and actual header/card deferred-query tests are complete. The current `apps/myk9show/src/features/premium/__tests__/publishInfoShowTransition.test.tsx` passes within the 78-test app batch. [#2400](https://github.com/rbeezley/myk9-platform/pull/2400) supplied these tests and the query-key audit. Its closure comment explicitly excludes a controlled browser replay; `docs/qa/per-show-query-placeholder-audit-2026-09-24.md:156` retains the replay recipe.

Expected: original A→B browser closure evidence or explicit owner acceptance of replacement proof. Observed: neither recorded in the inspected issue/comments. No renewed placeholder leak is claimed. Next/closure: owned A-published/B-unpublished browser navigation with delayed and failed B responses, no A state/URL on B's menu/card, recorded app SHA and outcomes; alternatively explicit owner acceptance of the passing rendered-component mutation proof. Do not publish/unpublish shared shows for this audit. MYK9-709 owns separate query-placeholder defects.

## P3 — unresolved existing draft compatibility finding

### MYK9-936 — persisted wizard drafts lose trial dates and times

**duplicate/reused; Low; source deferred label P2; source: codex; owner Richard; first/last October 2; baseline 342c68e0c.** [Canonical Linear contract](https://linear.app/myk9-platform/issue/MYK9-936).

New #2667 changes wizard trial fields to trialDate/startTimeDraft (`wizardStore.ts:99–105`) but keeps persist version 1 and returns old version-1 state unchanged (`wizardStore.migrations.ts:4–9`; restore `wizardStore.ts:415–438`). Actual migration proof retained dateTime and lacked both new fields. Current trial UI reads blanks and validation requires re-entry. Existing MYK9-936 already owns this exact deferred scope; no duplicate created. P3 reflects pre-launch tester drafts and recoverable schedule re-entry, with no wrongly saved show alleged. Next: Richard chooses migration or explicitly accepts tester-only invalidation. Closure: old-shape persisted hydration retains schedule/names/class/judge links and passes payload validation plus mocked browser resume; alternatively explicit owner disposition before real secretary use. Do not close from a merge.

## Newly resolved from the previous ledger

- **P1 / High — NCR-2026-09-19-03 / [MYK9-640](https://linear.app/myk9-platform/issue/MYK9-640).** First seen September 19, reconciled October 2, owner Richard. Existing September 25/26 comments supply applied migration, behavioral SQL, competing transactions and two-device stale Undo proof. Both client refusal and realtime-blocked server refusal left full entry-row hashes unchanged; C→B→A restored one live paid obligation. Current focused move-up tests passed. Already Done; no closing mutation. September 26 P3 leftovers are canonical MYK9-821, subsequently fixed by #2558, not unfiled work.
- **P2 / Medium — NCR-2026-09-20-02 / [MYK9-698](https://linear.app/myk9-platform/issue/MYK9-698).** First seen September 20, reconciled October 2, owner Richard. #2385 records merged-code bootstrap proof. This run independently passed 11 inventory/space/failing-Git/concurrency tests and a real isolated-worktree bootstrap, hooks `.githooks`, all 12 package builds and `qa:dist-fresh`. Initial restricted-network install failed; network-enabled retry succeeded. Already Done.
- **P2 / source Low — QA-TEST-FLAKE-002 / [MYK9-627](https://linear.app/myk9-platform/issue/MYK9-627).** First seen September 16, reconciled October 2, owner Richard. September 26 closure records three consecutive full chromium/mobile-chrome runs, 36/36 and zero skips each, on merged #2502, after helper/serial fixes in #2453. Accepted recorded focused browser proof, not a fresh audit replay. Already Done.

## Counts and Linear reconciliation

Canonical counts: **new 4; unchanged 1; resolved 3; duplicate 1; rejected 1; blocked 2**. The duplicate is current MYK9-936, reused rather than recreated. Outstanding: P0 1, P1 0, P2 6, P3 1. Resolved counts use recorded focused evidence, not merges alone.

Created MYK9-937/938/939/940. Updated/reopened MYK9-639/648/834; MYK9-936 updated with current proof and execution contract. No issues closed. Canonical current priorities match the remaining impact; original severity and completed historical scope are retained separately. Every issue has a known owner, sanitized reproduction, next action, acceptance and exact closure proof. No Linear access blocker. Ephemeral logs are not durable attachments; necessary written evidence is in Linear.

Archived-inclusive searches covered workflow, route/file/object, symptom, proof and cause; exact candidates were read. Prior fixes were checked against current main and subsequent PRs. MYK9-706's old judge-time estimate is rejected as current work: #2395 fixed entry×minutes and #2622 removed the legacy creation surface. Replication OCC/queue concerns were superseded by #2470/#2512/#2520/#2628/#2663; paid-root reconciliation by #2407; private-field and edit-status candidates were rejected after complete relevant paths were read. These are not additional actionable defects.

## Checks and limits

Fresh passing focused batches (not a sum of unique tests; some files overlap):

- Initial review: 10 files / 152 tests; actual premium transition, move-up, payment composition/loader, trial/class mapping, ringside parity and bootstrap.
- App completion: 14 files / 103 tests; 15 files / 141 tests. Initial supplementary 3-file/32-test output passed but lacked separately recorded shell status.
- Offline/show-day: 6 files / 66 tests; 4 files / 51 tests; exact current trial/auth source proofs exited 0.
- Edge completion: 40 files / 481 tests plus 3 files / 46 tests; SQL registration 1 file / 8 tests passed. SQL registration is not migrated SQL execution.
- QA tooling: initial 14 files / 524 tests, 514 passed/10 failed. Eight restrictive-sandbox process failures disappeared on an authorized local rerun (40 liveness tests passed); two default-budget deploy-picker failures reproduced and are MYK9-937. Diagnostic picker 10/10 passed at 15 seconds, not closure proof.
- Performance/fixture guards: 11 files / 123 tests passed; remaining QA tools 5 files / 58 tests passed. No load generated.
- E2E test-id self-test and actual audit passed: 86 files, no missing or stale entries. Supplemental selector/time changes reviewed; no browser run claimed.
- Supplemental forms/list app integration: 13 files / 110 tests passed; offline/date/wizard integration: 7 files / 77 tests passed and old-shape persisted-draft proof exited 0.
- Supplemental list core: 4 files / 44 tests passed, one existing todo file skipped; no new coverage conclusion from the todo.
- Real worktree bootstrap and all 12 package builds plus dist-fresh passed at initial baseline. Supplemental package source is only status grammar, reviewed with the final supplemental integration checks.
- Exact current withdrawal SQL executed locally with synthetic dependencies; judge prerequisite, trial mapper and auth claim proofs executed without shared fixtures.

No full suite/typecheck, fresh browser walk, full migrated SQL/concurrency suite, applied Supabase ACL audit, Stripe/payment/refund, production operation, email/push send, deployment or live load. Findings and closure limits reflect these boundaries. No application or tracked test edits. Logs retained in `/private/tmp/myk9-ncr-20261002/.logs`; durable finding contracts reside in Linear. Report/cursor are stamped in the primary workspace as explicitly requested documentation, with matching retained worktree copies. They are uncommitted and not pushed to remote main; no commit/push/PR is claimed. The automation memory records the same finished boundary so a later run can reconcile it.

## Completed commit inventory

Chronological inventory of all 282 commits reviewed from the shared boundary. Domain ledgers in the retained worktree describe functional coverage, later replacements and focused checks; this list does not imply each unchanged line or generated fixture was executed.

1. `2e48986ee` — docs(qa): record September 20 commit review
2. `c51b58417` — fix(ringside): enable results sheet across entry filters (#2379)
3. `06c5d07e5` — test(load): use plausible secretary fixture names (#2378)
4. `b9c7a1c02` — fix(classes): base judge time on current entries (#2376)
5. `b599219d4` — docs(agents): record model routing for issue work
6. `b5874aa83` — fix(MYK9-603): print assigned entry handler (#2384)
7. `fb7dc6e50` — feat(shows): clarify adding subsequent trials (#2373)
8. `3ec00a318` — fix(worktree): prevent bootstrap SIGPIPE and config races (#2385)
9. `da66f76d8` — feat(premium): edit show style from preview (#2377)
10. `23e5f0031` — feat(qa): optional review for bounded low-risk PRs (#2390)
11. `4b240b708` — ci(deploy): deploy myK9Show on demand instead of on every merge (#2393)
12. `368ba2f65` — docs(plan): group the open Linear backlog into 19 batch PRs
13. `8a3aba52c` — test(e2e): hermetic fixtures for the PR-smoke specs (MYK9-702) (#2392)
14. `8ea1f4cae` — fix(seed): make the load fixture opt-in and retarget staging consumers to the lean seed (#2394)
15. `579252447` — fix(classes): base judge-time estimate on entries x minutes per run (MYK9-706) (#2395)
16. `7d61d895e` — docs(openspec): archive myk9-689-current-entry-judge-time (MYK9-706) (#2396)
17. `3767cd934` — test(registration): assert real seeded dogs in the staging acceptance specs (MYK9-626) (#2397)
18. `952167d36` — test(premium): pin show A -> B publish-state transition on real surfaces (#2400)
19. `bdefbbe9a` — [MYK9-604] Validate wizard class registry identities (takeover of #2388) (#2398)
20. `0074c1a9a` — fix(db): only site admins can relink, re-email or re-status a person (MYK9-710) (#2401)
21. `f70f0b3b0` — MYK9-604: guard persisted show organization changes (takeover of #2391) (#2399)
22. `bd8a96546` — fix(trial-packet): honor the injected sleep instead of also sleeping for real (#2402)
23. `b477a8578` — fix(labels): render a trial's name, never "Trial ${trial_number}" (MYK9-704) (#2403)
24. `f73246d9d` — fix(entries): make account identity durable offline (MYK9-601) (#2381)
25. `e242818b4` — fix(premium): restore show-manager publishing (#2375)
26. `a40ed0725` — fix(seed): create exhibitor profiles for the sign-in accounts (#2404)
27. `696f58174` — fix(db): site-admin-only status, frozen email once entered, no direct signup-helper calls (MYK9-711, MYK9-712) (#2405)
28. `710147411` — fix(shows): honest entry-window status, show-zone close guard, latched trial readiness (#2406)
29. `6d4fb8da6` — fix(payments): settle a moved money root through its one live descendant (#2407)
30. `a2f4619c7` — fix(rls): club admins read waitlist and submissions, site-admin catalog writes, hoisted official arm (MYK9-660, MYK9-667, MYK9-668) (#2408)
31. `f352c9cc6` — fix(my-shows): one lifecycle predicate, grammar word, focus after leave, honest filter counts (MYK9-623, 624, 657, 658) (#2410)
32. `45bbdc5a0` — chore: delete dead entry services, offline form, addEntry path and unused replication indexes (MYK9-611, 614, 616, 673, 715) (#2411)
33. `92cfca7a4` — chore(pulls): delete the pull-request approval queue and entry-store orphans (MYK9-609) (#2413)
34. `e7e22b288` — fix: Locate Address CSP + query cleanup, AskQ model-failure handling (MYK9-686, MYK9-684) (#2414)
35. `d01b79fb3` — test: fix redirect and focus flakes, e2e path args, per-test fixture resets, package test typecheck (MYK9-605, 628, 669, 675, 707) (#2415)
36. `f2f19e59d` — fix(entries): retire entry_status scratch-requested (MYK9-719) (#2416)
37. `e62244604` — chore(test): delete machine-wide process-kill cleanup scripts; forward typecheck args to turbo (MYK9-720) (#2417)
38. `0f15490ff` — fix(cart): one recoverable-cart pick, drop stale writes, trust recovery ids only for their exhibitor (MYK9-650, 651, 655) (#2409)
39. `090a5a7dd` — fix(command-menu): search-only aliases so mail, paper and phone find the on-behalf entry (MYK9-672) (#2419)
40. `64daab9fd` — copy: one creation verb (Add), AKC report names, correct plurals (MYK9-671, 661, 644) (#2421)
41. `751f2e234` — fix(rls): members read their own club_members and club_officers rows (MYK9-723) (#2422)
42. `8dea2babe` — fix: delete dialog names the dog; class page shows the day-of fee on show day (MYK9-724) (#2423)
43. `53501e359` — chore(tooling): content-based edge-function drift, local-only skill rows, no forced worktree removal (MYK9-597, 598) (#2424)
44. `ff4a037ce` — fix(reports): secretary Reports page works offline with one print-readiness rule (MYK9-721) (#2425)
45. `a275af7d8` — fix(dogs): restore skips taken placements, unambiguous delete audit, show deleter and recorded money facts (MYK9-607, MYK9-608) (#2418)
46. `bbabe20e4` — chore(types): regenerate database.types.ts after migration 20260922221849 (MYK9-694) (#2426)
47. `a0e76426d` — test(e2e): triage the test-id audit, delete dead suites, gate it in CI (MYK9-617) (#2427)
48. `cebc05b97` — docs(agents): consolidate Planning into shared rules, drop duplicated LESSONS (#2428)
49. `78fd54cd3` — chore(claude): deny git update-ref -d alongside git branch -D (#2429)
50. `9c0a1fb09` — feat(clubs): membership + secretary access requests (MYK9-685) (#2420)
51. `2762c6344` — chore(skills): prune unused skills, merge IA-Review and launch-checklist, hand ship-it to ship-pr (MYK9-728) (#2430)
52. `9205d61fd` — fix(people): move handler DOB and junior numbers to people_private; one atomic person save (MYK9-664) (#2412)
53. `10dae7808` — fix(shows): auto-locate the venue on blur; warn on Review when there is no map pin (MYK9-686) (#2431)
54. `907ce2125` — fix(notifications): alert only on changes seen while open (MYK9-735) (#2432)
55. `018d07345` — fix(dogs): remove the dog picker's broken search history; widen list search (#2433)
56. `5a9992240` — fix(registration): staff dog picker marks the registration used for this show (MYK9-619) (#2435)
57. `ad5bd767d` — docs(plan): overnight backlog batches 2026-09-24; archive the 09-23 plan
58. `40d6700de` — fix(entries): move-up chain proof and Pulled jump-height guard (MYK9-640, MYK9-652) (#2437)
59. `49c01e691` — fix(reports): Waitlist Report reads waitlist_entries; delete the empty Financial waitlist mode; count real seats (MYK9-717, MYK9-718) (#2439)
60. `cb8f1e4af` — fix(registration): count class capacity server-side; drop closed or full lines from a recovered cart (MYK9-705, MYK9-656) (#2438)
61. `20c752b63` — fix(data): show-scoped placeholders, Browse show-zone labels, retire three schema-compat ladders (MYK9-709, MYK9-714, MYK9-654) (#2444)
62. `f062037bc` — fix: Playwright Regression green — offline recovery, prime race, 390px wizard (MYK9-738) (#2434)
63. `965c59000` — fix(layout): 44px default controls, no sideways scroll at 150% zoom, collapsing phone wizard header, wrapping cart header (MYK9-643, MYK9-622, MYK9-625) (#2445)
64. `5feac780a` — test(e2e): wait for the loaded Add Another Trial action in Add Trials mode (MYK9-755) (#2446)
65. `1d86c1807` — fix(access,email): FK-named user_roles embeds; role-request review lock; trial labels in confirmation emails (MYK9-726, MYK9-727, MYK9-713) (#2448)
66. `e6f4a16ee` — fix(shows): Add Trials knows the show's current trials before offering a first trial (MYK9-758) (#2450)
67. `35fed698a` — fix(replication): a show's entries are loaded only after a completed show sync (MYK9-746) (#2449)
68. `c9ffe915b` — fix(offline): prime forces a full sync; readiness counts server-backed rows only (MYK9-752) (#2452)
69. `1fb8aeea4` — chore(tooling): Dependabot smoke label, worktree write-handle liveness, in-tree health cadence, stray-show check (MYK9-520, 599, 725, 729, 741) (#2451)
70. `27789167d` — fix(dogs): stop remounting the select checkboxes; centre them; de-flake the pinned-select spec (MYK9-751) (#2454)
71. `c6b63ba69` — test(e2e): showWizardUI audit spec matches today's Browse cards; date check runs west of UTC (MYK9-760) (#2456)
72. `ae2dd50a1` — feat(access): access-request emails from a database job queue (MYK9-681) (#2455)
73. `e3e892835` — fix(landing): Banner sticky-nav status uses the club's flag colour again (MYK9-751) (#2457)
74. `e5497730a` — fix(shows): the wizard's sticky chrome no longer hides a focused or scrolled-to field (MYK9-764) (#2459)
75. `a9daa98c0` — fix: review-sweep P2/P3 batch — notifications, print, style save, QA tooling, withdrawal, delete refusals, club access (MYK9-742, 743, 744, 748, 749, 750) (#2458)
76. `2c9a71ae2` — test(offline): the readiness badge names its missing signals for diagnosis (MYK9-766) (#2460)
77. `32f093510` — fix(status): seat counts use the server's status set; guest Browse stops saying "Classes Not Ready" (MYK9-754, MYK9-756) (#2461)
78. `dcd8e75b8` — fix(shows): re-reveal only keyboard focus under the wizard chrome (MYK9-764) (#2462)
79. `bc405947a` — fix(ringside): a replayed score whose write already landed is not a conflict (MYK9-740) (#2436)
80. `2f7fdef9e` — test(e2e): walk regression canaries against live data (MYK9-730) (#2465)
81. `32bb7cf0f` — fix(clubs): guest directory hides clubs anon can no longer see (MYK9-747) (#2440)
82. `d7d1e316e` — fix(messages): scope the composer's shows per role and lock it to the opened show (MYK9-641, MYK9-722) (#2443)
83. `343b86b61` — fix(shows): the wizard no longer moves a page the secretary is using (MYK9-764) (#2468)
84. `83c9f6610` — chore(ui): drop the date range picker's dead initialFocus (MYK9-764) (#2469)
85. `742f5ea76` — Batch 11: show-day fixture, walk prompts in the repo, show-day walk, walk residue cleanup, wizardVisualQA flake (MYK9-731, 732, 733, 734, 627) (#2453)
86. `951c4defb` — fix(shows): publishing requires an entry window; drafts may omit it (MYK9-716) (#2447)
87. `c9de7236c` — fix(replication): a write queued during this device's own upload keeps up with its version (MYK9-770) (#2470)
88. `e7648fc60` — fix(replication): show readers wait for a completed show sync before counting (MYK9-761) (#2463)
89. `7f0418ff3` — fix(at-show): a failed device read of judge assignments is unknown, not "no classes" (MYK9-769) (#2471)
90. `8970f4050` — test(e2e): the judge dashboard shows today's show-day class, not "No Classes Today" (#2473)
91. `b8c0f3561` — fix(closeout): desk money keys on when the payment was received (Fixes MYK9-677) (#2441)
92. `80b5e3c52` — fix(shows): save judge edits as a difference, so a failed read can't delete real judges (MYK9-772) (#2474)
93. `f52369422` — fix(registration): the offline capacity check refuses on any failed device read (MYK9-774) (#2476)
94. `b925f304a` — ci: run browser smoke on Dependabot PRs (MYK9-520) (#2478)
95. `90bc9279b` — fix(cart): per-judge-day availability for multi-judge classes (MYK9-753) (#2479)
96. `b497fa177` — fix(replication): a judge assignment deleted on the server leaves other devices (MYK9-775, MYK9-776) (#2482)
97. `68eb8c088` — fix(push): one Results Posted push per class, with pending/sent retry (MYK9-737) (#2477)
98. `243bfcc36` — test(e2e): target the header Account menu exactly, not the sidebar's (#2483)
99. `3293bec7a` — chore(docs): agent branches never build a guides preview (#2484)
100. `c516cfb5d` — fix(shows): a failed device read is an error for show lists and joins, not an empty join (MYK9-774) (#2485)
101. `40f263d84` — docs(access): access-request email cron runs every 5 minutes (MYK9-681)
102. `b94d94061` — fix(clubs): signed-out club page lists the server's shows, never the replica (MYK9-768) (#2486)
103. `f50ac8851` — fix(push): exhibitor show messages push to the club's secretaries only (MYK9-759) (#2487)
104. `02390cb2f` — fix(shows): publish the premium with the server's judges, only when this device agrees (MYK9-774) (#2488)
105. `213d46efb` — fix(shows): signed-out Find Shows and show page read the server, never the replica (MYK9-779, MYK9-780) (#2489)
106. `1aa2dc7fa` — fix(entries): an owner cannot withdraw or pull after the show has finished (MYK9-778) (#2490)
107. `ff5e64d3a` — docs(plan): archive the 2026-09 backlog burndown; MYK9-544 re-reviews done
108. `7d352b65d` — fix(entries): page the trial and class money reads past max_rows (MYK9-767) (#2491)
109. `d56d143df` — fix(offline): the readiness badge re-checks when the at-show page's own sync settles (MYK9-766) (#2492)
110. `988aac871` — test(e2e): composite contrast through every layer and settle fades first (MYK9-784) (#2493)
111. `0008033aa` — fix(payments): an entry the enrollment refunded follows a later Paid in Full or Payment Due (MYK9-773) (#2494)
112. `35d3181ce` — test(e2e): let the wizard's and cart's availability reads past the staging write guard (MYK9-757) (#2496)
113. `75997588c` — fix(platform): refuse deleting the platform_settings singleton and alarm on its absence (MYK9-781) (#2495)
114. `c948f409f` — fix(banner): flag-coloured text stays readable for any club flag (MYK9-765) (#2498)
115. `cf792fe52` — fix(shows): signed-out show reads and /shows/:id trials and classes never read the replica (MYK9-783) (#2497)
116. `a463df157` — fix(offline): a pending delete never reads as a missing row; server-deleted trials leave the device (MYK9-762) (#2499)
117. `8f728c11d` — chore(types): regenerate database types; RETURNS TABLE nullability and membership RPCs live in the overlay (#2500)
118. `d6dc7e2d2` — fix(banner): entry-blank PDF paints flag text in flagText, not the raw flag (MYK9-786) (#2501)
119. `af5000e82` — fix(registration): dark-mode marker clears AA when selected; wizard walks undo their cart adds (MYK9-782, MYK9-763) (#2502)
120. `e487214df` — fix(results): a guest's class and trial on the public results page come from the server, never the device replica (MYK9-785) (#2503)
121. `3235225a1` — fix(replication): show-day scoped reads throw on a failed device read (MYK9-774) (#2504)
122. `285db1b18` — test: Vitest hooks get braced bodies so a returned mock is never run as cleanup (MYK9-787) (#2505)
123. `6388d99ab` — fix(replication): the read layer and stores throw on a failed device read; joins fail open (MYK9-774) (#2506)
124. `9c187ae5f` — fix(replication): shows/dogs/clubs/waitlist/registration helpers throw; label joins fail open (MYK9-774) (#2507)
125. `e4a4a66df` — fix(replication): sync fails on an unreadable replica; inventory every remaining getAll() (MYK9-774) (#2508)
126. `1dd47dd22` — docs(vercel): a rate-limited guides status on an agent branch is quota, not a leak
127. `f648a3c82` — fix(registration): desk capacity check syncs or refuses a show whose structure is not whole on the device (MYK9-788) (#2510)
128. `dd1c24bc4` — fix(public): a ringside passcode session reads public pages as a guest, never the device cache (#2509)
129. `c6f7cd1fa` — fix(payments): Paid in Full: Online runs the server's entries cascade (MYK9-773) (#2511)
130. `31cf9e091` — chore(deps): patch sharp, hono, @hono/node-server and qs (Dependabot #123, #150-151, #156-159) (#2513)
131. `1e009ba4b` — fix(replication): a show index bounds the desk capacity reads by one show (MYK9-788) (#2514)
132. `3adba0364` — chore(types): regenerate for mark_enrollment_paid_online and drop its hand override (MYK9-773) (#2515)
133. `6afd86f82` — test(secretary): stub the entries query so a cold-store warn cannot outlive the file (MYK9-790) (#2516)
134. `2df1ba0f0` — fix(replication): a stale full-row write re-fetches its row and rebases or surfaces (MYK9-771) (#2512)
135. `78208c29c` — fix(qa): push-hold resolves the repo over REST so cloud sessions can push (#2517)
136. `411d27da6` — fix(auth): Trial Details is account-only; a ringside passcode session goes to sign-in (MYK9-789) (#2518)
137. `68f73f31e` — perf(replication): show-scoped readers read through the show index (MYK9-792) (#2519)
138. `bad61b564` — fix(replication): a stale re-fetch never rolls a row back, and a queue rewrite never revives an uploaded write (MYK9-794, MYK9-791) (#2520)
139. `f9b952e9f` — docs(audits): exhibitor task walk 2026-09-26 (E44–E53)
140. `fcc9cc0b1` — docs(walks): exhibitor walk stops at Stripe Checkout; name all three Stripe entry points (#2521)
141. `b559d2b5f` — fix(dogs): the delete pre-check names only readable entry columns, so Delete works again (MYK9-799) (#2522)
142. `9b731bc94` — fix(at-show,dogs): filter show-day entries and upcoming shows by TRIAL day, not show day (#2523)
143. `5983626cb` — chore(qa): CODEX_REVIEW_MODEL override for cheaper Codex re-checks (#2524)
144. `d41f976fe` — chore: delete dead list components (MYK9-818) (#2525)
145. `5531081b9` — Fix four exhibitor bugs from the 2026-09-26 exhibitor walk (#2527)
146. `4a931fca8` — fix(dogs): gate recent results on the entry's own trial day (MYK9-823) (#2528)
147. `0dec5810d` — fix(ringside): show a calm message when a passcode join fails (MYK9-829) (#2529)
148. `57c03d487` — fix: seed scoring e2e IndexedDB from DatabaseManager's own schema (MYK9-793) (#2530)
149. `8216a53c0` — feat(admin/users): list toolkit pilot — view tabs, filter bar, floating bulk bar (#2526)
150. `7e57780ab` — fix(admin/users): sort Roles by badge lead role; rename "New this week" (#2537)
151. `f439e9048` — fix(dogs): server-side blocking-entry count RPC shares soft_delete_dog's guard (MYK9-822) (#2532)
152. `1a9c76a86` — fix(rls): let an assigned judge see a draft show before it publishes (MYK9-833) (#2531)
153. `b62c344c6` — fix(secretary): mail-in entry wizard friction (MYK9-832) (#2545)
154. `00b1b0505` — fix(reports): tick each UKC Nosework Trial Report's own trial number (#2541)
155. `bd4a7ced1` — fix: show payment methods tile and wizard trial timezone (MYK9-830, MYK9-831) (#2543)
156. `2e8555daa` — feat(secretary): list toolkit rollout for show setup surfaces (#2534)
157. `99bac6c59` — fix(entries): mail-in handler with no person match no longer becomes the secretary (MYK9-824) (#2542)
158. `cb6aaa5a0` — fix(show-desk): section-aware labels, registry order, and same-trial move-up (MYK9-825/826) (#2549)
159. `ef4948ea1` — fix(ringside): keep offline passcode judge's ring open across a reload (#2544)
160. `cd74ada6c` — fix(show-desk): unbreak main test after #2542/#2549 handler-grouping conflict (#2551)
161. `e16f848a5` — fix(reports): fill UKC download forms with real trial/show data (MYK9-828) (#2547)
162. `8e9fbd2f2` — MYK9-840: remove unused saved views control and align Show Map filters (#2552)
163. `7663f0961` — Fix Message Center and preliminary results (MYK9-802, MYK9-805) (#2548)
164. `14c589556` — fix(admin-users): preserve rolling view cutoff in URL (#2553)
165. `05e74fdb8` — Unify Entry Management views, filters, and bulk actions with the list toolkit (#2540)
166. `a0a5fe959` — MYK9-846: make PDF text WinAnsi-safe at the shared chokepoints (#2554)
167. `c7e5b293e` — feat(admin/users): rebuild bulk account actions and bulk role editing (MYK9-835, MYK9-820) (#2536)
168. `4347e2e51` — MYK9-841: staff on-behalf mail-in entries are accepted on submit (#2550)
169. `003246e9f` — Fix three move-up dialog and delete-show confirm leftovers (MYK9-821) (#2558)
170. `7041cebff` — feat(exhibitor/payments): adopt shared list toolkit for the year filter (#2564)
171. `d97f3639c` — MYK9-797: Adopt the list toolkit on People and Club members (#2562)
172. `d938339c0` — MYK9-804: Fix My Shows paid banner to use row-level, filter-independent money truth (#2560)
173. `824a3cda1` — MYK9-847: AKC entry form grid skips withdrawn/scratched/superseded entries (#2559)
174. `56f938f30` — MYK9-813: adopt the shared list toolkit on secretary tools (volunteers, messages, pipeline activity, dashboard tasks) (#2563)
175. `ffd8c8cb3` — MYK9-814 (part 1): admin consoles list-toolkit rollout (role requests, onboarding, templates) (#2565)
176. `f74c7e6ff` — MYK9-845: UKC entry form grid skips withdrawn/scratched/superseded entries (#2555)
177. `940907063` — MYK9-842: close same-day, same-name trial collision + future-only-trial check-in regression tests (#2556)
178. `b9977896f` — MYK9-796: Adopt the shared list toolkit on Dogs, health, and training records (#2561)
179. `61936b9c3` — chore(types): regenerate for count_blocking_entries_by_dog and drop its hand override (MYK9-822) (#2567)
180. `1e5486348` — MYK9-812 (4/4): Results Control bulk bar on the list toolkit (#2568)
181. `944809f2c` — fix(ops): close open Codex findings on walk-residue cleanup (MYK9-734) (#2538)
182. `92b3e5487` — MYK9-812 (1/4): people roster on the list toolkit (#2572)
183. `42ab5035b` — MYK9-812 (3/4): self check-in bulk bar on the list toolkit (#2569)
184. `13dc44111` — MYK9-798: adopt the list toolkit on Shows, Clubs, and Trials/Results tabs (#2566)
185. `400f73ac3` — MYK9-812 (2/4): cockpit schedule on the list toolkit (#2570)
186. `ad9df4a4b` — MYK9-812: OpenSpec proposal for show-day desk list toolkit (needs owner approval) (#2557)
187. `430e8f2a3` — MYK9-850: delete the mock-data judge check-in and gate steward screens (#2571)
188. `748ac7d68` — MYK9-803: offer Add a new dog to every account in the entry wizard (#2576)
189. `f078dc061` — feat(askq): Tera, an animated avatar for AskQ (#2573)
190. `bda97e4d2` — MYK9-800: gate self-check-in on the visibility cascade, add trial context + back link (#2577)
191. `ed55590d0` — MYK9-804: fix When-tab counts and Receipts wording on My Shows (#2578)
192. `edec65c3c` — fix(deps)(deps): bump @supabase/supabase-js in the supabase group (#2480)
193. `0886e1236` — fix(deps)(deps): bump the npm-minor-patch group across 1 directory with 18 updates (#2580)
194. `438a6c493` — MYK9-858: mark onboarding complete before leaving via final-step links (#2581)
195. `23cf05c4a` — fix(shows): reassure the address is still saved when Locate address fails (MYK9-857) (#2582)
196. `16edc76ef` — fix(clubs): explain pending club authorization instead of a bare "Unauthorized" (MYK9-855) (#2583)
197. `33de1e6a9` — MYK9-856: add an exit control to show Preview (#2584)
198. `6eeee3986` — MYK9-854: role-aware dog visibility on the Dogs page (#2579)
199. `e1a127f36` — MYK9-862: remove "Request additional access" from the sidebar (#2585)
200. `fe5ed5f0b` — MYK9-853: email and password on one sign-in screen (#2575)
201. `5e6a7bda2` — MYK9-849: disable overrides controls offline instead of failing silently (#2589)
202. `4d7eae56d` — chore(deps-dev)(deps-dev): bump turbo in the npm-minor-patch group (#2591)
203. `1c51a1c59` — MYK9-864: "Needs a connection" on Wi-Fi with no internet (#2592)
204. `e1258a76f` — MYK9-861: Normalize bare domains to https:// on the new club request form (#2586)
205. `e291d9eb3` — MYK9-860: show club admin(s)/secretary(ies) under the club name (#2588)
206. `c72b0d787` — MYK9-859: notify the requester when their club is approved, show roles on My Account (#2587)
207. `ffe0fda74` — fix(review-gate): stop fetching the unused statusCheckRollup (#2594)
208. `021442de5` — fix(deps)(deps): bump @supabase/supabase-js in the supabase group (#2590)
209. `237050b4c` — MYK9-865: Results Control keeps cached settings when a refresh fails (#2593)
210. `c889971b5` — chore(types): sync applied Supabase RPC declarations (#2596)
211. `a57829731` — docs(go-live): record Oct 10 deployed passcode walk (#2598)
212. `6b4921ad5` — feat(perf): benchmark myK9Show route performance (MYK9-843) (#2597)
213. `d5d071387` — docs(openspec): archive MYK9-843 benchmark change (#2599)
214. `691732f8d` — docs(audit): record first show-day cross-role walk
215. `4741c0ae1` — docs(audit): link show-day findings
216. `452f69b23` — docs(go-live): record Oct 10 test show rehearsal (#2600)
217. `d1cb3fee4` — fix(askq): handle dogs without legacy name (#2601)
218. `d107534a4` — feat(shows): per-show junior handler fee setting, no pricing (MYK9-662 slice A) (#2604)
219. `d2744ef3b` — feat(shows): set the junior handler fee in the show creation wizard (MYK9-662 slice A2) (#2605)
220. `447a2c0fd` — fix(ringside): restore draft passcode and offline reload (#2603)
221. `574f90ea9` — fix(show-day): align exhibitor and secretary entry facts (#2602)
222. `d9d74e0cc` — chore(supabase): refresh junior handler fee view types (#2606)
223. `2354cca22` — feat(dogs): breed picker first-letter navigation; registration error guidance (MYK9-883, MYK9-885) (#2607)
224. `a3eeb8796` — fix(reports): keep a print margin inside the report page (MYK9-886) (#2612)
225. `2c97c559d` — fix(show-wizard): trial date defaults to show date; clarify date range and add-trial actions (MYK9-884, MYK9-892, MYK9-888) (#2609)
226. `a00e89961` — fix(show-wizard): early club permission check, clearer host-club choice, map pin (MYK9-887, MYK9-889, MYK9-890, MYK9-893) (#2608)
227. `e906fddb0` — fix(clubs): guide club creation through remaining sections (MYK9-891) (#2610)
228. `9503a524b` — fix(shows): let club admins open the show wizard (MYK9-895) (#2613)
229. `187e6434c` — fix(deploy): pick the newest green main commit deterministically and verify prod serves it (MYK9-896) (#2614)
230. `f595deeb2` — fix(reports): fit the Show Flyer to one printed sheet (MYK9-894) (#2615)
231. `3bd1247ed` — feat(entries): junior handler fee pricing for owner juniors and secretary override (MYK9-878 slice B) (#2611)
232. `f73b96edb` — chore(supabase): refresh types after junior handler fee slice B migration (MYK9-878) (#2617)
233. `bdb2a6087` — fix(admin/users): re-check bulk retry eligibility against the live roster (MYK9-835, MYK9-820) (#2616)
234. `df6656cf4` — docs(plan): secretary CRUD consolidation plan (MYK9-897) (#2619)
235. `e6969be4a` — feat(secretary): Add Entry quick link on the dashboard (MYK9-902) (#2620)
236. `257003f42` — refactor(entries): one remove-entry dialog, delete unreachable class-page edit dialog (MYK9-901) (#2621)
237. `ed553aab4` — feat(shows): visible Edit show button in show page header (MYK9-904) (#2623)
238. `7a15ed988` — feat(entries): exhibitor declares a junior handler at card checkout (MYK9-879 slice C) (#2618)
239. `bb3e4b437` — chore(shows): delete dead ShowMainCard (MYK9-903) (#2624)
240. `f1010a732` — fix(clubs): refresh role scopes after a club is created so its creator can edit it (MYK9-905) (#2625)
241. `e7c4bd38f` — refactor(shows): split ShowManagementShell back under 500 lines (#2630)
242. `1b421b52d` — feat(shows): create a judge in place on Show Edit, panel-owned (MYK9-908) (#2627)
243. `282a3f80e` — fix(results): date fallback, gated dog-page polling, no error flash during profile load (MYK9-882, MYK9-881) (#2632)
244. `e648c6b0a` — fix(ui): shared Dialog and AlertDialog join the overlay stack (MYK9-910) (#2629)
245. `1cbcd6a43` — fix(settings): failed settings reads over a dead uplink mark the server unreachable (MYK9-866) (#2631)
246. `5d36c16c9` — fix(replication): never evict a warm replica on a zero-row full sync without independent proof (MYK9-880) (#2628)
247. `e3837f866` — fix(security): canonicalize website URLs on save and render (MYK9-863) (#2633)
248. `628d0aba9` — fix(routes): legacy /trials/:trialId/classes waits for the trial (MYK9-907) (#2634)
249. `112ebda86` — feat(classes): one way to add classes (MYK9-899) (#2622)
250. `e24e71541` — fix(clubs): let a club's creator SELECT it so INSERT RETURNING works (#2636)
251. `23a3c0793` — feat(setup): Edit and Delete on Setup trial and class rows (#2635)
252. `2ab41f9aa` — feat(list-toolkit): filters a novice can read, 13 filters cut (MYK9-906) (#2626)
253. `69086be3f` — fix(deploy): ask CI greenness per commit in the deploy picker (#2637)
254. `8386553e6` — fix(clubs): a created club no longer triggers "discard unsaved changes" on the way to its page (#2638)
255. `d68ce1573` — feat(admin): list clubs awaiting authorization on Onboarding (MYK9-855) (#2639)
256. `8a88ff6fc` — fix(shows): a deleted show leaves the list, and deleting it again is not an error (#2640)
257. `45bdb6fcb` — fix(shows): the Managing tab lists only the viewer's own clubs' shows (#2642)
258. `238bc5030` — docs(plan): one standard for create, edit and delete (#2643)
259. `cd69137be` — docs: core-object UI consistency audit and plan (#2644)
260. `619f57059` — docs(plan): page actions live only in the header Actions menu (#2645)
261. `34293ac0a` — docs: add-panels walk every tab; duplicate-actions audit (#2646)
262. `3cf2f515b` — feat(db): soft-delete and restore RPCs for every core object, money guard, direct-write block (MYK9-915) (#2648)
263. `ea6528f9b` — docs(plan): Delete sits at the far left of the Edit panel footer (#2647)
264. `340501e75` — docs(plan): owner decisions 14-20 for duplicate actions, and Phase 9 (#2650)
265. `f2f736dd8` — fix(ui): one wording and quick-win pass across the core objects (MYK9-917) (#2649)
266. `058bd4f54` — fix(dogs): owner/co-owner secretary gets the full dog view (MYK9-912) (#2653)
267. `b37e7a36c` — fix(show-day): Show Day Pull uses the shared pull mutation (MYK9-918) (#2654)
268. `3a5b44847` — feat(db): distinct SQLSTATEs for not found vs permission on delete RPCs (MYK9-922) (#2656)
269. `e2a1c0b81` — perf(show): split the entry chunk — PDF publishing, ringside UI, dog page (MYK9-844) (#2652)
270. `e881882f2` — fix(move-up): one shared target rule, same trial and free seat (MYK9-920) (#2657)
271. `582136a2d` — fix(db): soft-delete guards for entries and show-managed person deletes (MYK9-921, MYK9-923) (#2658)
272. `e6087635c` — fix(show-map): Review entry links to Entries instead of approving in place (MYK9-919) (#2659)
273. `41134b494` — feat(classes): merge Class Management into Setup → Classes (MYK9-924) (#2651)
274. `c8d44ae51` — feat(delete): one delete path, plain-language confirm dialog, and Undo (MYK9-922) (#2655)
275. `68d93b5b8` — fix(replication): deleted last show clears from the replica (MYK9-913); pin MYK9-911 (#2660)
276. `2ec0603ae` — feat(actions): every page action in the header Actions menu; Edit first on every row menu (MYK9-928) (#2662)
277. `f9cdf8a2b` — fix(delete): count every account's failed uploads; make discard cleanup one transaction (MYK9-925) (#2663)
278. `0ab3692de` — feat(ui): feedback consistency for save paths (MYK9-926) (#2661)
279. `38798a6fa` — feat(ui): detail pages share one shell, hero, breadcrumb and not-found state (MYK9-930) (#2664)
280. `118bad64c` — feat(crud): Delete in the Edit panel footer, off header menus, gates match the server (MYK9-927) (#2666)
281. `61c8cf1a1` — feat(forms): tab-error routing, one Person form, shared date/time, Add panels walk every tab (MYK9-931) (#2667)
282. `342c68e0c` — feat(lists): trimmed toolbar, shared list kit, remembered view, named bulk buttons (MYK9-929) (#2665)
