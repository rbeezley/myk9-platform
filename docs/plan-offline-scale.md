# Offline and scale: a device holds the shows its user works on

> **Status:** Active

Linear: MYK9-2252 (sync) and MYK9-2253 (people). Agreed with the owner in a design conversation on 2026-11-19. No code has been written. Checked with `verify-plan` and reviewed by Codex the same day; additions are marked [ADDED] or [EXPANDED].

## Why

Two things must both be true. A secretary, judge or steward must be able to run a show with no internet. And the app must keep working when the platform holds thousands of people, dogs and shows.

[ADDED] The yardstick is mySWT, the owner's Microsoft Access application. About 200 clubs run it from one laptop with no internet, and in it dogs and people carry over from show to show. myK9Show should match that as closely as a local-first web app can. The sizes in this plan assume 200 clubs. No mySWT data was imported, so each club's own history starts empty.

Today they pull against each other. To work offline, a device downloads everything its user is allowed to see, across the whole platform. Four of those downloads are one request with no paging, and the API returns at most 1,000 rows per request. Past that, the newest rows never arrive and every sync still reports success.

Production on 2026-11-19: 83 people, 296 classes, 106 trials, 45 shows, 95 dogs, 249 entries. Nothing truncates yet. Classes reach 1,000 after about 15 to 20 real shows.

## What the code does today

Read on 2026-11-19. Nothing here was reproduced in a browser.

| Fact                                                                                                                                                                                                                                                                      | Where                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| The background sync runs every table with no show scope, so classes, trials, shows and waitlist entries download platform-wide.                                                                                                                                           | `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`                                          |
| Those four fetch in one request with no paging. Entries, dogs, dog registrations, judge assignments and armbands page, but each takes a page shorter than 1,000 rows as the last one.                                                                                     | `apps/myk9show/src/services/replication/Replicated*.ts`                                            |
| A full sync that still leaves the device short reports success.                                                                                                                                                                                                           | `packages/replication/src/syncReplicatedTable.ts`                                                  |
| A second kind of sync already exists: one scoped pass per show whose page is open. It is what the "Offline ready" badge checks, against the server's count.                                                                                                               | `apps/myk9show/src/providers/showScopeTargets.ts`, `apps/myk9show/src/features/offline-readiness/` |
| Secretary and admin sessions download every person, with email, phone and street address, in one unpaged request. It is saved on the device as `myk9show-user-storage`.                                                                                                   | `apps/myk9show/src/App.tsx`, `apps/myk9show/src/store/userStore.ts`                                |
| Sign-out does not clear that saved directory.                                                                                                                                                                                                                             | `apps/myk9show/src/hooks/useAuth.ts`                                                               |
| About 30 files read people from that directory.                                                                                                                                                                                                                           | `grep -rl useUserStore apps/myk9show/src`                                                          |
| Only entries, armbands, waitlist entries and paperwork prints are kept per account on a shared browser. Other saved tables are not.                                                                                                                                       | `usesAccountOwnedRows` in `packages/replication/src/core/ReplicatedTable.ts`                       |
| A replicated `people` table exists, but it only creates walk-in people offline, and its sync downloads nothing. It saves each walk-in on the device with address, phone and email.                                                                                        | `createPerson` in `apps/myk9show/src/services/replication/ReplicatedShowDeskPeopleTable.ts`        |
| Offline, Entry Forms shows the typed handler text in the owner's place.                                                                                                                                                                                                   | `apps/myk9show/src/hooks/entryDisplayNames.ts:33`                                                  |
| [ADDED] Dogs, dog registrations and judge assignments also download platform-wide in the background pass, and page. Clubs download platform-wide in one request, through their own sync adapter. A secretary may see every dog (MYK9-854), so her device holds every dog. | `ReplicatedDogsTable.ts`, `ReplicatedClubsTable.ts`                                                |
| [ADDED] Entries are different. The background pass skips entries when it has no show, so a device holds the entries only of shows that were opened or saved on it.                                                                                                        | `syncForPrincipal` in `ReplicatedEntriesTable.ts`                                                  |
| [ADDED] "Offline ready" counts the show, its trials, classes, entries and judge assignments. It does not count dogs or people.                                                                                                                                            | `apps/myk9show/src/features/offline-readiness/useOfflineReadiness.ts`                              |
| [ADDED] The people search has no row limit and returns every contact column.                                                                                                                                                                                              | `searchUsers` in `apps/myk9show/src/services/database/users/reads.ts`                              |
| [ADDED] Feature switches are fixed when the app is built. Turning one off needs a deploy.                                                                                                                                                                                 | `apps/myk9show/src/config/features.ts`                                                             |

