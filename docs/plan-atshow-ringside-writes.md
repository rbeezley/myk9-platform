# Plan: At-Show Ringside — wire deferred writes + judge/steward write authorization

> **Status:** Active

> **Progress (2026-06-21):** Phases 0–4 implemented + verified locally (typecheck 25/25, lint clean, ratchet at baseline, 539 at-show/replication app tests + 58 MutationManager tests green incl. new RPC-branch + routing tests). Print (3d) was **removed from /at-show, not wired** — reports live only on the secretary Reports page (user decision; `context.hidePrintOptions`).
>
> **DB PUSH DONE:** migration applied to staging as **20260621171500_ringside_update_entry.sql** (renamed from 120000 — collided with a co-resident agent's already-applied version; Supabase tracks by timestamp). Function verified live (signature + grants). Secretary club-scope OK (auditor Finding 8). **Live judge repro still blocked by two non-code items:** (a) `judge_assignments` is empty on staging — seed §11 not applied to current data, so the RPC judge tier can't authorize; (b) client RPC routing isn't deployed (staging deploys from main → post-merge). Manager path is live-ready; judge path needs seed + merge/deploy.

Written against commit `824f3d5d0` (2026-06-21). Scope: `apps/myk9show/src/features/at-show/`, `packages/ringside/`, `packages/replication/`, `supabase/migrations/`.

## Problem

Four at-show ringside write paths are intentional spike stubs (run-order presets + drag-persist, score-reset, placement-recalc, print). Wiring them surfaced a deeper blocker: **judge and steward roles have no server-side write path to `entries`.**

- At-show writes go `replicatedEntriesTable.updateEntry()` → `MutationManager` direct PostgREST UPDATE with the **signed-in user's JWT** (the passcode grant is client-only; RLS sees the account's real roles).
- The `entries` UPDATE policy ([`20260604004045`](../supabase/migrations/20260604004045_restrict_entries_update_to_managers.sql)) gates only on `can_manage_show()` = `is_club_admin OR is_trial_secretary OR is_platform_admin` ([`038`](../supabase/migrations/038_fix_trial_class_rls_with_helper_functions.sql)). Judge/steward are excluded; no scoring RPC exists.
- Result: a judge scoring at ringside writes IndexedDB optimistically, then the sync UPDATE silently matches 0 rows under RLS → failed-mutation queue, no user error. **Scoring — the core judge action — does not persist today**, and wiring the stubs for judges would add three more silent-failure paths.

See memory `project_atshow_judge_write_rls_gap`.

## Decision (locked with user 2026-06-21)

Add a **SECURITY DEFINER RPC `ringside_update_entry`** that authorizes manager OR assigned-judge OR show-scoped-steward and writes only whitelisted ringside columns. Route ringside `entries` writes through it while **preserving offline-first** (the RPC becomes the sync-replay target, not a direct online call).

## Schema facts (verified)

- `judge_assignments(person_id→people, class_id, show_id, trial_id, status)` — caller assigned to a class: `auth.uid()→people.auth_user_id→people.id = ja.person_id AND ja.class_id = entry.class_id`. Treat `status IN ('invited','confirmed')` as active (confirm with user).
- Role helpers (mig 156 / 163): `is_trial_secretary(club_id)`, `is_club_admin(club_id)`, `is_site_admin()`, `is_show_official(show_id)` (already admits steward scoped to show). All check `is_active` + `expires_at`.
- `entries.version` auto-increments via BEFORE UPDATE trigger (mig `20260608200000`); OCC = `WHERE version = p_expected_version`.
- Payment-protection triggers (`20260611240000` / `_insert`) block `entry_fee`/`payment_method`/`stripe_payment_intent_id` for non-service roles — SECURITY DEFINER runs as postgres (not service_role), so the whitelist MUST exclude these.
- Scoring-completion trigger (`20260525170000`) fires on `is_scored/result_status/search_time_seconds/total_faults/points_earned` changes and **auto-recalculates `final_placement`** for the class.
- Writable ringside set: `run_order, check_in_status, is_in_ring, is_scored, result_status, search_time_seconds, area{1..4}_time_seconds, total_correct_finds, total_incorrect_finds, total_faults, no_finish_count, area{1..3}_{correct,incorrect,faults}, total_score, points_earned, points_possible, bonus_points, penalty_points, time_over_limit, time_limit_exceeded_seconds, final_placement, judge_notes, judge_signature, judge_signature_timestamp, disqualification_reason, has_video_review, video_review_notes, ring_entry_time, ring_exit_time, scoring_started_at, scoring_completed_at`.
- Protected / NOT writable by RPC: all payment/refund/stripe/comp/discount/promo, `entry_status`, `entry_source`, identity FKs, `version`, sync/system columns.

