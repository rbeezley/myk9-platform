# Offline and scale: a device holds the shows its user works on

> **Status:** Active

Linear: MYK9-2252 (sync) and MYK9-2253 (people). Agreed with the owner in a design conversation on 2026-11-19. No code has been written. Checked with `verify-plan` the same day; additions are marked [ADDED] or [EXPANDED].

## Why

Two things must both be true. A secretary, judge or steward must be able to run a show with no internet. And the app must keep working when the platform holds thousands of people, dogs and shows.

[ADDED] The yardstick is mySWT, the owner's Microsoft Access application. About 200 clubs run it from one laptop with no internet, and in it dogs and people carry over from show to show. myK9Show should match that as closely as a local-first web app can. The sizes in this plan assume 200 clubs. No mySWT data was imported, so each club's own history starts empty.

Today they pull against each other. To work offline, a device downloads everything its user is allowed to see, across the whole platform. Four of those downloads are one request with no paging, and the API returns at most 1,000 rows per request. Past that, the newest rows never arrive and every sync still reports success.

Production on 2026-11-19: 83 people, 296 classes, 106 trials, 45 shows, 95 dogs, 249 entries. Nothing truncates yet. Classes reach 1,000 after about 15 to 20 real shows.

## What the code does today

Read on 2026-11-19. Nothing here was reproduced in a browser.

| Fact                                                                                                                                                                                                          | Where                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| The background sync runs every table with no show scope, so classes, trials, shows and waitlist entries download platform-wide.                                                                               | `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`                                          |
| Those four fetch in one request with no paging. Entries, dogs, dog registrations, judge assignments and armbands page.                                                                                        | `apps/myk9show/src/services/replication/Replicated*.ts`                                            |
| A full sync that still leaves the device short reports success.                                                                                                                                               | `packages/replication/src/syncReplicatedTable.ts`                                                  |
| A second kind of sync already exists: one scoped pass per show whose page is open. It is what the "Offline ready" badge checks, against the server's count.                                                   | `apps/myk9show/src/providers/showScopeTargets.ts`, `apps/myk9show/src/features/offline-readiness/` |
| Secretary and admin sessions download every person, with email, phone and street address, in one unpaged request. It is saved on the device as `myk9show-user-storage`.                                       | `apps/myk9show/src/App.tsx`, `apps/myk9show/src/store/userStore.ts`                                |
| Sign-out does not clear that saved directory.                                                                                                                                                                 | `apps/myk9show/src/hooks/useAuth.ts`                                                               |
| About 30 files read people from that directory.                                                                                                                                                               | `grep -rl useUserStore apps/myk9show/src`                                                          |
| Only entries, armbands, waitlist entries and paperwork prints are kept per account on a shared browser. Other saved tables are not.                                                                           | `usesAccountOwnedRows` in `packages/replication/src/core/ReplicatedTable.ts`                       |
| A replicated `people` table exists, but it only creates walk-in people offline. Its sync downloads nothing.                                                                                                   | `apps/myk9show/src/services/replication/ReplicatedShowDeskPeopleTable.ts`                          |
| Offline, Entry Forms shows the typed handler text in the owner's place.                                                                                                                                       | `apps/myk9show/src/hooks/entryDisplayNames.ts:33`                                                  |
| [ADDED] Dogs, dog registrations, entries, judge assignments and clubs also download platform-wide in the background pass. They page. A secretary may see every dog (MYK9-854), so her device holds every dog. | `apps/myk9show/src/services/replication/ReplicatedDogsTable.ts`                                    |
| [ADDED] "Offline ready" counts the show, its trials, classes, entries and judge assignments. It does not count dogs or people.                                                                                | `apps/myk9show/src/features/offline-readiness/useOfflineReadiness.ts`                              |
| [ADDED] The people search has no row limit and returns every contact column.                                                                                                                                  | `searchUsers` in `apps/myk9show/src/services/database/users/reads.ts`                              |
| [ADDED] Feature switches are fixed when the app is built. Turning one off needs a deploy.                                                                                                                     | `apps/myk9show/src/config/features.ts`                                                             |

