# Offline and scale: page and alert now, scope later

> **Status:** Active

Linear: MYK9-2252 (sync) and MYK9-2253 (people). Agreed with the owner on 2026-11-19. No code has been written. A longer version of this plan was reviewed by Codex over six rounds on PR #4230. The owner then cancelled the work that scopes what a device holds, to stay focused on the December mock shows and the January real show. This is the short record of what is built now and what waits.

## Why

A secretary, judge or steward must be able to run a show with no internet. The yardstick is mySWT, the owner's Microsoft Access application, which about 200 clubs run from one offline laptop.

The limit that bites first is 1,000 rows per request, not 10,000 dogs or people. Four of the app's offline downloads are one request with no paging, and the API returns at most 1,000 rows. Past that, the newest rows never arrive and every sync still reports success. Classes reach 1,000 after about 15 to 20 real shows.

Production on 2026-11-19: 88 people, 296 classes, 106 trials, 45 shows, 74 dogs that are not deleted, 249 entries. Nothing truncates yet.

## What the code does today

Read on 2026-11-19. Nothing here was reproduced in a browser.

- The background sync downloads classes, trials, shows, waitlist entries and clubs platform-wide, each in one request with no paging (`apps/myk9show/src/services/replication/Replicated*.ts`).
- Dogs, dog registrations, judge assignments and armbands also download platform-wide, and page. Entries do not: the background pass skips them when it has no show, so a device holds the entries only of shows opened or saved on it.
- Every pager that exists takes a page shorter than 1,000 rows as the last one. That is safe only if the hosted row limit is 1,000. It has not been read; it is 1,000 in `supabase/config.toml`.
- A full sync that still leaves the device short reports success (`packages/replication/src/syncReplicatedTable.ts`).
- Secretary and admin sessions download every person, with email, phone and street address, in one unpaged request. It is saved on the device as `myk9show-user-storage`, about 30 files read it, and sign-out does not clear it.
- A person added at the desk is saved in a second place, the device's own `people` rows, with address, phone and email, until it is sent. Those rows are not kept per account (`ReplicatedShowDeskPeopleTable.ts`).
- Offline, Entry Forms shows the typed handler text in the owner's place (`apps/myk9show/src/hooks/entryDisplayNames.ts:33`).
- The Add Person duplicate check reads the saved directory. On a device that never loaded it, the check finds nothing and says nothing.

## Why the current design is the way it is

- The sync provider hands every table one scope value. With no scope, most tables download everything the user may see. That was the simplest thing that made every screen work offline.
- The people directory is preloaded so that names and owner pickers work on every management screen (SA-008 limits it to management roles).
- Sign-out keeps saved data so that a volunteer who signs out by habit is not locked out of a show at a venue with no internet (MYK9-202).
- A secretary sees every dog so that a mail-in entry can find any exhibitor's dog (MYK9-854).

## What the owner decided

1. **Build now only what is wrong today, the 1,000-row limit on the sync, and an alarm.** Nine issues, listed below.
2. **Do not scope what a device holds yet.** A secretary's device keeps every person and every dog, and the background sync keeps downloading platform-wide. This is revisited fresh when the alert fires.
3. **Sign-out removes phone, email and address, and keeps names and the show.** Work not yet sent to the server is never removed.
4. **A short download is a failure, reported quietly.** Volunteers see it only where the offline copy is already reported: the "Couldn't save the offline copy" line with Try again, and the checklist line "This device is ready to work offline". The owner gets a Sentry alert. A screen that needs missing data says "can't check" and never shows a guess.
5. **Past shows are read online.** A device holds the entries of shows saved on it, not of every past show.

Settled for the revisit, so it need not be argued again: the unit is the club, not the secretary, because secretaries change; the club's desk gets name, phone and email, never a street address; a judge or steward gets names only.

## Do nothing, delete it, or link to what exists

