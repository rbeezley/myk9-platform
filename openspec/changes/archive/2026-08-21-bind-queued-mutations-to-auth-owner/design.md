## Context

See `proposal.md` for motivation and the delta spec for normative behavior. The durable mutation row currently has no auth identity, while `ReplicationSyncProvider` triggers upload on initial authenticated startup, fresh sign-in, reconnect, polling, visibility changes, and explicit sync requests. That confirms MYK9-214's drain path: a queue created by user A can be read after user B signs in and is executed through the shared Supabase client, whose current session is B.

The queue and backup must continue to preserve offline scoring and show-day work. Clearing the queue on sign-out would contradict that durability goal and the existing sign-out warning, so the boundary must isolate writes without deleting them.

## Goals / Non-Goals

**Goals:**

- Make the auth identity used to create a mutation part of its durable local contract.
- Fail closed at enqueue and upload boundaries without weakening offline operation for a valid cached Supabase session.
- Preserve user A's work on a shared device so it can resume when A returns.
- Keep current retry, dependency, OCC, backup, conflict, and event behavior for mutations owned by the active user.

**Non-Goals:**

- Partition or clear replicated table caches by user.
- Add user-facing queue management or account-switch UI.
- Change remote application-table payloads, database schemas, RLS policies, or Supabase functions.
- Invent an owner for legacy unowned rows.

## Decisions

### 1. Resolve identity through an injected async provider

`MutationManagerOptions` will accept an identity resolver returning the current auth user id or `null`. The myK9Show singleton will implement it with the existing Supabase client's locally cached session, which remains available offline.

Upload execution additionally receives a request-scoped Supabase client pinned to the exact access token returned with the checked identity. The mutable shared client is rejected for dispatch because an account switch between the identity check and request construction could otherwise authorize user A's queued mutation as user B. Backup remains best-effort after the primary IndexedDB write, preserving the established rule that a localStorage failure cannot make a successfully durable offline score report failure.

The package has no mutable-client compatibility fallback: if an application does not provide a bound upload context, upload fails closed and leaves the queue untouched.

The resolver is injected rather than importing application auth into `@myk9/replication`, preserving package boundaries and testability. Calling Supabase `getUser()` was rejected because it requires a network round trip and would make valid offline queueing fail.

Resolver errors and empty identities are security failures, not anonymous compatibility cases: enqueue throws before persistence, while upload/review/retry/discard stop without modifying queue state. The app's existing sync error handling may report the failed pass, but it must not reinterpret identity-resolution failure as a mutation failure.

### 2. Stamp ownership before durable enqueue

`PendingMutation` gains an additive optional `authUserId` field so older IndexedDB/localStorage rows still deserialize. New queue operations resolve the identity before the primary IndexedDB write and require a non-empty id. The queue store receives that id and persists it with the mutation; all later spreads into retry/failed/backup rows retain it.

Keeping the field optional is a storage compatibility choice, not permission to create new unowned mutations. An explicit enqueue guard enforces the new contract.

### 3. Filter inside the upload runner, not at sign-out

The upload runner resolves the active identity at the start of each pass and holds any foreign-owner or unowned row before execution. Identity-held rows participate in dependency blocking so a dependent mutation cannot leapfrog a held prerequisite, while independent current-owner rows can continue.

This keeps the queue durable across account changes. Clearing on sign-out was rejected because it destroys valid offline work. Moving foreign rows immediately to the failed store was rejected because account switching is not a mutation failure and would expose user A's work in user B's recovery rail.

The runner resolves once before reading the pass and again immediately before each mutation execution. If the identity changes, the row is held and marked as a blocked dependency for that pass. This gives mixed-owner queues forward progress without allowing dependent work to leapfrog an owner-held prerequisite.

### 4. Apply the same owner boundary to failed-mutation actions

Failure listing, retry, and discard operations will be limited to the active owner. Otherwise user B could inspect or manipulate user A's dead-lettered work even though automatic upload is isolated. Backup writes remain device-global and retain every owner's rows so recovery cannot silently destroy held work.

Identity is resolved before lookup and re-checked immediately before local retry, discard, reconciliation, or clear transactions. A mid-operation account change therefore leaves the selected rows unchanged; read operations also re-check before returning owner-scoped results.

### 5. Legacy unowned rows fail closed

Rows created before this change remain durable but are ineligible for automatic adoption. Assigning them to the first user seen after upgrade would recreate the exact shared-device vulnerability. Logs will distinguish owner-held and legacy-held rows; no new lifecycle event or UI is added in this slice.

Backup parsing accepts an absent owner only for legacy compatibility. A present owner value must be a non-empty string; malformed owner metadata is rejected instead of being downgraded to legacy.

## Risks / Trade-offs

- **[Risk] Legacy unowned work no longer auto-uploads.** → Preserve it in IndexedDB and backup, log it distinctly, and never risk attributing it to the wrong account. Support can inspect the durable payload if recovery is required.
- **[Risk] A mixed-owner queue can make global pending counts include another user's held work.** → Keep the existing global count for queue-capacity and cache-safety decisions; per-user status presentation is intentionally deferred rather than weakening durability.
- **[Risk] Auth changes during an upload pass.** → Resolve identity before processing, re-check immediately before each execution, and dispatch through a client pinned to that exact session token; remaining work is held after an account change.
- **[Risk] Test clients lack Supabase auth methods.** → Inject deterministic identity resolvers in mutation-manager tests and add focused fail-closed coverage.
- **[Risk] The identity resolver throws or returns a malformed id.** → Treat it as a boundary failure, leave both queue stores unchanged, and cover enqueue/upload/recovery actions with assertion-first tests.
- **[Risk] Optional persisted metadata is accidentally omitted by backup parsing.** → Add round-trip tests for pending and failed owner-bound records plus explicit acceptance of ownerless legacy rows as held data.

## Migration Plan

1. Deploy the additive client-side type and queue/upload guards; no IndexedDB version or server migration is required because stored values are schemaless objects.
2. New mutations immediately receive ownership metadata. Existing owned-by-history but unmarked rows remain held.
3. Verify account-switch behavior with focused package tests and provider-level sign-in/startup drain coverage before merge.
4. Rollback is a code revert; older clients ignore the extra field. Rolling back reopens the cross-account replay risk, so it is only appropriate if the new client cannot queue or drain valid owner-bound work.