The hosted `max_rows` has not been read. It is 1,000 in `supabase/config.toml`. MYK9-2258 records the hosted value.

## Why the current design is the way it is [ADDED]

Read from the code's comments and the issues they cite.

- **One background pass, one scope.** The sync provider hands every table the same scope value, and its meaning differs per table (`ReplicationSyncProvider.tsx`). With no scope, each table downloads everything the user may see. That was the simplest thing that made every screen work offline.
- **Per-show passes came later.** A show whose page is open registers itself, and the provider adds one scoped pass for it (MYK9-1923, `showScopeTargets.ts`). "Offline ready" was built on those passes (MYK9-203).
- **The daily full re-download** repairs a device whose incremental sync has drifted (MYK9-1633).
- **Judge assignments have no scope** because the table was small when the code was written (the comment in `ReplicatedJudgeAssignmentsTable.ts`).
- **The people directory** is preloaded so that names and owner pickers work on every management screen (the comment in `App.tsx`). It is limited to management roles (SA-008).
- **Sign-out keeps saved data** so that a volunteer who signs out by habit is not locked out of a show at a venue with no internet (MYK9-202).
- **A secretary sees every dog** so that a mail-in entry can find any exhibitor's dog (MYK9-854).

None of these was a mistake when it was made. Each assumes a platform small enough to download whole.

## The decisions

Each was put to the owner with a recommendation on 2026-11-19.

1. **A device holds show by show.** It holds, in full and checked against the server, each show its user works on: a secretary's shows, a judge's assigned shows, an exhibitor's entered shows, from a few weeks before to a few weeks after. This happens automatically, with no button to remember. Lists that span the platform (Find Shows, all clubs) are looked up online. Every download also pages, as a safety net.
2. **People: everyone for now, the club's people at a trigger.** For now a secretary's or admin's device keeps every person on the platform, with name, phone and email. No device holds a street address. The end state is everyone who has ever shown with the club, with the same details; a judge or steward never holds contact details. The switch comes at 10 live clubs or 10,000 people, whichever is first, with an alert to the owner (MYK9-2274). [EXPANDED] This took three steps on 2026-11-19. First, the show's people only. Then the club's people, because in mySWT people carry over from show to show and secretaries change. Then the owner asked why people should differ from dogs, and chose everyone for now: the limit on people is whose phone numbers sit on each laptop, not size, and with a handful of clubs that exposure is small.
3. **Sign-out removes phone and email, and keeps names and the show.** On the saved people directory this means phone, email and address go and names stay. A person added at the desk is also saved in a second place on the device; such a row keeps every field until it is sent, and the name only after that (MYK9-2255). Work not yet sent to the server is never removed.
4. **A short download is a failure, reported quietly.** Volunteers see it only where the offline copy is already reported: the "Couldn't save the offline copy" line with Try again, and the checklist line "This device is ready to work offline". No banner and no pop-up. The owner gets a Sentry alert naming the table and the two counts. A screen that needs missing data says "can't check" and never shows a guess.
5. **Three phases, set by the dates.** The safety net lands before the December mock show. The people work lands before entries open on 2027-01-22. Show-by-show saving lands after that and before the real show's day.