- **Do nothing yet** is what the owner chose for scoping. With paging and an alarm in place, the platform-wide downloads keep working; they only grow.
- **Do nothing** was rejected for the nine issues. Seven of them are wrong today whatever the platform's size, and the cut-off at 1,000 rows is silent and arrives in the first season.
- **Delete it:** nothing is deleted now. The scoping work would delete the platform-wide pass and the directory download.
- **Link to what exists:** the nine reuse the people directory, the "Offline ready" line and the existing sync adapters. They add no page, tab or setting.

## Built now

| Issue     | What changes                                                                                                           | Due        |
| --------- | ---------------------------------------------------------------------------------------------------------------------- | ---------- |
| MYK9-2258 | The owner reads the hosted `max_rows`.                                                                                 | 2026-12-01 |
| MYK9-2252 | Classes, trials, shows, waitlist entries and clubs page in their sync adapters, and `getAllClubs` pages.               | 2026-12-01 |
| MYK9-2254 | A download short of the server's count is a failure, and sends one Sentry alert.                                       | 2026-12-01 |
| MYK9-2256 | Offline, Entry Forms and the check-in desk never show the handler as the owner.                                        | 2026-12-01 |
| MYK9-2257 | Add Person says when the duplicate check could not run.                                                                | 2026-12-01 |
| MYK9-2277 | A person added at the desk is private to the account that added them.                                                  | 2026-12-01 |
| MYK9-2255 | Sign-out removes phone, email and address from the saved people directory and from sent walk-in rows, and keeps names. | 2026-12-01 |
| MYK9-2265 | Offline at the desk: real owner names and an exhibitor's phone, read from the saved directory.                         | 2027-01-15 |
| MYK9-2274 | One alert to the owner before the limits.                                                                              | 2027-01-15 |

MYK9-2275 (every existing pager stops on an empty page, not a short one) waits on MYK9-2258. If the hosted limit is 1,000 it is cancelled. If it is lower, it is urgent, because today's pagers are then stopping early.

Three rules for these issues:

- **Paging is keyset on (`updated_at`, `id`), never offset, and stops on an empty page.** Rows cloned in one statement share a timestamp, so a pager keyed on the timestamp alone skips rows.
- **MYK9-2277 comes before MYK9-2255.** Keeping an unsent walk-in whole at sign-out is safe only if another account on the same browser cannot read it.
- **The alert must reach someone.** No Sentry alert rule is documented in the repo. MYK9-2254 confirms how an alert reaches the owner and sees a test alert arrive.

## The alert

MYK9-2274 is one daily check on the server. It alerts the owner the first time any count passes its number.

| Count      | Alert at | Why                                                                      |
| ---------- | -------- | ------------------------------------------------------------------------ |
| People     | 800      | The saved directory cuts off at 1,000, and nothing else warns of it.     |
| Dogs       | 10,000   | A secretary's device holds every dog.                                    |
| Classes    | 5,000    | The background sync downloads every class.                               |
| Live clubs | 10       | Every secretary's laptop holds every club's exhibitors' phone and email. |

## Not built now

Cancelled on 2026-11-19, each with its reason. The issues keep the design and what the review found.

- People scoped to the club: MYK9-2259, MYK9-2260, MYK9-2263, MYK9-2266, MYK9-2267, MYK9-2271. The directory rework: MYK9-2273.
- Dogs scoped to the club: MYK9-2272.
- Shows saved automatically, and the platform-wide pass retired: MYK9-2261, MYK9-2264, MYK9-2278.
- A survey of other whole-table reads: MYK9-2269.

What stays true until the revisit:

- The people directory still cuts off at 1,000 people. The alert at 800 is the warning.
- The saved directory still holds street addresses while a secretary is signed in. Sign-out removes them.
- Every secretary's and club admin's laptop holds every club's exhibitors' phone and email. The server already lets a secretary read them.
- A show is saved to a device when it is opened or when "Save for show day" is pressed. Nothing saves it automatically.
- The show, its trials and classes are not kept per account, so a draft show can be shown to the next account on a shared browser (the same gap as MYK9-2168).

## What the review found, for the revisit

