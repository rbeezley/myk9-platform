## Context

Server-side class-status derivation already exists and is the **sole DB-side writer** of `classes.status` for scoring: `refresh_class_scoring_state(p_class_id)` (SECURITY DEFINER), invoked by the `AFTER UPDATE OF <6 scoring cols>` trigger `entries_refresh_class_scoring_state`, both from migration `20260525170000`. The function body has been superseded twice; the **live body is `20260615160000_add_shows_is_nationals_placement_source.sql:37-108`** — the extension must build on that, not the original.

Grounding facts established during exploration:
- **Every scoring write is an `UPDATE public.entries`** touching `is_scored`/`result_status`/scoring columns — both the `ringside_update_entry` RPC (judge/steward/passcode tiers) and the direct `replicatedEntriesTable.updateEntry` PostgREST path (manager/secretary). So an `AFTER UPDATE` trigger already catches all scoring paths. INSERT/DELETE of entries is **not** caught today.
- DB status enum is lowercase: `upcoming | setup | in_progress | completed | cancelled` (CHECK in migration `138`). Client display type is `not-started | in-progress | completed`.
- Manual `mark-class-started` / `mark-class-complete` write `classes.status` **directly through the offline-first `ReplicatedClassesTable`** (`showMapActionMutations.ts:83-97`), **not** an RPC. This is the offline-first constraint: the override marker must ride the same replicated payload so it syncs like any other class field.
- `entries` has 6 BEFORE-UPDATE and 2 AFTER-UPDATE triggers; Postgres fires per-timing triggers in **alphabetical name order**. `entries_refresh_class_scoring_state` must remain the single scoring-side `classes.status` authority — folding new logic into its function/handler avoids ordering hazards.
- An existing attention system (`apps/myk9show/src/features/show-map/attention.ts`, `getAttentionCountsByNodeId`) renders a class/entry attention count, but the tree's baked `node.attentionCount` is entry-only (`showMapActions.ts:680`); a class-level "reopened" reason is new signal, existing rendering.
- Client derivation exists in **two** places that must not diverge from the server: `@myk9/core` `getClassDisplayStatus` (`packages/core/src/helpers/class-display-status.ts`) and `@myk9/ringside` `classStatus.ts`.

PO edge-case rules locked 2026-07-12 in `docs/archive/plan-class-status-auto-derivation.md` (that doc is the design/decision record; this change is tracked there via a backlink).

## Goals / Non-Goals

**Goals:**
- Auto-complete a class when every *expected* entry is accounted-for, so a scratch/no-show never blocks completion (fixes a live latent bug).
- Make a manual "Mark Complete"/"Mark Started" survive subsequent scoring recomputes (override marker).
- React to a late entry added to a closed class: reopen, clear the override, and flag it for the secretary.
- Keep client-rendered class status in agreement with the server-stored status.
- Achieve all of the above by **extending the existing function + trigger**, offline-first-safe, with no new UI surface.

**Non-Goals:**
- No auto-close of empty (0-entry) classes; that stays a manual override (PO Q4).
- No briefing-triggered status (PO Q2) — fires on entries only, so free.
- No new scoring write path, no new status page/dialog, no second trigger competing with the placement recalc.

## Decisions

### Decision 1 — Extend the existing function/trigger, not add a new one
Fold all new logic into `refresh_class_scoring_state()` + `handle_entry_scoring_state_change()` and broaden the existing trigger. **Alternative considered:** a separate `AFTER INSERT OR DELETE` trigger. **Rejected** — triggers fire alphabetically; a new trigger's ordering relative to the placement recalc would depend on its name, and two functions writing `classes.status` invites divergence. One authority, one code path.

### Decision 2 — Completeness predicate (PO Q1 + emergent D2)
Replace `total = COUNT(*)` / `done = is_scored` with:
- **expected**: `entry_status NOT IN ('scratched','withdrawn','cancelled') AND (check_in_status IS DISTINCT FROM 'pulled')`
- **accounted-for** (among expected): `is_scored = true OR result_status IN ('absent','excused')`
- class is `completed` when `expected > 0 AND accounted = expected`; `in_progress` when `accounted > 0` (or any expected entry has started scoring) and not yet all; `upcoming` when `accounted = 0`; empty (`expected = 0`) stays `upcoming`.

**Emergent D2 — the accounted-for terminal set = `result_status IN ('absent','excused')`.** Rationale: `result_status` enum is `pending|qualified|nq|absent|excused|withdrawn`; there is no literal "DQ". `nq` entries are `is_scored = true` already, so they're covered by the `is_scored` arm. `withdrawn` is already excluded from *expected*. So the only non-scored-but-terminal states are `absent` and `excused`. **Recommended default — confirm during apply.**

