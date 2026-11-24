# A reload right after a score is sent: recognise the judge's own write

> **Status:** Active

Issue: MYK9-2371. Found while tracing the phone-walk flake MYK9-2370 (CI run 45325630938).

## The problem

1. A judge saves score A. The upload (`ringside_update_entry`) commits on the server (version 14 to 15).
2. The phone reloads before it processes the reply.
3. Score A stays queued with version 14. No `lastOwnUpload` was written, because that happens only when the reply is applied (`mutation-row-sync.ts:151-155`). The in-memory `InFlightWriteRegistry` (`inflight-written-base.ts`, MYK9-1221) is gone after the reload.
4. The judge changes the same dog again (B, for example a reset), and B goes up still expecting version 14.
5. The server refuses B (current 15). The server's replay check (MYK9-740, `ringside_replay_applied_version`) helps only when the stored values equal the request, and B's do not.
6. The next download compares base (before A), local (B) and remote (A) in `reconcileDirtyRemoteRow`. Both sides changed the same field, so the phone shows the persistent "#200 Willow was scored two ways ... Other device: Qualified 1:02.03" notice. The "other device" is this phone.

**Not yet proven.** Steps 1 to 3 and step 6 match the CI evidence: the notice, "Not sent yet 1", and a queued write with version 6 and `retries` 0. The ordering in steps 4 and 5 does not. Older queued writes are superseded only after an acknowledgement (`supersedeOlderQueuedWrites` runs from `markReplicatedRowSynced`), so queueing B does not remove A. A could replay, be recognised as applied, and advance B's version first. Which pull and upload ordering actually leaves B stale has to be shown by a failing test before any design is chosen (Testing, step 1).

**What the judge can do:** "Keep this device's" sends B with a fresh version, which is correct. "Take theirs" puts A back, which loses the judge's correction. So the harm is a correction the judge can lose, plus a confusing notice at the ring.

**How likely:** it needs a reload, crash or tab kill in the short gap between the server's commit and the reply, followed by another change to the same dog before the next sync. The likeliest case is a judge with a weak signal who closes and reopens the app.

## Existing design, and why it is that way

- **MYK9-2111** (383f7ee243) reversed an earlier "restamp the version on refusal". Restamping let an older offline write overwrite a newer server change. The rule now is that a stale version is never restamped blindly. A same-field difference is a conflict, and a change to other fields is rebased.
- **MYK9-770** (`lastOwnUpload`) recognises only the phone's own acknowledged steps, so that another device's change still raises a conflict.
- **MYK9-1221** keeps the write that is in flight in memory only, from just before the send until the reply is applied.

So the design already recognises the phone's own writes. The gap is that this record is lost on reload.

## Options

**A. Do nothing.** It is rare, the right choice exists, and no score is lost unless the judge picks "Take theirs". Cost: none. Risk: a confusing notice at the ring, and a correction that can be lost.

**B. Server-verifiable identity (the only safe silent rebase).** Send the queued write's `mutation.id` with the RPC (a new `p_mutation_id` parameter), and record it on the row as `last_mutation_id`. When a write is refused, or a download disagrees with a queued write, the phone treats the server value as its own only if `last_mutation_id` is one of its own sent ids, persisted with the signed-in account's id. Otherwise the conflict stays.

- Why identity and not values: two people can record the same result. A matching value proves only that this phone meant to send it, not that its write is the one that committed. Silently rebasing on a value match could send B over another person's score.
- Cost: a migration (RPC overload plus a column), a client change, and a persisted record of sent ids scoped to `authUserId`. Records are restored only after the current account is resolved, and dropped for any other account. Clean them up once the server's version is past them.
- MYK9-2111's rule holds: nothing is restamped without proof.
- Requirements found in design review (Codex, plan PR rounds 1 and 2), each needing its own test:
  - Bind the id to the exact version it produced (`last_mutation_id` plus `last_mutation_version`). A later write on another path, such as a secretary's correction in entry management or the legacy RPC, must not inherit A's id.
  - Check the id on replay acknowledgements too. `ringside_replay_applied_version` returns success on value equality at two sites in `ringside_update_entry`, so another person's identical write would otherwise be acknowledged as A.
  - Scope sent ids to the account, as above.
- Every one of these touches the scoring RPC. That is why B is a post-mock-show change, if it is done at all.

**C. Client record plus a value match (rejected).** Persist `{mutationId, fields, serverVersion}` before sending, and treat an equal server value as the phone's own after a reload. This cannot tell this phone's commit from someone else's identical write (see B), so it can hide a real conflict.

**D. Clearer conflict wording only.** Keep the conflict, but stop calling the server side "Other device" when the phone cannot know who wrote it, for example "Saved on the server". Cost: a copy change in `entryConflictCopy.ts`. It does not stop a wrong "Take theirs", but it removes the claim that someone else scored the dog.

## Recommendation

1. First, the reproduction test (Testing, step 1). If it passes on `main`, close MYK9-2371 with the evidence and keep the MYK9-2370 spec wait.
2. If it reproduces: D now (small, safe), and B after the December mock show, since it touches the RPC and the sync core.
3. A is acceptable for the mock show.

## Testing

1. **Reproduction first, asserting the wanted outcome** (`packages/replication`, near `MutationManager.delayed-response.test.ts`). Send A, commit it on the stub server, drop the reply, rebuild the manager from the same IndexedDB (the reload), then queue B. Assert no conflict, B sent with the advanced version, and B stored on the server. On `main` the test must fail with the unexpected conflict, and the failure names the ordering. If it passes on `main`, the bug does not reproduce in the replication layer: close MYK9-2371 with that evidence.
2. **For B:**
   - After the fix, the same test shows no conflict, B is sent with the new version, and the server holds B.
   - Controls, where the conflict must still fire: another account writes the same value to the same field, with A replaying both before and after the next pull; and a secretary corrects the score between A's commit and the phone's next pull.
   - Account change across a restart without a clean sign-out: the earlier account's sent ids are not used.
3. **For D:** a unit test on the new wording.
4. **E2E:** the phone walk drops its queue-drain wait before the reset (MYK9-2370) and still passes 10 runs in CI.
