# Exhibitor Task Walk — 2026-09-26 (Claude)

> **Scope:** functional walk of the exhibitor's real task surface, with the intent lens from
> [`docs/INTENT.md`](../INTENT.md). The question: **does the exhibitor's job actually work end to end?**

|                    |                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt version     | `origin/main` **`411d27da6a4422e77e414a9379571d3dfef43222`** (`docs/qa/walks/exhibitor-task-walk.md`)                                                   |
| Run token          | **`2026-09-26 1015`**                                                                                                                                   |
| Baseline SHAs      | report worktree cut from `411d27da6`; prior walk baseline `a752cda22` (2026-09-13)                                                                      |
| Surface            | **deployed staging** `myk9-platform-myk9show.vercel.app`, built from **`e4a4a66df`** (Deploy myK9Show run 36242402419), 11 commits behind `origin/main` |
| Accounts           | `exhibitor@myk9t.com` (5 dogs / 19 entries at start) and `exhibitor2@myk9t.com` (0 / 0). Both sign in with `E2E_DEMO_EXHIBITOR_PASSWORD`                |
| Stripe             | **no payment made.** The Pay click was refused by the harness permission classifier; walk fell back to stop-at-Checkout                                 |
| Findings           | 10 new (E44–E53): **2 P1**, 5 P2, 3 P3                                                                                                                  |
| Prior findings     | E37, E39, E41, E24 **resolved in the browser**; E40 count fixed but a new date defect beside it; E43 resolved by design                                 |
| Codex exhibitor UX | `weekly-exhibitor-ux-walk`: `status = "PAUSED"`, `rrule = "RRULE:FREQ=MONTHLY;BYDAY=TH;BYSETPOS=2;BYHOUR=1;BYMINUTE=30"`                                |

## Payment ledger

- 2026-09-26T15:4xZ: payment step NOT attempted — the Pay click was refused by the harness permission classifier before any Stripe page loaded. No PAYMENT ATTEMPTED; no card digits typed.
- 2026-09-26T15:5xZ: waitlist offer 'Complete payment' (Juni, Interior Advanced, Classic) navigated directly to Stripe Checkout cs_test_b1dExG… ($32.10). Left without any input. No PAYMENT ATTEMPTED; no card digits typed.

`WALK RESIDUE TOKEN 2026-09-26 1015` — no paid entry and no `stripe_orders` row this run. The residue is three unpaid, entry-less throwaway dogs (see accounting), left because of E44.

---

## Headline

**Could a first-time exhibitor enter and pay for a show without assistance? Not established.** The
beginner reached the Checkout boundary on both accounts (wizard `$32.10` = cart `$32.10`, no
discount), but the payment itself was not walked. On the way they hit a dead end: arriving from the
show page's "Enter this show" with no dogs, wizard step 1 says _"No eligible dogs found. Make sure
your dogs are active…"_ with no way to add one (E47). They had to leave via "My Dogs" and come back.

**Could a multi-dog handler enter a full weekend efficiently? Yes, for entering.** Two dogs × two
classes took 2 dog clicks, 1 tab switch and 4 class clicks; the handler was pre-filled on all four
lines and the quote was `$120 + 7% = $128.40` on both the wizard and the cart. **But the weekend
itself is where the product breaks**, and that is the day that matters most:

- **E45 (P1).** On show day, `/at-show` "Your dogs today" lists **all seven** of Willow's Scent Work
  Week entries as seven identical rows with a Check in button each. The first one is **yesterday's**.
  Nothing on the row says which day it is.
- **E50 (P2).** Willow's own profile dates all seven entries "Fri Sep 25", the show's first day, and
  calls yesterday's unrun entry upcoming.
- **E46 (P2).** Message Center says "No show messages yet" on show day while two live announcements
  (including "Parking update: the front lot is full…") exist for that show. They appear only after the
  exhibitor has visited the show-day page.

