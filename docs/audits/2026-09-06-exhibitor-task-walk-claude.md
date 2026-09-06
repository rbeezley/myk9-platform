# Exhibitor Task Walk — 2026-09-06 (Claude)

> **Scope:** functional walk of the exhibitor's real task surface, with the intent
> lens from [`docs/INTENT.md`](../INTENT.md). Nothing else walks this role —
> `role-intent-walk` rotates judge / club-admin / site-admin only. The question is:
> **does the exhibitor's job actually work end to end?**

|                |                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline SHA   | `3eb2c56e5` (`fix(qa): instruct the Codex review verdict contract (#2077)`), `main` green                                               |
| Surface        | deployed staging `myk9-platform-myk9show.vercel.app`, real Chromium 1440×1000, tz America/Chicago                                       |
| Accounts       | `exhibitor@myk9t.com` (259 dogs / 1272 entries) **and `exhibitor2@myk9t.com` (0/0) — which signs in for the first time in three walks** |
| Stripe         | **payment completed in sandbox**, `cs_test_b14qzqYsE1Lb…` asserted before any card digits                                               |
| Findings       | 6 new (E32–E37): **2 P1**, 2 P2, 2 P3                                                                                                   |
| Prior findings | **13 confirmed resolved in the browser**, 1 recurrence, 1 not reachable                                                                 |
| Mutations      | 1 dog + 1 registration + 1 paid entry created; delete correctly refused (paid entry) — residue recorded                                 |

Prior walks: [`2026-09-04`](2026-09-04-exhibitor-task-walk-claude.md) (E24–E31),
[`2026-09-01`](2026-09-01-exhibitor-task-walk-claude.md) (E9–E23),
[`2026-07-02`](2026-07-02-exhibitor-elderly-ux-audit-claude.md) (E1–E8).

---

## Headline

**The remediation since 2026-09-04 is the strongest this walk has ever recorded.** Both P1s
from that run are fixed _in the browser_: a signed-out visitor can now open every show, and
the run schedule shows the judge and the result on every row. MYK9-294 — the
`{CHECKOUT_SESSION_ID}` placeholder that made post-payment confirmation impossible — is fixed,
proven by paying real sandbox money and reading the returned URL. The per-dog request storm is
gone (389 → 168 requests, 252 → 4 `manual_results`). Nine sentinel strings that this walk has
counted in the hundreds for three runs — `Judge TBD`, `Awaiting results`, `Not entered`,
`Show cancelled`, `Unknown Dog` — are all now at **zero**.

**Both new P1s are money and status surfaces that contradict themselves.**

- **The exhibitor cannot pay the $90 they owe.** Two surfaces state the balance with a
  deadline and offer one button; it lands on **"Your cart is empty."** The show is _open_ and
  its club _is_ Stripe-capable, so this is not the closed-show case MYK9-336 fixed.
- **"No waitlisted entries · Nothing to do here right now"** renders directly above
  **"My Wait List Positions · #1 · Juni"**. E3 from the 2026-07-02 audit, recurring, and
  sharper — the denial is now in prose, not just a wrong count.

Both are the signature exhibitor defect the task file says to hunt: one fact, two answers,
same screen.

---

## Precondition — is any show enterable? **Yes, and payable.**

Checked first, as required. A reseed since the last walk moved the fixtures onto the relative
date formula, which cleared the blocker MYK9-388 was opened for.

