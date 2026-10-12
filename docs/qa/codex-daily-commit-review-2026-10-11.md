# Daily commit review — October 11, 2026

source: codex. **Two P2 records require action: DQ downstream readers and failed Clear start feedback.** Five prior verification prerequisites remain open. No application code changed.

## Window and accounting

- Start exclusive: `d97cbec6b7d41204d9cbdba51dfd3f67a0212479`, from the shared daily-commit-review row.
- End inclusive / current baseline: `7021fe423f8bbf715fcec40de6eee8aa5e43868d`; fresh origin/main fetch agrees.
- Window: **2026-10-09T10:04:21Z–2026-10-11T10:15:37Z**. 43 commits; 351 changed files. No gap or 24-hour fallback. The October 10 scheduled-run timestamp is not a completed review cursor: the shared row and latest completed memory both stop October 9. This run explicitly covers the entire intervening range.
- Lifecycle counts: **new 2; unchanged 1; resolved 0; duplicate 0; rejected 2; blocked 4**. New means new residual evidence in this audit; MYK9-1011 reuses the existing canonical issue. Rejected hypotheses are not product findings.
- Severity: **P0 0 / P1 0 / P2 7 / P3 0 unresolved**. Classifications: 2 product/UX defect records (one also carries scoped export verification); 5 remaining verification prerequisites.
- Linear: **created 1 (MYK9-1097); modified/reopened 1 (MYK9-1011); closed 0**. All actionable evidence is in Linear, not report-only. Existing five issues were read in full with recent comments and left in their current states.

All records are tagged **source: codex**, owned by Richard Beezley, with last evidence reconciliation October 11 and the baseline above. A last-seen date is not a claim of a fresh live failure. Canonical P2 derives from confusion/recovery or incomplete verification; no stored-result corruption or show-day outage was demonstrated.

## P2 — new residual evidence

### [MYK9-1011](https://linear.app/myk9-platform/issue/MYK9-1011) — new: downstream DQ contract incomplete

Classification: product/UX defect plus export-verification prerequisite. Source Medium; confidence high for local/source proof. Original first seen October 4; residual first/last seen October 11; first nightly occurrence. Reopened Done → Todo, retaining completed historical scoring/catalog scope and owner.

