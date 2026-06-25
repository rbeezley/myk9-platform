# Replication: dirty rows never refresh their OCC token on sync-down

> **Status:** Complete — shipped in PR [#963](https://github.com/rbeezley/myk9-platform/pull/963) (squash `882c1a8dd`, 2026-06-25). Implemented the recommended three-way-merge approach plus the review-caught queued-mutation reconciliation (the upload reads the queued `PendingMutation` snapshot, not the IDB row, so the row reconcile alone was insufficient).

## Why this exists

Spun out of the ringside OCC conflict-storm incident ([`plan-ringside-occ-conflict-storm.md`](plan-ringside-occ-conflict-storm.md), PR [#961](https://github.com/rbeezley/myk9-platform/pull/961)). During that incident, storming clients were writing with `serverVersion` 3–5 while the server's `entries.version` was 8 — a **stale OCC token that never advanced**. #961 fixed the *storm* (the client now advances the token reactively on a conflict and backs off). This plan addresses the **root cause of the staleness itself**: the sync-down path does not refresh a row's `serverVersion` while the row is locally dirty.

## Root cause (verified against source)

New mutations stamp `serverVersion` from the local replicated row ([ReplicatedTable.ts:151-159](../packages/replication/src/core/ReplicatedTable.ts)). So if sync-down never advances a dirty row's `serverVersion`, every queued write inherits a stale token.

In `syncReplicatedTable` the dirty branch ([syncReplicatedTable.ts:212-258](../packages/replication/src/syncReplicatedTable.ts)) has three outcomes, **none of which advance the token**:

1. **Same-field conflict surfaced** (lines 218-249): the fresh server version is written into the *conflict snapshot* (`remoteServerVersion`), then `continue`. The row's own `serverVersion` is untouched until the user resolves (resolution does advance it via `clearConflictSnapshot`).
2. **No `mergeDirtyRow` adapter** (entries' case — `ReplicatedEntriesTable` defines none): the row is **skipped outright** (`continue`, line 257). `remoteServerVersion` is never added to `serverVersionMap`, which is only populated on the clean path (lines 271-272).
3. **`mergeDirtyRow` path** (lines 251-256): `table.set(id, merged, true)` is called with no `incomingServerVersion`, and `buildReplicatedRowForSet` **discards** the incoming version when `isDirty`: `serverVersion = isDirty ? existingRow?.serverVersion : (incomingServerVersion ?? existingRow?.serverVersion)` ([ReplicatedTableRowState.ts:40-42](../packages/replication/src/core/ReplicatedTableRowState.ts)). The `batchSet` path guards dirty rows the same way ([ReplicatedTableBatch.ts:55-59](../packages/replication/src/core/ReplicatedTableBatch.ts)).

**Failure chain:** row goes dirty (serverVersion=3) → server `version` advances to 8 via a trigger bump on an *untouched* field (placement recalc) or a concurrent writer → sync-down sees the dirty row, finds **no same-field conflict** (different field changed) → skips it → `serverVersion` stays 3 → next write sends `WHERE version = 3` → `40001` → (pre-#961) storm / (post-#961) reactive advance.

## The design flaw

The dirty-row guard correctly protects the user's optimistic **data** from being clobbered by a sync-down. But it also pins `serverVersion`, which is **server metadata, not user data** — advancing it never loses an offline edit. Conflating the two is the bug.

## Proposed fix

In `syncReplicatedTable`'s dirty branch, when **no same-field conflict is surfaced**, refresh the dirty row's `serverVersion` to `remoteServerVersion` **without touching `data`, `isDirty`, `version`, `baseData`, or `syncStatus`**. Concretely:

- Add an `incomingServerVersion` pass-through so a dirty `set`/merge can advance the token, OR a dedicated `table.refreshServerVersion(id, v)` that only writes `serverVersion`.
- Apply it on (2) the no-`mergeDirtyRow` skip path and (3) the `mergeDirtyRow` path. Leave (1) the same-field-conflict path as-is (resolution already advances the token).

**Why this is safe for conflict semantics:** advancing the token on a *non-conflicting* dirty row means the next write's OCC precondition matches the server, so the local edit applies on top of current server state — the intended offline-first outcome for a field nobody else touched. Genuine same-field conflicts still take path (1) and are surfaced unchanged. This does **not** reintroduce silent last-write-wins for conflicting fields.

### [EXPANDED] Correctness gap — advancing the token is NOT sufficient on the full-row write path

The "applies the local edit on top of current server state" claim holds only when the write sends a **delta**. It is true for the **RPC/ringside path** (`mutation.rpc.fields` is the touched-column delta — `buildRingsideRpcFields`), which is the actual incident path. It is **false for the direct-UPDATE path**: `this.supabase.from(tableName).update(data)` ([MutationManager.ts:696-698](../packages/replication/src/MutationManager.ts)) writes the **full optimistic row**. So if the server changed field A (e.g. `final_placement` via the recalc trigger) while the client's dirty edit only touched field B (`run_order`), the client's `data.A` still holds the *pre-edit base value* (entries has no `mergeDirtyRow`, so remote changes are never merged into dirty data). Advancing the token → the next full-row write succeeds → **field A regresses to the stale value. Silent data loss.**

So the fix is **advance the token AND reconcile untouched-but-remotely-changed fields into the dirty row's data**, not token-only. Two viable shapes:

- **(Recommended) Three-way merge on non-conflicting sync-down.** For each field: if `remote != base` and `local == base` (server changed it, client didn't) → take remote into local `data`; if `local != base` → keep local; if both changed the same field → that's path (1), surfaced. Then advance `serverVersion`. This is exactly the `mergeDirtyRow`/`detectDirtyRowConflict` machinery generalized — entries currently has no `mergeDirtyRow`, so this path adds the merge it never had.
- **(Alternative) Delta-only writes on the direct path.** Compute the touched-field delta (base vs local) and `update(delta)` instead of `update(data)`, mirroring the RPC path. Removes the clobber risk structurally for all tables, but is a larger blast-radius change to every direct UPDATE.

Pick one before implementing — do **not** ship token-advance alone.

### [ADDED] Scope — the bug (and fix) only matter when conflict surfacing is ON

`queueMutation` captures `serverVersion` only when `isConflictSurfacingEnabled()` ([ReplicatedTable.ts:151-159](../packages/replication/src/core/ReplicatedTable.ts)). With the flag OFF there is no OCC precondition (last-write-wins end-to-end), so no token, no stale-token conflict, no storm. The `showConflictSurfacing` kill-switch is currently `true` in production, so the bug is live — but the fix is a no-op when the flag is off, and tests must cover both flag states.

## Testing phase (required)

- **Unit (`syncReplicatedTable` / row-state):**
  - Dirty row + incoming server row with a higher `version` and **no overlapping field change** → local `serverVersion` advances; the local edit (touched field) is preserved; `isDirty`/`version` unchanged.
  - **[ADDED] Clobber guard (the key new case):** dirty row whose edit touched field B; server changed field A (untouched by client). After sync-down, local `data.A` must equal the **remote** value (merged in), not the stale base — proving the next write won't regress A. (Assert against whichever shape is chosen: 3-way merge, or delta-only write.)
  - Dirty row + **same-field** change → still marks `conflict`; token handled by resolution (unchanged behavior).
  - `buildReplicatedRowForSet` with `isDirty=true` + `incomingServerVersion` → token advances (the line 40-42 change), base-data capture unchanged.
  - `batchSet` dirty-row path → token refreshed even though data is not overwritten.
  - **[ADDED] Edge cases:** incoming `version` is `undefined` → token left unchanged (no write); incoming `version` **lower than or equal to** the local token → no regression (advance is monotonic / forward-only); no-op when nothing changes (don't write the row just to rewrite the same token — see Performance).
  - **[ADDED] Flag OFF:** with `isConflictSurfacingEnabled() === false`, sync-down behaves exactly as today (no token capture, no merge) — the fix is inert.
- **Regression:** the #961 `MutationManager` OCC tests stay green (the reactive net remains); existing `syncReplicatedTable` dirty-row + conflict-surfacing tests stay green.
- **[ADDED] Cross-table:** run the suite for at least one table that *does* define `mergeDirtyRow` (if any) to confirm the merge path still behaves; grep adapters first.
- **Integration:** simulate the placement-recalc bump (write score → trigger bumps version on `final_placement`) and assert the next queued write carries the advanced token and does **not** `40001`, **and** does not overwrite `final_placement`.
- Rebuild `@myk9/replication` before app tests (app vitest runs against built `dist`).

## [ADDED] Operational / rollout

- **Two-halves, again:** this is a client-package change. It ships only when staging redeploys from `main` **and** running clients reload the new bundle — a live stale client won't self-heal until it reloads (same property as #961). State this in the PR.
- **Reversibility:** prefer gating the new merge/advance behavior behind the existing `showConflictSurfacing` kill-switch (the bug only exists when that flag is on, so the flag already scopes it) rather than adding a new flag. Confirm the flag fully disables the new path so it can be turned off without a redeploy if it misbehaves.

## [ADDED] Performance

Previously, a dirty row arriving on sync-down was *skipped* (no IDB write). The fix writes it to refresh the token (and possibly merge fields). Guard against churn: **only write when the token actually advances or a field is merged** — skip the IDB put when `remoteServerVersion <= existingRow.serverVersion` and no field changed. Otherwise a busy show with many dirty rows pays an extra write per row per sync cycle.

## Risks / open questions

- Confirm no adapter relies on `serverVersion` staying pinned while dirty (grep usages).
- `mergeDirtyRow` is currently unused by entries; verify other tables' adapters before changing the shared path.
- Decide whether the same-field-conflict path (1) should *also* advance the token immediately (currently deferred to resolution) — likely leave as-is to avoid changing conflict UX.

## Relationship to #961

#961 (shipped) is the **reactive safety net** — a stuck token self-corrects on the next conflict + backs off. This plan is the **proactive source fix** — the token shouldn't get stuck at all. Ship this and #961 still earns its keep as defense-in-depth.
