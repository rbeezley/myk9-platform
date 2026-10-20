# Codex daily commit review — 2026-10-13

source: codex. Review complete through `eec1e3eff0f9435a2584e66e51a148dec7703064`.

Reviewed 36 commits / 252 changed files from `4ea223bc69d7646cc6cfbda653c88ec502b0e4fd` exclusive through the baseline above inclusive. Window: **2026-10-12T10:10:37Z–2026-10-13T10:14:26Z**. The shared daily-commit-review cursor supplied the start, not the scheduler timestamp. No coverage gap or 24-hour fallback. Final origin/main fetch and local main matched this endpoint.

One previously unfiled historical P1 cold-paper-scoring defect was confirmed while reviewing the new E2E workaround. Existing P0 credential exposure remains blocked on owner rotation. Two carried findings now have passing closure evidence. No application code changed.

| Lifecycle | Count |
| --------- | ----: |
| new       |     1 |
| unchanged |     2 |
| resolved  |     2 |
| duplicate |     0 |
| rejected  |     0 |
| blocked   |     7 |

Twelve canonical records: P0 1, P1 1, P2 10; no independent P3 record. Existing issue reuse is counted as unchanged/blocked, not counted again as duplicate. MYK9-1129 includes existing P3 subitems. MYK9-1085's specific stack scope now points to MYK9-1116; the broader ledger is not an extra finding. Created **MYK9-1130**; modified **MYK9-1128, MYK9-1129, MYK9-1085**. Closed/reopened no issues. No confirmed actionable item awaits filing.

## P0 — blocked

### MYK9-1128 — exposed E2E credential still needs owner rotation