## Phases

### Phase 0 — Foundational fixes — DONE
- Drag grace-timer unmount cleanup ([`useDragAndDropEntries.ts`](../packages/ringside/src/pages/EntryList/hooks/useDragAndDropEntries.ts)).
- `parsePasscode` case-insensitivity test.
- Verified: typecheck 25/25, ringside tests green.

### Phase 1 — DB: `ringside_update_entry` RPC  — WRITTEN + DUAL-REVIEWED (db push still gated)
Reviewed by Claude `migration-auditor` (structurally sound) + Codex `exec review` (no P0). All findings folded in: null show/club context rejected; payload filtered to allowed keys before `jsonb_populate_record` (coercion isolation); authoritative post-trigger version re-read (P1 stale-OCC fix); deleted-vs-conflict disambiguation; OCC enforced on no-op. Remaining gate: `supabase db push` confirmation + live secretary-scope check (auditor Finding 8).

*(original spec below)*

### Phase 1 spec — `ringside_update_entry` RPC
New migration `supabase/migrations/<ts>_ringside_update_entry.sql`:
- `ringside_update_entry(p_entry_id uuid, p_fields jsonb, p_expected_version int)` `returns int` (new version), `language plpgsql security definer set search_path = ''`.
- Resolve caller person_id from `auth.uid()`. Load entry's `show_id, class_id, version`.
- **Authz tiers:**
  - manager = `is_site_admin() OR is_trial_secretary(club) OR is_club_admin(club)` → full whitelist.
  - assigned judge (`judge_assignments` for entry.class_id) → full whitelist (scoring + run-order + check-in + placement).
  - steward (`is_show_official(show_id)` AND steward role scoped to show) → run-order + check-in ONLY (`canScore:false` parity); reject score/placement fields.
  - else `RAISE EXCEPTION ... errcode = '42501'`.
- Reject any key in `p_fields` not in the role's allowed set (defense-in-depth over the trigger).
- OCC: `UPDATE ... WHERE id = p_entry_id AND version = p_expected_version`; if 0 rows, distinguish stale-version vs not-found and RAISE with a distinct errcode so the client can resync.
- `revoke all ... from public; grant execute ... to authenticated;` + `notify pgrst`.
- **Tests:** pgTAP-style or seed-account integration: manager writes OK; assigned judge writes scoring OK; unassigned judge denied; steward denied scoring but OK run-order; payment field rejected; stale version rejected.
- Add `ringside_update_entry` Args/Returns to `database.types.ts` (hand-add per memory `feedback_typecheck_incremental_cache_masks_new_files`).

### Phase 2 — Replication: route entries writes through the RPC (offline-preserving) *(affects myK9Q — rebuild dist)*
- Add an optional per-table sync override to `MutationManager` config, e.g. `updateVia?: Record<tableName, { rpc: string }>`. Default unchanged → myK9Q untouched.
- In `executeMutation` UPDATE branch: if an override exists for `tableName`, call `supabase.rpc(rpc, { p_entry_id: data.id, p_fields: <data minus id/version>, p_expected_version: mutation.serverVersion })` instead of `.update()`. Preserve the existing 0-row / RLS-rejection classification and `newServerVersion` capture from the RPC return.
- myK9Show replication init registers `entries → ringside_update_entry`.
- **Tests:** unit on `executeMutation` taking the RPC branch with version; assert RLS-rejection still classified; assert payload excludes protected columns.