[ADDED] Decision 1 was put in terms of shows, trials and classes. The other tables were decided later the same day (MYK9-2268). Dogs and their registrations stay platform-wide for now, with an alert to the owner at 10,000 dogs; the end state is every dog that has shown with the club (MYK9-2272, parked until the alert). Judge assignments are saved per show, like classes, plus a person's own (MYK9-2264). Clubs stay platform-wide. Entries are saved per show: a device holds the entries of shows opened or saved on it. The owner was first told, wrongly, that a device already held all years of the club's entries; whether past shows are saved is now an open question (MYK9-2276).

## Do nothing, delete it, or link to what exists [ADDED]

- **Do nothing.** Nothing truncates at today's counts, and nothing would through the December mock show. The failure arrives in the first season, at about 15 to 20 real shows, and it is silent: the newest classes never arrive and every sync reports success. Rejected for phase 1 for that reason. The cheapest version of phase 1 is the alert alone (MYK9-2254), which would turn a silent failure into a loud one. Paging is small, so the plan does both.
- **Do nothing yet, for people and dogs.** Chosen by the owner. Both stay platform-wide behind an alert (MYK9-2274, MYK9-2268), and the per-club work is parked.
- **Do nothing yet, for the platform-wide pass.** Not yet put to the owner. With paging in place the pass keeps working; it only grows. Retiring it (MYK9-2264) is the riskiest change in the plan, and it could wait behind an alert on the number of classes, as dogs and people do. Saving shows automatically (MYK9-2261) is worth doing on its own date, because it fixes the volunteer who never opened the show at home. See Open questions.
- **Delete it.** The plan deletes the platform-wide pass for five tables (phase 3) and, at the people trigger, the directory download and the separate owner-name copy. It adds no page, tab or setting.
- **Link to what exists.** Phase 3 extends the per-show passes and the "Offline ready" check that already exist; it does not add a second way to sync. The people work reuses the existing directory now and the existing replicated `people` table later. Removing a revoked secretary's data follows the entries model (MYK9-1521).

## What a device holds, once all three phases land

| Role                  | Shows saved                          | People saved                                                                                                     |
| --------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Secretary, club admin | Their club's shows inside the window | For now everyone on the platform: name, phone, email. At the trigger, everyone who has ever shown with the club. |
| Judge                 | Shows they are assigned to           | None. Entries carry the names a judge sees.                                                                      |
| Steward (passcode)    | The show they opened                 | None. Entries carry the names a steward sees.                                                                    |
| Exhibitor             | Shows they have entered              | None beyond what entries already show                                                                            |
| Site admin            | A show they open                     | Everyone on the platform: name, phone, email                                                                     |

The window is the plan's proposal: 30 days before a show's first trial to 14 days after its last. The owner said "a few weeks before to a few weeks after".

[ADDED] At the trigger: a person has shown with a club if they own, co-own or handle a dog entered in any of its shows, including withdrawn and pulled entries (the desk still lists them), or are a judge or official of one of its shows. A secretary's access comes from the club. When the club revokes it, her device drops that club's people at its next sync, and a newly appointed secretary gets the club's whole history. A secretary's device also holds every dog on the platform (MYK9-2268).

## Phase 1: the safety net (before the December mock show)

Due 2026-12-01. Each issue is its own PR.

| Issue             | What changes                                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MYK9-2252         | Classes, trials, shows, waitlist entries and clubs page in their sync adapters, and `getAllClubs` pages. Each pager stops on an empty page, so a lower hosted limit cannot cut it off. |
| MYK9-2275 [ADDED] | The pagers that already exist (dogs, entries, dog registrations, judge assignments, armbands, and the id scans behind clean-up) stop on an empty page, not a short one.                |
| MYK9-2254         | A download short of the server's count is a failure, and sends one Sentry alert.                                                                                                       |
| MYK9-2255         | Sign-out removes phone, email and address from the saved people directory and from sent walk-in rows, and keeps names.                                                                 |
| MYK9-2256         | Offline, Entry Forms and the check-in desk never show the handler as the owner.                                                                                                        |
| MYK9-2257         | Add Person says when the duplicate check could not run.                                                                                                                                |
| MYK9-2258         | The owner records the hosted `max_rows`. If it is below 1,000, today's pagers already stop early, and the dogs clean-up could remove valid rows from a device.                         |

