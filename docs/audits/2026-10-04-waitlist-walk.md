# Waitlist walk, 2026-10-04 (MYK9-971 phase 1)

> **Status:** Complete (phase 1: walk and findings). Phase 2 (fixes and the e2e journey) is the findings below.

**Bottom line.** The waitlist cannot be walked end to end because it cannot be switched on. No screen sets a class's `allow_waitlist` or entry limit, so a full class always turns the exhibitor away. Steps 1, 3 to 6 and the live half of 8 therefore ran as code walks only. What did run in a browser: the secretary Waitlist tab, the judge-day capacity cards (including an over-limit one), the wizard's behaviour when a judge's day fills, and the hidden settings page that controls capacity and the offer window.

## Method and limits

- Code walk of all 8 steps on `origin/main` at `719029686`, file:line evidence below.
- Live walk on a local dev server (`pnpm dev`, port 5173, confirmed with `lsof` to be served from `.claude/worktrees/myk9-971`). The repo has one Supabase project, so localhost writes hit the real database: writes were limited to the Heartland demo show `dededede-0000-0000-0000-000000000010` (club `dededede-0000-0000-0000-000000000001`). Signed in as the canonical secretary and demo exhibitor accounts from `.env.local`; no roles or memberships were changed.
- Playwright CLI sessions `myk9-971-0410a` (secretary) and `myk9-971-0410b` (exhibitor), both closed at the end.
- **Read-only SQL was not available.** The permission layer refused the `psql` session-pooler command and a browser-side PostgREST probe, so database states were confirmed through the app's own screens only. Nothing below claims a database row state that was not seen on a screen.
- Stripe was not reached: no dog could be waitlisted, so no offer, payment link or settlement existed to follow.

## Walk record

### Step 1. Exhibitor joins the waitlist (wizard and /cart split)

|              |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code, wizard | `submit_show_entries` -> `evaluate_entry_capacity` queues a dog only when `COALESCE(allow_waitlist, false)` (`supabase/migrations/20260712200000_entry_capacity_enforcement.sql:266`). Otherwise outcome `full`.                                                                                                                                                                                                                                                                |
| Code, /cart  | `splitCartItemsByJudgeDayCapacity` sends a full line to the waitlist only if `item.class?.allow_waitlist === true`, else it is blocked (`apps/myk9show/src/features/payments/cartCapacitySplit.ts:91-100`); `checkoutWithWaitlist` calls `add_to_waitlist` (`store/cartStore.ts:989-1050`).                                                                                                                                                                                     |
| Code, writes | `allow_waitlist` defaults `false` (`002_shows_and_events.sql:135`). Nothing in `apps/myk9show/src` writes `allow_waitlist` or `max_entries` from a form (the only hits are reads, mappers and replication serialisation). The seed sets `allow_waitlist = false` on its one full class (`supabase/seed-demo.sql:1196`).                                                                                                                                                         |
| Live         | Heartland judge-day capacity set to 2 (Tue had 1 entry). Casey (demo exhibitor) entered two dogs in the same Tuesday class by check: Juni was entered, Ranger got "could not be entered because the class is full" on the receipt (`assets/2026-10-04-waitlist-walk/04-wizard-receipt.png`). No wait-list option anywhere. Class step showed no warning that the second pick would not fit.                                                                                     |
| My Shows     | "My Wait List Positions" exists (`pages/MyEntriesPage/modules/WaitListSection.tsx`) and shows position, "Spot offered", a relative "Expires in 47h 12m", Complete payment and Decline. Could not be seen with data. Position is the stored `MAX(position)+1` among waiting rows and is never renumbered (`20260629015413_harden_waitlist_idempotency_capacity_helper.sql:110-113`), so "#N" overstates the place in line once earlier dogs leave (already tracked as MYK9-995). |

Not walked live: the /cart split (needs a class with the waitlist on).

### Step 2. Secretary view, Entries -> Exceptions -> Waitlist

