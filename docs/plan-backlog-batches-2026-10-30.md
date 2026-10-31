# Linear Todo in batches — 2026-10-30

> **Status:** Active
>
> **Progress (2026-10-30):** Waves 1 and 2 merged (Wave 2 under owner convergence overrides; deferred reviews MYK9-1557, 1559–1562, 1565). Wave 3: batches 13, 14 and 20 dispatched.

Source: every MyK9-platform issue in **Todo** on 2026-10-30 (38 issues, read in full that day). 29 are agent work, grouped by the files they touch into **18 PRs** across three waves, plus two non-PR lanes and a review sweep. Each PR closes its issues with one `Fixes MYK9-<n>` line per issue. The format follows [`plan-backlog-batches-2026-09-24.md`](plan-backlog-batches-2026-09-24.md).

Ordering follows [`goals/fall-2026-launch-readiness.md`](goals/fall-2026-launch-readiness.md): show-day correctness and deploy safety first, then secretary and admin surfaces, then v3 parity features that need owner decisions or migrations.

## Ground rules

- One batch = one branch = one PR, opened from its own worktree after `pnpm qa:inflight` passes. Batches in the same wave touch disjoint file sets, so up to three implementers run at once (cloud lane first, Mac for review and browser evidence).
- Each PR carries the tests its issues demand (red before, green after), a shuffled run of the touched suite, `pnpm qa:code-quality-ratchet`, and the review tier `pnpm qa:review-tier` reports. Guardrail, RLS and replication batches are `independent` (Codex).
- **Stop rule:** a second finding on the same path, or a finding about code the previous fix introduced, parks the batch on its branch with a restructure note. The other batches keep going.
- **Merges and deploys:** standing approvals cover merging a green PR and running Deploy myK9Show behind `pnpm qa:prelaunch-tripwire`. `supabase db push` always waits for Richard; the three batches that need it (10, 16, 17) are sequenced so one push window covers them.
- Linear: set each issue In Progress with the claim comment at dispatch; after merge post the implementation comment and move to In Review until production evidence exists.

## Not a PR here (9 issues)

| Kind             | Issues                 | Why                                                                                                                                                   |
| ---------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parent only      | 1505, 1528, 1532, 1381 | 1528 closes with batches 1 and 3; 1532 with batch 10; 1381 when MYK9-1388 (In Progress elsewhere) lands; 1505 stays open for the owner's parity walk. |
| Owner-deferred   | 1511                   | TV display: "nothing here should be built until the owner reopens it".                                                                                |
| Parked, operator | 1436                   | Codex cloud environment editor and `jsr.io` allowlist are broken on OpenAI's side.                                                                    |
| Review sweep     | 1522, 1525, 1548       | Deferred re-reviews; see § Review sweep.                                                                                                              |
| Measurement lane | 1496                   | Native-stack measurements recorded on the issue and in `plan-show-day-db-load.md`; see § Lanes.                                                       |

## Wave 1 — show-day correctness, unblocked now

Start all six; three at a time.