The people directory is not paged in this phase. Phase 2 pages it (MYK9-2273).

[EXPANDED] Two details the first draft left out:

- **Paging is keyset on (`updated_at`, `id`), never offset.** Classes cloned in one statement share one timestamp. A pager keyed on the timestamp alone skips rows at a page boundary. MYK9-2252 tests more than one page of rows with the same timestamp.
- **The alert must reach someone.** No Sentry alert rule is documented in the repo. MYK9-2254 confirms how an event of this kind reaches the owner. If no rule would notify on it, the owner adds one and a test event is seen to arrive.

## Phase 2: people (before entries open on 2027-01-22)

Due 2027-01-15. [EXPANDED] Changed by the owner on 2026-11-19: every person stays on a secretary's device for now. So this phase fixes the directory that already exists, and the per-club work is parked.

| Issue     | What changes                                                                                                                                          | Waits on  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| MYK9-2273 | The people directory pages, a short load is a failure, it stops saving street addresses, and it counts toward "Offline ready".                        |           |
| MYK9-2265 | Offline at the desk: real owner names, an exhibitor's phone in the existing person details, and a duplicate check, all read from the saved directory. | MYK9-2273 |
| MYK9-2274 | An alert to the owner at 10 live clubs or 10,000 people, whichever comes first.                                                                       |           |

Cases these issues must handle:

- **A short load (MYK9-2273).** The fuller copy already on the device is kept, never overwritten, and the owner is alerted.
- **Addresses (MYK9-2273).** A screen that shows or edits an address reads that one person from the server when it opens. Saving a person from the edit panel never blanks an address.
- **A device with no directory (MYK9-2273).** It reads "not saved", and Add Person says it could not check (MYK9-2257).
- **A device that already holds the old copy (MYK9-2273).** The new build strips its address fields on first run, with no network. A short or failed load keeps that stripped copy, never the old one.

### Parked until the alert fires

The end state is unchanged: a secretary's device holds everyone who has ever shown with the club. These wait for the alert in MYK9-2274, and are picked up in this order.

| Issue     | What changes                                                                                                                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MYK9-2259 | Server: one read of a club's people for its desk, with phone and email, and of a show's names for its judges and stewards. A migration, so its own PR.                                                     |
| MYK9-2263 | A secretary's device holds her club's people, private to her account. A club that revokes her appointment removes them at the next sync.                                                                   |
| MYK9-2266 | Sign-out removes phone and email from that saved copy.                                                                                                                                                     |
| MYK9-2260 | Online, pickers, name lookups and the duplicate check ask the server as the user types. Offline, all three search the club's saved people, and a miss reads as "not found on this device". About 30 files. |
| MYK9-2267 | The platform-wide people directory download and its saved copy are deleted. The offline desk walk is repeated afterwards and still passes.                                                                 |
| MYK9-2271 | Each saved dog carries its owner's name, name only.                                                                                                                                                        |

Their "Done when" lines already carry the cases the plan check found: a late entry, an empty show, two roles, walk-ins saved before the change, sign-out during a sync, a failed removal, and a search with a limit.

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

[ADDED] Stopping a download does not remove what is already saved. A show that leaves the window, and everything the platform-wide pass saved before the upgrade, is removed from the device, except rows with work not yet sent (MYK9-2261, MYK9-2264).

## Rollout and rollback [ADDED]

**Order, for every issue.** Merge, then deploy. A merge is not a deploy.

