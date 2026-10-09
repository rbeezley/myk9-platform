# Daily commit review — October 9, 2026

source: codex. **No new actionable defect confirmed in the reviewed range.** Three prior findings have focused closure evidence. Five P2 verification prerequisites remain; none is a newly reproduced product failure. No application code changed.

## Window and accounting

- Start exclusive: `b69df7cc9879192f20ed41aeb4625069281c0507`, from the primary checkout's shared daily-commit-review row, including its uncommitted latest stamp.
- End inclusive / baseline: `d97cbec6b7d41204d9cbdba51dfd3f67a0212479`. Both fetches of origin/main agree. Local primary main was behind and was not moved.
- Window: **2026-10-08T10:07:57Z–2026-10-09T10:04:21Z**, 41 commits / 388 changed files. No gap or 24-hour fallback. Time before the first new commit is an idle interval, not missing coverage.
- Lifecycle counts: **new 0; unchanged 1; resolved 3; duplicate 0; rejected 2; blocked 4**. Rejected hypotheses are not findings or Linear work. Eight canonical records reconciled; five unresolved, all P2.
- Linear: **created 0; modified 2; closed 0**. MYK9-992 restored Done → In Review for its already specified proof gate; MYK9-1050 received the cross-linked closure evidence. Unchanged issues were not rewritten.

Every finding below is `source: codex`, owned by Richard Beezley, and uses the end SHA as its current baseline. Last-seen dates refer to evidence reconciliation, not a claim that a live failure was reproduced today. Confidence is high in the evidence described. Linear carries the full execution contract.

## P1 — newly resolved

### [MYK9-1050](https://linear.app/myk9-platform/issue/MYK9-1050) — resolved: authoritative placements reach the scoring device

Product replication/recovery; source High. First seen October 8; last checked October 9. #2827 clears embedded pending state on acknowledgment and accepts authoritative clean-row data; #2834 repairs previously stuck rows; #2847 refreshes staff show scopes.