The hosted `max_rows` has not been read. It is 1,000 in `supabase/config.toml`. MYK9-2258 records the hosted value.

## The decisions

Each was put to the owner with a recommendation on 2026-11-19.

1. **A device holds show by show.** It holds, in full and checked against the server, each show its user works on: a secretary's shows, a judge's assigned shows, an exhibitor's entered shows, from a few weeks before to a few weeks after. This happens automatically, with no button to remember. Lists that span the platform (Find Shows, all clubs) are looked up online. Every download also pages, as a safety net.
2. **People are looked up online and saved for the club.** Online, pickers and the duplicate check ask the server as the user types. Offline, a secretary's or club admin's device holds everyone who has ever shown with the club, with name, phone and email. A judge's or steward's device holds the names of their show's people. No device holds a street address. Offline, the duplicate check covers the club's people and says so. [EXPANDED] The owner widened this later the same day from "the show's people": in mySWT people carry over from show to show, and the club is the unit because secretaries change.
3. **Sign-out removes phone and email, and keeps names and the show.** The old platform-wide directory is cleared. Work not yet sent to the server is never removed. The saved people are private to the account that saved them.
4. **A short download is a failure, reported quietly.** Volunteers see it only where the offline copy is already reported: the "Couldn't save the offline copy" line with Try again, and the checklist line "This device is ready to work offline". No banner and no pop-up. The owner gets a Sentry alert naming the table and the two counts. A screen that needs missing data says "can't check" and never shows a guess.
5. **Three phases, set by the dates.** The safety net lands before the December mock show. The people work lands before entries open on 2027-01-22. Show-by-show saving lands after that and before the real show's day.

[ADDED] Decision 1 was put in terms of shows, trials and classes. The other tables were decided later the same day (MYK9-2268). Dogs and their registrations stay platform-wide for now, with an alert to the owner at 10,000 dogs; the end state is every dog that has shown with the club (MYK9-2272, parked until the alert). Each saved dog carries its owner's name, name only (MYK9-2271). Entries stay as they are: the club's shows, all years. Judge assignments are saved per show, like classes, plus a person's own (MYK9-2264). Clubs stay platform-wide.

## What a device holds, once all three phases land

| Role                  | Shows saved                          | People saved                                                  |
| --------------------- | ------------------------------------ | ------------------------------------------------------------- |
| Secretary, club admin | Their club's shows inside the window | Everyone who has ever shown with the club: name, phone, email |
| Judge                 | Shows they are assigned to           | The show's people, names only                                 |
| Steward (passcode)    | The show they opened                 | The show's people, names only                                 |
| Exhibitor             | Shows they have entered              | None beyond what entries already show                         |
| Site admin            | A show they open                     | That show's people: name, phone, email                        |

The window is the plan's proposal: 30 days before a show's first trial to 14 days after its last. The owner said "a few weeks before to a few weeks after".

[ADDED] A person has shown with a club if they own, co-own or handle a dog entered in any of its shows, including withdrawn and pulled entries (the desk still lists them), or are a judge or official of one of its shows. A secretary's access comes from the club. When the club revokes it, her device drops that club's people at its next sync, and a newly appointed secretary gets the club's whole history. A secretary's device also holds every dog on the platform, each with its owner's name.

## Phase 1: the safety net (before the December mock show)

Due 2026-12-01. Each issue is its own PR.

| Issue     | What changes                                                                                                                                   |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| MYK9-2252 | Classes, trials, shows, waitlist entries and `getAllClubs` page. Each pager stops on an empty page, so a lower hosted limit cannot cut it off. |
| MYK9-2254 | A download short of the server's count is a failure, and sends one Sentry alert.                                                               |
| MYK9-2255 | Sign-out clears the saved people directory.                                                                                                    |
| MYK9-2256 | Offline, Entry Forms and the check-in desk never show the handler as the owner.                                                                |
| MYK9-2257 | Add Person says when the duplicate check could not run.                                                                                        |
| MYK9-2258 | The owner records the hosted `max_rows`.                                                                                                       |

