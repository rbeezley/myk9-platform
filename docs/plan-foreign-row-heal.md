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

To confirm on the phone: Sentry should hold "Offline copy is short: entries holds 13 of 14 rows" for show `dededede-…10`. The IndexedDB row `dededede-0000-0000-0000-000000000054` should show an `ownerAuthUserId` other than the judge's.

## Why the guard is the way it is

MYK9-1133 (#2963) made cached rows belong to the account that synced them. MYK9-1148 (#2968) and the test `still skips an older download for another account's row` keep a download from overwriting another account's row. The aim was a shared ringside device: account A's **unsent** score must never be lost because account B synced. Unsent work is already marked separately (`isDirty`, `lastOwnUpload`), so the version guard on a **clean** foreign row protects nothing. Nobody sends that copy again.

## Options

1. **Recommended: a clean foreign row takes the server copy.** In `shouldKeepNewerRow`, a row owned by another account that is not dirty and has no `lastOwnUpload` no longer blocks the download. It is replaced and becomes this account's row. Dirty or unsent foreign rows keep the guard, as MYK9-1148 intended. The MYK9-1148 test is narrowed to "dirty or unsent", and a new test covers the clean case. The same guard runs in `repairStuckPendingFlags` and the conflict code, so all account-owned tables change, not only entries.
2. **On a full sync only, drop this scope's clean foreign rows before writing.** Same effect, but only on a full sync, so the next incremental sync can still trip on it.
3. **Do nothing in code: clear the phone's site data.** This heals the one device today, if the cause is right, but every future account switch on a shared device can strand a row the same way.

In every option, `PartialReplicaNotice` gets a **Try again** button that runs a forced full sync (today it is plain text). The short-replica failure already reaches Sentry once a session.

## Owner question

Option 1, with the MYK9-1148 test narrowed from "another account's row" to "another account's unsent row"? Recommendation: yes. Until it ships, clearing myk9show.com's site data on the phone and signing in again as the judge should unblock the MYK9-1940 AC4 rehearsal, and doing so also tests the cause.

## Testing

- `packages/replication`: account A's clean row at v12, account B downloads v10. The row is written and owned by B, the scope is stamped whole, and the short check passes. Red on `main` today.
- The same with A's row dirty: it is kept (MYK9-1148 still holds).
- At-show: the notice shows Try again, and pressing it runs `syncAtShowData(showId, { forceFullSync: true })`.
- After deploy: the owner's phone (or a phone with the stale row) loads Juni under Pending without clearing data.
