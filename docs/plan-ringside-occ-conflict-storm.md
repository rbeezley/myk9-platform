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

1. **RPC path:** on a version-conflict error, re-read the authoritative `version` and throw
   `OccRejectionError(fresh)` — routing it to the OCC handler instead of dead-lettering.
2. **OCC handler:** advance the **replicated row's** `serverVersion` to the fresh value so the
   app stops minting stale writes (regeneration fix), and apply **exponential backoff**
   (`occRetries` counter, capped at 30s) so an unresolved conflict can't hammer the server.
   The queued mutation stays dirty for user reconciliation — conflict semantics unchanged.

### #3 — Cut redundant Realtime load (owner decision + SQL)

`supabase_realtime` publishes `classes/entries/shows` — the same tables the offline-first
layer already delta-polls (`updated_at > $1`). Evaluate narrowing the publication (push *and*
pull on the same data is redundant) to drop the 65% steady-state WAL-decode floor. SQL
(`ALTER PUBLICATION …`) is a shared-DB mutation requiring owner consent.

## Testing

- `MutationManager.test.ts`: RPC version-conflict re-reads + advances the replicated row's
  `serverVersion`; sets `nextRetryAt` (backoff) and does not hammer; queued mutation stays
  dirty. `mutation-occ.test.ts`: `isVersionConflictError` classification.
- `pnpm --filter @myk9/replication build` then app tests (app vitest runs against built dist).