- How rows leave a device is the hard part. Five rounds each found a hole in a hand-written rule for it. The principle that survived: a saved show mirrors the server row by row, plus unsent work, and nothing about access is decided on the device.
- The cases a design must cover are recorded on MYK9-2261 and MYK9-2264: a replaced secretary who keeps her own entry, a show that drops off a user's list inside the window, appointments for one show only, armbands that sync as one table, and a device that upgrades from the platform-wide pass.
- Scoping is a sync change, so it starts with its own short reviewed design before any code.

## Rollout and rollback

- Merge, then deploy. A merge is not a deploy. The frontend moves only when Deploy myK9Show runs.
- None of the nine has a migration. Every change is app code. To roll back, revert the PR on `main` and run Deploy myK9Show.
- A device gets a new build only after its user accepts the update prompt. Before each show, each show device is opened online and updated.
- MYK9-2277 changes how the device's `people` rows are stored. It must not need a storage version that an older build cannot open.
- Lead time (proposal, for the owner to confirm): a change to syncing is live and walked on production at least three days before a show. If it is not, it waits until after the show.

## New wording

Proposed, for the owner to approve before it ships. `plan-recheck` compares the screens against this table.

| Where                                                       | Proposed words                                 | Issue     |
| ----------------------------------------------------------- | ---------------------------------------------- | --------- |
| Entry Forms and the check-in desk, offline, owner not saved | "Owner name not on this device"                | MYK9-2256 |
| Add Person, the check could not run                         | "Can't check for an existing person right now" | MYK9-2257 |
| Add Person, offline                                         | "Checked the people saved on this device"      | MYK9-2265 |

## Testing

Each issue carries its own tests. Before the December mock shows:

- Each newly paged adapter fetches more than 1,000 rows from a server that returns at most 500 per request, and gets them all. It pages across more than one page of rows that share one `updated_at`.
- A short download fails and alerts once. A pending local create, a pending delete, and a row deleted on the server between the count and the fetch raise no alarm. A test alert is seen to reach the owner.
- Two accounts on one browser: a secretary adds a walk-in offline and signs out. A judge signs in and cannot read the walk-in. The secretary signs back in, and the walk-in is sent intact.
- After sign-out, no person saved on the device has a phone, an email or an address, in the directory or in a sent walk-in row. Names stay, an unsent walk-in keeps every field, and it is all still so after a reload.
- The whole app suite shuffled six times (`pnpm vitest run --sequence.shuffle`). Sign-out rewrites state held in browser storage, which is the repo's six-run case.
- A browser walk on the local stack, offline: Entry Forms and the check-in desk with a dog handled by someone other than its owner, and Add Person on a device that never loaded the directory.
- Each show device is opened online and is on the current build. At the mock show, one secretary laptop saves the show, turns Wi-Fi off, and checks owner names on Entry Forms.

Before entries open on 2027-01-22:

- A browser walk on the local stack, offline, as a secretary: owner names on Entry Forms and the check-in desk, phone in person details, and the duplicate check finding a person already saved. A judge's device shows no phone or email.
- The alert: a test for each threshold and for the once-only rule, and a test alert seen to arrive.

After each deploy: `plan-recheck` on this plan.

## Not in scope

- A new page, tab, sheet or setting.
- Scoping what a device holds. See "Not built now".
- Narrowing who may read `people` on the server.
- Legacy myK9Q.

## Open questions

- **MYK9-2262:** whether Add entry lists matching people when no dogs match. Not about scale.
- **The new wording** in the table above.
- **The three-day lead time** for sync changes before a show.
- **The privacy policy.** It should say that secretaries of participating clubs can see exhibitor contact details. The wording is with the attorney review.

## Risks

- **The hosted row limit is below 1,000.** Then today's pagers already stop early, and the dogs clean-up could remove valid rows from a device. MYK9-2258 settles it.
- **An alert is sent and nobody sees it.** MYK9-2254 does not close until a test alert arrives.
- **The alert fires during show season.** The fix is then needed in a hurry. The numbers are set below each limit to leave room, and the cancelled issues hold the design.
- **A show device runs an old build.** The update is a prompt the user must accept. The pre-show check covers it.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: the nine issues change offline replication (paging, the short-download rule, per-account rows) and sign-out.