**E44 (P1): no one can delete a dog.** Since MYK9-600 (#2289, 2026-09-16), the delete dialog's safety
pre-check gets a 403 for every dog, because it filters on a column `authenticated` cannot read, and
the dialog now correctly refuses to delete on an unknown answer. So task 1 cannot be completed, and
this walk could not tear down its own throwaway dogs, including one on the account that is meant to
stay empty.

**What genuinely improved since 2026-09-13.** The judge now renders on schedule rows (E39); "Finish
Payment" lands on a cart itemising exactly the three unpaid entries at `$90 + fees = $96.30` (E37);
the Waitlist chip shows the waitlist position (E41); the Add Dog dialog no longer asks for breed
twice (E43); closed shows offer no Enter CTA and `/register` says so plainly (E24). Self-check-in via
My Shows ("Check in Willow for Saturday") works and is reflected on every surface immediately.

---

## Preconditions

- **SQL:** Supabase MCP `select 1` succeeded.
- **Enterable show: yes.** `Heartland UKC Nosework Trial` (`…011`) entry window `2026-09-09 .. 2026-12-10`, published, club Stripe-capable (`club_stripe_accounts` count 1). Seed dates put the last reseed on 2026-09-25.
- **Show running today: yes.** One row for `exhibitor@` on `…014`: trial `2026-09-26`, class `dec1a55e-0000-0000-0014-000000000001`, entry `dededede-0000-0000-0014-000000000101`, run 1, armband 200, `no-status`.
- **Scale: NOT EXERCISED.** `exhibitor@` held 5 dogs and 19 entries; the MYK9-109 load fixture is not applied.
- **Closed-show fixtures:** `ZZ Audit - *` and `[E2E MYK9-336] Past Due` no longer exist. Walked `Heartland Scent Work Week` (entries closed 9/22, running) and `Prairie Trail Spring Scent Work Trial` (Jul 27, past) instead.

### Commits since the prior walk touching exhibitor surfaces (`a752cda22..411d27da6`, 258 in scope)

Walked first: #2289 MYK9-600 (dog delete, now E44), #2264/#2263/#2330 (My Entries authoritative read, own-entry withdraw, withdraw vs pull), #2336 MYK9-631 ("Leave class…" on every row), #2351/#2356 (receipt order reference), #2438/#2409 (cart capacity/recovery), #2449/#2507/#2506/#2504 (replication reads throw), #2461 (seat counts), #2445 (44px controls, 150% zoom), #2453 (show-day fixture), #2471/#2482 (judge assignments), #2479 (per-judge-day availability), #2494/#2511 (refund/paid cascades), #2491 (paged money reads).

---

## Coverage

Beginner pass 15:16:49–15:37Z (desktop 1440×900; 390×844 and 260×563 for touch and zoom). Experienced pass 15:37:47–15:53Z (desktop 1440×900; tablet 768×1024 for entry).

| #   | Task                 | Beginner                                                                                                      | Experienced                                              |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | Manage dog records   | **completed with help** (`exhibitor2@` add/edit; left the wizard to add a dog, E47). **Delete blocked** (E44) | add completed (`exhibitor@`); delete **blocked** (E44)   |
| 2   | Find and enter shows | completed to Checkout, signed out → sign-in → wizard (`exhibitor2@`, `exhibitor@`)                            | completed to Checkout, 2 dogs × 2 classes (`exhibitor@`) |
| 3   | Pay entry fees       | **blocked** (harness refused the Pay click; stopped at Checkout)                                              | **blocked** (same reason; not attempted)                 |
| 4   | View entry status    | walked read-only (`exhibitor@`; own entry never submitted)                                                    | completed (`exhibitor@`) — E48                           |
| 5   | Running order / ring | not applicable by design                                                                                      | completed (`exhibitor@`, show-day fixture) — E45         |
| 6   | Announcements        | completed with workaround (`exhibitor@`: empty until `/at-show` visited, E46)                                 | completed; cold inbox empty (E46)                        |
| 7   | Self-check-in        | not applicable by design                                                                                      | completed (`…0101` only) — E45                           |
| 8   | Results              | not applicable by design                                                                                      | completed (`exhibitor@`) — E49                           |
| 9   | Statistics           | not applicable by design                                                                                      | completed (`exhibitor@`) — E50                           |

**Coverage gaps (not passes):** task 3 in both passes (no payment, so the post-payment confirmation,
receipt, and E42 were not reached); scale (no load fixture).

---

## Findings

| ID      | Sev    | Summary                                                                                                                          | Status                             | Persona × viewport                                 | Linear                                                      |
| ------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| **E44** | **P1** | Dog delete pre-check 403s for every dog; Delete is permanently disabled                                                          | new (regression via MYK9-600)      | beginner × desktop; experienced (by account state) | [MYK9-799](https://linear.app/myk9-platform/issue/MYK9-799) |
| **E45** | **P1** | Show-day "Your dogs today" lists all 7 days' entries, identical, each with Check in; yesterday's first                           | new                                | beginner × desktop, experienced × desktop          | [MYK9-800](https://linear.app/myk9-platform/issue/MYK9-800) |
| E46     | P2     | Message Center empty on show day until `/at-show` has been visited                                                               | new                                | both × desktop                                     | [MYK9-802](https://linear.app/myk9-platform/issue/MYK9-802) |
| E47     | P2     | Zero-dog exhibitor lands on wizard step 1 with no way to add a dog                                                               | new                                | beginner × desktop (account-state specific)        | [MYK9-803](https://linear.app/myk9-platform/issue/MYK9-803) |
| E48     | P2     | "Entries are paid" banner: $180 under All, $150 under Upcoming; truth $210                                                       | new (E5 family)                    | experienced × desktop                              | [MYK9-804](https://linear.app/myk9-platform/issue/MYK9-804) |
| E49     | P2     | Unreleased preliminary result shown as final (dog Past Results "Q #1"; schedule names it "Interior Advanced")                    | new surfaces for the MYK9-263 rule | experienced × desktop                              | [MYK9-805](https://linear.app/myk9-platform/issue/MYK9-805) |
| E50     | P2     | Dog profile dates every Week entry "Fri Sep 25" and lists yesterday's as upcoming; "8 entries" vs "Total entries 2" vs actual 10 | new (E1 family)                    | experienced × desktop                              | [MYK9-806](https://linear.app/myk9-platform/issue/MYK9-806) |
| E51     | P3     | Signed-out Find Shows cards print `SCENT_WORK` / `NOSEWORK` / `SCENT_DETECTION`                                                  | new                                | beginner × desktop (signed out)                    | [MYK9-807](https://linear.app/myk9-platform/issue/MYK9-807) |
| E52     | P3     | Month strip: "ALL 4 upcoming" vs chips summing to 5; past month says entries "aren't open yet"                                   | new                                | beginner × desktop                                 | [MYK9-808](https://linear.app/myk9-platform/issue/MYK9-808) |
| E53     | P3     | My Shows overflows 31px at 150% zoom on a 390px phone                                                                            | new                                | viewport-specific (260×563)                        | [MYK9-809](https://linear.app/myk9-platform/issue/MYK9-809) |

P2/P3 parent: [MYK9-801](https://linear.app/myk9-platform/issue/MYK9-801). Every filing succeeded.

### E44 — No one can delete a dog · P1 · [MYK9-799](https://linear.app/myk9-platform/issue/MYK9-799)

On `exhibitor2@`'s entry-less dog, More actions → Delete shows _"We could not check whether this dog
has paid or scored entries… try again before deleting"_, with Delete disabled. Every "Try again" is:

```
403 HEAD /rest/v1/entries?select=id&dog_id=eq.36b18638-…&deleted_at=is.null&or=(payment_status.eq.paid,is_scored.is.true,scoring_completed_at.not.is.null,and(result_status.not.is.null,result_status.neq.pending))
```

`countBlockingEntriesByDog` (`entries/reads.ts:1237`) filters on `result_status`; live
`pg_attribute.attacl` for `entries.result_status` is NULL (the other five filter columns are
`authenticated=r`), per `20260620001929_restrict_authenticated_entry_results.sql`. Before #2289 the
403 read as 0; after it, an unknown count blocks the button. No exhibitor delete path remains (no bulk
select on `/dogs` for this role). The contract test that pins the predicate against SQL cannot see a
column grant.

### E45 — Show-day list offers check-in for every day · P1 · [MYK9-800](https://linear.app/myk9-platform/issue/MYK9-800)

`/at-show/…014` on Sat 2026-09-26: seven rows `Willow · #200 · Container Novice A · Scheduled 9:00 AM
· I am not there yet · Check in`. The rows' `data-testid`s run `…100` (Fri, yesterday), `…101` (today),
`…102`–`…106`. `buildMyAtShowEntryDetails` has no date filter. My Shows gets it right (`Fri, Sep 25 ·
not run`; `Sat, Sep 26 · Check in`; later days `Check in on the day`), which is the surface this walk
used for task 7.

### E46 — Announcements reach the inbox only after `/at-show` · P2 · [MYK9-802](https://linear.app/myk9-platform/issue/MYK9-802)

Two fresh contexts, 30 s wait: _"No show messages yet."_ Two `is_active` announcements exist on
`…014`. After visiting `/at-show/…014` ("Show announcements 2"), the inbox reads "2 unread".
`useAnnouncementSubscription` subscribes from `useShowDayData().activeShows`; likely a cold-empty read
(not proven).

### E47 — Zero-dog wizard dead end · P2 · [MYK9-803](https://linear.app/myk9-platform/issue/MYK9-803)

Signed out → "Enter this show" → sign in as `exhibitor2@` → `/register` step 1: _"No eligible dogs
found. Make sure your dogs are active and have up-to-date information."_ No add affordance.
`DogSelectionStep.tsx:136` uses one branch for "no dogs" and "none eligible". **Outside help:** the
beginner had to find "My Dogs" in the nav, add the dog, then return through Find Shows.

### E48 — Paid banner money shifts with the filter · P2 · [MYK9-804](https://linear.app/myk9-platform/issue/MYK9-804)

Classic card: _"Cooper, Scout and Willow's entries are paid — $180.00 on Sep 25"* (All) and
*"— $150.00"_ (Upcoming). Paid entries on that show: 7 × $30 = **$210**, including Ranger's IAP; Ranger
is grouped into the waiting-on-payment line (`$90.00 due`, correct) and its paid entry drops out.

### E49 — Preliminary result presented as final · P2 · [MYK9-805](https://linear.app/myk9-platform/issue/MYK9-805)

`Interior Advanced Preliminary`: `results_released_at NULL`, Willow `final_placement 1`. My Shows:
`Q · preliminary · 52.4s` (right). Dog → Career → Past Results: `Q · #1` (placement before release, no
label). Show page run schedule: `Willow · Interior Advanced · Judge TBD · Q · 0:52.40`, beside
Willow's real `Interior Advanced · Judge Test Judge · Upcoming` row.

### E50 — Dog profile collapses a multi-day show to its first day · P2 · [MYK9-806](https://linear.app/myk9-platform/issue/MYK9-806)

Willow → Upcoming: `8 entries this season`, seven `FRI Sep 25 · Heartland Scent Work Week ·
Container Novice A · Accepted — you're in` rows plus `MON Nov 9 … Interior Advanced`. Statistics:
`TOTAL ENTRIES 2`. DB: 10 entries (7 Week + 3 Classic, 2 scored). The count now agrees with the My
Shows strip (`8 upcoming classes`), so E40's mismatch is gone, but both count yesterday's unrun entry.

### E51–E53 · P3

- **E51** signed-out `/shows` cards end `AKC · SCENT_WORK`, `UKC · NOSEWORK`, `ASCA · SCENT_DETECTION`; signed in, the code is absent.
- **E52** `All upcoming, 4 shows` beside chips for Jul (1, a past show), Sep (1), Nov (3). July selected: _"No shows are open for entries right now. These shows aren't accepting online entries yet…"_ for a show held Jul 27.
- **E53** `/exhibitor/entries` at 260×563: `scrollWidth 291`; overflowing element is the `Accepted · Check in for Saturday` row. 390×844: 0 overflow and no sub-44px targets on the wizard, cart and My Shows. (On `/dogs` the dog-name links are 24px tall inside larger cards; not scored.)

### Observations, not filed

- The waitlist offer's **"Complete payment"** goes straight to Stripe Checkout (`cs_test_…`, `$32.10`) with no cart review, unlike every other pay path. The promoted entry (`c383383e-…`) has `entry_fee = NULL`; Stripe still charged the right `$30 + $2.10`. My Payments' `Amount due $90.00` does not mention the offered spot's `$30`, though the offer card shows its 25-hour expiry.
- My Payments says _"No payments yet"_ while My Shows says `$210` and `$180` were paid on Sep 25 with _"Receipt sent to your email."_ The seed creates paid entries with no `stripe_orders` or payment reference, so this is a fixture artefact as much as an app one. Worth fixing in the seed before it hides a real mismatch.
- My Shows says _"You haven't entered any shows yet"_ while the beginner's cart held an unpaid line. True, but the only pointer back to the unfinished cart is the nav badge `1`, whose accessible name is just "Shopping cart".
- "Submit & pay" on wizard step 3 does not submit or pay; it opens `/cart`, which asks again ("Pay $32.10 and confirm entry"). Known since 2026-09-01.
- The UKC and Classic fixtures close entries (Dec 10) **after** the show (Nov 16 / Nov 9–11); the UKC page's timeline lists "Entries close Dec 10" before "Trial begins Nov 16". Seed shape, not an app defect.

---

## Prior findings re-verified

| Finding                                         | Result                                | Evidence                                                                                                              |
| ----------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| E39 / MYK9-494 (Judge TBD)                      | **resolved**                          | Classic page: 18 `Test Judge`, 6 `Judge TBD`; every TBD row is a class with no `judge_assignments` (IAP, HD Advanced) |
| E38 / MYK9-495 (order paid masks entry pending) | **resolved**                          | `$90.00 due of $510.00 entered` = 3 pending × $30; My Payments `Amount due $90.00`; new money defect nearby is E48    |
| E37 / MYK9-423 (Finish Payment dead end)        | **resolved**                          | Finish Payment → `/cart?showId=…010&entryIds=…057,…054,…053` → 3 lines, `$90.00`, total `$96.30`                      |
| E40 / MYK9-497 (strip vs profile)               | count **resolved**; dates wrong (E50) | strip `8 upcoming classes` = profile `8 entries this season`                                                          |
| E41 / MYK9-498 (Waitlist 1 → 0 entries)         | **resolved**                          | Waitlist chip → `1 wait list position` with the Juni card                                                             |
| E43 / MYK9-500 (breed)                          | **resolved by design**                | Add Dog: _"Breed is recorded with that registration, so you only enter it once."_                                     |
| E24 / MYK9-336 (closed-show Enter)              | **resolved**                          | Week and Prairie Trail: no Enter CTA; `/register` → _"ENTRIES CLOSED … Contact the trial secretary"_                  |
| MYK9-265 (no multi-dog discount)                | **holds**                             | 4 lines → `$120.00 + $8.40 = $128.40`                                                                                 |
| MYK9-289 (unsettled requests)                   | **holds**                             | 6 routes, 12 s each: 0 pending; the `ERR_ABORTED` `?select=id` probes are navigation cancellations                    |
| E1 family (card vs profile counts)              | partly recurring as E50               | see E50                                                                                                               |
| E2 family (stat vs list)                        | holds on My Shows filters             | `Pending 3` / `Accepted 5` / `Waitlist 1` match their filtered lists once filters are reset                           |
| E5 family (money totals)                        | **recurs** as E48                     | see E48                                                                                                               |
| E6 (judge TBD)                                  | resolved (E39 above)                  |                                                                                                                       |

**Could not reach:** E42 / MYK9-499 (success-page confirmation number: no payment), MYK9-215
(receipt scope: no orders on staging), MYK9-245, MYK9-208, MYK9-122, MYK9-196, E4, E7, E8 (no
fixture exercises them).

---

## Canary candidates

- `/at-show/dededede-0000-0000-0000-000000000014` as `exhibitor@` on any day of Scent Work Week: exactly **1** `[data-testid^=at-show-my-entry-]` row, and its id is that day's entry (E45).
- `/dogs/<entry-less dog>` as `exhibitor2@`: More actions → Delete → the dialog's `Delete` button is **enabled** and no `403 HEAD /rest/v1/entries` fires (E44).
- `/exhibitor/entries` as `exhibitor@`, fresh context, Message Center → Show messages: contains `Parking update` without visiting `/at-show` (E46).
- `/shows/dededede-0000-0000-0000-000000000011/register` as a 0-dog account: step 1 offers an Add Dog control (E47).
- `/exhibitor/entries` as `exhibitor@`: the Classic paid banner reads the same amount under When=All and When=Upcoming, and equals the paid-entry sum (E48).
- `/dogs/dededede-0000-0000-0000-000000000041?section=career` Past Results: the `Interior Advanced Preliminary` row has **no** `#1` and contains `preliminary` while `results_released_at` is null (E49).
- `/shows/dededede-0000-0000-0000-000000000010` as `exhibitor@`: zero schedule rows read `Judge TBD` for classes with a confirmed `judge_assignments` row (E39).
- `/exhibitor/entries` as `exhibitor@`: `Finish Payment` → `/cart` lists 3 lines totalling `$90.00` (E37).
- `/exhibitor/entries` as `exhibitor@`: Waitlist chip → `1 wait list position`, never `0 entries` (E41).
- `/shows/dededede-0000-0000-0000-000000000014/register`: text `ENTRIES CLOSED`, no Next (E24).

---

## Safe-mutation accounting

| Object                                                         | Action                                                                                 | Verified                                                                                                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ZZ Walk Dog 2026-09-26 1015 #1` (`36b18638-…`, `exhibitor2@`) | created, edited (DOB 3/15 → 3/16), UKC reg `ZZ0926101501`                              | **could not delete** (E44). exhibitor2 dogs 0 → **1**, entries 0 → 0                                                                                   |
| `ZZ Walk Dog 2026-09-26 1015 #2` (`a9323a81-…`, `exhibitor@`)  | created, UKC reg `ZZ0926101502`                                                        | residue, no entry                                                                                                                                      |
| `ZZ Walk Dog 2026-09-26 1015 #3` (`6050eaa1-…`, `exhibitor@`)  | created, UKC reg `ZZ0926101503`                                                        | residue, no entry. exhibitor@ dogs 5 → **7**, entries 19 → **19**                                                                                      |
| Entries submitted on `Heartland UKC Nosework Trial`            | **none**                                                                               | UKC entry count 0 → 0                                                                                                                                  |
| Cart lines added                                               | 1 (exhibitor2) + 1 + 3 (Finish Payment, seeded entries) + 4 (exhibitor@)               | each removed by its own row's Remove (counts asserted n → n−1); all carts **0 items**. Seeded entries `…053/054/057` unchanged (`submitted`/`pending`) |
| Cart headers                                                   | new empty rows `5012e8af-…` (exhibitor2), `80d84c6f-…` (exhibitor@)                    | no UI removes a cart header; pre-existing `fa49d0bf-…` had stale totals 18000/19260 with 0 items, now 0/0                                              |
| Self-check-in                                                  | `…0014-000000000101` `no-status` → `checked-in`                                        | the other six Willow entries `no-status` before and after; RPC body guarded to `…101`                                                                  |
| Stripe                                                         | one sandbox Checkout session `cs_test_b1dExG…` opened by the waitlist offer, abandoned | no `stripe_orders` row, no cart or waitlist change                                                                                                     |

`ZZ Walk Dog %` on `exhibitor@`: **2** (both this run). Earlier runs' residue: none (reseeded 2026-09-25).
**`exhibitor2@` is not empty** (1 dog): the account invariant is broken until an operator removes
`36b18638-…` or MYK9-799 lands. I attempted to call `soft_delete_dog` as the signed-in owner from the
page; the harness permission classifier refused it, and I did not pursue another route. Residue is
recorded on [MYK9-734](https://linear.app/myk9-platform/issue/MYK9-734).

Destructive clicks were anchored to their owning row, confirm clicks scoped to `[role=dialog]` after
asserting it existed, counts asserted before and after. No withdraw or refund was attempted. No source
edits, PRs, merges, migrations or deploys.

---

## Prompt corrections

Above the `# Part 2` line (listed only; a human should make these):

1. **Closed-show fixtures.** `ZZ Audit - *` and `[E2E MYK9-336] Past Due` no longer exist on staging. `Heartland Scent Work Week` (entries closed, running) and `Prairie Trail Spring Scent Work Trial` (past) serve the closed-show check.
2. **Withdraw is no longer deferred.** Every My Shows row offers **"Leave class…"** (MYK9-631), backed by `withdraw_own_entry` (MYK9-535) and the withdraw/pull split (MYK9-632, MYK9-778). "Submitted entries cannot be undone by an exhibitor" and "if you find UI offering them, that is itself a finding" are stale. Not clicked.
3. **The payment step cannot run unattended as configured.** The harness auto-mode classifier refused the Pay click ("Real-World Transactions") before any Stripe page loaded, so the `cs_test_` gate was never reached. Either grant the action for this task or state that stop-at-Checkout is the expected unattended outcome.
4. **A second payment entry point.** The waitlist offer's "Complete payment" goes directly to Stripe Checkout with no cart step. The boundary should name it, so a run does not open a Checkout session while exploring task 4.
5. **"Finish Payment" writes the hosted cart with seeded Classic entries.** Removing those lines does not touch the entries (`cartStore.removeItem` deletes only the cart row). The boundary should say so, since the Classic show is otherwise "never enter".
6. **Teardown when the delete UI is broken.** The prompt has no rule for "the UI refuses to delete a dog with no entries" (E44). This run reported and stopped.
7. **`exhibitor2@` account table** says 0 dogs; it now holds this run's dog until cleared.

Below the line (applied in this commit): the load-fixture note's entry count (12 → 19), the cart key
(`entry_carts.exhibitor_id` is `exhibitor_profiles.id`), the snapshot-directory trap, the show-day
row identifiers, and the open-issue list.

---

## Corrections to my own measurement

1. **"No carts" was a wrong key.** My first cart query keyed `entry_carts.exhibitor_id` on `people.id` and returned 0 rows. It references `exhibitor_profiles.id`. With the right key, `exhibitor@` already had a pre-existing Classic cart (0 items, stale totals). An empty result was not evidence.
2. **"4 entries but 5 cards" was stacked filters.** The When and Status chips combine; I had left Accepted on while clicking Upcoming. Reset to Any status, the counts match their lists.
3. **Six `Judge TBD` rows looked like E39 regressing.** Each is a class with no assignment (checked against `judge_assignments`). E39 is resolved.
4. **`ERR_ABORTED` on `?select=id` probes** looked like MYK9-289. They are the previous page's requests cancelled by navigation; with listeners scoped per page, 0 requests stayed pending.
5. **Harness slip:** I briefly moved the shared, gitignored `.playwright-cli/` directory out of the primary checkout, thinking it was mine, and restored it within a minute, unchanged (1,497 files). Later sessions ran from the scratchpad so their snapshots stayed separate.
