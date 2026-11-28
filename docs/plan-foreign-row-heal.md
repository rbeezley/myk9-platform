# A judge's phone that holds another account's copy of an entry never finishes syncing

> **Status:** Active

Tracking: MYK9-2507. This is design-first because the fix changes how the offline copy decides which account owns a row, and a test on `main` asserts today's behavior on purpose.

## What happened

On 2026-11-27 the owner's phone, signed in as `judge@myk9t.com`, showed Heartland's Exterior Excellent with Juni (#102) missing. It also showed "This device hasn't finished getting this show's data", and neither refresh nor reopening the app cleared it. The server is fine: the judge's replication view returns all three of the class's entries, Juni included at version 10, and the show-wide count is 14. RLS, the cursor and the entry's status history are all ruled out (read-only checks, 2026-11-28).

## Most likely cause (from the code; not yet seen on the device)

The phone holds Juni's row under **another account** (an earlier sign-in on this phone, or the shared demo fixture before a reseed lowered its version), at a server version above 10.

- `packages/replication/src/core/downloadRowGuards.ts` `shouldKeepNewerRow` keeps a cached row whose version is higher than the download's. The two rescues (MYK9-1632, ownerless rows; MYK9-1633, this account's own rows on a full sync) both exclude another account's row.
- So every download skips Juni. The reader shows only this account's rows, so Juni is invisible. The short-replica check counts 13 of 14 (MYK9-2254), so the sync fails as short every time, and the entries scope is never stamped whole. That is why the notice never clears.
- Ranger and Maple were at lower versions on the phone, so they updated. That matches what the phone showed.

To confirm on the phone, before anything on it is reset: Sentry should hold "Offline copy is short: entries holds 13 of 14 rows" for show `dededede-…10`. Record the stored entries row `dededede-0000-0000-0000-000000000054` (`ownerAuthUserId`, `serverVersion`, `isDirty`, `syncStatus`, `lastOwnUpload`) and the device's pending and failed mutation queues for every account, and compare them with the server's v10. The cause holds only if the owner is another account, `serverVersion` is above 10, and the row carries no unsent work. A successful reset would show only that rebuilding the cache helps, not why Juni was skipped.

## Why the guard is the way it is

MYK9-1133 (#2963) made cached rows belong to the account that synced them. MYK9-1148 (#2968) and the test `still skips an older download for another account's row` keep a download from overwriting another account's row. The aim was a shared ringside device: account A's **unsent** score must never be lost because account B synced. Unsent work is marked separately: `isDirty` and the mutation queue. `lastOwnUpload` is set by an **acknowledged** upload (`mutation-row-sync.ts:154`), so it records sent work, not unsent work. A foreign row that is clean, has nothing queued, and whose acknowledged version the server has since moved past or regressed below protects nothing: nobody sends that copy again.

## Options

1. **Recommended: a clean foreign row yields to the server copy.** `shouldKeepNewerRow` is called only by the ordinary and chunked writes in `ReplicatedTableBatch`; this change is to that helper and those two paths. `repairStuckPendingFlags` and the conflict code use `isOlderThanRow` on their own and stay as they are. Another account's row no longer blocks the download when all of these hold:
   - it is not dirty, and the mutation queue holds no pending or failed mutation for it under any account;
   - it has no `lastOwnUpload`, or this is a full sync and its `serverVersion` has not moved since the fetch began (the MYK9-1633 rule, extended to foreign rows), so an upload acknowledged during the fetch is never rolled back. `syncReplicatedTable` builds `versionsAtFetch` from `getLocalRowsForScope()`, which leaves out other accounts' rows, so the pre-fetch snapshot must also take the scope's foreign rows' versions (read by id, not through the account-scoped reader). Without that, an acknowledged foreign row has nothing to compare and stays stuck.

   It is then replaced and becomes this account's row. A dirty or queued foreign row keeps the guard, as MYK9-1148 intended. The MYK9-1148 test is narrowed to "another account's unsent row", and new tests cover the clean case and the acknowledged-upload case.

2. **On a full sync only, drop this scope's clean foreign rows before writing.** Same effect, but only on a full sync, so the next incremental sync can still trip on it.
3. **Do nothing in code.** Every account switch on a shared device can strand a row the same way, and the only way out is a reset that erases every account's unsent work on the device. Not acceptable for show day.

**Retry.** `PartialReplicaNotice` gets a **Try again** that runs a forced full sync (`syncAtShowData(showId, { forceFullSync: true })`), reusing the entry list's existing forced-refresh handler. Where `StaleReadNotice` (which already has Try again) shows at the same time on `AtShowDogsPage` / `AtShowDogPage`, only one Try again shows, and it runs the forced sync. The short-replica failure already reaches Sentry once a session.

## Owner question

Option 1, with the MYK9-1148 test narrowed to "another account's unsent row"? Recommendation: yes.

**Until it ships, do not clear the affected phone's site data.** A reset erases every account's unsent scores and check-ins on the device. The phone is also the evidence (see above). For the MYK9-1940 AC4 rehearsal, use another phone, or a fresh browser profile, signed in as the judge.

## Testing

- `packages/replication`: account A's clean row at v12 with nothing queued; account B downloads v10. The row is written and owned by B, the scope is stamped whole, and the short check passes. Red on `main` today.
- A's row dirty, or with a pending or failed mutation: it is kept (MYK9-1148 still holds).
- A's row with `lastOwnUpload`, clean, `syncStatus: 'synced'`: on a full sync whose fetch saw the same version, it yields; if an acknowledgment moved it during the fetch, it is kept.
- At-show: the notice shows one Try again, also when `StaleReadNotice` shows too, and pressing it runs the forced full sync.
- **Confirmed after the first sync** (issue criterion 3): sync a judge's phone first, then confirm an entry on Show Desk, then check that it appears under Pending through the normal sync path, with no Try again and no sign-out. A walk on the deployed build, after the stale phone's row has been recorded.
- **The incident itself:** after the stale phone's row is recorded, deploy, then on that same phone (no site-data reset, no sign-out) open Exterior Excellent: the notice clears and Juni is under Pending.