Fresh tests include `apps/myk9show/src/services/replication/ReplicatedEntriesTable.ackedWriteSync.test.ts`, entries conflict tests and package mutation-row/atomic batch/stuck-row tests. All pass. The decisive operational proof is the **October 8 23:10 UTC comment on [MYK9-1055](https://linear.app/myk9-platform/issue/MYK9-1055)**: production build `0401eee24`, same browser and affected class, Willow 1st / Cooper 2nd, IndexedDB final_placement 1/2, zero remaining clean-wrapper/pending-data rows. The earlier scope-refresh gap is separately MYK9-1064, fixed by #2847. This is focused production readback plus tests, not merge-only resolution. This audit did not repeat live scoring or a separate print walkthrough. No closure action remains on the original class-page criterion.

## P2 — unresolved

### [MYK9-992](https://linear.app/myk9-platform/issue/MYK9-992) — blocked: cross-role queue-position readback

Remaining classification verification prerequisite; source Medium, historical UX/recovery. First seen September 28 under MYK9-868; last October 9; fifth daily reconciliation of this scope.

#2824 repairs the checked-in/unscored null-position display. `apps/myk9show/src/features/at-show/AtShowMyEntriesToday.tsx:103` now renders queue information independently of the check-in action; `myAtShowEntryDetails.helpers.ts:213` supplies pending state when no run order exists. `AtShowMyEntriesToday.queue.test.tsx` passes in this run. Expected and now demonstrated locally: canonical place or truthful pending wording, with finished/in-ring/pulled state-only controls.

The issue had moved to Done without its required deployed comparison. Full issue/comments, MYK9-995 and #2824 were checked; October 5's walk predates this repair and explicitly did not exercise the exhibitor callout. The PR leaves deployed proof unchecked. Restored In Review with the passing implementation evidence preserved. Impact: remaining uncertainty about cross-role arrival/queue behavior, not a reproduced current display failure.

Next / exact closure: authorized day-of entry across secretary, judge and cold exhibitor UI, including null/gapped-order cases, SQL/replica readback, build identifier and expected position/pending text. Record state-only negative controls and cleanup, or an explicit owner-approved replacement for this proof. No fixture write was performed.

### [MYK9-834](https://linear.app/myk9-platform/issue/MYK9-834) — unchanged: expired-token offline identity rehearsal

Verification prerequisite; source Medium. First September 26; last October 9. Existing In Review retained. Same-user identity fix at `apps/myk9show/src/hooks/useAuth.ts:175` and `apps/myk9show/src/features/at-show/useRehydrateRingsideGrant.ts:142` is unchanged. Full issue and latest comments retain the unrecorded passcode rehearsal. A normal offline-save test is not the expired-token/reload proof.

Next / exact closure: authorized deployed refocus → token expiry → full offline reload → durable score → reconnect upload, with build and local/server identity evidence plus revocation controls. Impact is uncertainty in venue recovery; no new auth or score-loss failure alleged.

### [MYK9-1021](https://linear.app/myk9-platform/issue/MYK9-1021) — blocked: deployed secretary notice/dedupe proof

Verification prerequisite; source Medium. First October 6; last October 9; fourth daily reconciliation. Existing In Review retained. `apps/myk9show/supabase/functions/cron-waitlist-expiration/offerStep.ts:64` and `supabase/migrations/20261007012700_myk9_1021_mail_in_waitlist_head_notice.sql:26` are unchanged. Prior implementation, applied migration and CI proof stand; the latest recorded evidence still leaves the notification-safe human-facing gate open. MYK9-1041's type closure is distinct.

Next / exact closure: authorized test-account free spot with a mail-in head and online dog behind produces exactly one actionable secretary notice; repeated evaluation does not duplicate it or skip the head. Record build, row states/counts and cleanup. Impact is unverified notification/recovery behavior, not an asserted new failure. No cron, notification or fixture action performed.

### [MYK9-1023](https://linear.app/myk9-platform/issue/MYK9-1023) — blocked: deployed offline score/readback proof

Verification prerequisite after UX repair; source High retained, canonical P2. First October 6; last October 9; fourth daily reconciliation. Existing In Review retained. `apps/myk9show/src/features/at-show/quickAdvancePanel.tsx:112` checks queue/server matching; :221 handles acknowledgment toast. Source unchanged. Recorded automated proof stands; the full issue/comments still require deployed offline SQL/readback.

Next / exact closure: an authorized changed-score save offline shows local/pending while authoritative SQL stays old, then reconnect acknowledges only after score/details match. Record build, sanitized versions and cleanup. Global/off-panel toast remains a non-goal. Impact is remaining uncertainty about local-versus-server assurance; no new lost-score claim or live scoring operation.

### [MYK9-639](https://linear.app/myk9-platform/issue/MYK9-639) — blocked: owner-deferred Stripe TEST replay

Verification prerequisite P2/source Medium; historical financial High preserved separately. First September 17 (audit September 19/20); last October 9. Existing Backlog retained. `apps/myk9show/supabase/functions/stripe-webhook/paymentReconciliationLoader.ts:161` is unchanged. Prior loader/chain proof stands. Owner explicitly deferred the controlled TEST replay until after October 10.

Next / exact closure: approved one-/two-hop checkout and payment-link replay, root paid once, matching ledger/report/offline readback and negative controls under the approved refund policy. Impact is unverified deployed end-to-end settlement, not a new financial defect. No payment/refund operation performed.

## P2 — newly resolved

### [MYK9-1051](https://linear.app/myk9-platform/issue/MYK9-1051) — resolved: toolbar tests establish their viewport

Test/harness; source High retained, canonical P2/Medium. First October 8; last October 9. #2828 repairs the viewport leak. October 8 14:59 UTC issue evidence records 10/10 shuffled targeted passes, passing focused coverage assertions (standalone coverage command exits 1 for unrelated global thresholds), original-seed targeted pass and six green full-suite CI shards. This run independently passes the changed toolbar tests within the 124-file shuffle. Single-file seed replay alone was not treated as full-suite proof. No remaining action.

## P3 — newly resolved

### [MYK9-981](https://linear.app/myk9-platform/issue/MYK9-981) — resolved under explicit owner-approved replacement proof

UX/recovery verification; source Low. First October 3; client residual October 4; last October 9. `apps/myk9show/src/features/admin-system-health/useRefundRequests.ts:73` invalidates both request and alert lists. The October 9 00:28 UTC owner comment records applied server/backfill evidence and client #2725 deployed in `975a7f5`. With no open requests, the owner explicitly accepts the real-QueryClient positive/negative regression tests instead of manufacturing a live board action. This revised acceptance is recorded in Linear; no reopening or fresh financial/admin mutation. No remaining action.

## Subsequent fixes and rejected hypotheses

- Placement repair was completed across #2827, #2834 and #2847, rather than attributing the already repaired embedded-flag/cursor problem to current main.
- #2824 repairs the old checked-in queue display; only its existing proof gate remains. #2828 repairs the prior shuffle failure.
- Two candidate hypotheses rejected after complete relevant-path reads: late-entry owner-address guidance is explicitly nonblocking and rendered on the existing class selection surface; the fill-owner RPC's wider staff access matches the authorized show-manager/people access contract. Neither is filed or counted as an unresolved defect.
- Results-tab verification/sign-off expansion is deliberately staged under its existing plan; deferred scope was not manufactured into a new defect. All actionable records encountered in the carried-forward ledger already have canonical Linear issues.

## Checks and verification limits

- Isolated worktree `/private/tmp/myk9-ncr-20261009`, branch `codex/ncr-review-20261009`. Bootstrap/package build passed (12 cached package tasks).
- All **124 existing changed app test files: 1,472 tests passed**, shuffled seed `1791539923025`, exit 0, 29.92 seconds. Deleted test files excluded. Exact list/log retained in `.logs/changed-tests.txt` and `.logs/changed-tests.log`.
- **4 replication-package files / 67 tests passed**, seed `1791540026780`, exit 0; `.logs/replication-tests.log`. Combined **128 files / 1,539 tests passed**.
- `git diff --check b69df7cc..HEAD` passed. Reviewed source changes, relevant complete implementations and schemas, INTENT, scorecard, prior report/memory, QA findings and exact Linear records. SQL/function auth and concurrency changes reviewed against predecessors and behavioral tests.
- No full app suite, fresh typecheck, browser walkthrough or live SQL performed. Behavioral SQL and edge-runtime tests were reviewed but not executed. Recorded production/CI/owner evidence above is attributed, not claimed as a fresh audit execution. Registry-list changes were inspected as code/data, not independently certified against external registries.
- Test reporter buffered output until completion; process inspection confirmed no runner remained. There was no test timeout/failure. Initial sandbox network lookup failed; authorized fetch/bootstrap succeeded. No unresolved environment blocker.
- No application edits, PR, push, merge, deployment, database write, notification or shared-fixture mutation. Report and cursor are uncommitted audit artifacts; primary checkout's other changes preserved. Automation memory and shared cursor carry this same finished boundary.

## Commit inventory (oldest first)

- `6d03d54b9` — fix(db): online entries get the next run order (MYK9-1048) (#2818)
- `556fd9088` — feat(db): results verified against paper, fingerprint-guarded (MYK9-1045) (#2819)
- `d412d0514` — fix(entries): class/trial Entry Forms links land on that scope's forms (#2820)
- `c338e7d36` — fix(paper-scoring): cap time at 6 digits, live format, block Q over class time limit (#2821)
- `f36c74d03` — fix(db): health probes read pg_cron history once, not per job; hourly 7-day retention (MYK9-1052) (#2832)
- `e93317d36` — fix(entries): keep the list on screen during background syncs; focus follows the form on narrow screens (#2828)
- `be2c01110` — chore(types): regenerate database types after the MYK9-1045 / MYK9-1048 push (#2831)
- `35e20bd25` — fix(entries): only the newest entries load may write (#2829)
- `80f17fbc2` — fix(at-show): checked-in unscored dogs show place in line or a pending note (MYK9-992) (#2824)
- `975a7f5fb` — fix(replication): a synced entry takes the server row, including placements (MYK9-1050) (#2827)
- `ca78f1381` — fix(sync): throttle idle-tab sync passes (MYK9-1054) (#2833)
- `2ce8c1c7f` — feat(reports): show Before / During / After as visible sections with print status (MYK9-1033) (#2823)
- `bb75b88bd` — fix(replication): repair rows stuck at a pending data flag (MYK9-1055) (#2834)
- `df82c7c01` — test(e2e): one saved sign-in per test account per run; preflight signs its check out (MYK9-1056) (#2835)
- `b817e9376` — fix(ci): public artifacts never carry Playwright trace archives (MYK9-1057) (#2836)
- `c5370eded` — fix(dogs): dog edits refresh the roster immediately after the local write (MYK9-1061) (#2840)
- `d362816ac` — feat(registration): explain greyed-out dogs; warn on implausible dog DOB (MYK9-1060) (#2839)
- `a8623d585` — feat(registration): warn before leaving the add-entry wizard with no entry (MYK9-1058) (#2841)
- `422ea86d9` — feat(show-home): Enter paper scores action with class picker (MYK9-1062) (#2843)
- `023711154` — docs(plan): Actions menu groups, a Create group, no page ⋮ (MYK9-1063)
- `ffdc67f64` — docs(plan): fold the Actions menu plan into the CRUD standard as decision 6 / Phase 6 (MYK9-1063)
- `0401eee24` — feat(actions): Actions menu sections with icons and a Create group on every page (MYK9-1063) (#2844)
- `9885f0e5a` — feat(actions): person, dog and club page actions move from the card ⋮ to the header menu (MYK9-1063) (#2845)
- `37c187090` — fix(show-edit): list assigned judges who are not qualified for the org (#2842)
- `5058b0de8` — fix(show-day): complete armbands, combined awards and day limits (#2806)
- `2b6196134` — fix(deps)(deps): bump @supabase/supabase-js (#2767)
- `bdd2498ba` — feat(dogs): complete AKC and UKC breed lists, add UKC AMBOR (#2846)
- `cc9091a3c` — feat(actions): complete the object sections with links to existing surfaces (MYK9-1063) (#2848)
- `2852d0cf0` — docs(plan): archive the CRUD standard plan; point references at docs/archive (MYK9-1063) (#2849)
- `9ee5cc172` — fix(entries): refresh a show's entries when staff open it (MYK9-1064) (#2847)
- `43ff94cec` — fix(deps)(deps): bump the npm-minor-patch group across 1 directory with 16 updates (#2850)
- `1ca9e2ed9` — docs(secretary-guide): trial heading ⋮ has Edit Trial; Delete trial is in the edit panel
- `14c66ddcd` — fix(askq): regenerate document assets for the secretary-guide edit (#2853)
- `778e4aa8a` — fix(page-header): truncate the breadcrumb instead of widening phones (MYK9-1065) (#2852)
- `f8e8ec243` — fix(entries): dedupe get_account_today_entries and show-entries reads (MYK9-1066) (#2851)
- `6a43376a9` — test(e2e): one shared horizontal-overflow helper for every geometry spec (MYK9-1068) (#2856)
- `1f86d460a` — fix(dogs): queue dog edits through the replication mutation queue (MYK9-1067) (#2855)
- `685980abc` — feat(entries): require the owner's address on AKC entries (MYK9-1010) (#2857)
- `b1d6f1e7a` — feat(results): Results tab as class list + detail (MYK9-1031, part 1) (#2791)
- `1dab903de` — feat(show-map): Overview hands finished classes to Results (MYK9-1032) (#2854)
- `d97cbec6b` — fix(dogs): queue bulk dog status changes through the mutation queue (MYK9-1070) (#2858)