Introduced by f3bc161ed / [#2892](https://github.com/rbeezley/myk9-platform/pull/2892). A typed synthetic platform result with `resultStatus:'disqualified', resultText:'DQ'` passed into the real `normalizeExhibitorResult` returns `nq`; `computePerformanceStats([result],[])` reports `nq:1,total:1` and no DQ bucket. An excused control passes. The new assertion expecting disqualified fails. The dog Statistics chart consequently presents this result as NQ. This is derived misclassification, not a stored-score change.

Exact paths: [apps/myk9show/src/services/performanceStatsEngine.ts:80](https://github.com/rbeezley/myk9-platform/blob/7021fe423f8bbf715fcec40de6eee8aa5e43868d/apps/myk9show/src/services/performanceStatsEngine.ts#L80) (fallback at :86, breakdown :123); [apps/myk9show/src/components/dogs/DogDetails/Statistics/charts.tsx:105](https://github.com/rbeezley/myk9-platform/blob/7021fe423f8bbf715fcec40de6eee8aa5e43868d/apps/myk9show/src/components/dogs/DogDetails/Statistics/charts.tsx#L105). Other confirmed gaps already noted in the original merge comment are now explicit acceptance items in the same canonical issue: the active inline class editor omits DQ and its reason (`components/classes/ClassResultsTable/QualificationCell.tsx:85`, `constants.ts:27`); AskQ's `get_entry_results` schema excludes disqualified ([supabase/functions/_shared/askq/toolDefinitions.ts:64](https://github.com/rbeezley/myk9-platform/blob/7021fe423f8bbf715fcec40de6eee8aa5e43868d/supabase/functions/_shared/askq/toolDefinitions.ts#L64)) although its executor filters the exact status (:148).

The issue also owns the concrete **AKC electronic-format verification prerequisite**: [packages/secretary/src/results/formatters/akcEntryOutcome.ts:186](https://github.com/rbeezley/myk9-platform/blob/7021fe423f8bbf715fcec40de6eee8aa5e43868d/packages/secretary/src/results/formatters/akcEntryOutcome.ts#L186) deliberately sends EXCU/EXO for DQ because the repo lacks authoritative distinct-code guidance. This is **not** reported as a proven wrong AKC code. The prior merge comment required confirmation before launch; the gate is now in the issue description.

Next action / closure: preserve a distinct DQ engine/chart bucket; test mixed Q/NQ/EX/DQ totals and labels; render the fixture; allow DQ plus required reason in the existing class workflow or link to its canonical scoresheet, proving persist/reload; test the exact AskQ DQ filter and record separately authorized deployed smoke; obtain authoritative AKC mapping evidence plus a generated-file fixture. Do not close on merge or unrelated green tests. No new surface is required.

Dedup: archived-inclusive workflow/status/engine/statistics searches, exact issue and merge comment, current main and QA registry. Existing issue scope explicitly requires all readers, so no duplicate was created. Full execution contract and synthetic proof are in Linear.

### [MYK9-1097](https://linear.app/myk9-platform/issue/MYK9-1097) — new: failed Clear start has no feedback

Audit alias NCR-2026-10-11-01; canonical ID MYK9-1097. UX/recovery, source Medium, high confidence, first/last seen October 11, first run. Introduced by 40352b788 / [#2882](https://github.com/rbeezley/myk9-platform/pull/2882). Affects secretary show cockpit class actual-start correction, all viewports.

[apps/myk9show/src/features/show-map/cockpit/ClassActualStartEditor.tsx:35](https://github.com/rbeezley/myk9-platform/blob/7021fe423f8bbf715fcec40de6eee8aa5e43868d/apps/myk9show/src/features/show-map/cockpit/ClassActualStartEditor.tsx#L35) catches a rejected clear and sets an error, but the `!editing` early return (:49–76) omits the alert; only the edit branch (:118) renders it. Rendered the real component using the repository custom render, `hasStart=true`, and a synthetic rejected `replicatedClassesTable.updateClass`. Clicking Clear start calls the expected `{actual_start_time: undefined}`, but `screen.queryByRole('alert')` returns null. The new feedback assertion fails; all five existing editor tests pass in the same run. The temporary diagnostic test was removed afterwards.

Expected: visible accessible failure feedback and retry. Observed: silent failure and re-enabled button. Impact: secretary cannot tell why the incorrect start remains; no demonstrated data loss.

Next action / exact closure: show failure in the current branch, preserve time and retry; add passing rejected-clear and successful-retry tests plus edit/save controls, and record rendered-component/browser failure → feedback → retry proof. Keep the established replicated mutation. Full reproduction, acceptance, owner and closure gate are in Linear.

Dedup: archived-inclusive file, workflow, error-text and cause searches; read MYK9-1086, MYK9-69 and MYK9-926. Their completed redesign, old scheduled-time mapping and wrapper feedback scopes are distinct. New issue relates to MYK9-1086; fresh main contains no subsequent fix.

## P2 — carried verification gates

### [MYK9-992](https://linear.app/myk9-platform/issue/MYK9-992) — blocked: cross-role queue-position readback

Remaining classification verification prerequisite; source Medium, historical UX/recovery. First seen September 28 under MYK9-868; last October 11; sixth daily reconciliation of this scope.

#2824 repairs the checked-in/unscored null-position display. [apps/myk9show/src/features/at-show/AtShowMyEntriesToday.tsx:103](https://github.com/rbeezley/myk9-platform/blob/7021fe423f8bbf715fcec40de6eee8aa5e43868d/apps/myk9show/src/features/at-show/AtShowMyEntriesToday.tsx#L103) now renders queue information independently of the check-in action; `myAtShowEntryDetails.helpers.ts:213` supplies pending state when no run order exists. `AtShowMyEntriesToday.queue.test.tsx` passed in the prior run. Expected and now demonstrated locally: canonical place or truthful pending wording, with finished/in-ring/pulled state-only controls.

At the prior audit, the issue had moved to Done without its required deployed comparison. Full issue/comments, MYK9-995 and #2824 were checked; October 5's walk predates this repair and explicitly did not exercise the exhibitor callout. The PR leaves deployed proof unchecked. Previously restored In Review with the passing implementation evidence preserved. Impact: remaining uncertainty about cross-role arrival/queue behavior, not a reproduced current display failure.

Next / exact closure: authorized day-of entry across secretary, judge and cold exhibitor UI, including null/gapped-order cases, SQL/replica readback, build identifier and expected position/pending text. Record state-only negative controls and cleanup, or an explicit owner-approved replacement for this proof. No fixture write was performed.

### [MYK9-834](https://linear.app/myk9-platform/issue/MYK9-834) — unchanged: expired-token offline identity rehearsal

Verification prerequisite; source Medium. First September 26; last October 11. Existing In Review retained. Same-user identity fix at [apps/myk9show/src/hooks/useAuth.ts:175](https://github.com/rbeezley/myk9-platform/blob/7021fe423f8bbf715fcec40de6eee8aa5e43868d/apps/myk9show/src/hooks/useAuth.ts#L175) and [apps/myk9show/src/features/at-show/useRehydrateRingsideGrant.ts:142](https://github.com/rbeezley/myk9-platform/blob/7021fe423f8bbf715fcec40de6eee8aa5e43868d/apps/myk9show/src/features/at-show/useRehydrateRingsideGrant.ts#L142) is unchanged. Full issue and latest comments retain the unrecorded passcode rehearsal. A normal offline-save test is not the expired-token/reload proof.

Next / exact closure: authorized deployed refocus → token expiry → full offline reload → durable score → reconnect upload, with build and local/server identity evidence plus revocation controls. Impact is uncertainty in venue recovery; no new auth or score-loss failure alleged.

### [MYK9-1021](https://linear.app/myk9-platform/issue/MYK9-1021) — blocked: deployed secretary notice/dedupe proof

Verification prerequisite; source Medium. First October 6; last October 11; fifth daily reconciliation. Existing In Review retained. [apps/myk9show/supabase/functions/cron-waitlist-expiration/offerStep.ts:64](https://github.com/rbeezley/myk9-platform/blob/7021fe423f8bbf715fcec40de6eee8aa5e43868d/apps/myk9show/supabase/functions/cron-waitlist-expiration/offerStep.ts#L64) and [supabase/migrations/20261007012700_myk9_1021_mail_in_waitlist_head_notice.sql:26](https://github.com/rbeezley/myk9-platform/blob/7021fe423f8bbf715fcec40de6eee8aa5e43868d/supabase/migrations/20261007012700_myk9_1021_mail_in_waitlist_head_notice.sql#L26) are unchanged. Prior implementation, applied migration and CI proof stand; the latest recorded evidence still leaves the notification-safe human-facing gate open. MYK9-1041's type closure is distinct.

Next / exact closure: authorized test-account free spot with a mail-in head and online dog behind produces exactly one actionable secretary notice; repeated evaluation does not duplicate it or skip the head. Record build, row states/counts and cleanup. Impact is unverified notification/recovery behavior, not an asserted new failure. No cron, notification or fixture action performed.

### [MYK9-1023](https://linear.app/myk9-platform/issue/MYK9-1023) — blocked: deployed offline score/readback proof

Verification prerequisite after UX repair; source High retained, canonical P2. First October 6; last October 11; fifth daily reconciliation. Existing In Review retained. [apps/myk9show/src/features/at-show/quickAdvancePanel.tsx:112](https://github.com/rbeezley/myk9-platform/blob/7021fe423f8bbf715fcec40de6eee8aa5e43868d/apps/myk9show/src/features/at-show/quickAdvancePanel.tsx#L112) checks queue/server matching; :221 handles acknowledgment toast. Acknowledgment behavior remains covered by the current passing tests. Recorded automated proof stands; the full issue/comments still require deployed offline SQL/readback.

Next / exact closure: an authorized changed-score save offline shows local/pending while authoritative SQL stays old, then reconnect acknowledges only after score/details match. Record build, sanitized versions and cleanup. Global/off-panel toast remains a non-goal. Impact is remaining uncertainty about local-versus-server assurance; no new lost-score claim or live scoring operation.

### [MYK9-639](https://linear.app/myk9-platform/issue/MYK9-639) — blocked: owner-deferred Stripe TEST replay

Verification prerequisite P2/source Medium; historical financial High preserved separately. First September 17 (audit September 19/20); last October 11. Existing Backlog retained. [apps/myk9show/supabase/functions/stripe-webhook/paymentReconciliationLoader.ts:161](https://github.com/rbeezley/myk9-platform/blob/7021fe423f8bbf715fcec40de6eee8aa5e43868d/apps/myk9show/supabase/functions/stripe-webhook/paymentReconciliationLoader.ts#L161) is unchanged. Prior loader/chain proof stands. Owner explicitly deferred the controlled TEST replay until after October 10.

Next / exact closure: approved one-/two-hop checkout and payment-link replay, root paid once, matching ledger/report/offline readback and negative controls under the approved refund policy. Impact is unverified deployed end-to-end settlement, not a new financial defect. No payment/refund operation performed.

The five records above were re-read this run. None has new risk-appropriate closure proof. October 11's money-path orchestration hold does not authorize MYK9-639's Stripe TEST replay. Existing local repair evidence is preserved; no new product failure is alleged for these five gates.

## Subsequent fixes and rejected hypotheses

Within the window, later commits repair earlier changes: judge-supplies containing block (#2878), lifecycle backdrop margin (#2880), UKC combined navigation/counts and persisted max time (#2885/#2887), dual element clock (#2893), missing-max notice (#2894), FastCAT Excused serialization (#2896), and combined section state/judge grouping (#2895). Current focused tests cover the relevant behavior; these are excluded as new unresolved findings. No prior canonical record is marked resolved on merge alone.

Two rejected DQ follow-up hypotheses: `view_breed_stats` was already dropped in migration 20260817170000, so adding a DQ bucket to it is not current work; the fixture-restoration pending predicate already excludes normally scored DQ rows through `is_scored`, so no demonstrated fixture defect is filed. ASCA post-event DQ categorization remains inconclusive without a demonstrated required field/code and is not represented as a product defect.

## Checks and limits

- Worktree bootstrap: dependencies and shared-package builds pass. All checks ran in isolated `/private/tmp/myk9-ncr-20261011`, branch `codex/ncr-review-20261011`, at the baseline.
- Changed app tests, shuffled seed 20261011, maxWorkers=4: **86 files / 1,009 tests passed** (20.49s).
- Changed scoring-ui tests: **12 files / 154 passed**; ringside: **10 files / 108 passed**; admin-mcp: **4 files / 40 passed**. Package runs used the same shuffled seed.
- Secretary AKC outcomes: **1 file / 36 passed**. Root primary-checkout and behavioral-SQL registration tests: **2 files / 23 passed**. Total existing targeted checks: **115 files / 1,370 tests passed**.
- Independent synthetic probes: DQ normalization assertion fails with actual `nq`; clear-start alert assertion fails with actual null (five existing editor controls pass). These intentional diagnostic failures confirm the recorded defects, not environmental instability.
- Compared the large DQ migration's recreated function/view bodies to each latest preceding definition: changes are DQ handling and explicit security_invoker; inspected auth/grant boundaries. Behavioral SQL files are registered, but **SQL was not executed in this run**; no container runtime/shared writes. No claim that a source-text contract proves deployed RLS.
- No full-suite/typecheck claim, no browser/mobile layout proof, no deployed offline/notification/Stripe replay, no live AskQ request or authoritative external AKC-format check. These limits are explicit in the relevant Linear contracts.
- Initial tsx CLI probe hit a sandbox IPC restriction; `node --import tsx` ran the actual engine successfully. A mistaken pnpm directory invocation was corrected before the real component probe. Neither is a repository finding.
- No application edits, PR, push, merge, deployment, database write, notification or shared-fixture mutation. Only audit report/cursor and automation memory are updated. Evidence remains under the retained worktree's `.logs`.

## Commit inventory (oldest first)

- `58accf069` — chore(types): regenerate database types after MYK9-1010 and MYK9-1016 pushes (#2859)
- `aa734c7ca` — docs(qa): record Codex daily commit reviews 2026-10-02 to 2026-10-09
- `1780261e0` — feat(results): judge sign-off on Results, initials leave Overview (MYK9-1031, part 2a) (#2862)
- `24567f345` — feat(results): results checked against paper gate Release on the Results tab (MYK9-1031, part 2b) (#2861)
- `bce7bef43` — fix(show-home): finished classes sink to the bottom of the paper-scores picker (MYK9-1062) (#2863)
- `d67c1c044` — feat(db): record who created dogs and people, and from which show (MYK9-1059) (#2864)
- `01487b7c6` — feat(admin): show loose-ends lookup, and add-entry dogs and people record their show (MYK9-1059) (#2865)
- `884d09a35` — fix(dogs): health records header wraps at 390px instead of scrolling sideways (MYK9-1069) (#2866)
- `5bc586a54` — feat(db): version columns for registrations and people, versioned person update (MYK9-1071) (#2867)
- `ca9736777` — feat(skills): generalize opsx-orchestrate into orchestrate with a Linear run mode (MYK9-1074) (#2869)
- `25feb8f66` — fix(checkout): cancel page no longer says selections are saved "for 30 minutes" after the hold ended (MYK9-1073) (#2870)
- `4de55973f` — chore(turbo): opt out of turbo's AGENTS.md agent-guidance block (#2868)
- `5bcb3f91a` — docs(skills): orchestrate continuous overnight mode (MYK9-1079) (#2872)
- `ac75c3cf5` — docs(intent): add Dialog or Slide-Out guideline (decision vs work)
- `2d5544f1e` — feat(ui): replace window.confirm with an in-app ConfirmDialog (#2871)
- `3ac5df4d8` — refactor(clubs): Add Member is a dialog, not a slide-out (MYK9-1080) (#2874)
- `d4fd6d2ae` — refactor(lifecycle-emails): email review and preview are slide-outs, not dialogs (MYK9-1083) (#2875)
- `4a9fd7411` — refactor(judge-supplies): manage supplies is a slide-out; deleting an item asks first (#2876)
- `276805616` — docs(plan): fold the show Tools slide-out into the header Actions menu (held until after Oct 10)
- `e2e232333` — docs(plan): ringside entry list redesign (option G)
- `fc90a3749` — chore(classes): delete the unused ClassTemplateManager (MYK9-1082) (#2877)
- `5ae0b6f5a` — docs(plan): link ringside entry list redesign to MYK9-1086
- `326c192bd` — fix(judge-supplies): the manage panel is no longer squeezed into the supplies card (#2878)
- `fbeb8ca58` — fix(lifecycle-emails): keep the cockpit's space-y margin off the email preview backdrop (MYK9-1083) (#2880)
- `74f384e2c` — feat(at-show): entry list redesign + scoresheet tweaks (MYK9-1086) (#2879)
- `96cda5564` — feat(scoring): UKC Nosework is one area with no found/correct (MYK9-1086) (#2881)
- `40352b788` — fix(show-day): Oct 10 test-show fixes — ringside chooser, UKC event number, actual times, score-reset reopen (MYK9-1086) (#2882)
- `3d07a7c8e` — fix(ringside): reserve the phone title's two lines in em, not px (MYK9-1086) (#2883)
- `06990f014` — docs(guides): rename "Enter paper scores" to "Enter results from scoresheet" (MYK9-1086) (#2884)
- `d4d232730` — fix(at-show): combined A/B lists for every UKC level; scoresheet Back returns to the combined list (#2885)
- `3da7ea854` — fix(at-show): UKC max time persists, combined tab counts, scoring battery drain (#2887)
- `8d06b4b9a` — fix(show-map): moved-out rows no longer block Mark Class Complete (MYK9-1072) (#2888)
- `e235907cd` — feat(show-wizard): after cloning, say what was carried forward, cleared, and needs confirming (MYK9-1047) (#2889)
- `9f512d3fa` — test(qa): primary-checkout fixtures disable background gc and retry cleanup (MYK9-1077) (#2890)
- `e26d1e487` — fix(ukc): rulebook max element times on UKC rules; backfill classes with none (MYK9-1086) (#2891)
- `6f749c18f` — fix(scoring): UKC dual-timer max time is the element time (MYK9-1093) (#2893)
- `f3bc161ed` — feat(scoring): record a Disqualified (DQ) result with a required reason (MYK9-1011) (#2892)
- `34419eba3` — fix(scoring): no saved max time means no limit and a ringside notice, never a silent 3:00 (#2894)
- `ba3ad8fb1` — chore(store): remove the unused classTemplateStore and its registrations (MYK9-1087) (#2897)
- `4fbb51a5a` — fix(scoring): FastCAT Excused saves as excused, not pending (MYK9-1094) (#2896)
- `a83908da9` — fix(at-show): combined A/B card reflects both sections; different judges don't combine (MYK9-1092) (#2895)
- `6624cc58d` — fix(messages): compose is a mode inside the Message Center panel, not a dialog over it (MYK9-1088) (#2898)
- `7021fe423` — feat(reports): Result Catalog for one judge's day, keyed on the Show Map judge (MYK9-1036) (#2900)
