## Why

Class status (`upcoming` / `in_progress` / `completed`) is already auto-derived server-side from scoring events by `refresh_class_scoring_state()` (shipped in migration `20260525170000`, live body at `20260615160000`). But three gaps make it unreliable for show-day secretaries: (1) a **latent bug** — the completeness count treats every entry as expected-to-score, so a single scratched dog or no-show keeps a class stuck `in_progress` forever and it never auto-completes; (2) a manual "Mark Complete"/"Mark Started" is silently overwritten by the next scoring write because there is no override marker; and (3) a late entry added to an already-complete class is not reacted to at all (the trigger is `UPDATE`-only), so new work can hide under a closed class. All three directly undermine the secretary's ability to trust the board on show day, which is the fall-2026 launch priority. The PO edge-case rules were locked 2026-07-12 (`docs/plan-class-status-auto-derivation.md`).

## What Changes

- **Fix the completeness definition** (PO Q1): count only *expected* entries (not `scratched`/`withdrawn`/`cancelled` and not `pulled`) and treat an entry as *accounted-for* when `is_scored` OR its `result_status` is a non-scored terminal outcome (`absent`/`excused`). A class completes when all expected entries are accounted-for — so a no-show no longer blocks completion. **This corrects existing live behavior.**
- **Add an override marker** (PO Q4/Q5): new `classes.status_source` column (`'derived' | 'manual'`, default `'derived'`). `refresh_class_scoring_state()` skips the status write when `status_source = 'manual'` (still refreshes `scored_count` for display). The manual `mark-class-started` / `mark-class-complete` mutations set `status_source = 'manual'` in the same offline-first replicated payload.
- **React to late entries** (PO Q6): broaden the derivation trigger to fire on `INSERT`/`DELETE` of entries too. An entry added to a `completed` or manually-closed class flips it back to `in_progress`, **clears** `status_source` to `'derived'`, and stamps a new `classes.reopened_after_closeout_at`. The show-map attention layer reads that stamp as a class-level attention reason so the secretary who force-closed the class is told new work appeared.
- **Reconcile client derivation with the server** (dual-path): the two client-side class-status derivations (`@myk9/core` `getClassDisplayStatus`, `@myk9/ringside` `classStatus.ts`) adopt the same expected/accounted-for definition (or defer to `is_scoring_finalized`) so the client never contradicts the server-stored status.
- Extend the **existing** function and trigger handler rather than adding a competing `AFTER` trigger (triggers fire in alphabetical name order — a second trigger is an ordering hazard against the placement recalc).

## Capabilities

### New Capabilities
- `class-status-derivation`: Server-authoritative derivation of `classes.status` from entry scoring state — the expected/accounted-for completeness definition, the manual-override marker that survives recompute, and the late-entry reopen/attention behavior.

### Modified Capabilities
- `status-display`: Adds a requirement that the client-side class/scoring-status classifiers agree with the server-derived stored status (same completeness definition or deference to `is_scoring_finalized`), extending the existing "single classifier per status domain, no drift" rule to cover client↔server drift, not just client↔client.

## Impact

- **DB (migration):** extend `refresh_class_scoring_state()` + `handle_entry_scoring_state_change()`; broaden trigger `entries_refresh_class_scoring_state` to `INSERT`/`DELETE`; add `classes.status_source` + `classes.reopened_after_closeout_at`; one-time backfill recompute of existing classes (webhook-guarded). No GRANT changes (function stays `SECURITY DEFINER`).
- **Replication:** `ReplicatedClassesTable` mapper (`mapClassStatusToDb` / `toSupabaseRow`) carries `status_source`; manual mark-class mutations (`showMapActionMutations.ts`) set it.
- **Client derivation:** `@myk9/core` `getClassDisplayStatus` + `@myk9/ringside` `classStatus.ts` completeness definition.
- **Show-map:** attention layer reads `reopened_after_closeout_at` as a class-level attention reason (reuses existing `attention.ts` rendering).
- **Webhooks (fire-timing only):** `trg_notify_class_status_push` / scoring push fire when derived status transitions change — no schema change to them, but timing shifts (expected in tests).

## Non-Goals

- **No new page, dialog, or status surface.** This reuses the existing show-map status chips and attention count; it does not add an "empty class closeout" UI or a new status dashboard. The manual mark-class actions already exist — this only makes their result stick.
- **No auto-closing of empty (0-entry) classes.** An empty class stays `upcoming`; formal closeout remains the manual override (PO Q4). Auto-close-on-wrap-up is explicitly deferred past v1.
- **No change to briefing semantics.** Briefing time stays informational; it does not trigger `in_progress` (PO Q2) — satisfied for free because the trigger fires on `entries`, not `classes.briefing_time`.
- **No new scoring write path.** Every scoring write is already an `UPDATE public.entries`; this rides the existing paths (`ringside_update_entry` RPC + direct replicated update).