[Canonical contract](https://linear.app/myk9-platform/issue/MYK9-1128). Security exposure; source High, canonical P0 by the scorecard's security-exposure criterion; existing Urgent priority retained. First/last seen October 13. Owner Richard Beezley. High confidence in the recorded exposure, no claim of exploitation.

The existing issue documents a shared E2E password inside public Playwright report embedded ZIP data, usable for test accounts including an admin on the unified project. #2945 / `fe57ce773` repairs [scrubArtifactSecrets.ts:79](https://github.com/rbeezley/myk9-platform/blob/eec1e3eff0f9435a2584e66e51a148dec7703064/apps/myk9show/src/utils/scrubArtifactSecrets.ts#L79), adds recursive verification, and gates artifact uploads. Its October 13 03:40 UTC comment records **369 leaking artifacts deleted** and a real-CI a11y artifact verified clean. This supersedes the older count in the issue description.

Remaining exact proof: owner confirmation of rotation on affected accounts and corresponding GitHub secrets/local environment, with authorized replacement sign-in/CI validation; retain the deletion and clean-artifact evidence. Merge alone cannot revoke an exposed password. Updated Linear with this contract. No password values, reports containing credentials, account changes or secret changes were accessed/performed by this audit.

## P1 — new historical finding

### MYK9-1130 / NCR-2026-10-13-01 — paper scoring stays empty after late hydration

[Canonical contract](https://linear.app/myk9-platform/issue/MYK9-1130). Product/show-day readiness; source High, canonical P1 because the secretary's golden path needs an undocumented warm-up/reload. Owner unassigned. First recorded CI observation October 12, confirmed source review/last seen October 13. High confidence; no fresh browser reproduction claimed.

[PaperScoresheetPage.tsx:81](https://github.com/rbeezley/myk9-platform/blob/eec1e3eff0f9435a2584e66e51a148dec7703064/apps/myk9show/src/pages/scoring/PaperScoresheetPage.tsx#L81) loads only when classId/loadAttempt changes. [paperScoresheetData.ts:22](https://github.com/rbeezley/myk9-platform/blob/eec1e3eff0f9435a2584e66e51a148dec7703064/apps/myk9show/src/pages/scoring/paperScoresheetData.ts#L22) reads [ReplicatedEntriesTable.ts:520](https://github.com/rbeezley/myk9-platform/blob/eec1e3eff0f9435a2584e66e51a148dec7703064/apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts#L520), a local read. If class metadata exists before entries hydrate, successful [] becomes a definitive zero-dog page and later replica writes do not reload it.

In-scope [resultsTabJourney.spec.ts:74–98](https://github.com/rbeezley/myk9-platform/blob/eec1e3eff0f9435a2584e66e51a148dec7703064/apps/myk9show/src/test/e2e/secretary/resultsTabJourney.spec.ts#L74), #2916 / `22322be69`, explicitly documents the first CI timeout and warms the Results tab before visiting paper scoring, with a reload fallback. This is discovery evidence for an older implementation defect, **not a regression caused by #2916**.

Reproduction: delay entries hydration in an isolated two-entry fixture; directly open `/scoring/classes/:classId/entries?mode=split` while the class read succeeds; let local entries read []; release hydration. The page has no trigger to replace the empty list. Expected: the entries/count converge without navigation or reload, while unknown initial data is not presented as known zero.

Closure: deterministic red-to-green delayed-hydration component test; cold direct-route browser proof without Results warming/reload; warm offline/unsynced-score, truly-empty and failed-read controls. Keep the existing surface and replication path. App test startup stalled this run, so this contract accurately distinguishes source/recorded-CI proof from new runtime proof.

Dedup included archived searches by workflow, file, helper, cold/empty symptom and replica cause. Exact MYK9-1062 (entry point, paper screen explicitly excluded), MYK9-1031 (Results redesign), MYK9-774 (failed reads), and MYK9-637 (ringside class-list reader) are different completed scopes; none reopened.

## P2 — unchanged and blocked

All rows are source: codex, baseline `eec1e3eff0f9435a2584e66e51a148dec7703064`, last seen October 13. Verification-only records do not assert a new runtime defect. Full acceptance criteria remain in each canonical Linear issue.

| Canonical / status                                                                                   | First seen; source; owner                            | Affected workflow, current evidence and exact next proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [MYK9-1111](https://linear.app/myk9-platform/issue/MYK9-1111), blocked                               | Oct11; Medium; Richard                               | Secretary Quick Create/Add Person Only. #2934 / 8eb68a43f now wires duplicate selection in QuickCreateFlow.tsx:236 and DogSelectionStepEnhanced. Recorded real-host online/offline tests prove original identity, no create call and dependencies. Still owed: signed-in secretary duplicate-selection browser replay at both hosts. High confidence in repair, browser closure unverified.                                                                                                                                                                                                                                                                                                                                   |
| [MYK9-1112](https://linear.app/myk9-platform/issue/MYK9-1112), blocked                               | Oct11; Medium; Richard                               | Secretary Quick Create saved-record Edit. #2936 / 507ca378b uses QuickCreateEditForms.tsx instead of blank creates. Recorded 14 real-host tests and 1,560-test shuffled run cover identity/cancel/failure/success. Still owed: signed-in browser edit/readback with unchanged IDs and no duplicate rows. The after-disconnect paused editor is separately MYK9-1125.                                                                                                                                                                                                                                                                                                                                                          |
| [MYK9-1116](https://linear.app/myk9-platform/issue/MYK9-1116), blocked; prior audit ledger MYK9-1085 | Oct11 stack evidence; Medium; Richard                | Add Dog panel registration stack. #2943 / 4de2dee36 removes the second panel. Oct13 comment records Dogs and Dog Only at 320/375/768/1440: one dialog, inline registration, Back/Escape. Only onboarding Add Dog remains unwalked; record the same one-dialog/focus behavior at accepted 375px. MYK9-1085 updated to point here; other dialog callers belong to MYK9-1117. Do not declare the broader ledger resolved.                                                                                                                                                                                                                                                                                                        |
| [MYK9-834](https://linear.app/myk9-platform/issue/MYK9-834), unchanged                               | Sep26; Medium; Richard                               | Passcode ringside offline scoring. Identity repairs in hooks/useAuth.ts:175 and features/at-show/useRehydrateRingsideGrant.ts:142 stand. Still no complete recorded refocus→expiry→offline reload→durable score→reconnect proof with identity/revocation controls. Retain In Review. High confidence in the outstanding proof gap.                                                                                                                                                                                                                                                                                                                                                                                            |
| [MYK9-1011](https://linear.app/myk9-platform/issue/MYK9-1011), blocked                               | Oct4; residual Oct11; Medium; Richard                | AKC DQ downstream. #2904's performanceStatsEngine.ts:86, QualificationCell.tsx:88 and AskQ toolDefinitions.ts:64 repairs remain. Need browser persisted DQ/reason/chart, live AskQ exact-DQ filter fixture, and authoritative AKC mapping plus generated-file proof. Deployment alone does not close it. No allegation of a wrong export code without that evidence.                                                                                                                                                                                                                                                                                                                                                          |
| [MYK9-992](https://linear.app/myk9-platform/issue/MYK9-992), blocked                                 | Sep28; Medium; Richard                               | Show-day position. MyEntryRow.tsx queue display retained. Oct12 18:46 issue evidence now proves gapped-order secretary and cold-exhibitor “2nd up” on build 49692674c against SQL (4/5 run numbers). Remaining: null-order checked-in/unscored branch, judge surface, in-ring/pulled controls and cleanup. Partial proof narrows but does not close the gate.                                                                                                                                                                                                                                                                                                                                                                 |
| [MYK9-639](https://linear.app/myk9-platform/issue/MYK9-639), blocked                                 | Sep17; audit Sep19; Medium, historical High; Richard | Move-up paid-root accounting. stripe-webhook/paymentReconciliationLoader.ts:161 unchanged. Controlled Stripe TEST one-/two-hop replay across both callers, root paid once, ledger/report/offline readback and negative controls still absent. Owner deferral/hold does not authorize payment actions; no replay performed.                                                                                                                                                                                                                                                                                                                                                                                                    |
| [MYK9-1129](https://linear.app/myk9-platform/issue/MYK9-1129), unchanged / existing canonical reuse  | Oct13; Medium, historical Low; owner gap             | Registrations replica #2948. ReplicatedDogRegistrationsTable.ts:230–253 awaits hydration after prune; :276–283 confirmed deletion has no fence against the older response. Offline copy can regain a deleted row. Existing comments also identify merged-create sibling placeholders absent on server, plus P3 refresh/rail issues and future queued-write prerequisites. Updated priority to Medium/P2 for incorrect current UI state, preserving the owner's PR3/MYK9-1075 sequencing. High-confidence source interleaving, no fresh runtime failure claimed. Closure: delayed hydration/delete red-to-green, two-registration merged-create test, offline rendered readback, and distinct proof for each existing subitem. |

## P2 — newly resolved

- **[MYK9-1097](https://linear.app/myk9-platform/issue/MYK9-1097)**, first Oct11, last Oct13; source Medium; Richard. #2931 / `768b6fab1` fixes ClassActualStartEditor clear-start feedback/retry, class-switch state and save disabling. October12 19:17 comment records 10/10 component tests, failure→alert→retry recovery and mutation checks (each removed fix goes red), plus 201 shuffled cockpit tests. This is passing focused closure proof, not inference from merge. Already Done; this audit made no status mutation. No production deployment criterion.
- **[MYK9-1021](https://linear.app/myk9-platform/issue/MYK9-1021)**, first Oct6, last Oct13; source Medium; Richard. Owner explicitly accepted isolated Nightly instead of live DB proof October12 15:33. [Run 38266836797](https://github.com/rbeezley/myk9-platform/actions/runs/38266836797), #2925, exercises the real expiry cron: Scout mail-in stays waiting, Maple online behind stays waiting, exactly one secretary notice, second cron still one, Message Center notice appears once, cleanup recorded. This meets the previously missing notice/dedupe proof. Already Done; no status mutation.

These are attributed existing passing results, not fresh browser runs by this audit. Previously resolved MYK9-1023 is omitted from the active ledger.

## Subsequent fixes considered

Reviewed final combined main, not intermediate versions. #2934 and #2936 repair yesterday's Quick Create defects but retain their browser proof gates. #2943 repairs the stack and #2946 fixes the phone tabs; onboarding remains above. #2931 and #2925 provide the two closures. #2940 repairs class-completion convergence and #2942 explains unsynced/conflicted Verify state; fresh replication tests pass, but no new live closeout claim. #2947 adds real lazy-import retry after earlier Nightly repairs; no claim that the complete Nightly is now green. #2945 contains future artifact output while owner rotation remains open.

Existing MYK9-1124/1125/1126 own the separately documented offline dog-view, paused editor and account-bound cache limitations encountered in comments; no duplicate issues created. No additional confirmed actionable regression remained after checking current implementation and canonical issues.

## Checks and verification limits

Isolated worktree `/private/tmp/myk9-ncr-20261013`, branch `codex/ncr-review-20261013`. Bootstrap completed after restricted-network attempt was stopped and approved network retry succeeded. App/package builds were available.

- Replication: **3 files / 37 tests passed**, MutationManager.convergedOutcome, MutationManager.discardRevert, detectDirtyRowConflict.
- Root: **5 files / 39 tests passed**, isolated-e2e-functions/lifecycle/browser-diagnostics/migration-chain and run-behavioral-sql-tests.
- **76 tests / 8 files passed** total. Logs retained under `.logs/replication-tests.log` and `.logs/root-tests.log`.
- Changed app tests: selected 89 files, shuffle seed 20261013. Runner produced only its RUN header, stalled over 30 seconds and was interrupted (130), as required. **No app-test passing result.** No retry loop or unsupported product/harness diagnosis. Log `.logs/app-tests.log`; list `.logs/app-tests.txt`. An initial wrong-working-directory selection attempt was canceled before the corrected command; it is not counted as a test verdict.
- `git diff --check 4ea223bc6 HEAD` passed. Final origin/main still equals reviewed SHA.
- No full typecheck/lint, full app suite, browser/mobile walkthrough, live SQL, behavioral SQL execution, deployment, production auth/notification/Stripe/AskQ replay, or AKC external specification verification.
- No application edits, commits, pushes, PRs, merges, deployments, account/fixture/payment/notification mutations. Only requested audit documentation/cursor and automation memory written; Linear finding creation/updates used the explicit policy authorization.
- Retain worktree for logs. Shared cursor/report copied to the primary checkout as the explicitly requested audit-only documentation output; not committed or pushed. Linear is the work queue.

## Commit inventory, oldest first

- `22322be69` — test(e2e): Results tab secretary journey; one print fingerprint on Reports and Results (MYK9-1031) (#2916)
- `33634e191` — test(registration): Quick Create journeys get a 30s timeout and paste whole values (MYK9-1081) (#2917)
- `81e778042` — docs(audit): show-day walk 2026-10-12 report and Part 2 mechanics corrections
- `faa6c505b` — docs(walks): show-day walk restores its own fixture before every run (#2918)
- `23f67f5b6` — fix(at-show): Correct this score reopens from the device; no em dash in the offline confirmation (MYK9-1106, MYK9-1110) (#2919)
- `a1e61c39d` — test(registration): chooseOption waits on the chosen node, not a screen-wide option scan (MYK9-1081) (#2921)
- `6c681baaf` — refactor(registration): Add Person Only, Dog Only and onboarding Add Dog are slide-outs; delete the dialog variant (MYK9-1081) (#2920)
- `2224e4184` — fix(entries): name the trial and day on each entry-form class row (MYK9-1107) (#2922)
- `9ca91ed46` — docs(qa): record Codex daily commit review 2026-10-12
- `dc5764214` — docs(plan): archive the Quick Create one-panel plan as Complete (MYK9-1081)
- `3a761e79d` — test(e2e): waitlist journey on the isolated Nightly target with the real expiry cron; guide card 7 (MYK9-971) (#2925)
- `60eb27f62` — fix(show-page): past, never-run days read "Not run", not "Next up" (MYK9-1109) (#2924)
- `c7f539877` — fix(at-show): exhibitor's today row shows its own result, preliminary until release, with faults (MYK9-1026) (#2923)
- `5aff0b6ea` — fix(results): show a non-zero fault count on the show page schedule and dog page (MYK9-1108) (#2926)
- `f909c9357` — fix(show-page): the exhibitor's run schedule reads results from their own masked read (MYK9-1115) (#2927)
- `7262e6389` — docs(plan): offline edits to existing dog registrations (MYK9-1090)
- `70294f264` — docs(ops): guides Git connection is off; deploymentEnabled:false never stopped its skipped records
- `51a29bb50` — fix(guides): Astro site is help.myk9show.com, not the unattached guides.myk9show.com (MYK9-1123) (#2930)
- `768b6fab1` — fix(cockpit): a failed Clear start shows its error and keeps retry (#2931)
- `a47ea45e4` — fix(replication): Discard puts a refused dog edit back to the server's copy (MYK9-1076) (#2932)
- `8eb68a43f` — fix(registration): Quick Create reuses the existing person chosen in the duplicate prompt (MYK9-1111) (#2934)
- `46ddc943b` — fix(e2e): repair the nine failing nightly Playwright tests (MYK9-1114) (#2935)
- `ebf025237` — fix(classes): no saved max time means no limit in buildClassConfig (MYK9-1095) (#2933)
- `f905c4020` — test(shows): await the Fixed Count option in WaitListSettingsCard (MYK9-1122) (#2937)
- `507ca378b` — fix(registration): Quick Create Edit opens the saved dog or person in place (#2936)
- `be4780da4` — refactor(panels): Message Center and Manage Registrations use the shared panel-mode focus hook (MYK9-1118) (#2939)
- `ea4089287` — fix(replication): marking a class complete after the server completed it is not a conflict (#2940)
- `b069c645d` — fix(results): Verify says why it cannot show while the class row is unsynced or in conflict (#2942)
- `4de2dee36` — fix(dogs): panel-variant Add Dog hosts registration as a mode, not a second slide-out (#2943)
- `bc2d97776` — test(e2e): run the mail-in Quick Create spec in the Nightly (MYK9-1120) (#2944)
- `a1845fb03` — fix(dogs): secretary edits a dog she brought in; Edit hidden where the server refuses (MYK9-1127) (#2941)
- `81b71948e` — test(e2e): attach browser diagnostics when the nightly second-pass reds fail (#2938)
- `86275eb14` — fix(dogs): Add Dog tab strip fits a 320px phone and keeps its done check visible (#2946)
- `fe57ce773` — fix(ci): scrub secrets inside the Playwright HTML report and refuse to upload a leak (#2945)
- `a74b983ee` — fix(routes): lazy routes retry a failed chunk import, and Try Again re-imports (MYK9-1114) (#2947)
- `eec1e3eff` — feat(dogs): sync the registrations replica; server-first reads with a labelled offline copy (MYK9-1090) (#2948)
