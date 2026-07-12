## 1. Confirm the two open decisions (apply-time gate)

- [x] 1.1 **CONFIRMED 2026-07-12 (PO):** D2 accounted-for predicate = `result_status IN ('absent','excused')`. NQ entries are already `is_scored=true`; `withdrawn` excluded from expected via `entry_status`; no literal 'DQ' in the enum.
- [x] 1.2 **CONFIRMED 2026-07-12 (PO):** D1 backfill = YES, webhook-guarded (skip `status_source='manual'`). Implementer picks the guard mechanism by reading the current `trg_notify_class_status_push` body (session-GUC vs. in-transaction disable).

## 2. Migration — schema + derivation

- [x] 2.1 Pre-flight (migration-auditor + repo lessons): `supabase migration list` to confirm remote state; read the **live** `refresh_class_scoring_state` body at `20260615160000_add_shows_is_nationals_placement_source.sql:37-108` (extend that, not the original); confirm the `entries` CHECK values for `entry_status`/`result_status`/`check_in_status` and the `classes.status` CHECK (migration 138).
- [x] 2.2 New migration `NNN_class_status_auto_derivation.sql`: add `classes.status_source text NOT NULL DEFAULT 'derived' CHECK (status_source IN ('derived','manual'))` and `classes.reopened_after_closeout_at timestamptz NULL`. (Additive columns; no new table, so no new GRANTs required — confirm existing `classes` grants cover the new columns.)
- [x] 2.3 `CREATE OR REPLACE FUNCTION refresh_class_scoring_state()` from the live body with: the new expected/accounted-for completeness predicate (Decision 2); an early-return from the _status_ write when `status_source = 'manual'` (still update `scored_count`); clear `reopened_after_closeout_at` when the class legitimately reaches `completed`.
- [x] 2.4 `CREATE OR REPLACE FUNCTION handle_entry_scoring_state_change()` to handle `TG_OP IN ('INSERT','DELETE')`: on INSERT of an expected entry into a `completed`/`manual` class → set `in_progress`, reset `status_source='derived'`, stamp `reopened_after_closeout_at=now()`; on DELETE re-derive the affected class.
- [x] 2.5 Recreate trigger `entries_refresh_class_scoring_state` as `AFTER INSERT OR DELETE OR UPDATE OF <existing 6 cols>` with an updated `WHEN` guard (INSERT/DELETE have no OLD/NEW pair for the UPDATE guard — split the trigger definition appropriately). Keep it the single scoring-side `classes.status` writer.
- [x] 2.6 Webhook-guarded one-time backfill: `PERFORM refresh_class_scoring_state(id)` over all classes where `status_source <> 'manual'`, with the push webhook suppressed per 1.2. End with `NOTIFY pgrst, 'reload schema';`.
- [x] 2.7 Run the `migration-auditor` agent over the new migration; fix any findings.

## 3. Migration — behavioral tests (psql rolled-back)

- [x] 3.1 Test: scratched dog does not block completion — class with all-expected accounted-for + one scratched → derives `completed`.
- [x] 3.2 Test: manual override survives recompute — set `status_source='manual'` + `completed`, then score another entry → status stays `completed`, `scored_count` updates.
- [x] 3.3 Test: late-entry reopen — INSERT expected entry into a `completed` class → `in_progress`, `status_source='derived'`, `reopened_after_closeout_at` set; and clears a prior `manual` override.
- [x] 3.4 Test: empty class stays `upcoming`; first score → `in_progress`; absent/excused counts as accounted-for.
- [x] 3.5 Test: backfill recomputes a stuck `in_progress` class to `completed` and skips a `manual` class (run in a rolled-back txn against a seeded fixture).

## 4. Replication + manual-override client wiring

- [x] 4.1 `ReplicatedClassesTable`: carry `status_source` (and `reopened_after_closeout_at` read) through `mapClassStatusToDb`/`toSupabaseRow` and the read mapper (update BOTH the replication mapper and any PostgREST fallback `.select` — dual-path).
- [x] 4.2 `showMapActionMutations.ts` `markShowMapClassStarted`/`markShowMapClassComplete`: include `status_source: 'manual'` in the same `updateClass` payload.
- [x] 4.3 Unit tests: mapper round-trips `status_source`; manual mutations set `status_source='manual'` (assertion-first `toHaveBeenCalledWith` on the payload).

