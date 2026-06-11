# Plan — Fix incremental-sync watermark dropping freshly-created rows

**Status:** Proposed
**Author:** Investigation triggered 2026-06-10 by a real report (tester "Sherry Thompson" created dogs Ditto + Minnie; rows confirmed present on the server but absent from her app)
**Scope:** `packages/replication` sync engine + the nine app-level replicated table adapters
**Risk:** High — core offline-first path shared by every replicated table. Requires `/codex:review`.

---

## 1. Problem statement

A user created two dogs. Both rows are confirmed in the database (`public.dogs`,
`status = active`, `deleted_at IS NULL`, correctly owned by her `people` record,
RLS permits her read). Yet the app's "My Dogs" list shows nothing.

The list is offline-first: `getAllDogs()` reads the **local replica**
(`replicatedDogsTable.getAllDogs()`), falling back to PostgREST only on error
(`apps/myk9show/src/services/database/dogs/reads.ts`). So "row is in the DB" and
"row is in the app" are decoupled. The rows are on the server but never reached
her device's replica — and won't, on their own.

## 2. Root cause

The incremental-sync engine records its high-water mark using the **client wall
clock**, but filters the next fetch against the **server's `updated_at`** column.

- Watermark write — `packages/replication/src/syncReplicatedTable.ts:216`
  ```ts
  lastIncrementalSyncAt: Date.now(),   // client clock, at sync completion
  ```
- Next fetch filter — `apps/myk9show/src/services/replication/ReplicatedDogsTable.ts:129`
  ```ts
  .gt('updated_at', new Date(since).toISOString())   // server timestamp, strict >
  ```