| #   | Batch                           | Issues     | Size | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------- | ---------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Deploy-order safety             | 1527, 1529 | S    | `20261030174300` is applied (live `list_migrations`, 2026-10-30), so the incident half is cleared. Remaining: route `ring_phase` / `ring_phase_time` through `optionalColumn.ts` in `classes/reads.ts` and `ReplicatedClassesTable.ts` with a simulated-42703 test; a deploy guard in `prelaunch-tripwire.ts` or `deploy-myk9show.yml` that refuses an unapplied migration (fixture both directions); the comment-only header fix in the coin-flip migration. `independent` tier (guardrails). |
| 2   | Scoresheet registry dispatch    | 1543       | S    | A verifier reproduces on `main` first (seed defect vs product defect). Then `useAtShowScoresheet.ts`, `pages/scoring/ScoresheetPage.tsx`, the `deriveSportType` mapping of `trial_type` (`scent_detection` vs `Scent Detection`). No silent AKC fallback on valid ASCA or UKC rows; tests on the stored values; judge re-walk.                                                                                                                                                                 |
| 3   | Ringside sentinel and A/B phase | 1530, 1537 | S    | `transformEntry` maps an unset run order to `null` at the source; sweep `exhibitorOrder` readers in `features/at-show/`. `combinedSectionState.ts` (`packages/ringside`, rebuild dist) carries the merged phase and time; `ringsideStatusInfo.ts` formats it instead of merging again. Four phase tests from the issue.                                                                                                                                                                        |
| 4   | Find Shows reload and the PWA   | 1549, 1539 | M    | `StaggeredGrid.tsx` (callers: `ShowCardGrid.tsx`, `JudgeDashboard.tsx`): key the grid on list identity, children by id, a visibility test on a growing list. "Refresh app" in `AccountMenuContent.tsx` applies a waiting service worker. `sw-custom.ts` navigation allowlist gains `/shows` without exposing a prior account's cache (signed-out control). Unblocks MYK9-1489. Offline evidence on a second engine.                                                                            |
| 5   | My Shows and the Home card      | 1531, 1524 | M    | Both read `pages/MyEntriesPage/modules/useMyEntriesData.ts` (over 500 lines: counter goes in a sibling hook). In-flight check-in count holds the return refresh; the "Your entries today" card reads the My Shows view model as-is (trial-day filter, status text verbatim, link only). MYK9-1523 is merged (#3418), so liveness is free.                                                                                                                                                      |
| 6   | Replication revoke-to-zero      | 1521       | M    | Direction 2 from the issue: when an incremental sync returns 0 rows on a non-empty local scope, run the count (or the no-access RPC) and clear. Engine-only, no migration. The regression test must fail on current behavior. `independent` tier.                                                                                                                                                                                                                                              |

## Wave 2 — after PRs #3423 and #3427 merge; admin and medium items

| #   | Batch                             | Issues                 | Size | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | --------------------------------- | ---------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | Ringside audience and leaderboard | 1544                   | S    | `ShowDetailsPage.audience.ts`: any ringside-admitted viewer gets the tabbed audience (release gate kept). `ringsideMenuItems.ts` (lands with #3427) drops the entries check. The nationals-only Leaderboard item and route moved to batch 19 (1540).                                                                                                                 |
| 8   | Ringside Settings offline         | 1545                   | M    | Device-level preferences (theme, voice, haptics) write locally first through the stores that already hold them (`themeClasses`, the audio settings provider), sync when online, survive a cold offline boot; a stated rule for a newer server value. Then remove `requiresConnection` from the Settings item. After batch 7 (same menu file).                                                                                                                 |
| 9   | On-device signal for dog pages    | 1538                   | S    | Reuse the "not on this device" signal #3425 added for the class page, extended to trials and classes; `useAtShowStaffDogs.ts`, `AtShowDogsPage.tsx`, `AtShowDogPage.tsx`. Test: entries ok, classes failed.                                                                                                                                                                                                                                                   |
| 10  | Site-admin walk                   | 1533, 1534, 1535, 1536 | M    | One PR because the pages overlap (`SupportInboxPage.tsx` in 1534 and 1535; `AdminDashboard/*` in 1534 and 1536). 1533: resolve an auth-only ticket through `people.auth_user_id` on the client (owner accepted 2026-10-30 in place of the RPC column; no migration) and say "user not found" on a dead `?userId=`; a test on the real row shape. 1534: `text-xs` token. 1535: `min-h-11` at call sites. 1536: deep links to filtered lists. Closes 1532.                          |
| 11  | Ask Queue thread persistence      | 1541                   | M    | `AskQPanel.tsx`, `hooks/useAskQ.ts`: per-user, per-show device-local thread; 20 entries or 14 days; Clear history and New question; storage reads and writes in try/catch. Match the answer-context shape in `plan-ai-natural-language-access.md`.                                                                                                                                                                                                            |
| 12  | Duration time entry               | 1503                   | L    | One parser in `@myk9/core` (search time m:ss.cc, max time m:ss) and one input. Adoption is smaller than the issue's table: #3422 already made `packages/scoring-ui` `ManualTimeField` the single scoresheet field. Remaining: `MaxTimeDialog` / `maxTimeInput.ts`, `data-table-time-input.tsx`, `BulkResultEntry` helpers, `ClassEditForm` time limits. Delete `formatTimeInputToMMSS` and `ui/time-input.tsx` (0 callers). Rebuild core and scoring-ui dist. |

## Wave 3 — parity features that need a decision or a migration

| #   | Batch                          | Issues | Size | Notes                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------ | ------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13  | Clock-time entry               | 1504   | M    | After 12 (same parser module). `time-picker*.tsx`, `ClassEditForm`, the ringside Status dialog's briefing and break times (`ring_phase_time`), schedule and results sort keys. Regression tests for MYK9-69 and MYK9-1405; unset is never 1:00 AM.                                                                                                  |
| 14  | Ringside class list parity     | 1506   | L    | Alone. Progress bar, queue-based upload indicator and offline badge, ⓘ reusing the entry-list popover component, ⋯ opening the Class Options shell from #3420, four tabs with counts, search and sort, refresh. Defaults from § Decisions apply unless Richard changes them. Judge, steward and secretary browser checks against the v3 screenshot. |
| 15  | Class Settings and area picker | 1515   | M    | After 12, 13 and 14 (shared time input; the card menu opens the dialog). Planned start, area count and time allocation save through `ringside_update_class`; check-in mode and results visibility open the existing workbench controls. The area picker actually opens.                                                                             |
| 16  | Stale-class prompt             | 1514   | M    | v3's trigger rule detects, a prompt asks. Migration adds `trials.auto_complete_stale_classes` (null means enabled); needs a `db push`. Reuses mark-unscored-absent and the server-side derivation; re-checks synced state before acting.                                                                                                            |
| 17  | Exhibitor view of show dogs    | 1517   | L    | Last to start; needs the privacy decision recorded on the issue first. A definer RPC returning only the approved columns, behavioral SQL tests under `supabase/tests/`, grants verified on the applied database, `security-audit` diff review and `migration-auditor`. Reuses the staff list from #3419 and `dog_favorites`. `db push`.             |
| 18  | Commit-lag watermark           | 1497   | M    | After 6. Direction 3 first: measure transaction duration on writes to `entries`, `classes`, `shows`, `dogs` on the native stack; if it sits far below the 5 s overlap, document the bound with a monitor. Otherwise widen the overlap for high-churn tables, measured.                                                                              |
| 19  | Ringside leaderboard route     | 1540   | M    | Moved from batch 7 (2026-10-30): reaching the Nationals leaderboard from ringside needs a `SECURITY DEFINER` read of released rankings for non-managers, so a migration and a `db push`. Respects the results release gate; behavioral SQL test under `supabase/tests/`; `migration-auditor`. Unblocks MYK9-1516's closure.                                    |
| 20  | Round-cap review-gate exit     | 1566   | M    | Owner decision 2026-10-30: after 3 rounds with no open P0/P1 and the rest filed, the reviewing agent posts a gate line that turns it green; `owner` stays for an unclosable P0/P1 or an unavailable reviewer. Guardrail paths, so the floor is `independent`.                                                                                        |

## Lanes outside the PR flow

- **Node and CI (1548 → 1547 → 1542).** 1548: a fresh Codex independent review of #3430's merged head on `main` (`d6a7ad720`); P0/P1 fixed, the rest filed. 1547: one Node version source that older PR heads and historical deploys can still resolve (fallback when the file is absent), with fixture coverage; carries 1548's fixes. 1542: a cloud session per provider proves Node 22.23.4 persists across shells and runs cloud setup, preflight, docs build and typecheck with #3337's lockfile; record both proofs, then raise the floor in `scripts/cloud/tool-versions.json` in #3337's merge.
- **Measurement (1496).** On the isolated native stack with `seed-demo.sql` and the 517-entry show: `realtime.list_changes` cost per run reconciled with the MYK9-1363 subscriber inventory, and the entry-results view at `sessions=50` as secretary and judge (p50/p95). The 55-writer `40001` check follows the decision below.

## Review sweep (no code)

- **1522**: close won't-fix once MYK9-1477 has two green nightlies (check the run history first).
- **1525**: close won't-fix at launch if no user reports a missing My Entries; if one does, the cheapest fix is the bounded re-check listed on the issue.
- **1548**: see the Node lane; the issue closes when the review and the disposition of its findings are recorded.

## Decisions (defaults applied unless Richard says otherwise)

1. **1517 column list:** armband, call name, breed, handler name, plus class membership, run-order position and check-in status (needed for "your turn"); never contact details, fees, payment status or registration numbers. Online-only list; favorited dogs' alerts keep working offline.
2. **1506:** class favorites are device-local like v3 (toggling one section of a combined A/B card toggles both); "Your ring" stays as a judge-only chip inside Pending; no multi-column grid.
3. **1515:** ringside owns planned start, area count and time allocation; check-in mode and results visibility open the workbench controls; an unset flexible area count prompts, it does not block the entry list.
4. **1514:** "Not yet" snoozes until the next score in another class or 15 minutes, whichever comes first.
5. **1533:** superseded 2026-10-30. #3447 resolved the auth id on the client through `people.auth_user_id`; the owner accepted it, so batch 10 needed no migration.
6. **1496 item 3:** waive the 55-writer harness for now; the ringside OCC breaker and containment state are the mitigation, and items 1 and 2 are recorded. Build it only if Richard wants the number before launch.
7. **Pushes:** one `db push` window after batches 16, 17 and 19 merge, requested on Linear with `needs:operator`.

The owner confirmed defaults 1 and 6 on 2026-10-30 ("All recommendations"); 2, 3 and 4 still apply as defaults.

## Testing phase

A batch is not done until all of the following hold; a wave is not done until its real-browser checks are recorded.

**Per batch**

- The issue's named tests are red before the change and green after; the touched app suite passes `pnpm vitest run --sequence.shuffle`; `pnpm typecheck`, `pnpm lint`, `pnpm qa:code-quality-ratchet`.
- Packages touched (`core`, `scoring-ui`, `ringside`) are rebuilt before the app suite runs.
- The review tier's verdict is pinned to the head SHA; `bash scripts/qa/watch-pr-checks.sh <pr>` returns 0.

**Per wave**

- Deploy myK9Show under standing approvals once the wave's PRs merge; the run summary names a commit at or after the last merge.
- Wave 1: a judge scores an ASCA class and a combined A/B class on production; an exhibitor checks in two dogs and returns to My Shows; a primed secretary reloads Find Shows offline (second engine or physical device); the revoke-to-zero spec runs on the isolated stack.
- Wave 2: a judge with no entries opens Results during a show; Settings changes offline survive a cold reload; the support deep link opens the Manage Roles dialog from an auth-id-only ticket; admin pages re-measured at 375 and 1440 for the 14 px and 44 px floors; a judge types `125`, `4`, `430` and `1:23.45` into the scoresheet and Set Max Time and sees the preview before saving.
- Wave 3: a secretary edits a start time (never 1:00 AM); the class list walked as judge, steward and secretary against the v3 screenshot, including offline; a judge moving between levels sees the stale-class prompt once and "Not yet" stays quiet; two exhibitors in one show see each other's dogs and an exhibitor from another show sees nothing.

**Exit**

- Every issue in this plan is Done or carries a recorded reason it is not (won't-fix, parked, owner-deferred).
- Richard's v3 parity walk on MYK9-1505 finds nothing missing, or files the gap as a new child.
- This plan flips to `Complete`, moves to `docs/archive/`, and drops its index row.