The people directory is not paged in this phase. Phase 2 deletes it. If phase 2 slips past 2027-01-22, page it.

[EXPANDED] Two details the first draft left out:

- **Paging is keyset on (`updated_at`, `id`), never offset.** Classes cloned in one statement share one timestamp. A pager keyed on the timestamp alone skips rows at a page boundary. MYK9-2252 tests more than one page of rows with the same timestamp.
- **The alert must reach someone.** No Sentry alert rule is documented in the repo. MYK9-2254 confirms how an event of this kind reaches the owner. If no rule would notify on it, the owner adds one and a test event is seen to arrive.

## Phase 2: people (before entries open on 2027-01-22)

Due 2027-01-15. Sub-issues of MYK9-2253, in this order.

| Issue             | What changes                                                                                                                                           | Waits on             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| MYK9-2259         | Server: one read of a club's people for its desk, with phone and email, and of a show's names for its judges and stewards. A migration, so its own PR. |                      |
| MYK9-2263         | A secretary's device holds her club's people, and a judge's holds the show's names. Private to the account, counted by "Offline ready".                | MYK9-2259            |
| MYK9-2265         | Offline at the desk: real owner names, an exhibitor's phone in the existing person details, a duplicate check over the club's people.                  | MYK9-2263            |
| MYK9-2266         | Sign-out removes phone and email from saved people.                                                                                                    | MYK9-2263            |
| MYK9-2271 [ADDED] | Each saved dog carries its owner's name, name only, so a dog from another club still shows its owner offline.                                          |                      |
| MYK9-2260         | Pickers, name lookups and the duplicate check ask the server as the user types.                                                                        |                      |
| MYK9-2267         | The platform-wide people directory download and its saved copy are deleted.                                                                            | MYK9-2260, MYK9-2265 |

MYK9-2260 touches about 30 files. Survey the readers first and split it by surface if it does not fit one PR.

[EXPANDED] Cases each issue must handle, added to its "Done when":

- **A late entry (MYK9-2259).** A person who joins the show after a device's last sync arrives on its next sync, even though their own record did not change.
- **An empty show (MYK9-2259, MYK9-2263).** The server answers a positive zero. A device reads "saved" only after that answer, never because nothing arrived.
- **Two roles (MYK9-2263).** A user who is the secretary of one show and a judge at another keeps the phone and email saved for the first when the second syncs.
- **Walk-ins saved before the change (MYK9-2263).** A person created at the desk and not yet sent is still sent and still readable.
- **Sign-out during a sync (MYK9-2266).** A sync that is running at sign-out writes no phone or email back afterwards.
- **A failed removal (MYK9-2266).** Sign-out still completes, and the removal runs again on the next load before any saved person is read.
- **The search (MYK9-2260).** It starts after a few characters, returns a limited number of matches and only the columns the picker shows. Names for a list are fetched in one request, not one per row. A failed search says so and offers Try again; it never shows an empty list as "no match". The query is checked at 50,000 people, and gets an index if it scans the table.

## Phase 3: show by show (after 2027-01-22, before the real show's day)

No due date yet. Set one when the real show's date is known.

| Issue             | What changes                                                                                                                                                                               | Waits on                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| MYK9-2261         | The background sync saves each show the user works on, automatically. "Save for show day" stays as the manual retry.                                                                       | Phase 2                 |
| MYK9-2264         | The platform-wide pass for classes, trials, shows, waitlist entries and judge assignments is retired. Each screen that reads across shows either reads the saved shows or asks the server. | MYK9-2261               |
| MYK9-2268 [ADDED] | Dogs, their registrations and clubs stay platform-wide. The owner is alerted when a device's dogs pass 10,000.                                                                             |                         |
| MYK9-2272 [ADDED] | Parked until that alert: a device holds only the dogs that have shown with the club.                                                                                                       | The alert               |
| MYK9-2269 [ADDED] | Every server read that returns a whole table with no limit is listed, then paged or filtered.                                                                                              | With or after MYK9-2264 |