When the client clock runs ahead of the database clock (or a row commits on the
server *during* the sync's network round-trip), a row's server `updated_at` lands
**below** the stored watermark. The strict `.gt` then skips it on every
subsequent sync. It is never re-fetched.

### Three compounding defects

1. **Watermark source mismatch (root cause).** `since` derives from client
   `Date.now()`; the query filters server `updated_at`. Any positive client/server
   skew — or a commit during the round-trip — silently drops rows.
2. **No safety buffer.** The engine supports `incrementalBufferMs`
   (`syncReplicatedTable.ts:103`) to subtract a margin from `since`. **No table
   passes it** → defaults to `0`. Zero tolerance for skew or boundary races.
3. **Full re-sync only on a totally empty replica.**
   `forceFullSync = options.forceFullSync === true || localRows.length === 0`
   (`syncReplicatedTable.ts:100`). A *partially* stale replica (most rows present,
   a few missing) never force-fulls, so it never self-heals. Only a complete cache
   wipe recovers (`length === 0` → `since = 0` → fetch all).

### Scope of exposure

Every incrementally-synced table: `dogs`, `trials`, `shows`, `classes`,
`entries`, `judge_assignments`, `waitlist`, `clubs`. Immune: `armbands` only —
`ReplicatedArmbandsTable.ts:109` forces a full sync every time.

### Current user-facing workaround (not a fix)

Clear site data / log out + in → empties the replica → next sync is a full sync
(`since = 0`) → all rows return. Confirmed effective but it is a manual recovery,
not a correctness fix.

### [ADDED] 2.4 Causal-link verification (the bug is real; its tie to *this* report is not yet proven)

The watermark defect is established from code. What is **not** yet confirmed is
that it is the mechanism behind the specific report (Sherry's two dogs). Two
distinct vectors produce the same "row on server, absent from app" symptom:

- **Vector A — watermark drop (this plan's subject).** Applies when the rows
  reach the device only via *fetch* (a second device/browser, or after the
  original device's IndexedDB was evicted). The corrected watermark fixes this.
- **Vector B — failed local create persistence.** If she created the dogs on the
  same device, the rows enter the replica via the **local create** path
  (`createDog` → IndexedDB write), independent of any fetch. If that IDB write
  failed (quota/eviction/private-window) while the *upload* still succeeded, the
  row is on the server but never in her local replica — and the watermark fix does
  **not** address this; only a fetch (full sync / cache clear) recovers it.

**Required before implementation:** determine which vector applies. Evidence to
gather: was the second sighting on the same browser/device as creation? Any
console `sync` errors or `syncStatus: 'error'` in her session logs? Does her
replica contain *other* dogs (→ partial replica → consistent with Vector A) or is
it empty? If Vector B is in play, file a **separate** plan for hardening the
local-create→IDB path (e.g. verify-after-write, retry, surface a create failure to
the user). Do not let this plan's green tests imply her exact symptom is fixed if
it was Vector B.

## 3. Fix design

### 3.1 Primary — server-authoritative watermark

Stop using `Date.now()` for `lastIncrementalSyncAt`. Instead advance the watermark
to the **maximum `updated_at` of the rows actually returned** by `fetchRemoteRows`.
The dog adapter already orders `updated_at` ascending, so the last fetched row
carries the max; other adapters either order the same way or we compute the max
explicitly.

Mechanism: add an adapter hook so the engine can read a row's server timestamp
without knowing the column name.

```ts
// SyncReplicatedTableAdapter<TRemote, TLocal>
/** Server-side updated_at (epoch ms) for a fetched remote row.
 *  Used to advance the incremental watermark to a timestamp the client has
 *  actually observed, instead of the client's own clock. */
getRemoteUpdatedAt?(remote: TRemote): number;
```

Engine change (`syncReplicatedTable.ts`):
- While iterating `remoteRows`, track `maxRemoteUpdatedAt = max(getRemoteUpdatedAt(r))`.
- On success, set `lastIncrementalSyncAt` to `maxRemoteUpdatedAt` when the hook is
  provided **and** at least one row was fetched; otherwise **leave the prior
  watermark unchanged** (do NOT advance to `Date.now()` — that is the bug). When no
  hook is provided, preserve today's `Date.now()` behavior for back-compat.

Edge cases:
- Empty fetch → watermark unchanged (nothing newer was observed). Correct.
- First full sync (`since = 0`) → watermark jumps to the max server timestamp seen.
  Correct and tighter than `Date.now()`.

This single change removes both the clock-skew class and the round-trip-race class,
because the watermark can only ever advance to a server timestamp the client has
already received.

**[ADDED] Robustness rules the engine MUST enforce** (each gets a test in §5):

1. **Monotonic, never regress.** Store
   `lastIncrementalSyncAt = max(priorWatermark, maxRemoteUpdatedAt)`. A backdated
   row, a trigger that rewrites `updated_at`, or out-of-order delivery must never
   move the watermark backward and silently widen the window unboundedly.
2. **NaN/null guard (critical).** If `getRemoteUpdatedAt(remote)` returns a
   non-finite number (null/`undefined`/unparseable `updated_at`), **exclude that
   row from the max** — never let it propagate. An unguarded `Math.max(NaN, …)`
   poisons the watermark; `new Date(NaN).toISOString()` throws, breaking *every*
   subsequent fetch. Treat a row with no usable timestamp as "does not advance the
   watermark" (it is still cached as data — only the watermark math ignores it).
3. **Never advance on failure.** Preserve today's invariant: the watermark write
   stays in the success path only. A thrown/aborted sync must leave the prior
   watermark intact (the `catch` block at `syncReplicatedTable.ts:231` must not
   write `lastIncrementalSyncAt`).

**[ADDED] Self-uploaded row re-fetch (same-device correctness).** When a device
creates a row locally (dirty) and uploads it, the server stamps `updated_at`. The
corrected watermark must let that device **re-fetch its own row** on the next
incremental sync so it picks up the server `version` (OCC precondition) and any
trigger-derived fields. Because the uploaded row's server `updated_at` is `>` the
pre-create watermark, the corrected `since` (max-seen, minus buffer) includes it.
Add a test asserting a locally-created→uploaded row is re-fetched and its
`serverVersion` lands on the IDB row.

### 3.2 Defense-in-depth — incremental buffer

Pass `incrementalBufferMs` on each table's `syncReplicatedTable(...)` call (start
with `60_000`). Subtracting a minute from `since` makes any residual boundary race
self-correcting. Re-fetching a handful of overlapping rows is an idempotent
upsert (the engine already reconciles by id). Centralize the constant in the
replication package so all adapters share one value.

**[ADDED] Per-table tuning — buffer cost on high-churn tables.** A 60s buffer
means every incremental sync re-fetches all rows touched in the trailing minute.
For low-churn tables (`dogs`, `clubs`, `trials`, `shows`) this is a few rows. For
**`entries` and `classes` during a live show**, scores/placements/status churn
continuously, so a 60s buffer can re-pull a large rolling set on every sync tick —
wasted bandwidth and IDB writes on exactly the tables that sync most often. Define
the constant per-table rather than one global: keep `60_000` for low-churn tables,
use a smaller buffer (e.g. `5_000–10_000`) for `entries`/`classes`. The smaller
buffer is still safe because the **primary** fix (server-authoritative watermark)
already removes the systemic drop; the buffer is only absorbing sub-second
boundary ties there. Measure re-fetch row counts in the §5 tests for a show-sized
fixture and confirm the chosen buffers don't balloon the payload.

### 3.3 Safety net — periodic forced full sync

Add a coarse heal: force a full sync when `now - lastFullSyncAt > 24h` (new
metadata field `lastFullSyncAt`, written only on full-sync completion). Guarantees
any future drift, from any cause, self-heals within a day even if 3.1/3.2 miss an
unforeseen path. Optional but cheap; include unless it complicates review.

### [ADDED] 3.4 Observability — so the next instance is caught by a metric, not a user

This bug class is silent: no error, no log, just absent rows. Add lightweight
signal so a regression is detectable without a user report:

- Emit a structured `logger.warn` (or counter) when a sync runs as `full-sync`
  **because** `localRows.length === 0` after the replica was previously non-empty
  (i.e. an unexpected eviction/heal), including table name and row delta.
- Include `rowsAffected`, `operation`, and the resolved `since` in the existing
  `SyncResult` log so a drift can be spotted in session logs.
- (With 3.3) emit when the 24h forced full sync fires and how many rows it
  recovered — a non-zero recovery count is a smoking gun for an upstream drop.

### [ADDED] 3.5 Concurrent multi-tab sync

Two tabs share one IndexedDB replica and one sync-metadata row. Concurrent
`updateSyncMetadata` writes can interleave and a slower tab could clobber a newer
watermark with an older one. Audit whether `ReplicatedTableCache` already
serializes metadata writes (single-writer / last-write-wins on the IDB record).
If not, the monotonic rule in §3.1 (store `max(prior, maxSeen)`) already prevents
a *backward* clobber for the watermark specifically; document that as the
mitigation and add a test with two interleaved sync completions asserting the
watermark ends at the larger value. Full cross-tab coordination
(BroadcastChannel/leader election) is out of scope unless the audit shows a
concrete corruption path.

## 4. Implementation steps

1. **Engine** (`packages/replication/src/syncReplicatedTable.ts`)
   - Add optional `getRemoteUpdatedAt` to `SyncReplicatedTableAdapter`.
   - Track `maxRemoteUpdatedAt` in the fetch loop.
   - Replace the unconditional `lastIncrementalSyncAt: Date.now()` with the
     server-authoritative rule in 3.1, **including the monotonic `max(prior,
     maxSeen)` guard, the NaN/null exclusion, and the never-advance-on-failure
     invariant** (fallback to prior `Date.now()` behavior only when no hook).
   - (3.3) Add `lastFullSyncAt` metadata + force-full-on-stale logic.
   - (3.4) Add the observability log/counter on unexpected full-sync heals and in
     `SyncResult`.
   - (3.5) Audit `ReplicatedTableCache` metadata-write serialization; rely on the
     monotonic guard as the multi-tab mitigation.
2. **Types** (`packages/replication/src/types.ts`) — add `lastFullSyncAt` to the
   sync-metadata type if 3.3 is included.
3. **Adapters** (`apps/myk9show/src/services/replication/Replicated*Table.ts`)
   - Implement `getRemoteUpdatedAt` (parse `row.updated_at` → epoch ms) on each
     incrementally-synced table.
   - Add `{ incrementalBufferMs: REPLICATION_INCREMENTAL_BUFFER_MS }` to each
     `syncReplicatedTable(...)` options arg.
4. **Constant** — export `REPLICATION_INCREMENTAL_BUFFER_MS = 60_000` from the
   replication package.

Keep each adapter edit mechanical and identical in shape (DRY); if more than ~3
adapters diverge, extract a shared helper.

## 5. Testing phase (required — assertion-first)

Write the failing tests **before** the engine change so they prove the current
bug, then turn green with the fix.

1. **Engine unit test** (`packages/replication/src/__tests__/syncReplicatedTable.watermark.test.ts`)
   - **Clock-ahead drop (red first):** stub the table with one fetched row whose
     server `updated_at = T`. Make the engine's completion clock report `T + 30_000`
     (client ahead). Run sync. Assert the **next** sync's `since` is `T` (or
     `T - buffer`), **not** `T + 30_000`, and that a row at `updated_at = T + 1` is
     fetched on the following round. Under today's code this fails (watermark =
     `Date.now()` skips it).
   - **Round-trip race:** simulate a row committed with `updated_at` between the
     fetch return and watermark write; assert it is fetched on the next sync.
   - **Empty fetch:** watermark unchanged when zero rows returned.
   - **No hook:** back-compat — engine still uses `Date.now()` when
     `getRemoteUpdatedAt` is absent.
2. **Buffer test:** assert `since` passed to `fetchRemoteRows` equals
   `watermark - incrementalBufferMs` (floored at 0).
3. **Adapter test** (dogs) — `getRemoteUpdatedAt` parses `updated_at` to epoch ms
   correctly (including null/edge handling).
4. **(3.3) Stale-heal test** — with `lastFullSyncAt` older than 24h, the next sync
   runs as `full-sync` regardless of `localRows.length`.
5. **[ADDED] Monotonicity test** — a fetch whose `maxRemoteUpdatedAt` is *lower*
   than the current watermark must leave the watermark unchanged (no regression).
6. **[ADDED] NaN/null guard test (critical)** — a fetched row with
   `updated_at = null`/unparseable must (a) still be cached as data, (b) be
   excluded from the watermark max, and (c) never produce a `NaN`/`Invalid Date`
   `since` on the following sync. Assert the next `since` is a valid ISO string.
7. **[ADDED] No-advance-on-failure test** — force `fetchRemoteRows` to throw;
   assert `syncStatus = 'error'` and `lastIncrementalSyncAt` is unchanged from
   before the failed sync.
8. **[ADDED] Self-uploaded re-fetch test** — create a row locally (dirty) → upload
   → next incremental sync re-fetches it; assert `serverVersion` is stored on the
   IDB row.
9. **[ADDED] Buffer-payload test** — with a show-sized fixture (e.g. 500 churning
   `entries`), assert the per-table buffer does not re-fetch more than an agreed
   ceiling of rows per incremental tick (guards §3.2 performance choice).
   **DEFERRED (2026-06-11):** not implemented. The buffer mechanism (`since =
   watermark − buffer`) is covered at the engine level, and the per-table buffer
   size is a tuning choice rather than a correctness property, so a heavy
   adapter+PostgREST-mock fixture was judged low-value for this PR. Re-add if a
   high-churn table shows a payload regression in practice. The dogs-specific
   adapter test (§5.3 intent) was likewise folded into the `parseUpdatedAtMs` unit
   tests, since all 8 adapters share the identical `parseUpdatedAtMs(remote.updated_at)`
   one-liner.
10. Run `pnpm typecheck` and the replication + dogs suites green before considering
    any phase complete.

Do not consider the work done until every test above is written and passing.

## 6. Verification

- **[ADDED] Resolve the causal branch first (§2.4).** Before/alongside
  implementation, determine whether the report was Vector A (fetch-path drop, fixed
  here) or Vector B (local-create IDB write failure, separate plan). State the
  finding in the PR so the fix's scope is not oversold.
- Reproduce the original symptom path in a test (clock-ahead → row dropped →
  fixed). The production row for the reporting user is already correct in the DB;
  no data backfill is needed — once a client picks up the fix, its next sync with
  the corrected watermark (or a one-time cache clear) surfaces the rows.
- After merge, spot-check via the app that a freshly created dog appears without a
  manual cache clear — **on a second device/browser** (the path that exercises the
  fetch-side watermark, not just local create).

## 7. Review gate

`/codex:review` in addition to `/review` — this changes sync-gate / state logic in
shared offline-first code (per CLAUDE.md "Codex second opinion" + memory
`feedback_codex_review_default_on`).

## 7a. Harden findings & dispositions (adversarial pass, 2026-06-11)

A three-agent adversarial review ran against the implemented diff. Dispositions:

**Fixed in this PR (cheap robustness guards):**
- **Corrupt persisted watermark → `new Date(since).toISOString()` throw.** A NaN/Infinity
  `lastIncrementalSyncAt` in IndexedDB could wedge a table's sync. Added a
  `Number.isFinite` guard so a bad watermark degrades to a full-ish fetch (`since = 0`)
  instead of throwing. Tested (`it.each(['Infinity','NaN'])`).
- **Concurrent watermark regression.** Two overlapping syncs of the same table each
  computed `Math.max` against their own pre-fetch metadata snapshot, then wrote
  last-write-wins — so a slow sync could regress a watermark a faster concurrent sync had
  already advanced. **Fixed properly** (post-review): the monotonic advance now happens
  *inside* the cache's read-modify-write transaction
  (`ReplicatedTableCache.updateSyncMetadata(..., { advanceWatermarkMonotonically: true })`),
  maxing against the **live** persisted value, not the caller's stale snapshot. The reset
  path (literal write to 0) is preserved by gating the max behind the flag. (Note: the
  regression direction was *safe* either way — a lower watermark causes idempotent
  re-fetching, never dropped rows — but the watermark is now genuinely monotonic under
  concurrency.) Tested: a stale 6000 write does not regress a persisted 7000; a reset to 0
  still applies.

**Verified non-issues:**
- **Pagination > 1000 rows:** the ascending-order + server-authoritative watermark gives
  *progressive paging* (each sync advances past the previous batch). This is an
  improvement over the old `Date.now()` watermark, which wedged tables over the PostgREST
  default cap.
- **NaN-poisoned `Math.max`:** guarded by `Number.isFinite` before the max + the
  `sawRemoteTimestamp` fallback. `parseUpdatedAtMs` returns `null`, never `NaN`.
- **numeric-string / tz-less `updated_at`:** the columns are `timestamptz` (ISO strings);
  this parse path does not occur in practice.

**Documented limitations / deferred (NOT fixed here):**
- **Cross-scope shared watermark (entries/classes).** Sync metadata is keyed by table name
  only (`ReplicatedTableCache` uses `this.tableName` as the IDB key), so a table synced
  under multiple `scope.value`s (e.g. `entries` via the provider's `licenseKey=''` AND via
  `ScoringEntryListPage.sync(classId)`) shares one watermark. Advancing it under one scope
  can cause the other scope's next incremental fetch to skip rows. **This is pre-existing**
  — the old `Date.now()` watermark was shared the same way — and is **not introduced or
  worsened in a data-loss direction by this fix.** This fix is fully correct for
  single-scope tables, which includes the reported bug (`dogs`, synced only under
  `licenseKey=''`). Proper fix: key sync metadata by `(tableName, scope.value)`. Tracked as
  a follow-up.
- **Far-future corrupt `updated_at` poisoning the monotonic watermark.** A single row with
  an absurd future timestamp would stick (monotonic can't recede). Corrupt-data-only, very
  low likelihood; not guarded because a `Date.now()` upper clamp would reintroduce the
  client-clock coupling this fix exists to remove. Documented edge.

## 7b. Pre-existing security findings surfaced (separate work)

The security agent flagged real issues that **predate this diff** and are out of scope for a
watermark fix (fixing them is a separate, high-stakes change). Flagged as follow-up tasks:
- `dogs_select` / `people_select` RLS are `deleted_at IS NULL AND auth.uid() IS NOT NULL`
  (any authenticated user reads all rows); ownership is enforced *only* client-side
  (`filterByOwnership`). The provider syncs with `licenseKey=''`, so the adapter's own
  `.eq('owner_id', …)` is dead at runtime and the full table seeds every client's local
  cache. `loadOwnersMap` then pulls owner PII (email/phone) for every cached owner.
- No tombstone cleanup on `dogs`: soft-deleted rows linger in the local replica
  indefinitely (`shouldCleanupStaleRows` unset; deleted rows simply stop arriving).

These were deliberately simplified pre-launch for query performance; they need revisiting
before real users — but not inside this PR.

## 8. Out of scope / follow-ups

- Migrating the watermark to a logical (per-row monotonic) cursor instead of a
  timestamp — larger change; revisit only if timestamp-based proves insufficient.
- No backwards-compat shims for old replica metadata: project is pre-launch, no
  real users (memory `project_prelaunch_no_users`). A one-time watermark reset on
  upgrade is acceptable and self-heals via full sync.
