## Context

The offline-first replication layer (`@myk9/replication`) is architecturally sound: writes are IndexedDB-first with a synchronous localStorage backup, dirty rows are guarded against server pulls at three layers, quota eviction skips dirty rows, and OCC conflicts hold the local score rather than dropping it. The July 2026 audit nonetheless found several places where a *failure path routes around the safety net*: the queue is durable but the scoring submit swallows its exceptions; the localStorage backup exists but circuit-breaker recovery never reads it; the dirty-guard exists but one hot read path bypasses it with a two-transaction read-modify-write. The fixes are surgical and localized — no new architecture, no schema migration, no RLS change (the ringside write-authz gap is already closed by `ringside_update_entry`).

Stakeholders: ringside judges (primary — they can't recover a released run), secretaries (see the synced results), and the platform's fall 2026 launch readiness gate.

## Goals / Non-Goals

**Goals:**
- Close every confirmed path where a queued score is silently lost or shown as saved when it wasn't.
- Make sync state truthful and give judges a "safe to close the iPad" signal.
- Land each phase behind vitest coverage, assertion-first for the value-sensitive fixes (per project convention).

**Non-Goals:**
- No new pages, routes, sheets, or dialogs — Phase 3 reuses the existing `SyncIndicator` slot and account-menu/sync-panel surfaces.
- No server-side dead-letter service or backend changes.
- No rework of the OCC conflict-surfacing kill switch beyond what ordering correctness requires.
- Deferred (audit L-tier, non-blocking): dead TTL machinery cleanup, legacy `ConflictResolver`/`ConflictManager` removal, `conflictCount` increment-vs-set diagnostics.

## Decisions

**D1 — Fail-closed submit, fail-open retry.** The two error philosophies are deliberately opposite. At *submit* time, an error means the score may not be persisted, so we fail **closed**: block success, show the error, keep the judge on the sheet. At *upload retry* time, the score is already durable, so an ambiguous error should not throw the score away — we fail **open**: unknown/unclassified errors exhaust the retry budget; only affirmatively-permanent errors (RLS, 4xx, constraint) dead-letter. Alternative considered: keep dead-lettering unknowns and rely on the failed-store UI. Rejected — it depends on the judge noticing a toast after they've navigated away, and combined with recovery-wipe it becomes real loss.

**D2 — Recovery snapshots mutations, not the whole DB.** Rather than teach `recover()` to preserve object stores selectively (fragile across schema versions), snapshot `pending_mutations` + `failed_mutations` to localStorage immediately before `deleteDB`, then restore after re-open. This reuses the existing backup format, extended to include `status: 'failed'` (today `parseMutationBackup` filters those out). Alternative: avoid `deleteDB` and surgically repair — rejected as unreliable against genuinely corrupt databases, which is the case `recover()` exists for.

**D3 — Access-tracking write becomes side-effect-only.** The `getReplicatedRow` race is fixed by not rewriting `data`/`isDirty` from a stale read. Preferred fix: perform access-stat updates in a single readwrite transaction that re-reads inside the tx; acceptable alternative: write only the access-stat fields via an index/patch that never carries `data`/`isDirty`. This mirrors the already-shipped fix in `markAsSynced`/`reconcileDirtyRow` (single readwrite tx, PR #351).

**D4 — Ordering by monotonic sequence, not timestamp.** Add a persisted counter (in `sync_metadata`) assigned at `queueMutation` time and make it the primary sort key in `mutation-ordering.ts`, with timestamp as tiebreaker only. This closes the same-millisecond re-stamp bug at the root instead of trying to detect it during upload.

**D5 — Cross-tab upload leadership via `navigator.locks`.** Wrap `uploadPendingMutations` in `navigator.locks.request('replication-upload', ...)` and add an existence re-check before the OCC-backoff `db.put` so a losing tab can't resurrect a deleted mutation. `navigator.locks` is available in all target browsers including iOS Safari 15+. Alternative: BroadcastChannel leader election — more code, weaker guarantee.

**D6 — Persistence requested, degrade gracefully.** Call `navigator.storage.persist()` at app startup and on `/at-show` entry; treat denial as non-fatal but, on iOS Safari (non-standalone) with unsynced work present, show the existing Add-to-Home-Screen nudge. This is the standard mitigation for the Safari 7-day ITP purge that otherwise kills both IDB and the localStorage backup together.

**D7 — Transparency reads one source of truth.** Delete the `Math.random()` mock hooks and re-point `AccountMenuContent` / `SyncStatusPanel` / the ringside `SyncIndicator` at `useReplicationSync()` + `mutationManager.getPendingCount()`. The `SyncIndicator` slot already accepts `pendingCount`; the only change is to pass it and render whenever `pendingCount > 0`, not just while syncing.

## Risks / Trade-offs

- **Blocking the submit on queue failure could trap a judge mid-show if the failure is persistent (e.g. permanent queue overflow).** → The overflow itself is the bug signal; pair the blocking error with a visible pending/overflow indicator and a "force retry/clear synced" affordance so the judge has a way forward rather than a silent lie. Overflow at 1000 pending only occurs on a device that has failed to sync for a long time — the indicator surfaces that condition long before the cap.
- **`navigator.storage.persist()` prompts or silently grants depending on browser/engagement heuristics.** → Never block on the result; it's a best-effort hardening, with the Add-to-Home nudge as the real iOS mitigation.
- **Restoring failed mutations after recovery could re-surface a genuinely-permanent failure loop.** → Restored failed mutations land back in the reviewable failed store (not the active queue), so they don't auto-retry; the judge still decides retry vs discard.
- **Sequence-number ordering interacts with the existing topological sort.** → Sequence is the tiebreaker within a dependency root, not a replacement for topology; add tests asserting both dependency order and intra-root sequence order hold.
- **Reading real pending counts on hot UI surfaces could add render churn.** → `getPendingCount` is a cheap in-memory read; subscribe via the existing provider rather than polling.

## Migration Plan

No data migration. Ship in three independently-deployable phases, each green before the next:
1. Phase 1 (score-loss closures) — highest severity, smallest surface; deployable alone.
2. Phase 2 (durability hardening) — depends on nothing in Phase 3.
3. Phase 3 (transparency) — safe to ship last; the mock-hook replacement is the only user-visible change.

Rollback: each phase is a self-contained set of edits with no schema/state change, so a revert of the phase's commits fully restores prior behavior. The `sequenceNumber` field (D4) is additive on `types.ts`; older queued mutations lacking it sort by timestamp fallback, so a rollback mid-show does not strand them.

## Open Questions

- Exact copy and trigger threshold for the Add-to-Home-Screen nudge (show once per unsynced session vs once per device) — resolve during Phase 2 with the INTENT owner.
- Whether the ringside `SyncIndicator` should also expose a tap-to-detail (list of pending armbands) or just the count — start with the count, revisit if judges want attribution inline rather than in the failure toast.
