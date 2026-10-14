# Exhibitor Task Walk — 2026-10-14 (Claude)

> **Scope:** functional walk of the exhibitor's real task surface, with the intent lens from
> [`docs/INTENT.md`](../INTENT.md). The question: **does the exhibitor's job actually work end to end?**

|                    |                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Prompt version     | `origin/main` **`3ce11fc03f8858f00bf31bb0cea854c755f5a27d`** (`docs/qa/walks/exhibitor-task-walk.md`)                                |
| Run token          | **`2026-10-14 1435`**                                                                                                                |
| Baseline SHAs      | prompt read at `3ce11fc03`; report worktree cut from `23cfba847` (walk file unchanged between them); prior walk baseline `411d27da6` |
| Surface            | **deployed staging** `myk9-platform-myk9show.vercel.app`, built from **`0952bffb2`** (Deploy myK9Show run 38596233091, 2026-10-14)   |
| Accounts           | `exhibitor@myk9t.com` (6 dogs / 33 handler entries at start) and `exhibitor2@myk9t.com` (0 / 0). Both signed in                      |
| Stripe             | **no payment made.** Stop-at-Checkout on four sessions, all `cs_test_`; every quote equalled the Checkout amount                     |
| Findings           | 10 new (E54–E63): **0 P0/P1**, 3 P2 (E54–E56), 7 P3. E57 and E58 folded into existing issues                                         |
| Prior findings     | E44, E45, E46, E47, E48, E49 (Past Results), E50, E53, E24, E37, E39 **hold in the browser**                                         |
| Codex exhibitor UX | `weekly-exhibitor-ux-walk`: `status = "PAUSED"`, `rrule = "RRULE:FREQ=MONTHLY;BYDAY=TH;BYSETPOS=2;BYHOUR=1;BYMINUTE=30"`             |

## Payment ledger

No card details typed and no Pay pressed on Stripe in any session. Each session was opened by the app's own checkout control, read, and left:

- 19:5xZ `exhibitor2@`, cart button `Pay $32.10 and confirm entry` → `cs_test_b1IFIN…`, Stripe total **$32.10** ($30.00 + $2.10). Left.
- 20:0xZ `exhibitor@` (beginner, dog #2) → `cs_test_b1Duw0…`, **$32.10**. Left.
- 20:0xZ `exhibitor@` (experienced, 2 dogs × 2 classes) → `cs_test_b1eSyH…`, **$128.40** ($120.00 + $8.40). Left.
- 20:2xZ `exhibitor@` "Pay $90.00" (Finish Payment) → cart → `cs_test_b1zP9h…`, **$96.30** ($90.00 + $6.30). Left.

`stripe_orders` rows created in the last 3 hours: 0. The waitlist offer path was not reachable (Waitlist 0).

---

## Headline

**Could a first-time exhibitor enter a show and reach Checkout without help? Yes, once they have the link.**
The beginner, signed out, arrived at the Heartland UKC show page, pressed "Enter this show", signed in,
and the wizard now offers **"Add a dog"** on an empty account (E47 fixed). Dog, UKC registration,
class, payment step and cart all agreed on **$32.10**, and so did Stripe. The help they needed was
before that: **signed-out Find Shows does not list the open show** (it shows "No shows yet", on purpose,
because MYK9-952 hides demo clubs). On staging a beginner cannot discover it; that is a fixture
limitation, not an app defect, and the prompt is corrected below. After leaving Checkout unpaid,
nothing outside the nav cart badge says an entry is waiting: My Shows reads "You haven't entered any
shows yet" and My Payments "Amount due $0.00". That has been noted since 2026-09-26; it is still the
moment a beginner is least sure where things stand.

**Could a multi-dog handler enter a full weekend efficiently? Yes for entering.** Two dogs × two classes
took 10 clicks (2 dog picks, 2 tab switches, 4 class picks, Next, Submit), 53 s at 768×1024, with the
handler pre-filled on all four lines and `$120 + 7% = $128.40` identical on the wizard, cart and Stripe.
No multi-dog discount (MYK9-265 holds).

**Show day works.** Today's Willow entry is the only row on the show-day page (E45 fixed), with its date;
the announcements arrive cold (E46 fixed); self-check-in from My Shows wrote exactly one entry and showed
"checked in" on all three surfaces at once. **But the exhibitor's record of their dog is wrong**: Willow's
Past Results and Statistics include **two NQs from deleted shows**, so her Q rate reads 60% instead of 100%
(E54), and Title Progress says "1 more leg to earn SCN!" on the strength of an unreleased preliminary result
(E55). The Classic show page puts "1st" and "2nd" on an unreleased class, under a schedule that says
"preliminary" (E56).

**Delete works again** (E44 fixed): every throwaway dog this run created was deleted through the UI, and
both accounts ended at their start counts.

---

## Preconditions

- **SQL:** Supabase MCP `select 1` succeeded.
- **Enterable show: yes.** `Heartland UKC Nosework Trial` (`…011`), entries `2026-09-09 .. 2026-12-10`, club Stripe-capable (`club_stripe_accounts` 1). It held 2 entries at start: `lucky`'s pending pair (see residue, not this run's).
- **Show running today: yes, but the fixture function is denied.** `seed_demo_show_day_fixture_today()` returns `42501 permission denied` over MCP. Found the fixture by id prefix: `dededede-0000-0000-0731-47330ec0b729` (Oct 14–20) has a trial today; the older `…a4f2faa73124` (Oct 6–12) is still live. Precondition query with that id: one row, entry `dededede-0000-0000-0731-e1d215e812a5`, run 1, armband 200, 9:00, `no-status`.
- **Scale: NOT EXERCISED.** `exhibitor@` held 6 dogs; the MYK9-109 load fixture is not applied.
- **Closed-show fixtures:** walked the running Week show and `Prairie Trail Spring Scent Work Trial` (past).