### Phase 3 — Client wiring (the four stubs)
- **3d Print — REMOVED, not wired (user decision 2026-06-21):** reports belong only on the secretary Reports page; the at-show print menu was a myK9Q-era holdover from the Access-upload workflow. Hidden via a new optional `context.hidePrintOptions` flag on the ringside EntryList context (set `true` by both at-show host pages); the host print handlers remain as unreachable no-ops to satisfy the `EntryListHandlers` contract. Consistent with CLAUDE.md "consolidate, don't duplicate / deletions are a feature."
- **3a Run-order:** `handleApplyRunOrder` non-manual presets → `calculateRunOrder()` ([`lib/runOrderUtils.ts`](../apps/myk9show/src/lib/runOrderUtils.ts)) then persist each via `updateEntry({ runOrder })`; wire `updateExhibitorOrder` drag callback ([`AtShowEntryListPage.tsx`](../apps/myk9show/src/features/at-show/AtShowEntryListPage.tsx)) to persist + `refresh()`.
- **3b Score reset:** `handleResetScore` ([`useAtShowEntryListActions.ts:111`](../apps/myk9show/src/features/at-show/useAtShowEntryListActions.ts)) → `updateEntry({ is_scored:false, result_status:'pending', search_time_seconds:0, total_faults:0, finalPlacement:null, scoringCompletedAt:null, disqualification_reason:null })` (mirror `usePaperScoring.clearEntry`); `confirmResetScore` calls the action then refreshes (drop optimistic-only clear). Scoring-completion trigger clears stale placements automatically.
- **3c Placement recalc:** `handleRecalculatePlacements` → fetch class (element→format), get scores from offline store, `placementCalculatorService.calculatePlacements()`, persist `updateEntry({ finalPlacement })`. Note: writing scores already auto-recalcs server-side; this is the manual backstop. Confirm we don't double-apply.

### Phase 4 — Verification
- `pnpm --filter @myk9/ringside build` + `@myk9/replication build` (dist for app tests).
- `pnpm typecheck`, full `pnpm lint`, `pnpm qa:code-quality-ratchet`.
- Unit tests for each wired handler (assertion-first on the exact field payloads).
- Live verify on staging (demo show `dededede-…010`): score as `judge@myk9t.com` and confirm it PERSISTS after reload (the original silent-failure repro).

## Sequencing & gates
1. Phase 0 ✅. 2. Phase 3d (print) — safe, no gate. 3. Phase 1 (migration; Codex + db push confirm). 4. Phase 2 (replication; affects myK9Q). 5. Phase 3a/3b/3c on top. 6. Phase 4.
- **Gated actions needing user confirmation:** `supabase db push`, Codex review of the migration, shared-package change review.
- Each phase is its own PR (mixed DB+code → PR, not direct-to-main).

## Resolved decisions (2026-06-21)
- **Steward scope:** run-order + check-in only (matches ringside matrix `canScore:false`). RPC ignores score/placement fields for stewards.
- **judge_assignments filter:** `status IN ('confirmed','invited')`.
- **Replication routing:** NOT a per-table override (too broad — would route secretary entry-management edits through the ringside RPC and drop their non-ringside columns). Use **per-mutation tagging**: `updateEntry(id, updates, { viaRpc: 'ringside_update_entry' })` threads a tag onto the queued mutation; only at-show writes carry it. MutationManager routes tagged mutations through the RPC, untagged ones stay direct UPDATE. myK9Q + secretary screens untouched.
- **RPC whitelist semantics:** the replication payload is the FULL row, so the RPC **ignores** (intersects out) non-whitelisted keys rather than rejecting — only whitelisted columns present in `p_fields` enter the SET clause.