| Show                                      | Entries close      | Club Stripe-capable? | Enterable today?                               |
| ----------------------------------------- | ------------------ | -------------------- | ---------------------------------------------- |
| `MYK9-109 Load Show 1`                    | 2026-11-20         | **yes**              | **Yes — walked, and paid**                     |
| `Heartland Scent Work Classic`            | 2026-11-20         | **yes**              | Yes                                            |
| `MYK9-109 Load Show 2` / `3`              | 2026-11-20         | no                   | Yes (unpayable by design — MYK9-386's fixture) |
| `ZZ Audit - *`, `[E2E MYK9-336] Past Due` | 2026-08-09 … 08-27 | mixed                | No — genuinely past                            |

**Consequence for coverage:** with everything open, the _closed_-show paths are no longer
reachable, so E24 (MYK9-336's closed-show cart) could not be re-verified in its original form.
Recorded as a coverage gap below, not a pass.

### A fixture defect the rollforward introduced

All four open shows now close entries **31 days after the show has finished**:

```
entry_open  2026-08-20   start_date 2026-10-20   entry_close 2026-11-20
```

The app renders this faithfully and it reads as nonsense: the show page shows
`CLOSES NOV 20, 2026` with a live `CLOSING IN 75D 21H` countdown for a trial dated in October,
and every My Shows card reads `Entries close Nov 20, 2026` under `Tue, Oct 20, 2026`. It is the
seed formula (`CURRENT_DATE + 45` for start, `+ 76` for close), not app drift. It also leaves
Heartland carrying `completed`, scored entries on a future-dated show. Noted on
[MYK9-388](https://linear.app/myk9-platform/issue/MYK9-388) rather than filed separately — it
is a fixture, not a defect in the product.

---

## Coverage

| #   | Task area                        | Walked      | Account           | Notes                                                                                                                                                           |
| --- | -------------------------------- | ----------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Manage dog records               | **Yes**     | **both**          | Created a dog, added an AKC registration through the wizard's inline form, verified both in the DB. Empty-state half **finally covered** on `exhibitor2`        |
| 2   | Find and enter shows             | **Yes**     | signed-out + both | Guest discovery **fixed** (E27 resolved). Wizard walked end to end. Closed-show path not reachable — see gap 1                                                  |
| 3   | Pay entry fees                   | **Yes**     | `exhibitor@`      | Completed in sandbox. Money exact on six surfaces; confirmation immediate. **But settling an existing balance dead-ends — E37**                                 |
| 4   | View entry status                | **Yes**     | both              | Buckets reconcile to the DB exactly. **Waitlist is the exception — E32**                                                                                        |
| 5   | Running order / ring assignments | **Yes**     | `exhibitor@`      | **Fixed.** Judge and result on every row (E19/E29 resolved). No published run _times_ in the fixtures, so ordering itself is still untested                     |
| 6   | Announcements inbox              | **Partial** | both              | Correct empty state on both accounts; **0 announcements exist platform-wide**, so nothing else is testable                                                      |
| 7   | Check in on show day             | **Partial** | `exhibitor@`      | 253 Check In buttons, dialog opens, no write before confirm, cancel is clean. **E25's copy is fixed.** No show is running today, so the day-of path is untested |
| 8   | Review results                   | **Yes**     | `exhibitor@`      | Run schedule and podium both correct and reconcile. **Tab badge says `Results 0` — E33**                                                                        |
| 9   | Review statistics                | **Yes**     | `exhibitor@`      | **Exact.** Willow: 2 entries, Q rate 100%, fastest 38.50s, avg 45.45s = (38.50+52.40)/2                                                                         |

### Coverage gaps (not passes)

1. **Closed-show paths.** Every non-archival show is now open, so the "Enter CTA on a closed
   show" check and E24's refusing cart have no fixture to run against.
2. **Show-day check-in (task 7).** No show is running today.
3. **Announcements (task 6).** Zero announcements exist in the database, so the empty state is
   truthful and the populated state has still never been walked.
4. **Published run times (task 5).** The fixtures carry no published schedule times, so
   ordering correctness is unverified even though the rows now render fully.

---

## Findings

E-series continuing from **E31** (2026-09-04 walk).

| ID      | P      | Title                                                                          | Status vs prior      | Filed                                                       |
| ------- | ------ | ------------------------------------------------------------------------------ | -------------------- | ----------------------------------------------------------- |
| **E37** | **P1** | "Finish Payment" on a $90 open-show balance lands on "Your cart is empty"      | new                  | [MYK9-423](https://linear.app/myk9-platform/issue/MYK9-423) |
| **E32** | **P1** | "No waitlisted entries · nothing to do here" above "My Wait List Positions #1" | **recurrence of E3** | [MYK9-417](https://linear.app/myk9-platform/issue/MYK9-417) |
| **E33** | P2     | Show tab always reads `Results 0` — hard-coded literal                         | new                  | [MYK9-419](https://linear.app/myk9-platform/issue/MYK9-419) |
| **E34** | P2     | "Receipt" opens a filtered entry list with no amount, order id or date         | new                  | [MYK9-420](https://linear.app/myk9-platform/issue/MYK9-420) |
| **E35** | P3     | "Browse All" badge reads 4 or 8 depending on the active tab                    | new                  | [MYK9-421](https://linear.app/myk9-platform/issue/MYK9-421) |
| **E36** | P3     | Breed picker results are unlabelled buttons — no listbox semantics             | new                  | [MYK9-422](https://linear.app/myk9-platform/issue/MYK9-422) |

Parent for the P2/P3 group: [MYK9-418](https://linear.app/myk9-platform/issue/MYK9-418).

---

### E37 — The exhibitor cannot pay the money the app says they owe · **P1** · MYK9-423

Reproduced 2/2 in fresh contexts.

Two money surfaces agree on the debt, and both attach a deadline:

- My Shows fee card: `ENTRY FEES · $90.00 · due of $38,100.00 entered · [Finish Payment]`
- My Payments: `Amount due $90.00 · Heartland Scent Work Classic - pay by Nov 20 · This matches
Current Fees on My Shows for current entries. · [Finish payment]`

**Finish Payment** navigates to a correctly-formed URL carrying the three genuinely unpaid
entries:

```
/cart?showId=dededede-…0010&entryIds=dededede-…0057,dededede-…0054,dededede-…0053
```

The cart renders:

> **Your cart is empty**
> Browse upcoming shows and add entries to your cart to get started. `[Browse Shows]`

No amount, no line items, no pay button, no explanation. Held for 15 s in both trials — a
settled state, not a loading flash.

**The debt and the eligibility are both real.** The three entries are `payment_status=pending`,
$30 each, summing to exactly the $90 quoted. Heartland is `published`, `entry_close_date` is
**2026-11-20** — 75 days out — and its club holds a `club_stripe_accounts` row with
`payouts_enabled`. So neither the client `isPastShow` guard nor the `stripe-checkout` server
gates should fire.

**And checkout itself works.** The same walk paid $32.10 for a new entry on MYK9-109 Load Show 1
through wizard → cart → Stripe → confirmation. So this is specific to settling an _existing_
unpaid entry through the deep link.

**This is not MYK9-336 recurring.** That issue is scoped to _closed_ shows and #2033 correctly
suppressed the CTA for those. This is the open-show branch, which nothing guards. It is also
strictly worse than the state #2033 replaced: the old cart at least itemised the fees and said
why it refused; this one denies the entries exist. `AmountDueSection.tsx` carries
`// INTENT: an exhibitor who owes money must never face a dead end` — this is that dead end, on
the branch the comment was not covering.

---

### E32 — "No waitlisted entries" printed directly above waitlist position #1 · **P1** · MYK9-417

Reproduced 2/2. On one screen, simultaneously:

- Status chip: **`Waitlist 0`**
- Click it: **`0 entries`**, and the empty state

  > **No waitlisted entries**
  > Waitlisting happens when a class is full — you're in line and will be moved in automatically
  > if a spot opens up. **Nothing to do here right now.**

- Immediately below, still rendered: **`My Wait List Positions · #1 · Juni · Interior Advanced ·
Heartland Scent Work Classic · [Withdraw]`**

**Ground truth.** `waitlist_entries` holds exactly one row and it is that one — Juni, class
`dec1a55e-…0032`, `position 1`, `status waiting`, `joined_via online`. The **section is right**;
the chip, the count and the empty state are wrong.

**Mechanism — two sources that never meet.** The chip count and the filtered list both come from
`entries: MyEntry[]` via `filterEntriesByStatus` → `isWaitlistEntry`
(`useMyEntriesFilters.ts:55-66`, `entryPredicates.ts:25`), which asks
`getOperationalEntryState(e) === 'waitlist'` — derived from the `entries` table. Juni's `entries`
row is `entry_status='submitted'`, so it can never match. The section comes from
`useMyWaitlistEntries(...)` (`MyEntriesPage/index.tsx:150-156`), which reads the
**`waitlist_entries` table**.

The irony is in the code. `filterEntriesByStatus` is introduced by:

> _Kept as one function so the filtered list and the tab counts can never drift apart — they are
> the same question asked about different sets._

That guard works: count and list agree. The drift is between **both of them** and the section,
which the guard does not reach. This is MYK9-216's fix holding while the same bug lives one
table over.

**Why P1.** `docs/roles/exhibitor.md` task 4 is "view entry status … with no silent limbo". A
waitlist _is_ the limbo state, and the app denies it in prose — _"Nothing to do here right now"_
is a stronger falsehood than a wrong number. A promotion off that waitlist creates an entry and
a fee.

---

### E33 — `Results 0`, hard-coded, over a first-place finish · P2 · MYK9-419

Heartland's tab bar reads `Overview | Trials 4 | My Entries 515 | Classes 10 | Results 0`.
Open the Results tab and it renders `2 classes` and five placements:

```
Container Novice A                Interior Advanced Preliminary
  1st  Test Exhibitor "Willow"      1st  Test Exhibitor "Willow"
  2nd  Test Exhibitor "Scout"       2nd  Test Exhibitor "Ranger"
  3rd  Test Secretary "Cooper"
```

The badge stays `0` before and after. Cause, `ShowDetailsPage.tsx:351`:

```ts
{ id: 'results', label: 'Results', icon: Medal, count: 0 },
```

A literal. Every sibling derives its count — and they are all correct (`My Entries 515` equals
63 load dogs × 8 + 11 = 515 exactly). This one cannot be non-zero on any show for any user.

This is the tab an exhibitor opens to find out how their dog did. `0` is a strong "nothing here"
signal, so the likely outcome is they never click — and Willow won two classes. P2 rather than
P1 only because the content is reachable and correct once opened.

---

### E34 — "Receipt" is not a receipt · P2 · MYK9-420

Observed on the order this walk had just paid. My Payments shows the row correctly:

```
Sep 6, 2026 | MYK9-109 Load Show 1 | Online entry fees | $32.10 | Paid | [Receipt]
```

**Receipt** links to `/exhibitor/entries?orderId=ff08fa39-…&showId=…&entryIds=df535d32-…`, which
renders My Shows filtered, with a well-written banner: _"Showing 1 of 258 entries — the ones your
payment for MYK9-109 Load Show 1 covered. · Show all entries"_.

Searched the whole rendered destination:

| Looked for            | Present? |
| --------------------- | -------- |
| the string `Receipt`  | no       |
| `$32.10`              | no       |
| the order id          | no       |
| the word `Order`      | no       |
| a payment date        | no       |
| a confirmation number | no       |

The only money on the page is the global `$90.00 due of $38,100.00 entered` header. The entry
card says `Paid` but never how much; expanding `Entered Classes (1)` adds nothing.

So a control labelled **Receipt** produces a filter. The amount exists only on the page the
exhibitor just navigated away from, and there is no other receipt affordance in the product.
The deep-link pattern is _right_ for this codebase's consolidate-don't-duplicate phase — the ask
is not a new page, it is that the destination state amount, date and reference.

---

### E35 / E36 — two P3s

**E35.** The `Browse All` badge reads `4` while that tab is selected and **`8`** while Past Shows
is selected, flipping back on return; reproduced 2/2. Eight shows are published and visible, so
`8` is the correct "all" count and the `4` is the upcoming-only subset. Nothing is unreachable;
filed because it is the house pattern and because a tab named "all" that badges half the set is
a naming decision worth making.

**E36.** The registration form's **Registered Breed** field opens a `role="dialog"` with a
`Search breeds…` input, and renders matches as bare `<button>` elements — `[role="option"]`
count **0**, `[role="listbox"]` count 0. Its sibling **Registration Organization** on the same
form is correct, with nine real `role="option"` children. Screen-reader users get a dialog of
unrelated buttons instead of a combobox; keyboard users get no option traversal.

---

## Prior findings re-verified

**Resolved — confirmed in the browser, not merely merged.**

| Prior                                                        | Verdict                                | Evidence                                                                                                                                                                                    |
| ------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E27** / MYK9-380 — guests get "Show Not Found"             | **RESOLVED**                           | 3 shows × 2 paths (real click-through + direct nav) in fresh guest contexts, all render fully. The missing `shows` request now fires: `1 shows request, 200`                                |
| **E29** / MYK9-381 — run schedule can never show a result    | **RESOLVED**                           | All 4 scored entries render `Qualified · time · placement`, each matching the DB exactly. **0** occurrences of `Awaiting results`                                                           |
| **E19** / MYK9-381 — "Judge TBD" on 967 rows                 | **RESOLVED** (3rd sighting, now fixed) | 902 rows across 5 groupings read `· Judge Test Judge`. **0** occurrences of `Judge TBD`                                                                                                     |
| **E31** / MYK9-294 — confirmation can never find the payment | **RESOLVED**                           | Returned to `…/checkout/success?session_id=cs_test_b14qzq…` — the real id, **0** occurrences of `%7BCHECKOUT_SESSION_ID%7D`. "Entry Submitted Successfully!" with confirmation # on arrival |
| **E9** / MYK9-289 — 389 requests, 252 one-per-dog            | **RESOLVED**                           | 168 requests, `manual_results` 252 → **4**, on an account 7 dogs _larger_. 0 unsettled, 0 non-2xx on 7 routes across both accounts                                                          |
| **E25** / MYK9-383 — "I need to withdraw from this class"    | **RESOLVED**                           | Now reads _"I WON'T BE RUNNING THIS CLASS — this only tells the secretary that this dog won't run in this class; **it does not withdraw the entry or change its fee**"_                     |
| **E16** / MYK9-385 — 191 dogs said "Not entered"             | **RESOLVED**                           | **0** occurrences                                                                                                                                                                           |
| **E15** / MYK9-385 — waived entry badges "Unknown"           | **RESOLVED**                           | **0** occurrences of the `Unknown` sentinel                                                                                                                                                 |
| **E11** / MYK9-291 — "Show cancelled" on live shows          | **RESOLVED** (holds)                   | **0** occurrences of `Show cancelled` and `Unknown Dog`                                                                                                                                     |
| **E30** / MYK9-387 — entry count stated three ways           | **RESOLVED**                           | `My Entries 515` and `513 scheduled runs across 68 dogs` differ by exactly the `2 other entries (withdrawn, scratched…)` the copy names. 515 reconciles to the DB exactly                   |
| **E17** — entries in no status bucket                        | **RESOLVED** (holds)                   | `Any status 258 = Pending 3 + Accepted 255 + Waitlist 0`; `All 258 = Upcoming 257 + Completed 1`                                                                                            |
| **E13** / MYK9-367 — wizard quotes less than the cart        | **RESOLVED** (holds)                   | Wizard `$32.10` = cart `$32.10` = Stripe `$30.00 + $2.10` = `amount_cents 3210`                                                                                                             |
| **E18** / MYK9-293 — dog delete fails silently               | **RESOLVED** (holds)                   | Delete of a dog with a paid entry surfaces _"This dog has paid or scored entries. Scratch or refund them before deleting."_ within 1.5 s; `dogs_live` unchanged at 259                      |
| MYK9-218 — dogs list unbounded                               | **RESOLVED** (holds)                   | `Showing 1 to 25 of 259`                                                                                                                                                                    |
| MYK9-215 — receipt card-scoped not order-scoped              | **RESOLVED** (holds)                   | Receipt links are order-scoped (`orderId=…`); the defect is now that the destination carries no money — E34                                                                                 |

**Recurred:** E3 (waitlist count vs widget) — filed as E32/MYK9-417.

**Not reachable this run:** E24 / MYK9-336 (needs a _closed_ show; none exist), E4, E7, E8,
E23, MYK9-245, MYK9-208, MYK9-122, MYK9-196 — no fixture state exercises them. **E20** /
MYK9-386's fixture (a club with no Stripe account) still exists on Load Shows 2 and 3, but the
card-offered-anyway path was not re-walked this run.

**Credential drift resolved:** `exhibitor2@myk9t.com` signs in. `E2E_EXHIBITOR_PASSWORD` is now
present in `.env.local`. The genuine first-run empty state — unverified for two consecutive
walks and the only part of this role nobody had ever looked at — is covered, and it is **good**:
truthful copy, correct zero balances, sensible next actions on all five routes.

> `/dogs` — _"No dogs yet. Add your first dog to start tracking titles, training, and health records."_
> `/exhibitor/entries` — _"Welcome! Let's get you set up. Add your dog once and we'll remember the details — entering a show takes about 30 seconds from here on."_
> `/exhibitor/payments` — _"$0.00 · Current entries are paid up. · No payments yet."_

---

## Corrections to my own measurement

Five first readings were wrong, four of them inventing a defect that did not exist.

1. **"Both money figures are $60 short."** The fee card reads `$90.00 due of $38,070.00 entered`
   while the DB summed to `$150.00`unpaid of`$38,130.00`. I had a two-surfaces finding drafted.
   Both UI figures correctly **exclude the two withdrawn-and-refunded entries** ($30 each):
   `$38,130 − $60 = $38,070` and `$150 − $60 = $90`, exactly. The app is right and consistent;
   my query was the naive one.

2. **"The Pending bucket undercounts by one."** `Pending 2` against three payment-pending
   registrations looked like a miscount. `Pending` is a **review**-status bucket, not a payment
   one — confirmed when my newly _paid_ entry landed in it as `Pending review · Paid`, moving it
   to 3. Two different meanings of the word, and I picked the wrong one.

3. **"Past Shows says 4 for four future shows."** It says 4 because there are exactly four
   genuinely past shows, which I would have seen by clicking it. The real anomaly was one line
   above and I nearly missed it — `Browse All` flipping 4 → 8 (E35).

4. **"The breed picker renders no options."** True as written and useless as a diagnosis: the
   options are `<button>` elements, so `getByRole('option')` was always going to return nothing.
   Reading the popup's DOM turned a phantom "picker is broken" into a real, narrow a11y finding
   (E36). The 2026-09-04 walk recorded the identical trap on the sex picker and the 09-01 walk on
   the breed picker; this is its third consecutive appearance in a corrections section.

5. **A regex that navigated me off the application entirely.** `getByRole('button', {name:
/continue/i})` on the sign-in page matched **"Continue with Google"** and took the run to a
   Google account page — which I first read as a broken two-step sign-in flow. The canonical
   helper uses `getByTestId('continue-button')` or `{name: 'Continue', exact: true}`. An
   unanchored regex on a page with an OAuth button is a live hazard, not a style preference.

**A near-miss worth recording.** My first `Create Dog` submit used
`getByRole('button', {name:/…/i}).last()` and resolved to the **dark-mode toggle** in the page
header — outside the dialog entirely. It timed out harmlessly here, but this is exactly the
shape the task file warns about for destructive clicks: a page-wide `.last()` that lands on
another control when the one you want is inside a dialog. Every subsequent submit and confirm in
this walk was scoped to `[role="dialog"]`.

**Method note.** The `Results 0`, `Browse All 4/8`, waitlist and empty-cart findings were each
re-run in a **second fresh context** before being written down, because all four are the kind of
state that a warm cache or a stale render could fake. All four reproduced 2/2.

---

## Safe-mutation accounting

**Counts asserted before and after every mutation.**

| Object                                      | Action                                          | Verified                                                                   |
| ------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| Dog `ZZ Walk Dog 2026-09-06` (`8b18c606-…`) | created via UI                                  | `dogs_live` 258 → **259**; sex `female`, DOB `2021-05-05` as entered       |
| AKC registration `SR09062026`               | created via the wizard's inline form            | present; correctly unblocked class selection                               |
| Entry `df535d32-…` · Load 1 Class 1         | created and **paid**                            | `entries_live` 1271 → **1272**; `entry_status=paid`, `payment_status=paid` |
| `stripe_orders` `ff08fa39-…`                | created by the sandbox payment                  | `status=succeeded`, `amount_cents=3210`, `paid_at 2026-09-06 08:45:59Z`    |
| Dog delete                                  | attempted through the UI, **correctly refused** | `dogs_live` stayed **259**; refusal surfaced verbatim                      |

**The payment gate was mechanical, as required.** Two separate scripted attempts aborted before
typing any digits because the URL was not yet a Stripe session; the run that paid asserted
`cs_test_b14qzqYsE1Lb…` first. No live-mode page ever received input.

**Residue, and it cannot be cleaned up by this walk.** `ZZ Walk Dog 2026-09-06` holds a paid
entry, so `soft_delete_dog` refuses (correctly, `MK002`), and withdraw/refund are outside this
walk's mutation boundary. `ZZ Walk Dog 2026-09-01` from the previous walk is still present for
the same reason. The task file's instruction to "soft-delete the entry and dog at the end"
cannot be satisfied for any walk that also completes a payment — the two requirements are in
direct conflict. Recorded on
[MYK9-388](https://linear.app/myk9-platform/issue/MYK9-388) along with the visible
accumulation: 12 payment rows on My Payments, and 14 of 15 `stripe_orders` now pointing at
entries a later reseed hard-deleted.

No withdraw or refund was attempted. Every destructive click was anchored to the row that owns
it, every confirm was scoped to `[role="dialog"]`, and the dialog's presence was asserted before
being reached into. No source edits, PRs, merges, migrations or function deploys were made. The
only repo write is this report.

---

## Linear — filed 2026-09-06

Every dedup search used `includeArchived: true` and matched on task area / route / object /
symptom rather than title.

| Issue                                                         | Finding                                                      | Priority |
| ------------------------------------------------------------- | ------------------------------------------------------------ | -------- |
| [MYK9-423](https://linear.app/myk9-platform/issue/MYK9-423)   | **E37** — open-show balance dead-ends at an empty cart       | High     |
| [MYK9-417](https://linear.app/myk9-platform/issue/MYK9-417)   | **E32** — "No waitlisted entries" above waitlist position #1 | High     |
| [MYK9-418](https://linear.app/myk9-platform/issue/MYK9-418)   | P2/P3 parent                                                 | Medium   |
| ├ [MYK9-419](https://linear.app/myk9-platform/issue/MYK9-419) | **E33** — `Results 0` hard-coded                             | Medium   |
| ├ [MYK9-420](https://linear.app/myk9-platform/issue/MYK9-420) | **E34** — "Receipt" carries no payment detail                | Medium   |
| ├ [MYK9-421](https://linear.app/myk9-platform/issue/MYK9-421) | **E35** — `Browse All` badge 4 vs 8                          | Low      |
| └ [MYK9-422](https://linear.app/myk9-platform/issue/MYK9-422) | **E36** — breed picker a11y semantics                        | Low      |

**Verification comments posted** to four issues that were closed without browser evidence:
[MYK9-294](https://linear.app/myk9-platform/issue/MYK9-294) (payment confirmation, with the
sandbox replay), [MYK9-381](https://linear.app/myk9-platform/issue/MYK9-381) (judge + results,
with the zero counts), [MYK9-289](https://linear.app/myk9-platform/issue/MYK9-289) (settle
measurement across 7 routes — it had been closed with no post-fix Nightly result available), and
[MYK9-388](https://linear.app/myk9-platform/issue/MYK9-388) (fixtures unblocked, plus the new
`entry_close > start_date` seed defect and the residue).

**Label deviation, unchanged from the 2026-09-04 walk.** The task file asks for `p0`/`p1`,
`source:claude`, `walk:exhibitor`. **None of those four labels exists in this workspace** — the
full team set is: vacation-blocked, needs-richard, auto:yellow, auto:green, Claude, Codex,
Parked, Human Tester, Wait for Launch, Test, Bug, Feature, Improvement. Rather than create four
labels on a shared workspace unasked, I used the convention every prior walk has used —
`Claude` + `Bug`, with Linear **Priority** carrying severity (High = P1, Medium = P2, Low = P3).
This is now the second walk to record the same deviation; it is worth either creating the labels
once or amending the task file.

Coverage gaps, the fixture defect and the corrections section were **not** filed, per the task
file.

---

## Confidence

| Finding     | Confidence                                                        | Basis                                                                                                                                                                                 |
| ----------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E37         | **High**                                                          | Reproduced 2/2 in fresh contexts; entry ids, fees, show dates and the club's Stripe row all checked in the DB; the working checkout on another show isolates it to the deep-link path |
| E32         | **High**                                                          | Reproduced 2/2; `waitlist_entries` read directly; both data sources traced to their hooks and quoted                                                                                  |
| E33         | **High**                                                          | Reproduced 2/2; the cause is a literal on a named line; sibling counts verified correct against the DB                                                                                |
| E34         | **High**                                                          | Six separate strings searched for on the destination, all absent; observed on an order paid minutes earlier                                                                           |
| E35         | **High** on the behaviour, **medium** on which number is intended | Reproduced 2/2; the correct total is unambiguous, the product intent for the label is not                                                                                             |
| E36         | **High**                                                          | Popup DOM dumped; contrasted against the correct sibling control on the same form                                                                                                     |
| Resolutions | **High**                                                          | Each is a zero-count of a string previously counted in the hundreds, or a DB-to-pixel reconciliation on named rows                                                                    |