- No issue in phases 1 to 3 has a migration. The parked MYK9-2259 has one. When it is picked up: dry run, `supabase db push` from `main` after the merge, then read the grants from the applied database, all before any build that calls the new read is deployed.
- The frontend moves only when Deploy myK9Show runs.
- A device gets a new build only after its user accepts the update prompt. Before the mock show and before the real show, each show device is opened online and updated.

**Lead time (proposal, for the owner to confirm).** A change to syncing is live and walked on production at least three days before a show. If it is not, it waits until after the show.

**Rolling back.**

- Every change in phases 1 to 3 is app code. To roll back, revert the PR on `main` and run Deploy myK9Show.
- Phase 3 has a build-time switch. Off restores the platform-wide pass. It still needs a deploy.
- Nothing on the server is changed or deleted by phases 1 to 3.
- What a device removes (phone, email and address at sign-out) is a copy. The server still holds it, and the next sign-in brings back what the role allows.
- The parked MYK9-2263 changes the shape of the saved people. When it is picked up, it must not need a storage version that an older build cannot open.

## New wording [ADDED]

Proposed, for the owner to approve before it ships. `plan-recheck` compares the screens against this table.

| Where                                                       | Proposed words                                 | Issue     |
| ----------------------------------------------------------- | ---------------------------------------------- | --------- |
| Entry Forms and the check-in desk, offline, owner not saved | "Owner name not on this device"                | MYK9-2256 |
| Add Person, the check could not run                         | "Can't check for an existing person right now" | MYK9-2257 |
| Add Person, offline                                         | "Checked the people saved on this device"      | MYK9-2265 |

Wording that stays as it is: "Couldn't save the offline copy", "Offline copy: not saved on this device", "Save for show day", "Try again", "This device is ready to work offline".

## Testing

Each issue carries its own tests. This phase is what must be true before a phase is called done.

**Phase 1**

- A unit test per sync adapter, new and existing, and per id scan, fetches more than 1,000 rows from a server that returns at most 500 per request, and gets them all. A clean-up that could not read every live id removes nothing.
- [ADDED] A unit test per fixed adapter pages across more than one page of rows that share one `updated_at`.
- Engine tests: a short download fails and alerts once. A pending local create, a pending delete, and a row deleted on the server between the count and the fetch raise no alarm.
- [ADDED] A test Sentry event for a short download is seen to reach the owner.
- Sign-out tests: after sign-out no person saved on the device has a phone, an email or an address, in the directory or in a sent walk-in row. Names stay, an unsent walk-in keeps every field, and it is all still so after a reload.
- The whole app suite shuffled six times (`pnpm vitest run --sequence.shuffle`). Sign-out rewrites state held in browser storage, which is the repo's six-run case.
- A browser walk on the local stack, offline: Entry Forms and the check-in desk with a dog handled by someone other than its owner. Add Person on a device that never loaded the directory.
- At the December mock show: one secretary laptop saves the show, turns Wi-Fi off, and checks owner names on Entry Forms.
- [ADDED] Before the mock show: each show device is opened online and is on the current build.

**Phase 2**

- A test seeds more than 1,000 people, loads them all, and finds one late in the alphabet.
- A test: a short load keeps the earlier copy and sends one alert.
- A test reads the stored directory and finds no address field. A test saves a person from the edit panel and the address on the server is unchanged.
- A test rehydrates the old saved format offline and finds no address field.
- A browser walk on the local stack, offline, as a secretary: owner names on Entry Forms and the check-in desk, phone in person details, and the duplicate check for a person from another club.
- A judge's device holds no directory.
- The trigger alert: a test for each threshold and for the once-only rule, and a test alert seen to arrive.
- When the parked work is picked up: a behavioral SQL test for the club's people read with positive and negative controls for each role (these run only in CI), grants read from the applied database, a two-account test on one browser, and the search query plan at 50,000 seeded people.