This phase changes what "everything on the device" means, so it lands last, with paging already protecting it.

[EXPANDED] Saving more shows means more requests. A saved show that is not open syncs when the user signs in, when the app opens and when the connection returns, and otherwise less often than an open show. MYK9-2261 measures the requests in one background pass with one, three and six saved shows, before and after. Both phase 3 changes ship behind one build-time switch.

## Rollout and rollback [ADDED]

**Order, for every issue.** Merge, then deploy. A merge is not a deploy.

- MYK9-2259 has a migration. After it merges: dry run, `supabase db push` from `main`, then read the grants from the applied database. This happens before any build that calls the new read is deployed. The read is additive; nothing is dropped.
- The frontend moves only when Deploy myK9Show runs.
- A device gets a new build only after its user accepts the update prompt. Before the mock show and before the real show, each show device is opened online and updated.

**Lead time (proposal, for the owner to confirm).** A change to syncing is live and walked on production at least three days before a show. If it is not, it waits until after the show.

**Rolling back.**

- Every change except MYK9-2259 is app code. To roll back, revert the PR on `main` and run Deploy myK9Show.
- Phase 3 has a build-time switch. Off restores the platform-wide pass. It still needs a deploy.
- Nothing on the server is changed or deleted by phases 1 and 3. Phase 2 adds one read and may add one index.
- What a device removes (the old directory, phone and email at sign-out) is a copy. The server still holds it, and the next sync brings back what the role allows.
- MYK9-2263 changes the shape of the saved people. It must not need a storage version that an older build cannot open. If it does, the PR says so, because a rollback would then leave devices unable to read saved data.

## New wording [ADDED]

Proposed, for the owner to approve before it ships. `plan-recheck` compares the screens against this table.

| Where                                                       | Proposed words                                 | Issue     |
| ----------------------------------------------------------- | ---------------------------------------------- | --------- |
| Entry Forms and the check-in desk, offline, owner not saved | "Owner name not on this device"                | MYK9-2256 |
| Add Person, the check could not run                         | "Can't check for an existing person right now" | MYK9-2257 |
| Add Person, offline, checked the club's people              | "Checked this club's people only"              | MYK9-2265 |
| A people picker, offline, with no show in context           | "Connect to the internet to search people"     | MYK9-2260 |
| A people picker, the search failed                          | "We couldn't search. Try again."               | MYK9-2260 |

Wording that stays as it is: "Couldn't save the offline copy", "Offline copy: not saved on this device", "Save for show day", "Try again", "This device is ready to work offline".

## Testing

Each issue carries its own tests. This phase is what must be true before a phase is called done.

**Phase 1**

- A unit test per fixed adapter syncs more than 1,000 rows and gets them all. A second run with a page limit of 500 passes too, to cover a lower hosted limit.
- [ADDED] A unit test per fixed adapter pages across more than one page of rows that share one `updated_at`.
- Engine tests: a short download fails and alerts once. A pending local create, a pending delete, and a row deleted on the server between the count and the fetch raise no alarm.
- [ADDED] A test Sentry event for a short download is seen to reach the owner.
- Sign-out tests: the saved directory is empty after sign-out and stays empty after a reload.
- The whole app suite once with `pnpm vitest run --sequence.shuffle`, because the engine and the sign-out handler touch shared state.
- A browser walk on the local stack, offline: Entry Forms and the check-in desk with a dog handled by someone other than its owner. Add Person on a device that never loaded the directory.
- At the December mock show: one secretary laptop saves the show, turns Wi-Fi off, and checks owner names on Entry Forms.
- [ADDED] Before the mock show: each show device is opened online and is on the current build.

**Phase 2**

