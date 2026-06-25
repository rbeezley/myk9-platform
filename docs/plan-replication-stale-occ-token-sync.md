# Replication: dirty rows never refresh their OCC token on sync-down

> **Status:** Active

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

## Testing phase (required)

- **Unit (`syncReplicatedTable` / row-state):**
  - Dirty row + incoming server row with a higher `version` and **no overlapping field change** → local `serverVersion` advances to the incoming version; `data`, `isDirty`, `version` unchanged.
  - Dirty row + **same-field** change → still marks `conflict`; token handled by resolution (unchanged behavior).
  - `buildReplicatedRowForSet` with `isDirty=true` + `incomingServerVersion` → token advances (the line 40-42 change), base-data capture unchanged.
  - `batchSet` dirty-row path → token refreshed even though data is not overwritten.
- **Regression:** the #961 `MutationManager` OCC tests stay green (the reactive net remains).
- **Integration:** simulate the placement-recalc bump (write score → trigger bumps version on `final_placement`) and assert the next queued write carries the advanced token and does **not** `40001`.
- Rebuild `@myk9/replication` before app tests (app vitest runs against built `dist`).

## Risks / open questions

- Confirm no adapter relies on `serverVersion` staying pinned while dirty (grep usages).
- `mergeDirtyRow` is currently unused by entries; verify other tables' adapters before changing the shared path.
- Decide whether the same-field-conflict path (1) should *also* advance the token immediately (currently deferred to resolution) — likely leave as-is to avoid changing conflict UX.

## Relationship to #961

#961 (shipped) is the **reactive safety net** — a stuck token self-corrects on the next conflict + backs off. This plan is the **proactive source fix** — the token shouldn't get stuck at all. Ship this and #961 still earns its keep as defense-in-depth.