### Commits since the prior walk (`411d27da6..3ce11fc03`, 405 in scope)

Walked first: #2522 MYK9-799 (dog delete pre-check), #2577 MYK9-800 (show-day check-in gating), #2576 MYK9-803 (Add dog in wizard), #2560/#2578 MYK9-804 (paid banner, When counts), #2548 MYK9-802/805 (Message Center, preliminary), #2975 MYK9-1147 (draft-show entries), #2902 MYK9-1046 (show-day list), #2923/#2926/#2927 (results on show-day, faults, masked schedule read), #2922 (trial/day on class rows), #2839/#2841 (wizard greyed dogs, leave warning), #2733 MYK9-952 (demo shows off signed-out lists), #2969/#2957 (dog reads server-first), #2961/#2948 (registration replica).

---

## Coverage

Beginner pass 19:36:57–20:03Z (desktop 1440×900; 390×844 touch, 260×563 for 150% zoom). Experienced pass 20:04:18–20:24Z (desktop 1440×900; 768×1024 for entry and layout). Times are wall clock for a scripted harness, not a human's pace, so they are not compared.

| #   | Task                 | Beginner                                                                                                                             | Experienced                                                                                                   |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 1   | Manage dog records   | completed (`exhibitor2@`: add in wizard, edit DOB, delete; `exhibitor@`: add)                                                        | completed (`exhibitor@`: 2 adds, 3 deletes)                                                                   |
| 2   | Find and enter shows | **completed with help**: signed-out discovery cannot list the show (MYK9-952); entered via direct link (`exhibitor2@`, `exhibitor@`) | completed, 2 dogs × 2 classes (`exhibitor@`)                                                                  |
| 3   | Pay entry fees       | completed to Checkout (both accounts); post-payment **not exercised by design: stop-at-checkout**                                    | completed to Checkout (wizard and Finish Payment); post-payment **not exercised by design: stop-at-checkout** |
| 4   | View entry status    | walked read-only on seeded entries (`exhibitor@`)                                                                                    | completed (`exhibitor@`): E58, E62, MYK9-1172                                                                 |
| 5   | Running order / ring | not applicable by design                                                                                                             | completed (show-day fixture): 9:00, run 1, #200 agree everywhere                                              |
| 6   | Announcements        | completed (`exhibitor@`, cold context): E59                                                                                          | completed (fresh context): E59                                                                                |
| 7   | Self-check-in        | not applicable by design                                                                                                             | completed (`…e1d215e812a5` only)                                                                              |
| 8   | Results              | not applicable by design                                                                                                             | completed (Classic): E56                                                                                      |
| 9   | Statistics           | not applicable by design                                                                                                             | completed (Willow): E54, E55                                                                                  |

**Coverage gaps (not passes):** post-payment confirmation, receipt and E42 (stop-at-checkout); signed-out discovery of the open show (fixture hidden by design); scale (no load fixture); waitlist offer path (no waitlist position on the account).

---

## Findings

