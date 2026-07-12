## 1. Confirm the two open decisions (apply-time gate)

- [ ] 1.1 Confirm D2 accounted-for predicate: `result_status IN ('absent','excused')` is the complete non-scored terminal set (verify no other terminal `result_status`/`entry_status` value should count as accounted-for in current data). Record the decision in `design.md`.
- [ ] 1.2 Confirm D1 backfill = YES and pick the webhook-guard mechanism (session-GUC check inside the push trigger vs. temporarily disabling `trg_notify_class_status_push` in-transaction) by reading the current push-trigger body. Record in `design.md`.

## 2. Migration — schema + derivation

- [ ] 2.1 Pre-flight (migration-auditor + repo lessons): `supabase migration list` to confirm remote state; read the **live** `refresh_class_scoring_state` body at `20260615160000_add_shows_is_nationals_placement_source.sql:37-108` (extend that, not the original); confirm the `entries` CHECK values for `entry_status`/`result_status`/`check_in_status` and the `classes.status` CHECK (migration 138).
- [ ] 2.2 New migration `NNN_class_status_auto_derivation.sql`: add `classes.status_source text NOT NULL DEFAULT 'derived' CHECK (status_source IN ('derived','manual'))` and `classes.reopened_after_closeout_at timestamptz NULL`. (Additive columns; no new table, so no new GRANTs required — confirm existing `classes` grants cover the new columns.)
- [ ] 2.3 `CREATE OR REPLACE FUNCTION refresh_class_scoring_state()` from the live body with: the new expected/accounted-for completeness predicate (Decision 2); an early-return from the *status* write when `status_source = 'manual'` (still update `scored_count`); clear `reopened_after_closeout_at` when the class legitimately reaches `completed`.
- [ ] 2.4 `CREATE OR REPLACE FUNCTION handle_entry_scoring_state_change()` to handle `TG_OP IN ('INSERT','DELETE')`: on INSERT of an expected entry into a `completed`/`manual` class → set `in_progress`, reset `status_source='derived'`, stamp `reopened_after_closeout_at=now()`; on DELETE re-derive the affected class.
- [ ] 2.5 Recreate trigger `entries_refresh_class_scoring_state` as `AFTER INSERT OR DELETE OR UPDATE OF <existing 6 cols>` with an updated `WHEN` guard (INSERT/DELETE have no OLD/NEW pair for the UPDATE guard — split the trigger definition appropriately). Keep it the single scoring-side `classes.status` writer.
- [ ] 2.6 Webhook-guarded one-time backfill: `PERFORM refresh_class_scoring_state(id)` over all classes where `status_source <> 'manual'`, with the push webhook suppressed per 1.2. End with `NOTIFY pgrst, 'reload schema';`.
- [ ] 2.7 Run the `migration-auditor` agent over the new migration; fix any findings.

## 3. Migration — behavioral tests (psql rolled-back)

- [ ] 3.1 Test: scratched dog does not block completion — class with all-expected accounted-for + one scratched → derives `completed`.
- [ ] 3.2 Test: manual override survives recompute — set `status_source='manual'` + `completed`, then score another entry → status stays `completed`, `scored_count` updates.
- [ ] 3.3 Test: late-entry reopen — INSERT expected entry into a `completed` class → `in_progress`, `status_source='derived'`, `reopened_after_closeout_at` set; and clears a prior `manual` override.
- [ ] 3.4 Test: empty class stays `upcoming`; first score → `in_progress`; absent/excused counts as accounted-for.
- [ ] 3.5 Test: backfill recomputes a stuck `in_progress` class to `completed` and skips a `manual` class (run in a rolled-back txn against a seeded fixture).

## 4. Replication + manual-override client wiring

- [ ] 4.1 `ReplicatedClassesTable`: carry `status_source` (and `reopened_after_closeout_at` read) through `mapClassStatusToDb`/`toSupabaseRow` and the read mapper (update BOTH the replication mapper and any PostgREST fallback `.select` — dual-path).
- [ ] 4.2 `showMapActionMutations.ts` `markShowMapClassStarted`/`markShowMapClassComplete`: include `status_source: 'manual'` in the same `updateClass` payload.
- [ ] 4.3 Unit tests: mapper round-trips `status_source`; manual mutations set `status_source='manual'` (assertion-first `toHaveBeenCalledWith` on the payload).

## 5. Dual-path client derivation reconciliation

- [ ] 5.1 `@myk9/core` `getClassDisplayStatus` (`packages/core/src/helpers/class-display-status.ts`): defer the "completed" verdict to `is_scoring_finalized`; apply the expected/accounted-for definition to the `in_progress`/`not-started` split so it cannot contradict the server.
- [ ] 5.2 `@myk9/ringside` `classStatus.ts`: same reconciliation; confirm core and ringside agree for identical inputs.
- [ ] 5.3 Unit tests in BOTH packages: scratched-excluded-from-expected, defer-to-finalized, core↔ringside agreement. Rebuild the packages before running app tests that consume built `dist`.

## 6. Show-map attention (Q6)

- [ ] 6.1 Surface `reopened_after_closeout_at` as a class-level attention reason in `features/show-map/attention.ts` / the class-node attention aggregation (reuse existing rendering; do not add new UI).
- [ ] 6.2 Unit test: a class with non-null `reopened_after_closeout_at` contributes to its node's attention count.

## 7. Verify, review, merge, archive

- [ ] 7.1 `pnpm typecheck` (clear the app tsbuildinfo cache — new DB columns + types), `pnpm lint`, and the affected app/package vitest suites; report evidence.
- [ ] 7.2 `db-push` the migration to staging (shared-system mutation — confirm before push); verify live via a rolled-back psql behavioral proof of the three headline behaviors.
- [ ] 7.3 Open PR; run `/review` and (high-stakes: migration + trigger + money-adjacent show-day path) a `/codex:review` second opinion; address findings.
- [ ] 7.4 Merge; sync `main`; run branch/worktree hygiene.
- [ ] 7.5 Update tracking docs: mark the OPEN-TODOS "Draft + implement class-status auto-derivation full plan" item done; flip `docs/plan-class-status-auto-derivation.md` status to Complete and `git mv` it to `docs/archive/` per the docs convention; add `> Tracked in openspec change: class-status-auto-derivation` was already the linkage — ensure the archived stub notes shipment.
- [ ] 7.6 `opsx:sync` delta specs to `openspec/specs/` and archive the change.