### Decision 3 — Override marker via a replicated column (PO Q4/Q5)
Add `classes.status_source text NOT NULL DEFAULT 'derived' CHECK (status_source IN ('derived','manual'))`. `refresh_class_scoring_state()` early-returns from the *status* write when `status_source = 'manual'`, but still updates `scored_count` (display stays live). Manual mark-class mutations set `status_source = 'manual'` **in the same replicated `updateClass` payload** — carried through `mapClassStatusToDb`/`toSupabaseRow`. **Alternative considered:** an RPC that sets status+marker atomically. **Rejected** — the manual path is deliberately offline-first (`ReplicatedClassesTable`); routing it through an online RPC would break show-day-offline manual closeout.

### Decision 4 — Late-entry reopen + attention (PO Q6)
Broaden the trigger to `AFTER INSERT OR DELETE OR UPDATE OF <cols>`. On INSERT of an expected entry into a class whose current `status = 'completed'` (or `status_source = 'manual'`): set `status = 'in_progress'`, reset `status_source = 'derived'`, stamp `reopened_after_closeout_at = now()`. The show-map attention layer reads `reopened_after_closeout_at` as a class-level attention reason (existing `attention.ts` rendering; new signal only). The stamp is cleared the next time the class legitimately reaches `completed` again. **Alternative considered:** a Postgres `NOTIFY`/toast. **Rejected** — the durable column survives offline/reconnect and reuses the show-map attention surface the secretary already watches, rather than a transient notification.

### Decision 5 — Dual-path client reconciliation (status-display delta)
`@myk9/core` `getClassDisplayStatus` and `@myk9/ringside` `classStatus.ts` adopt the same expected/accounted-for definition, OR defer to `is_scoring_finalized` (the server sets it authoritatively when it writes `completed`). Preference: **defer to `is_scoring_finalized` for the "completed" verdict** so the client cannot contradict a server completion even if its local entry snapshot is mid-sync; use the shared expected/accounted math only for the `in_progress` vs `not-started` split. This keeps the client honest without recomputing completion locally.

### Decision 6 — Migration backfill (emergent D1)
**Recommended: YES.** Run a one-time `PERFORM refresh_class_scoring_state(id)` over all existing classes in the migration so the completeness fix reaches classes currently stuck `in_progress` behind a scratch/no-show. Guard the class-status push webhook during backfill (e.g. `SET LOCAL` a session GUC the push trigger checks, or temporarily disable `trg_notify_class_status_push` inside the migration transaction) so a mass status flip does not fan out hundreds of push notifications. Skip classes already `status_source = 'manual'`. **Confirm during apply.**

## Risks / Trade-offs

- **Backfill mass-flips existing classes** → recompute is idempotent and guarded from the push webhook; manual-override classes are skipped; runs inside one transaction with a clear rollback (drop columns + restore prior function body).
- **Webhook fire-timing shift (emergent D3)** — changing *when* a class flips to `in_progress`/`completed` changes when `trg_notify_class_status_push` and the scoring push fire. → No schema change to the webhooks; document the shift so testers expect it; the guard above prevents the backfill itself from firing them.
- **Client/server disagreement during sync** → Decision 5 defers the "completed" verdict to server `is_scoring_finalized`, so a mid-sync client cannot show "in progress" for a server-completed class.
- **`check_in_status` / `entry_status` NULLs** → predicate uses `IS DISTINCT FROM` and `NOT IN` carefully so NULL check-in never wrongly excludes an entry from *expected*.
- **Offline manual override then online scoring** → the marker is written in the same replicated payload; on sync, conflict resolution keeps the manual marker and the trigger respects it. Covered by an offline-first behavioral test.

## Migration Plan

1. Migration adds `classes.status_source` + `classes.reopened_after_closeout_at`; redefines `refresh_class_scoring_state()` (from the live `20260615160000` body) with the new predicate + override early-return + reopen logic; redefines `handle_entry_scoring_state_change()` to handle INSERT/DELETE; recreates the trigger with `AFTER INSERT OR DELETE OR UPDATE OF <cols>`.
2. Webhook-guarded one-time backfill recompute (skip `status_source='manual'`).
3. `NOTIFY pgrst, 'reload schema'`.
4. Client: replicated-table mapper carries `status_source`; manual mutations set it; reconcile the two `getClassDisplayStatus` derivations.
5. **Rollback:** drop the two columns and `CREATE OR REPLACE` the function back to the `20260615160000` body; recreate the trigger with the original `AFTER UPDATE OF` column list. No data loss (columns are additive).

## Open Questions

- **D1 backfill** and **D2 accounted-for predicate** carry recommended defaults above — confirm at apply time (they shape the migration).
- Backfill webhook-guard mechanism: session-GUC check inside the push trigger vs. temporarily disabling the trigger in-transaction — pick the one that matches the existing push-trigger implementation during apply.