| ID  | Sev | Summary                                                                                                         | Status                                   | Persona × viewport                   | Linear                                                                   |
| --- | --- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| E54 | P2  | Dog Past Results / Statistics / Title Progress include results from soft-deleted entries on deleted shows       | new                                      | experienced × desktop                | [MYK9-1177](https://linear.app/myk9-platform/issue/MYK9-1177)            |
| E55 | P2  | Statistics and Title Progress count unreleased preliminary results as final (SCN "2/3 legs")                    | new (MYK9-263 / MYK9-805 family)         | experienced × desktop                | [MYK9-1178](https://linear.app/myk9-platform/issue/MYK9-1178)            |
| E56 | P2  | Classic show page per-dog section: "Qualified · 1st/2nd" on an unreleased class, below a "preliminary" schedule | new surface for E49                      | experienced × desktop                | [MYK9-1179](https://linear.app/myk9-platform/issue/MYK9-1179)            |
| E57 | P3* | My Shows lists a dog's per-day rows out of date order; today's check-in row is second                           | already filed today by the show-day walk | both × desktop, experienced × 768    | comment on [MYK9-1172](https://linear.app/myk9-platform/issue/MYK9-1172) |
| E58 | P3  | Draft-show entries: "Unknown Class" rows; Upcoming "8 entries" over 9 cards; dog strip 10 vs profile 8          | open issue, new symptoms                 | experienced × desktop                | comment on [MYK9-1147](https://linear.app/myk9-platform/issue/MYK9-1147) |
| E59 | P3  | Message Center opens on "You're all caught up" directly under "2 unread"                                        | new                                      | both × desktop                       | [MYK9-1180](https://linear.app/myk9-platform/issue/MYK9-1180)            |
| E60 | P3  | Wizard class checkboxes named "Select Novice"/"Select Advanced": no element, no dog                             | new                                      | both × desktop, 768                  | [MYK9-1181](https://linear.app/myk9-platform/issue/MYK9-1181)            |
| E61 | P3  | "Show day is here" banner clips the show name mid-word at 390px                                                 | new                                      | viewport-specific (390×844, 260×563) | [MYK9-1182](https://linear.app/myk9-platform/issue/MYK9-1182)            |
| E62 | P3  | Paid banner says "The secretary will review it next" on accepted, checked-in entries                            | new                                      | experienced × desktop                | [MYK9-1183](https://linear.app/myk9-platform/issue/MYK9-1183)            |
| E63 | P3  | "See all classes" under "Your dogs today": all 7 days, each "Entry count not loaded yet" for 30 s+              | new (exhibitor remainder of MYK9-637)    | experienced × desktop                | [MYK9-1184](https://linear.app/myk9-platform/issue/MYK9-1184)            |

\* MYK9-1172 was filed P3 by the show-day walk; this walk would rate it P2 on show day and said so on the issue rather than re-filing.
P2/P3 parent: [MYK9-1176](https://linear.app/myk9-platform/issue/MYK9-1176). Every filing succeeded. MYK9-1173 ("Next up" on every future day's row) was already filed and is confirmed.

### E54 — Deleted shows in a dog's history · P2 · [MYK9-1177](https://linear.app/myk9-platform/issue/MYK9-1177)

Willow → Career → Past Results lists `ZZ Rehearsal 2026-09-26 UKC Nosework · Vehicle Advanced A · NQ` (show and
entry soft-deleted 2026-09-26) and `Heartland Scent Work Week · Container Novice A · NQ · September 25, 2026`
(old fixture `…014`, soft-deleted 2026-10-01; its trial was Oct 1). Statistics: `SCORED ENTRIES 5 · Q RATE 60% ·
3 of 5`. Live scored entries: 3, all Q. Network: `view_authenticated_entry_results?…&dog_id=in.(…41)&is_scored=eq.true`
with no `deleted_at` filter, from `useExhibitorResults.ts`, which also feeds Statistics and Title Progress.

### E55 — Preliminary results counted toward title legs · P2 · [MYK9-1178](https://linear.app/myk9-platform/issue/MYK9-1178)

Title Progress `SCN · 2/3 qualifying legs · 1 more leg to earn SCN!`. Released Container Novice Qs: one (Classic,
Nov 9). The second leg is the Oct 7 Week Q, `results_released_at NULL`, labelled "preliminary" on Past Results.

### E56 — Placement on an unreleased class · P2 · [MYK9-1179](https://linear.app/myk9-platform/issue/MYK9-1179)

`/shows/…010` "Where to be & when": `Willow · Interior Advanced Preliminary · Q · 0:52.40 · preliminary` (right).
Per-dog block on the same page: `Interior Advanced Preliminary · 106 · Qualified · 0:52.40 · 1st`, and Ranger `2nd`.

### E57–E63 · P3

- **E57** (MYK9-1172) Willow's Week card: Sun 18, **Wed 14**, Fri 16, Mon 19, Sat 17, Thu 15, Tue 20. The show page and dog profile list the same entries in date order.
- **E58** (MYK9-1147) Willow's 2 paid entries on a real club's **draft** show (`f84d4690-…`): header now `Show not published yet` (fixed), rows still `Unknown Class` ×2; `Upcoming 8` / `8 entries` over 9 cards; strip `10 upcoming classes` vs profile `8 entries this season`.
- **E59** `2 unread · Notifications · No notifications yet · You're all caught up`; the two announcements are on the Show messages tab.
- **E60** a11y tree: `checkbox "Select Novice"`, `checkbox "Select Advanced"`, identical across dog tabs.
- **E61** at 390×844 the banner reads `Heartland Scent Wor`; title span extends to x=460; page does not scroll sideways.
- **E62** `Willow's entry is paid — $210.00 on Oct 14, 2026 · The secretary will review it next` beside `Accepted` and `checked in` (7 entries, called "entry").
- **E63** 7 of 7 rows `Entry count not loaded yet` at 5, 15 and 30 s; the class page shows `Pending 2`.

### Observations, not filed

- **After abandoning Checkout** (beginner, `exhibitor2@`): My Shows `You haven't entered any shows yet`, My Payments `Amount due $0.00 · Current entries are paid up`; the only sign of the held line is the nav `Shopping cart 1` badge. Noted since 2026-09-26; the beginner persona's main point of uncertainty. Worth a product decision rather than a bug.
- **Cold-load latency.** `/exhibitor/entries` in a fresh context took **11.6 s** to first render a show name (one sample); wizard step 2 showed `Loading your cart…` for **17.1 s** on `exhibitor2@`'s first visit, 1.0–1.5 s afterwards. Single measurements, not instrumented by phase, so not filed.
- **Pulled entries with a Q.** Ranger's three Week entries (`74e96d34-…` today, `6e52d586-…`, `edcd882f-…`) are `scratched`/`pulled` yet `is_scored` with `result_status = qualified`, so My Shows reads `Pulled` beside `Q · preliminary · 58.0s`. Ids are not seed ids; another session created and scored them (today's at 19:37:49Z, during this walk). A ringside/secretary question: can a pulled entry be scored, or a scored one pulled?
- **Old Week fixture stuck "in the ring".** The Oct 6–12 show's Willow card reads `In ring` and its Oct 6 row `in the ring`, a week later. Other sessions' scoring residue, not an exhibitor defect.
- The Prairie Trail show page renders **two `<main>` landmarks** (Playwright strict-mode violation on `locator('main')`).
- Signed-out `/shows` says `No shows yet · Shows appear here as clubs publish them` while the month strip shows `OCT 1` (a real club's past show). Same family as E52.

---

## Prior findings re-verified

| Finding                                     | Result                                              | Evidence                                                                                                   |
| ------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| E44 / MYK9-799 (dog delete)                 | **resolved**                                        | 4 dogs deleted through Actions → Edit dog → Delete dog; counts n → n−1 each; no 403                        |
| E45 / MYK9-800 (show-day list)              | **resolved**                                        | `/at-show/…47330ec0b729`: one row, `Trial 1 · Wed, Oct 14, 2026`                                           |
| E46 / MYK9-802 (inbox empty until /at-show) | **resolved**                                        | two fresh contexts: Show messages lists both announcements without visiting `/at-show` (new E59 beside it) |
| E47 / MYK9-803 (zero-dog wizard)            | **resolved**                                        | `You don't have any dogs yet. Add a dog to enter this show.` + `Add a dog`; dog auto-selected after save   |
| E48 / MYK9-804 (paid banner money)          | **resolved**                                        | Week `$210.00` = 7 × $30; Classic `$90.00 due` = 3 pending; same under All and Upcoming                    |
| E49 / MYK9-805 (preliminary as final)       | **resolved on Past Results**; new surfaces E55, E56 | Past Results `Q · preliminary` with no `#1`                                                                |
| E50 / MYK9-806 (profile dates)              | **resolved**                                        | Willow Upcoming: WED Oct 14 … TUE Oct 20, each its own date (count issue moved to E58)                     |
| E53 / MYK9-809 (150% zoom overflow)         | **resolved**                                        | 260×563: `scrollWidth 260` on My Shows, wizard, cart                                                       |
| E51 / E52 (signed-out cards, month strip)   | not re-measured                                     | demo shows no longer listed signed out (MYK9-952)                                                          |
| E39 / MYK9-494 (Judge TBD)                  | **holds**                                           | Classic: 6 `Judge TBD` rows, all on the 2 classes with no confirmed `judge_assignments`                    |
| E37 / MYK9-423 (Finish Payment)             | **holds**                                           | `Pay $90.00` → `/cart?…entryIds=…054,…053,…057`, 3 lines, `$96.30`, Stripe `$96.30`                        |
| E24 / MYK9-336 (closed-show Enter)          | **holds**                                           | Week and Prairie Trail: no Enter control; `/register` → `ENTRIES CLOSED`, no Next                          |
| MYK9-265 (no multi-dog discount)            | **holds**                                           | 4 lines → `$120.00 + $8.40 = $128.40` on wizard, cart and Stripe                                           |
| MYK9-289 (unsettled requests)               | **holds**                                           | 7 routes × 12 s: 0 pending. `ERR_ABORTED` on `?select=id` HEAD probes are navigation cancellations         |
| E1/E40 family (card vs profile counts)      | **recurs** via draft-show entries                   | E58                                                                                                        |
| E2 family (stat vs list)                    | **recurs** for Upcoming                             | E58; Pending 3, Accepted 8, Waitlist 0, Completed 4 match their lists                                      |
| E5 family (money totals)                    | holds                                               | see E48                                                                                                    |

**Could not reach:** E42 / MYK9-499 and MYK9-215 (need a payment), MYK9-245, MYK9-208, MYK9-122, MYK9-196, E4, E7, E8 (no fixture exercises them).

**Leave class** (read-only): offered on every upcoming row (Week, Classic unscored, UKC, draft show); absent on scored rows and on the ended Oct 6–12 show. Not clicked.

---

## Canary candidates

- `/dogs/dededede-0000-0000-0000-000000000041?section=career` as `exhibitor@`: Past Results contains no `ZZ Rehearsal` row; Statistics `SCORED ENTRIES` equals Willow's live scored entries (E54).
- Same page → Title Progress: SCN reads `1/3` while the Oct 7 Week class and Interior Advanced Preliminary are unreleased (E55).
- `/shows/dededede-0000-0000-0000-000000000010` as `exhibitor@`: the per-dog block for `Interior Advanced Preliminary` contains `preliminary` and no `1st`/`2nd` (E56).
- `/exhibitor/entries` as `exhibitor@` on a Week day: the first class row under Willow's Week card names the earliest date (E57).
- `/exhibitor/entries` as `exhibitor@`: Upcoming chip count equals the number of cards rendered under Upcoming (E58).
- Message Center as `exhibitor@` on a Week day: never `all caught up` while the header reads `unread` (E59).
- `/at-show/<today's fixture>` as `exhibitor@`: exactly 1 `Your dogs today` row, dated today (E45).
- `/dogs/<entry-less dog>`: Actions → Edit dog → Delete dog opens a confirm whose `Delete dog` is enabled, and no `403 HEAD /rest/v1/entries` fires (E44).
- `/shows/dededede-0000-0000-0000-000000000011/register` as a 0-dog account: step 1 has an `Add a dog` button (E47).
- `/exhibitor/entries`, fresh context, Message Center → Show messages contains `Parking update` without visiting `/at-show` (E46).
- `/exhibitor/entries` as `exhibitor@`: the Week paid line reads the same amount under All and Upcoming and equals 7 × $30 (E48).
- `/shows/dededede-0000-0000-0000-000000000010`: zero `Judge TBD` rows for classes with a confirmed `judge_assignments` row (E39).
- `/exhibitor/entries` → `Pay $90.00` → `/cart` lists 3 lines totalling `$96.30` (E37).
- `/shows/<running Week fixture>/register`: `ENTRIES CLOSED`, no Next (E24).

---

## Safe-mutation accounting

| Object                                                               | Action                                                          | Verified                                                                              |
| -------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `ZZ Walk Dog 2026-10-14 1435 #1` (`b0eccba0-…`, `exhibitor2@`)       | created in wizard, UKC `ZZ1014143501`, DOB 3/15 → 3/16, deleted | `deleted_at 19:56:29Z`; exhibitor2 **0 dogs / 0 entries / 0 cart items**              |
| `#2` (`662a0a01-…`, `exhibitor@`, beginner)                          | created, UKC `ZZ1014143502`, deleted                            | All (9) → (8)                                                                         |
| `#3` (`e5669cbf-…`), `#4` (`6a744690-…`) (`exhibitor@`, experienced) | created, UKC regs, deleted                                      | All (8) → (7) → (6); no live `ZZ Walk%` dogs on either account                        |
| Cart lines                                                           | 1 (ex2) + 1 + 4 (ex1) + 3 Finish Payment (seeded entries)       | each removed by its own row (n → n−1 asserted); seeded `…053/054/057` still `pending` |
| Cart headers                                                         | none new                                                        | ex1 4 headers before and after; ex2 1 (pre-existing `5012e8af-…`)                     |
| Self-check-in                                                        | `…0731-e1d215e812a5` `no-status` → `checked-in`                 | other six Willow Week entries `no-status` before and after                            |
| Stripe                                                               | 4 sandbox Checkout sessions opened and abandoned                | 0 `stripe_orders` rows                                                                |

**Count assertions.** `exhibitor2@`: 0 / 0 / empty, as at start. `exhibitor@`: dogs 6 → 6, cart items 1 → 1
(an abandoned 2026-10-03 Classic line, not this run's), **handler entries 33 → 34**. The extra row is
`74e96d34-f023-41c3-81a9-2e9f2f5af852`, Ranger on today's Week class, created 19:37:49Z by another session
(this run's dogs never held an entry). Reported, not touched.

**Earlier residue on `exhibitor@`** (reported, not deleted): dog `lucky` (`bfbece6d-…`, `name` NULL, created
2026-09-27) with two pending UKC entries `193d6ed0-…`, `5d9af03f-…`; Willow's two paid entries on the
draft Darboshea show.

Destructive clicks were anchored to the row naming this run's dog (and class), confirms scoped to the dialog
after asserting it named the dog, counts asserted before and after. No withdraw, pull or refund. No source edits,
PRs, merges, migrations or deploys.

---

## Prompt corrections

Above the `# Part 2` line (listed only; a human should make these):

1. **Signed-out discovery cannot find the open show.** Since MYK9-952 (#2733) signed-out Find Shows hides demo clubs; the beginner's "start signed OUT at discovery … find the open show" is impossible on staging. Either name the direct link as the expected route, or keep a real-club fixture show open.
2. **`seed_demo_show_day_fixture_today()` is denied over MCP** (42501). The precondition query needs a form the MCP role can run (the id-prefix lookup used here is in Part 2 now).
3. **Account table:** `exhibitor@` is described as 5 dogs / 19 entries; it held 6 dogs / 33 entries (two weeks of show-day fixtures, the draft-show entries, `lucky`, other sessions' Ranger entries). Seeded-only counts are no longer a usable start-state assertion; record the live count instead (which the boundary already says).
4. **Count assertion vs concurrent sessions.** "A mismatch is a finding" did fire on a foreign insert (Ranger, 19:37Z). The rule should say to attribute a mismatch by `created_at` and id before calling it a finding.

Below the line (applied in this commit): dog delete path and MYK9-799 status, `call_name` vs `name`, the fixture lookup without the function, the check-in anchor and guard, wizard checkbox names and the toggle hazard, chip roles, cart expiry, MYK9-952, the 2026-10-14 account counts, the open-issue list and the audit list.

---

## Corrections to my own measurement

1. **"Every run listed under Wednesday."** My first read of the Week show page's run schedule put all seven runs under `WEDNESDAY, OCT 14`. A line filter had dropped the other day headings; the full text has one heading per day. Not a finding.
2. **"No dogs named ZZ Walk."** A `name like 'ZZ Walk%'` query returned 0 rows for three live dogs: Add Dog writes `call_name` and leaves `name` NULL.
3. **"Cart line hidden."** `exhibitor@`'s Classic cart item looked invisible on `/cart`; its cart is `abandoned` (expired 2026-10-03), so hiding it is correct.
4. **Check-in console errors were mine.** The write guard I put round the check-in aborted read-only `get_show_judges` RPCs, producing six `net::ERR_FAILED` console errors. The app made one write, to the right entry.
5. **A re-run removed a cart line.** Re-running the class-selection step unchecked a class already in the cart (selection toggles). Verified in SQL, then ran once.
6. **Filter-chip and checkbox locators failed** until I matched chips by tag and checkboxes by their real names; none of those failures was an app defect (E60 is the part that is).