**Phase 3**

- Unit tests for the list of shows per role and for the window.
- A browser walk on the local stack: sign in on a clean device, never open the show, go offline, open the show.
- Offline walks of My Entries, the judge's assignments list and the secretary dashboard after the platform-wide pass is retired.
- A check that a signed-in device makes no unscoped request for classes, trials, shows, waitlist entries or judge assignments, apart from a person's own assignments.
- [ADDED] The request count of one background pass with one, three and six saved shows, before and after.
- [ADDED] A build with the phase 3 switch off behaves as before.
- [ADDED] A show leaving the window, with and without unsent work, and a device upgrading from the platform-wide pass: the rows are gone and screens stop returning them.

**After each phase deploys:** `plan-recheck` on this plan.

## Not in scope

- A new page, tab, sheet or setting. Every change lands on a screen that exists.
- A "this is a shared computer" choice at sign-in.
- Per-account storage for dogs, classes, trials and shows. Earlier work closed the known leaks there (MYK9-1126, MYK9-1139), and the clubs case is MYK9-2168.
- [EXPANDED] Scoping dogs, their registrations and clubs. They stay platform-wide by owner decision (MYK9-2268). Their pagers are still fixed in phase 1 (MYK9-2275).
- [ADDED] Narrowing who may read `people` on the server. A secretary must be able to find any existing person, so the server keeps answering her searches. This plan changes what a device stores and what a search returns, not who is allowed to ask.
- Legacy myK9Q.

## Open questions

- **Add entry lists matching people when no dogs match.** Raised in MYK9-2253, not decided. MYK9-2262 holds it with a recommendation to build it.
- **The window.** 30 days before to 14 days after is a proposal. Confirm it on MYK9-2261.
- **The real show's date.** Phase 3 needs it for a due date.
- [ADDED] **The new wording** in the table above.
- [ADDED] **The three-day lead time** for sync changes before a show.
- [ADDED] **The privacy policy.** It should say that secretaries of participating clubs can see exhibitor contact details. The wording is with the attorney review.
- [ADDED] **Whether retiring the platform-wide pass waits for a trigger.** MYK9-2264 could be parked behind an alert on the number of classes, as dogs and people are. Recommendation: park it, and keep MYK9-2261 on its date.
- [ADDED] **Past shows.** A device holds the entries only of shows opened or saved on it. In mySWT, past shows are on the laptop. MYK9-2276 recommends saved shows only, with past shows read online.

## Risks

- **A screen that read the platform-wide copy shows "nothing here" after phase 3.** A read that spans shows cannot trust the saved copy alone. MYK9-2264 moves each one to ask the server first and to say "can't check" when it cannot.
- **Phone and email blanked at sign-out do not come back.** MYK9-2255 reloads the directory at the next sign-in online, without anyone pressing a button.
- **A false alarm from a stale count.** MYK9-2254 confirms with a second count before it fails a sync.
- **The interim outlives its trigger.** Every person stays on every secretary's laptop for longer than intended. MYK9-2274 alerts the owner at 10 live clubs or 10,000 people, and the parked issues are written and ordered.
- [ADDED] **The alert is sent and nobody sees it.** Sentry holds the event but no rule notifies the owner. MYK9-2254 does not close until a test event arrives.
- [ADDED] **Saving more shows loads the database on show day.** Each saved show adds requests to every pass. MYK9-2261 slows the pass for shows that are not open and records the measured count.
- [ADDED] **A show device runs an old build.** The update is a prompt the user must accept. The pre-show check above covers it.
- [ADDED] **Every club's exhibitors' phone and email sit on every secretary's laptop, for now.** The server already lets a secretary read them. Sign-out removes them, though staff are told to stay signed in. The exposure grows with each club, which is why the trigger counts clubs.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: the plan changes offline replication and sign-out, and changes the people directory that about 30 files read. The parked people work adds a migration with role-based access to contact details.
