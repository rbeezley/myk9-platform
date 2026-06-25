# Ringside OCC Conflict Storm — High-CPU Remediation

> **Status:** Active

## Incident

Supabase flagged the staging project (`sojmvhhwsjxmfistvzbe`) at >80% CPU. Investigation
(2026-06-25) found a **live storm of failing `ringside_update_entry` RPC calls** — 12
concurrent backends, hundreds of `40001 Version conflict` errors per second in the Postgres
logs — against the **demo seed show** (`dededede-…-010`). No real users; the driver is
long-lived demo-show ringside clients (browser tabs / test processes left running for hours).

### Evidence chain

1. `pg_stat_statements`: Realtime WAL decode = 65% of cumulative DB time over 172 days
   (structural baseline, see #3). The acute spike was hidden because…
2. …`ringside_update_entry`'s success counter was frozen at **14 lifetime calls** while 12
   backends executed it concurrently — `pg_stat_statements` does **not** count failed
   statements, so a storm of erroring calls is invisible in the query ranking.
3. Postgres logs: wall-to-wall `Version conflict updating entry … (expected N)` where `N`
   rotates 3/4/5 while the rows are actually at **version 8** — the clients write with a
   **stale `serverVersion` that never advances**.
4. Targeted rows' `updated_at` is hours old → zero successful writes despite the storm =
   100% failing calls.

### Root cause

The OCC token never advances on conflict, so the loop is self-sustaining:

- `MutationManager.executeMutation` RPC branch ([MutationManager.ts](../packages/replication/src/MutationManager.ts)) throws the **raw** `40001`; unlike the
  direct-UPDATE path it does **no occ re-check**, so it never learns the real version.
- `40001` is classified non-retryable (SQLSTATE starts with `4`) → the mutation dead-letters,
  but the **replicated row's `serverVersion` is never advanced**.
- New app writes stamp `serverVersion` from the replicated row
  ([ReplicatedTable.ts:158](../packages/replication/src/core/ReplicatedTable.ts)), so every
  regenerated write inherits the same stale token → conflicts again → storm.
- The `OccRejectionError` catch branch had **no backoff** — re-uploads were unthrottled.

## Remediation

### #1 — Stop the live storm (operational, owner action)

The new code only takes effect once the stale clients reload. Immediate relief:

- Close the demo-show ringside browser tabs / kill the test process driving the writes.
- Optional stopgap (shared-DB mutation, owner consent): `pg_terminate_backend(pid)` for the
  `ringside_update_entry` backends — temporary; clients respawn until closed.

### #2 — Make conflicts self-correct and back off (code, this PR)

1. **RPC surfaces the version (migration `20260625190000`):** `ringside_update_entry` now
   raises its `40001` with the authoritative current version in the Postgres `DETAIL` field.
   The client reads it from `error.details`.
2. **Client conflict recovery:** on a version conflict, throw `OccRejectionError(fresh)` carrying
   that version → routed to the OCC handler instead of dead-lettering.
3. **OCC handler:** advance the **replicated row's** `serverVersion` to the fresh value so the
   app stops minting stale writes (regeneration fix), and apply **exponential backoff**
   (`occRetries` counter, capped at 30s) so an unresolved conflict can't hammer the server.
   The queued mutation stays dirty for user reconciliation — conflict semantics unchanged.

> **Review fix (PR #961, Codex):** the first cut re-read `entries.version` via a **direct table
> read**. But assigned-judge / steward / passcode sessions — the exact roles this RPC exists for
> — are denied a direct `entries` read (reads go through `view_authenticated_entry_results`,
> which REVOKEs anon and keys on `auth.uid()`; it does **not** admit the passcode claim for a
> re-read). So the re-read returned 0 rows and the token never advanced for ringside roles. Fix:
> the SECURITY DEFINER RPC — which already authorized the write and holds the version — returns
> it in the conflict `DETAIL`, role-agnostic and with no second round-trip. **Lesson:** any
> "re-read the row" recovery must go through the _same authz boundary as the write_.

### #3 — Cut redundant Realtime load (owner decision + SQL)

`supabase_realtime` publishes `classes/entries/shows` — the same tables the offline-first
layer already delta-polls (`updated_at > $1`). Evaluate narrowing the publication (push _and_
pull on the same data is redundant) to drop the 65% steady-state WAL-decode floor. SQL
(`ALTER PUBLICATION …`) is a shared-DB mutation requiring owner consent.

### #4 — Isolate write-heavy E2E from shared staging (code, follow-up)

Ringside/scoring E2E specs now share a `sharedStagingWriteGuard` helper that intercepts
write-heavy shared-staging calls before they reach `sojmvhhwsjxmfistvzbe`:

- `POST /rest/v1/rpc/ringside_update_entry` returns a fixture version integer and records the
  payload for assertions.
- `PATCH /rest/v1/entries` returns an empty fixture result for paper-scoring writes.
- Read traffic and writes to any non-shared Supabase project are allowed through, so the same
  specs can run against an isolated/ephemeral project without fixture interception.

The at-show live/offline scoring specs and the paper-scoring workflow spec use the shared guard.
This keeps the storm-prone writes off shared staging while preserving the existing fixture-backed
browser coverage.

## Testing

- `MutationManager.test.ts`: RPC version-conflict re-reads + advances the replicated row's
  `serverVersion`; sets `nextRetryAt` (backoff) and does not hammer; queued mutation stays
  dirty. `mutation-occ.test.ts`: `isVersionConflictError` classification.
- `pnpm --filter @myk9/replication build` then app tests (app vitest runs against built dist).
- `sharedStagingWriteGuard.test.ts`: shared-staging write classification for ringside RPC and
  paper-scoring entry patches, plus read/isolated-project pass-through.
- `playwright test ... --list`: changed scoring specs load under Chromium (2 paper-scoring tests,
  1 at-show offline test, 1 known-fixme at-show judge test).