## 5. Dual-path client derivation reconciliation

- [x] 5.1 `@myk9/core` `getClassDisplayStatus` (`packages/core/src/helpers/class-display-status.ts`): defer the "completed" verdict to `is_scoring_finalized`; apply the expected/accounted-for definition to the `in_progress`/`not-started` split so it cannot contradict the server.
- [x] 5.2 `@myk9/ringside` `classStatus.ts`: same reconciliation; confirm core and ringside agree for identical inputs.
- [x] 5.3 Unit tests in BOTH packages: scratched-excluded-from-expected, defer-to-finalized, core↔ringside agreement. Rebuild the packages before running app tests that consume built `dist`.

## 6. Show-map attention (Q6)

- [x] 6.1 Surface `reopened_after_closeout_at` as a class-level attention reason in `features/show-map/attention.ts` / the class-node attention aggregation (reuse existing rendering; do not add new UI). **DONE** — `getClassAttention`/`ClassAttentionReason` + `isReopenedClassAttentionNode` in the dynamic `getAttentionCountsByNodeId` aggregation; `reopenedAfterCloseoutAt` on `ShowMapClassInput`/`ShowMapNode`; reuses the existing rollup + "N need attention" badge.
- [x] 6.2 Unit test: a class with non-null `reopened_after_closeout_at` contributes to its node's attention count. **DONE** — attention + showMapActions tests (76 green).
- [x] 6.3 **End-to-end data threading (found during 6.1 review):** the show-map tree reads classes from the **trial store** (`SyncableTrialClass`), not `ReplicatedClass` — so the layer work above is inert until the field flows through. Thread `reopenedAfterCloseoutAt` (a) into the `TrialClass`/`SyncableTrialClass` type, (b) through the `replicated → SyncableTrialClass` mapping in `store/trial-store-helpers.ts` (sourced from `replicated.reopenedAfterCloseoutAt`, wired in ReplicatedClassesTable batch 3), and (c) into the `showClasses` → `ShowMapClassInput` map at `pages/ShowDetailsPage.tsx:248-268` (passed as `mapClasses` at :452).
- [x] 6.4 Test the threading: a class row carrying `reopened_after_closeout_at` reaches `ShowMapClassInput.reopenedAfterCloseoutAt` (mapping-level assertion), so the attention signal actually fires in the app.

## 7. Verify, review, merge, archive

- [x] 7.1 **DONE** — `pnpm typecheck` 26/26; app tests 144 (5 changed files); `@myk9/core` 19 + `@myk9/ringside` 8; ESLint `--max-warnings 0` on all 11 changed source files exit 0.
- [x] 7.2 **DONE** — migration renumbered 130000→180000 (collision with remote `advisor_sweep_mechanical`), merged `origin/main`, pushed `20260712180000` to staging. Rolled-back psql behavioral proof green on live staging: all of 3.1–3.5 PASS (scratch-doesn't-block, manual-override-survives, late-entry-reopens+clears, empty/first-score/absent, backfill fixes-stuck+skips-manual), ROLLBACK.
- [x] 7.3 **DONE** — PR [#1294](https://github.com/rbeezley/myk9-platform/pull/1294). Codex quota-blocked → Claude-substituted fresh-context adversarial review (per policy). Found 4 real findings; all fixed: #3 reopen guard (migration `20260712190000`, staging-verified psql 3.6), #2 stamp-clear on manual complete, #1/#4 intent-aware replicated writes. Re-verified: typecheck clean, replication 433 tests, staging psql 3.1–3.7 all green.
- [x] 7.7 **FOLLOW-UP TRACKED:** resend intent preservation moved to its own `OPEN-TODOS.md` item so this shipped change can archive without losing the non-blocking work. `rebuildUpdatePayload` currently strips all server-owned keys on resend; the follow-up will persist the original mutation's explicit key set alongside `PendingMutation`.
- [x] 7.4 **DONE** — PR #1294 merged; `main` synced; branch/worktree hygiene runs after the archive PR merges.
- [x] 7.5 **DONE** — tracking item closed, decision record marked Complete and moved to `docs/archive/`, docs index row removed.
- [x] 7.6 **DONE** — delta specs synced to `openspec/specs/`; change archived to `openspec/changes/archive/2026-07-12-class-status-auto-derivation/`.