- Live, `/shows/<id>/entries?tab=exceptions&exception=waitlist`: judge-day cards for Pat Donovan, Mon Nov 9 and Tue Nov 10 (`01-secretary-waitlist-tab-before.png`).
- Counts: queue and class counts read the replica (`services/database/waitlists/reads.ts:72-164`); the judge-day cards read live from `judge_day_summary` plus a browser-side capacity calculation (`hooks/queries/useJudgeDayCapacity.ts:44-107`), so they are a second implementation of the server rule (F11).
- Queue order: sorted by `position` (`reads.ts:90-92`); table shows only `waiting` rows (`:76`).
- Report agreement: the Waitlist Report is built on the same `getWaitlistByClass` read (`reportRows.ts:1-15, 104`), and the same status filter helpers feed the Financial Report (MYK9-717/718 fixes hold in code). Not compared on data: there is no waitlisted row to compare.
- **View Wait List** opens only the first class of the judge-day (F7). Screenshot `06-view-wait-list-class-stats-vs-judge-day.png`: a judge-day that reads Full above, class stats below reading "Entry limit infinity, Available infinity".
- The tab repeats show selection ("Show: Waitlist" view menu, then a "Select Show and Class" card with its own show dropdown).

### Step 3. A spot opens (pull, scratch, decline)

- Nothing tells the secretary. No push, alert or activity entry is created when a seat frees.
- It is automatic as well as manual: `cron-waitlist-expiration` runs every 15 minutes (`20260622000222_link_waitlist_promotions.sql`, schedule `*/15 * * * *`) and `processClassesWithOpenSpots` offers the next `waiting` online dog in any class that has a free seat and no open offer (`apps/myk9show/supabase/functions/cron-waitlist-expiration/index.ts:261-345`, RPC `promote_waitlist_entry_from_cron`). One automatic offer per class at a time; a class that expired an offer this run is skipped until the next run (`:147, 199, 286`). Mail-in rows are skipped (`:326-331`), but mail-in rows can never be created (F1).
- Exhibitor-side decline frees the spot via `decline-waitlist-offer` (`apps/myk9show/supabase/functions/decline-waitlist-offer/index.ts:60-164`), status `declined`, then the same cron picks the next dog.

### Step 4. Making the offer

- Control: **Offer Spot** on a row of the Waitlist table, shown only while the class has a free seat (`pages/secretary/WaitlistManagementPage/WaitlistTable.tsx:29-31, 77-82`). Confirm dialog: "This will move them from the waitlist to accepted entries. The exhibitor will be notified." (`WaitlistActionDialog.tsx:64-65`). That wording is wrong: the RPC inserts a `pending-payment` entry, marks the waitlist row `offered`, and sets the deadline (`promote_waitlist_entry_internal`, `20260622000222...sql:281-291`).
- Server checks: class limit and every judge-day's available spots, under advisory locks (`:219-265`); "Class is full" / "Judge-day capacity is full" are raised otherwise.
- Window: `shows.waitlist_payment_deadline_hours`, default 48, minimum 1 (`:267-275`). The UI never passes `p_deadline_hours`. Set on the Wait List Settings card, which is only on `/secretary/settings` and has no link (F2); opened by URL it shows "Select a show to configure its settings." until a show is selected elsewhere.
- Notification: after the RPC the browser creates a Stripe payment link via `stripe-payment-link` (`useWaitlistManagementData.ts:223-270`) and sends an in-app message with the URL (`waitlistOfferMessage.ts:16-33`); failures only show a warning toast. Separately the `trg_waitlist_offer_notification` trigger enqueues an `offered` event and calls `push-trigger-waitlist` for email and push (`20260713010000_waitlist_notification_events.sql:282-341`). Neither mentions the deadline (F6). If the tab closes between the RPC and the link, the offer exists without a link; the exhibitor can still start payment from My Shows.
- After the offer the row leaves the Waitlist tab (F5).

### Step 5. Exhibitor accepts and pays