- A behavioral SQL test for the show's people read, with positive and negative controls for each role. These run only in CI, so read the CI result.
- Grants read from the applied database, not from the migration text.
- A unit test syncs more than 1,000 people for one show.
- A two-account test on one browser: the second account reads none of the first account's saved people.
- A browser walk on the local stack, offline, as a secretary and as a judge: owner names, phone in person details, the duplicate check. The judge's device holds no phone or email.
- A test seeds more than 1,000 people and finds one late in the alphabet through each picker.
- After the deploy: a device that held the old directory no longer has it.
- [ADDED] Tests for the cases listed under Phase 2: a late entry, an empty show, two roles, a walk-in saved before the change, sign-out during a sync, and a failed removal.
- [ADDED] A revoked secretary's device drops the club's people at its next sync. A newly appointed secretary's device gets the club's whole history. A dog from another club shows its owner's name offline.
- [ADDED] The search query plan at 50,000 seeded people on the local stack.

**Phase 3**

- Unit tests for the list of shows per role and for the window.
- A browser walk on the local stack: sign in on a clean device, never open the show, go offline, open the show.
- Offline walks of My Entries, the judge's assignments list and the secretary dashboard after the platform-wide pass is retired.
- A check that a signed-in device makes no unscoped request for classes, trials, shows, waitlist entries or judge assignments, apart from a person's own assignments.
- [ADDED] The request count of one background pass with one, three and six saved shows, before and after.
- [ADDED] A build with the phase 3 switch off behaves as before.

**After each phase deploys:** `plan-recheck` on this plan.

## Not in scope

- A new page, tab, sheet or setting. Every change lands on a screen that exists.
- A "this is a shared computer" choice at sign-in.
- Per-account storage for dogs, classes, trials and shows. Earlier work closed the known leaks there (MYK9-1126, MYK9-1139), and the clubs case is MYK9-2168.
- [EXPANDED] Paging dogs, entries, dog registrations, judge assignments and armbands. They already page. Dogs, their registrations and clubs stay platform-wide by owner decision (MYK9-2268).
- [ADDED] Narrowing who may read `people` on the server. A secretary must be able to find any existing person, so the server keeps answering her searches. This plan changes what a device stores and what a search returns, not who is allowed to ask.
- Legacy myK9Q.

## Open questions

- **Add entry lists matching people when no dogs match.** Raised in MYK9-2253, not decided. MYK9-2262 holds it with a recommendation to build it.
- **The window.** 30 days before to 14 days after is a proposal. Confirm it on MYK9-2261.
- **The real show's date.** Phase 3 needs it for a due date.
- [ADDED] **The new wording** in the table above.
- [ADDED] **The three-day lead time** for sync changes before a show.

## Risks

- **A screen that read the platform-wide copy shows "nothing here" after phase 3.** A read that spans shows cannot trust the saved copy alone. MYK9-2264 moves each one to ask the server first and to say "can't check" when it cannot.
- **Phone and email blanked at sign-out do not come back.** A sync that only asks for changed rows would not restore them. MYK9-2266 requires a full download of the show's people at the next sign-in.
- **A false alarm from a stale count.** MYK9-2254 confirms with a second count before it fails a sync.
- **Phase 2 slips past 2027-01-22.** Then real exhibitors' details reach every secretary device. Phase 1's sign-out clear limits the exposure, and the directory must then be paged.
- [ADDED] **The alert is sent and nobody sees it.** Sentry holds the event but no rule notifies the owner. MYK9-2254 does not close until a test event arrives.
- [ADDED] **Saving more shows loads the database on show day.** Each saved show adds requests to every pass. MYK9-2261 slows the pass for shows that are not open and records the measured count.
- [ADDED] **A show device runs an old build.** The update is a prompt the user must accept. The pre-show check above covers it.
- [ADDED] **More contact details sit on a secretary's laptop.** It holds the club's whole history, not one show. They are the club's own exhibitors, they are private to her account, and phone and email are removed at sign-out.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: the plan changes offline replication, adds a migration with role-based access to contact details, and touches sign-out and about 30 files that read people.
