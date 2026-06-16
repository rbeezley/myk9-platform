# Plan: Server-side gate for public/anon scored results

> **Status:** Active

## Implementation status (2026-06-16)

Code complete; **migration NOT yet pushed** (shared-DB — awaiting confirmation).

- `supabase/migrations/20260616120000_public_results_release_gate.sql` — resolver
  fn + helpers, `view_public_entry_results`, anon REVOKE (anon + PUBLIC) +
  safe-column allowlist, authenticated/service_role re-grants.
- Anon read paths repointed: `publicReads.ts` (new) + branches in
  `useClassEntriesRaw`, `useTrialEntries`, `EntriesTab` (anon → view; authed
  unchanged); TV results + public Podium → view; TV live ring untouched.
- Tests: RLS contract, SQL/TS cascade parity, mapper units (typecheck + 43 tests green).
- **Before push:** run `SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='entries';`
  to confirm the REVOKE targets the real grantor (anon vs PUBLIC).
- Codex second opinion recommended (RLS = high-stakes).

Security follow-up from PR #777 self-review. The `results_released_at` (and the
broader per-field visibility cascade) release gate for public class results is
enforced **only client-side**. Anonymous users — and exhibitors for their own
entries — can directly query withheld scored columns.

## Root cause (verified)

1. **Anon has a broad `SELECT` on `entries`.** Policy `entries_anon_select_for_tv`
   ([108_tv_display_anon_access.sql:13](../supabase/migrations/108_tv_display_anon_access.sql))
   grants anon row access to **every** entry of any non-draft show, with **no
   column restriction and no predicate on the parent class's release state**.
   Anon can `GET /entries?select=final_placement,result_status,search_time_seconds,total_faults&...`
   for any class, released or not. The TV view being `security_invoker=true`
   ([20260613100000](../supabase/migrations/20260613100000_security_revoke_anon_grants.sql))
   does not help — it just defers to this same wide-open anon policy.

2. **The release model is a per-field cascade, not a single boolean.** Visibility
   is governed by `show_result_visibility_defaults` → `trial_result_visibility_overrides`
   → `class_result_visibility_overrides` ([093](../supabase/migrations/093_result_visibility_tables.sql)),
   four fields (placement / qualification / time / faults), each with timing
   `immediate | class_complete | manual_release`. `results_released_at` only
   governs the `manual_release` timing. **Default preset is `open`** (qual/time/faults
   immediate, placement on class-complete) — so a flat `results_released_at IS NOT NULL`
   predicate would *over-block* the default and break the public Podium / TV results.
   Logic of record: [visibility-cascade.ts](../packages/secretary/src/visibility/visibility-cascade.ts).

3. **Three public detail pages leak everything via `select('*')`.** Routes
   `/shows/:id`, `/trials/:trialId`, `/shows/:s/trials/:t/classes/:classId`
   ([publicRoutes.tsx](../apps/myk9show/src/routes/publicRoutes.tsx)) are **not**
   `ProtectedRoute`-wrapped. `ClassDetailsPage` calls `getEntriesByClass`
   ([reads.ts:345](../apps/myk9show/src/services/database/entries/reads.ts)) which
   selects `*` (all scored columns + PII: `special_requests`, `payment_status`,
   `entry_fee`, `stripe_payment_intent_id`, owner email join). Same shape for
   `getEntriesByShow` / `getEntriesByTrial`. These functions are **shared** with
   authenticated scoring/print flows that legitimately need scored columns —
   so the fix cannot simply narrow the function; it must be enforced at the DB layer.

## Why the fix is mechanically bigger than the ticket

Postgres has no "table SELECT minus one column." To stop anon reading
`final_placement` directly, we must `REVOKE SELECT ON entries FROM anon` and
re-`GRANT SELECT (<safe columns>) ON entries TO anon`. That single act:

- closes the scored-results hole (scored columns simply not granted), **and**
- closes the broad PII `*` hole (PII columns not granted), **and**
- breaks every anon `select('*')` / scored-column read until repointed.

A column-nulling view alone is **security theater** here: a determined anon
bypasses any surface and queries the table directly. The grant revoke is required.

## Target design (faithful per-field cascade — user-approved)

### Migration `20260616120000_public_results_release_gate.sql`

1. `resolve_class_result_visibility(p_class_id uuid)` — `SECURITY DEFINER STABLE`,
   `SET search_path`. Resolves show→trial→class cascade (preset expansion + per-field
   override coalescing, mirroring `applyOverride`), derives class state
   (`released` if `results_released_at` set; else `completed` if status completed
   OR `is_scoring_finalized`; else `in_progress`), and returns four booleans:
   `placement_visible, qualification_visible, time_visible, faults_visible`.
   DEFINER so it can read the `authenticated`-only visibility tables on anon's behalf.
2. `view_public_entry_results` — owner-run (`security_invoker=false`), embeds the
   non-draft-show + `deleted_at IS NULL` row filter, CROSS JOIN LATERAL the resolver,
   and `CASE WHEN <field>_visible THEN col ELSE NULL END` for each scored column
   (`final_placement`←placement; `result_status`/`result_text`/`is_scored`-qual←qualification;
   `search_time_seconds`/`total_score`←time; `total_faults`←faults). Plus safe
   identity/scheduling cols + flattened dog/class labels. `GRANT SELECT` to anon, authenticated.
3. `REVOKE SELECT ON public.entries FROM anon;` then
   `GRANT SELECT (<safe allowlist>) ON public.entries TO anon;`
   Safe allowlist (identity/scheduling only): `id, class_id, trial_id, show_id,
   dog_id, armband, handler, run_order, is_in_ring, is_scored, check_in_status,
   entry_status, jump_height, created_at`. **Excludes** all scored + PII columns.
   New columns are not auto-granted → default-safe.
4. Drop the now-redundant `entries_anon_select_for_tv` policy (grant is the gate now)
   — or keep it; document. `NOTIFY pgrst`.

### App read-path repoints (anon surfaces only; authenticated unaffected)

- TV live ring `getPostgrestTVDisplayData` — already selects only safe columns;
  verify it still works under the allowlist (dogs join is a separate grant).
- TV results `getPostgrestTVDisplayResults` — repoint to `view_public_entry_results`.
- Public Podium `useShowResults` — repoint from `view_entry_with_results` to
  `view_public_entry_results`.
- Public detail pages (`ClassDetailsPage`, `ShowDetails EntriesTab`, `TrialDetailsPage`):
  when unauthenticated, read entries through the safe view rather than the shared
  `select('*')` functions (which stay intact for authenticated scoring/print).

### Tests

- pgTAP/SQL or app-level: anon **cannot** read `final_placement` for an unreleased
  (`manual_release`/`review`) class; **can** for a released one; cascade matrix
  (immediate/class_complete/manual_release × in_progress/completed/released).
- Unit: `resolve_class_result_visibility` parity with `getVisibleResultFields`.
- Regression: TV live ring + Podium still render for anon.

## Open sub-problem (separate, narrower)

Migration 129 lets an **authenticated exhibitor** read their **own** entry row in
full — including `final_placement` before release. RLS cannot null columns, so
gating an exhibitor's own early result needs a column-nulling view for the
authenticated own-entries path too. Tracked here; **out of scope** for this PR
unless folded in.

## Process

Shared-DB security migration → up-front confirmation before `supabase db push`;
Codex second opinion per CLAUDE.md (RLS = high-stakes).