Code only. My Shows "Complete payment" starts a payment link for the promoted entry (`hooks/queries/useMyWaitlistEntries.ts`); `trg_entry_payment_links_require_active_waitlist_offer` refuses links for lapsed offers (`20260713110000_waitlist_offer_payment_guard.sql`); the webhook marks the entry paid and sets the waitlist row `accepted` (`stripe-webhook/index.ts:2365-2390`), and refuses to revive an expired claim that collided with a replacement offer, leaving it for a manual refund (`:2296-2363`). Refunds stay manual (#2689). MYK9-968 (settlement committed, response lost, offer stays `offered`) is untouched by this walk.

### Step 6. Offer expires or is declined

Code only. `expireWaitlistOffer` closes open Stripe sessions, checks for a completed payment first and returns `paid` so the cron skips it (`_shared/waitlistExpiration.ts:65-102, 144-233`; cron `index.ts:171-175`), marks the entry `promotion-expired` (frees the seat) and the waitlist row `expired` or `declined`, then queues an `expired` notice. The next dog is offered by the following cron run, not the same one (F3). Cron failures alert the operator and fail the Sentry check-in (`cronOutcome.ts:55-102`). Live expiry was not attempted: the production cron cannot be triggered from here and no offer existed.

### Step 7. Capacity: enforced versus displayed

- **Enforced by the server** for online entries since 2026-07-12 (`evaluate_entry_capacity`, `get_judge_day_capacity_live`, locks in `20260712200000_entry_capacity_enforcement.sql`). The guide's "displayed, not enforced" wording is already gone from `main`; the guide now says so correctly (below).
- **Displayed** by `JudgeCapacityOverview`: `confirmed / capacity`, "N spots available", a bar clamped to 100 percent, a "Full" badge (`components/waitlist/JudgeCapacityOverview.tsx:30-77`).
- Reproduced the over-limit read on Heartland: capacity 3 with 3 Monday entries -> "3 / 3, Full"; capacity lowered to 2 -> "**3 / 2 entries, 0 spots available**" and Tue "2 / 2 Full" (`05-secretary-judge-day-over-limit.png`). Nothing explains the over-limit (F8). A "130 / 125" arises the same way, or from a late/offline entry carrying a deliberate `capacityOverride` (`features/registration/submitOfflineLateEntry.ts:237-251`).

### Step 8. Offline and replication

- `waitlist_entries` is a replicated table (`providers/ReplicationSyncProvider.tsx:106`), incremental by `updated_at`, with a row-count coverage check (`ReplicatedWaitlistEntriesTable.ts:95-160`). The queue, class counts and the Waitlist Report read it, so they open with no signal.
- The judge-day cards do not (live PostgREST), and Offer and Remove are plain RPC/DELETE calls with no queue and no offline message (F11).
- Hard deletes are not replicated: Remove and Withdraw delete the row, the adapter has no `cleanupStaleRowsOnFullSync` (the entries, trials, shows and judge-assignment adapters do), and nothing deletes the local row. Suspected ghost rows (F4); needs a red test, not reproduced.
- Not run: a browser offline test.

## Findings

| #   | Severity       | Finding                                                                                                                                                                         | Proposed fix                                                                                             | Size         | Issue                                                |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------- |
| F1  | P1             | No UI sets `allow_waitlist` or a class entry limit; the waitlist cannot be turned on, and mail-in waitlist rows cannot be created. Blocks every live waitlist step and the e2e. | Per-class (or show default) "Allow wait list" and entry limit in Setup -> Classes; seed a waitlist class | Large        | MYK9-998                                             |
| F2  | P1             | Judge-day capacity, offer window and mail-in hold live on `/secretary/settings`, which nothing links to and which needs a store-selected show                                   | Move or link into show Setup / Waitlist tab, keyed on the URL's show                                     | Small-medium | MYK9-999                                             |
| F4  | P1 (suspected) | Remove and Withdraw hard-delete; waitlist replica never prunes, so removed dogs may linger in the queue, counts and report                                                      | Soft-delete status or stale cleanup plus local delete; red test first                                    | Small-medium | MYK9-1000                                            |
| F3  | P2             | Cron auto-offers a freed spot within 15 minutes without telling the secretary; no manual/auto switch; guide said offer it yourself                                              | Decide mode; notify the secretary when an offer goes out                                                 | Medium       | MYK9-1003                                            |
| F5  | P2             | Offered dogs vanish from the Waitlist tab; the secretary cannot track or withdraw an offer; `WaitListQueue.tsx` (the only "Pending Payment" view) is dead code                  | Offered group with expiry, Withdraw offer; delete or reuse the dead component                            | Medium       | MYK9-1001                                            |
| F6  | P2             | Offer deadline is never stated: not in the dialog, the in-app message, or as a clock time on My Shows; dialog copy says "accepted entries"                                      | Say "N hours, until <time zone time>" everywhere; fix copy                                               | Small        | MYK9-1002                                            |
| F7  | P2             | View Wait List opens only the first class of the judge-day; stats under a Full day read "infinity"; tab re-asks show and class                                                  | Judge-day queue across its classes; drop the second show selector                                        | Medium       | MYK9-1004                                            |
| F11 | P2             | Judge-day cards are a browser re-implementation, online only; Offer/Remove give no offline hint                                                                                 | Server capacity read; disable with "Online only"                                                         | Medium       | MYK9-1005                                            |
| F8  | P3             | "3 / 2 entries, 0 spots available" with no over-limit explanation                                                                                                               | Say "N over the limit" (and why when an override exists)                                                 | Small        | MYK9-1006                                            |
| F10 | P3             | Exhibitor "#N" is a stored counter that is never renumbered                                                                                                                     | Server place-in-line count                                                                               | Medium       | MYK9-995 (existing)                                  |
| F12 | P3             | The wizard receipt says "because the class is full" for a day that filled; class step gives no warning that a second dog will not fit                                           | Reuse the judge-day full reason (MYK9-515) on the receipt                                                | Small        | not filed: could not tell class from day without SQL |
| F13 | P3             | Dev console: `<div>` inside `<p>` nesting error on the Wait List Settings card                                                                                                  | Swap the skeleton wrapper                                                                                | Trivial      | not filed: noise; folds into MYK9-999                |

Also open and unchanged: MYK9-968 (payment-link refund leaves an offer `offered`).

Acceptance status: the written walk record is this file. The e2e journey and the secretary/exhibitor "finish" items are blocked on F1, F5 and F6. The guide has been corrected (below).

## Guide changes (docs only)

`docs/user-guides/secretary-guide.md`, card 7 (the issue calls it card 6; it is now 7): states that capacity is server-enforced, how the cards read when over the limit, that View Wait List opens the first class, the 48-hour default window, the 15-minute automatic offers, and what is not working yet. Known gaps updated. "Last verified" now reads 2026-10-04 for card 7 only, with the honest scope. `pnpm askq:prepare-docs` regenerated `supabase/functions/_shared/askq/documentAssets.ts`.

## Data created and changed on the Heartland demo show

All on `Heartland Scent Work Classic` (`dededede-0000-0000-0000-000000000010`):

- **Wait List Settings**: judge daily capacity 200 -> 3 -> 2 -> **200**, payment deadline 48 -> 1 -> **48**. Both restored through the same settings card; the Waitlist tab confirmed 200 afterwards. The deadline value was saved with the capacity in one Save and was not read back on screen.
- **One entry created and then pulled**: Juniper ("Juni"), Buried Master, Tue Nov 10 Trial 2, payment by check, confirmation `MK9-000244`, via the exhibitor's **Pull** (not a refund). It left the exhibitor's list, but the pulled row, and any item it adds to the secretary's Pulls tab, remain as a record. The "Ranger" selection was refused by the server, so nothing was created for it.
- A saved registration draft ("Load Draft (1)") exists for Casey on this show.
- No waitlist rows, offers, payments or Stripe objects were created. No other club's data was touched.
