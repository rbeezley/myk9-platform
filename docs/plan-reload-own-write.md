# A reload right after a score is sent: recognise the judge's own write

> **Status:** Active

Issue: MYK9-2371. Found while tracing the phone-walk flake MYK9-2370 (CI run 45325630938).

## The problem

1. A judge saves score A. The upload (`ringside_update_entry`) commits on the server (version 14 to 15).
2. The phone reloads before it processes the reply.
3. Score A stays queued with version 14. No `lastOwnUpload` was written, because that happens only when the reply is applied (`mutation-row-sync.ts:151-155`). The in-memory `InFlightWriteRegistry` (`inflight-written-base.ts`, MYK9-1221) is gone after the reload.
4. The judge changes the same dog again (B, for example a reset). B takes over A's columns (`mutation-supersede.ts`) and is sent with expected version 14.
5. The server refuses B (current 15). The server's replay check (MYK9-740, `ringside_replay_applied_version`) cannot help, because B's values differ from what is stored.
6. The next download compares base (before A), local (B) and remote (A) in `reconcileDirtyRemoteRow`. Both sides changed the same field, so the phone shows the persistent "#200 Willow was scored two ways ... Other device: Qualified 1:02.03" notice. The "other device" is this phone.

**What the judge can do:** "Keep this device's" sends B with a fresh version, which is correct. "Take theirs" puts A back, which loses the judge's correction. So the harm is a correction the judge can lose, plus a confusing notice at the ring.

**How likely:** it needs a reload, crash or tab kill in the short gap between the server's commit and the reply, followed by another change to the same dog before the next sync. The likeliest case is a judge with a weak signal who closes and reopens the app.

## Existing design, and why it is that way

- **MYK9-2111** (383f7ee243) reversed an earlier "restamp the version on refusal". Restamping let an older offline write overwrite a newer server change. The rule now is that a stale version is never restamped blindly. A same-field difference is a conflict, and a change to other fields is rebased.
- **MYK9-770** (`lastOwnUpload`) recognises only the phone's own acknowledged steps, so that another device's change still raises a conflict.
- **MYK9-1221** keeps the write that is in flight in memory only, from just before the send until the reply is applied.

So the design already recognises the phone's own writes. The gap is that this record is lost on reload.

## Options

**A. Do nothing.** It is rare, the right choice exists, and no score is lost unless the judge picks "Take theirs". Cost: none. Risk: a confusing notice at the ring, and a correction that can be lost.

**B. Keep the in-flight record across a reload (recommended).** Before sending, write `{mutationId, tableName, rowId, fields, serverVersion}` to IndexedDB. Delete it once the reply is applied, in the same place the memory registry ends today. On startup, load these records into `InFlightWriteRegistry`. Supersede must keep the record of a write that was sent, even when it drops that write's columns. The existing `resolveInFlightMergeBase` path then sees "base plus own write", finds no conflict and rebases B.

- No server or migration change.
- The MYK9-2111 rule is unchanged: nothing is restamped blindly. A remote value is treated as the phone's own only when it equals what this phone sent.
- Cost: a new IndexedDB store (a schema version bump), one extra write per send, and cleanup rules for records left over after an account switch or a reply that never came. Remove a record once the server's version is past it, or when the account signs out.

**C. Value match without a persisted record.** At reconcile, treat the remote as the phone's own when it equals a queued write. This does not work after supersede, because A has already been deleted. That is why B persists the record.

**D. Server idempotency by mutation id.** A new RPC parameter and a migration. It recognises a replay of A but not the B-versus-A conflict, so it does not fix this on its own.

## Recommendation

B, after the December mock show, unless the owner wants it sooner. A is acceptable for the mock show.

## Testing

- Unit (`packages/replication`, near `MutationManager.delayed-response.test.ts`):
  - Send A, commit it on the stub server, drop the reply, rebuild the manager from the same IndexedDB (the reload), then queue B. Expect no `replication:conflict`, B sent with the new version, and the server holding B.
  - Control: another device changes the same field. The conflict must still fire.
- Cleanup: a record whose reply arrives late is removed. A record left after sign-out does not apply to the next account.
- E2E: the phone walk drops its queue-drain wait before the reset (MYK9-2370) and still passes 10 runs in CI.
