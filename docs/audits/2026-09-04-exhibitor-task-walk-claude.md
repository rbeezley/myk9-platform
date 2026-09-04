# Exhibitor Task Walk — 2026-09-04 (Claude)

> **Scope:** functional walk of the exhibitor's real task surface, with the intent
> lens from [`docs/INTENT.md`](../INTENT.md). Nothing else walks this role —
> `role-intent-walk` rotates judge / club-admin / site-admin only. The question is:
> **does the exhibitor's job actually work end to end?**

| | |
| --- | --- |
| Baseline SHA | `44c6c153d` (`fix(admin): resolve component audit findings (#2025)`) |
| Surface | deployed staging `myk9-platform-myk9show.vercel.app` (auto-deploys from `main`), real Chromium 1440×1000, tz America/Chicago |
| Accounts | `exhibitor@myk9t.com` (252 dogs / 1235 live entries). `exhibitor2@myk9t.com` **sign-in rejected — credential drift, 2nd consecutive walk** |
| Stripe | **no payment made** — no show is both open and Stripe-capable. See the precondition below |
| Findings | 7 new (E24–E30), 5 prior findings unchanged, **9 prior findings confirmed resolved in the browser** |
| Artefacts | 53 screenshots + network captures in the session scratchpad |
| Mutations | 1 dog + 1 registration created and **fully undone**; counts asserted before and after |

Prior walk: [`2026-09-01-exhibitor-task-walk-claude.md`](2026-09-01-exhibitor-task-walk-claude.md) (E9–E23).
A Codex elderly-novice UX walk also ran on 2026-09-03
([`../ux-audits/exhibitor-elderly-novice-2026-09-03.md`](../ux-audits/exhibitor-elderly-novice-2026-09-03.md), filed MYK9-366..370);
findings here are deduped against it.

---

## Headline

**The remediation since 2026-09-01 is real and it holds.** All five P1s from that walk
were verified fixed *in the browser*, not just merged — the entry list now pages the full
1275 rows, the ghost "Show cancelled" cards are gone, the $180 outstanding balance
reconciles to the cent, and the dog-delete refusal is surfaced verbatim. Four of the ten
P2/P3s were fixed too, several by the 2026-09-03 Codex walk.

**Two new P1s replace them, and both are the same shape:** a fact the app has, does not show.

- A **signed-out visitor cannot open any show** they find on Find Shows. The detail page
  never even requests the show — it reads a cold replication store, gets a well-formed
  empty array, and renders "Show Not Found". Discovery is the one thing
  `docs/roles/exhibitor.md` promises works without an account.
- The exhibitor's **run schedule can never display a result or a judge**. 958 rows say
  "Awaiting results" and 967 say "Judge TBD", on a show where 3 entries are scored and
  released and 9 of 9 classes carry a judge name. Both fields are fetched over the wire and
  discarded by a mapper. Meanwhile the *same dog's* Statistics tab reports the results
  exactly right — the signature exhibitor defect, at its widest yet.

---

## Precondition — is any show enterable? **Partly. Payment is not walkable.**

Checked first, as required.

| Show | Entries close | Club has Stripe? | Enterable today? |
| --- | --- | --- | --- |
| `MYK9-109 Load Show 1` | **2027-01-02** | **no** | Yes — wizard opens, but the club cannot take money |
| `Heartland Scent Work Classic` | 2026-09-01 | **yes** | **No** — closed 3 days ago |
| `MYK9-109 Load Show 2` / `3` | 2026-09-01 | no | No |
| `ZZ Audit - Rewalk` | 2026-08-27 | yes | No |
| `[E2E MYK9-336] Past Due Payment Fixture` | 2026-08-09 | yes | No |
| `ZZ Audit - *` (others) | 2026-08-27 | no | No |

**No show is both open and Stripe-capable**, so **role task 3 (Pay entry fees) could not be
walked at all** and MYK9-294 could not be re-verified. This is recorded as a coverage gap,
not a pass. Exactly one club in the database has a `club_stripe_accounts` row, and its
show's window closed on the same day the previous walk used it.

This was predicted — the 2026-09-01 walk closed with *"Task 3 is unwalkable as specified
next run"* — and the 2026-07-06 walk hit the same wall. Filed as
[MYK9-388](https://linear.app/myk9-platform/issue/MYK9-388) per the task file's explicit
instruction to open a fixture-rollforward issue.

The closed-show path itself is **correct**: `/shows/<closed>/register` dead-ends at
*"ENTRIES CLOSED — This show is no longer accepting normal online entries"* with a
"Message the show team" link. That prior finding stays resolved.

---

## Coverage

| # | Task area | Walked | Account | Notes |
| --- | --- | --- | --- | --- |
| 1 | Manage dog records | **Yes** | `exhibitor@` | Created a dog, added an AKC registration, edited it, deleted it — all through the UI, all verified in the DB. **Empty-state half not covered** (gap 1) |
| 2 | Find and enter shows | **Yes** | signed-out + `exhibitor@` | Signed-out discovery **broken at the click-through** (E27). Wizard walked to the payment step. Closed-show path correct |
| 3 | Pay entry fees | **No** | — | **Coverage gap** — no Stripe-capable show is open. MYK9-294 unverified |
| 4 | View entry status | **Yes** | `exhibitor@` | The strongest area this run. Counts now reconcile exactly to the database |
| 5 | Running order / ring assignments | **Yes** | `exhibitor@` | Judge never resolves (E19 → MYK9-381). No published times in the fixtures, so ordering itself is untested |
| 6 | Announcements inbox | **Partial** | `exhibitor@` | `/notifications` renders a correct empty state. **The DB holds 0 announcements platform-wide**, so the empty state is truthful and nothing else can be tested |
| 7 | Check in on show day | **Partial** | `exhibitor@` | Early self-check-in reachable and correct (61 buttons, dialog opens, no write before confirm); **E25** on its copy. No show is live, so the day-of path is untested — and `/at-show` dead-ends, which MYK9-379 already owns |
| 8 | Review results | **Yes** | `exhibitor@` | **Fails** — E29. Statistics and Past Results are correct; the show's own surfaces are not |
| 9 | Review statistics | **Yes** | `exhibitor@` | **Accurate.** Willow: 2 entries, Q rate 100%, fastest 38.50s, avg 45.45s — reconciles exactly |

### Coverage gaps (not passes)

1. **`exhibitor2@myk9t.com` sign-in rejected**, second consecutive walk. `testUsers.ts:122`
   reads `E2E_EXHIBITOR_PASSWORD`, which is absent from `.env.local`; the shared password
   returns `Invalid login credentials`. Per the task file this is credential drift, not an
   app bug. **Consequence: the genuine first-run empty state has now gone unverified twice.**
   It is the screen every real new user sees first and the only part of this role nobody has
   looked at. Rolled into MYK9-388.
2. **Payment (task 3)** — see the precondition above.
3. **Show-day check-in (task 7)** — no show is running today.
4. **Announcements (task 6)** — zero announcements exist in the database.

---

## Findings

E-series continuing from **E23** (2026-09-01 walk).

| ID | P | Title | Status vs prior | Filed |
| --- | --- | --- | --- | --- |
| **E27** | **P1** | Signed-out visitors get "Show Not Found" on every show they click from Find Shows | new | [MYK9-380](https://linear.app/myk9-platform/issue/MYK9-380) |
| **E29** | **P1** | Run schedule can never show a result: 958 "Awaiting results" over scored, released entries | new | [MYK9-381](https://linear.app/myk9-platform/issue/MYK9-381) |
| **E19** | P2→**P1** | "Judge TBD" on 967 rows while 9/9 classes carry a judge name | **unchanged** (E6, 3rd sighting) | [MYK9-381](https://linear.app/myk9-platform/issue/MYK9-381) |
| **E24** | P2 | "Finish Payment" on entry cards still leads to a cart that refuses | **MYK9-336 AC unmet** | MYK9-336 reopened |
| **E25** | P2 | Check-in dialog offers "I need to withdraw from this class", 127 days out | new | [MYK9-383](https://linear.app/myk9-platform/issue/MYK9-383) |
| **E26** | P2 | Dog Career → Past Results dates an Aug 1 trial to 7/31 | new (MYK9-366 family) | [MYK9-384](https://linear.app/myk9-platform/issue/MYK9-384) |
| **E28** | P2 | My Shows says entries close Jan 1; the show page says Jan 2 | new (same family) | [MYK9-384](https://linear.app/myk9-platform/issue/MYK9-384) |
| **E16** | P2 | 191 dog cards say "Not entered"; every one of those dogs has entries | **unchanged** (E1, 3rd sighting) | [MYK9-385](https://linear.app/myk9-platform/issue/MYK9-385) |
| **E15** | P2 | A waived entry badges as "Unknown" | **unchanged** | [MYK9-385](https://linear.app/myk9-platform/issue/MYK9-385) |
| **E20** | P2 | Card payment offered end to end for a club that cannot accept it | **unchanged** | [MYK9-386](https://linear.app/myk9-platform/issue/MYK9-386) |
| **E9** | P2 | My Shows fires 389 requests, 252 of them one per dog | **unchanged** | commented on MYK9-289 |
| **E30** | P3 | Show page states one entry count three ways: tab 485, header 482, DB 486 | new | [MYK9-387](https://linear.app/myk9-platform/issue/MYK9-387) |

---

### E27 — A signed-out visitor cannot open any show they find · **P1** · MYK9-380

The most consequential finding of the walk, because it is the first thing anyone does.

In a fresh context with no cookies and no storage:

1. `/shows` renders **MYK9-109 Load Show 1**, `Jan 9–11, 2027`, `Published`. The network
   shows `200 /rest/v1/shows?select=*,club:clubs(name,address,email)&status=in.(…)` returning
   **8 rows** — anon has read access and the data is there.
2. Clicking that row — the app's own link — lands on `/shows/a1090000-…`.
3. The page renders **"Show Not Found — The show you're looking for doesn't exist or has
   been removed."** 118 characters of body. No console errors. It fails silently and
   confidently.

Verified on three published, non-deleted shows; reproduced both by direct navigation and by
the real click-through. The same URLs render fully for a signed-in exhibitor, *including from
a fresh context with cold IndexedDB* — so this is guest-only.

**The decisive evidence is what is missing.** The complete `/rest/v1/` traffic on that page is:

```
200 rows=3 /rest/v1/sport_templates?select=*,sport_class_rules(*)&is_active=eq.true…
200 rows=5 /rest/v1/clubs?select=*&deleted_at=is.null&updated_at=gt.1970-01-01…
```

**No `shows` request at all.** Not RLS, not a grant, not an embed privilege — the page
decides the show does not exist without asking. `ShowDetailsPage` resolves it from
`useFastShowDetails` → `getShowById` and a fallback `useShowsQuery` → `getAllShows`, both
through `withReplicationFallback` (`services/database/shows/reads.ts:117-152`). For a guest
the replicated store is **cold but well-formed**, returning `{data: [], error: null}`, and
the network fallback only fires on a *throw*. `/shows/:id` lives in `publicRoutes.tsx:158`
and is not wrapped in `ProtectedRoute`, so it is meant to be public.

`docs/roles/exhibitor.md`, under "Should never have to think about": *"Setting up an account
just to browse shows — discovery is open."* Discovery is half-open: findable, unopenable,
and the app blames the show rather than asking for a sign-in.

---

### E29 + E19 — The run schedule can never show a result or a judge · **P1** · MYK9-381

`Heartland Scent Work Classic` ran 2026-08-01→03. Its `show_visibility_settings` are
`preset=open`, `qualification_timing=immediate`, `time_timing=immediate`,
`placement_timing=class_complete`. Three of this exhibitor's entries are scored and released:

```
Willow  Container Novice A  is_scored=t  result_status=qualified  38.50s  scored 2026-08-01 09:15Z
Scout   Container Novice A  is_scored=t  result_status=qualified  41.20s  scored 2026-08-01 09:15Z
Willow  Interior Advanced   is_scored=t  result_status=qualified  52.40s  scored 2026-08-01 09:15Z
```

Thirty-four days later, on the show page:

- All three render **"Awaiting results"**. Counted by DOM leaf node: **958** elements whose
  entire text is `Awaiting results`; **zero** rows carry a result.
- The **Results tab reads `0`**: *"Results are being reviewed — Placements will appear here
  after the secretary releases them."* The placement half of that copy is defensible
  (`final_placement` is NULL, class not fully scored); withholding the **Q and the time**,
  both set to `immediate`, is not.
- **967** rows read `Saturday Trial · Judge TBD`; **zero** name a judge. All 9 Heartland
  classes and all 4 Load Show 1 classes carry `classes.judge_name = 'Test Judge'`.

**The same dog's other tabs are exactly right** — this is the two-surfaces-one-fact defect
the task file says to hunt, and here it is four surfaces:

| Surface | Willow's Heartland results |
| --- | --- |
| Career → **Statistics** | `2 entries · Q rate 100% (2 of 2) · fastest 38.50s · avg 45.45s` — exact |
| Career → **Past Results** | Both Qs listed |
| Overview / **Title Progress** | `SCN 33% · 1/3 legs`, `SIA 33% · 1/3` |
| Show → **My run schedule** | **"Awaiting results"** |
| Show → **Results** tab | **0** |

**Mechanism, traced.** `getPendingResultLabel` (`components/shows/tabs/entryResultDisplay.ts:61`)
emits the string unless `entry.hasResult && entry.result`. `hasResult` is
`!!entry.competitionData` (`hooks/useShowEntriesForUser.ts:359`), read from the replicated
store — and `replicatedToEntry` **never sets `competitionData`**; `mergeEntryData` only
carries forward a pre-existing local value (`store/entry-store-helpers.ts:63-78`). The one
place that builds it reads `dbEntry.result`, a relation on a **`results` table that does not
exist** — `information_schema` returns only `manual_results`. Scores live on `entries` itself.
So the branch is dead by construction.

For the judge: `classes.judge_name` **is** on the wire (confirmed in the classes select), and
`mapDatabaseToClass` derives the judge **only** from a joined `judge_assignments` relation,
never from `judge_name` (`services/mappers/classMappers.ts:218-237`); the replication mapper
hard-codes `judge: '', // Local-only` (`store/class-store-helpers.ts:21`). And the source it
*does* read yields nothing either — the `judge_assignments` request carries no `people(...)`
embed, while `readAssignmentJudgeName` needs it. Both conditions hold, which is why the count
is 967/967 rather than partial.

On the screen the product itself labels *"Times, armbands, judges, and results stay together
here"*, none of the three that depend on these fields is ever populated. E19 is now its third
consecutive sighting (E6 → E19 → E19) and had never been filed.

---

### E24 — "Finish Payment" still leads to a cart that refuses · P2 · MYK9-336 reopened

MYK9-336's AC 2 reads: *"No 'Finish payment' / 'Pay $X online' CTA points at a cart that will
refuse."* PR #1976 fixed the two surfaces the issue body named, and both hold — the My Shows
fee card and `/exhibitor/payments` now say **"Contact the club to settle"**, and the $180
reconciles exactly ($90 Heartland + $90 fixture show).

The **per-entry CTA on the My Shows cards** was not covered and still dead-ends. Three cards
render **Finish Payment**; following one to
`/cart?showId=dededede-…&entryIds=dededede-…0054` renders the full cart —
`Entry Fees $35.00 · Service fee (7%) $2.45 · Total $37.45` — above *"Entries are closed for
this show"* and a disabled **"Entries closed. Cannot pay online"**.

The `isPastShow` guard lives only in `AmountDueSection.tsx:107-115`. `MyEntryCard.tsx:234-253`
gates the link on whether a `paymentHref` could be *built*, and `buildFinishPaymentHref` is a
pure URL builder with no notion of the entry window, so it always can. The block even carries
the right intent — `// INTENT: an exhibitor who owes money must never face a dead end` — on
the *other* branch. Three call sites now have to agree about one fact.

---

### E25 — "I need to withdraw from this class", 127 days before the show · P2 · MYK9-383

61 entry cards carry a **Check In** button, all for a show running 2027-01-09. Early
self-check-in is deliberate (`docs/plan-exhibitor-early-checkin.md`, Status: Active), and the
dialog is otherwise excellent plain-language first-person copy. One option is not:

```
I NEED TO WITHDRAW FROM THIS CLASS
  THE SECRETARY WILL SEE THAT THIS DOG WON'T RUN IN THIS CLASS
```

That is the exhibitor-facing label for the check-in status `pulled`
(`types/check-in-types.ts:90-95`) — a day-of ring signal. But "withdraw" is the word this
product already uses for something heavier: `docs/roles/exhibitor.md` lists *"Self-service
withdraws and refunds"* as deferred, and `entry_status = 'withdrawn'` renders on the very same
screen as **"Withdrawn · Refunded"**. An exhibitor four months out who wants out of a class
will read this as the withdraw control, select it, and believe they are done. The entry and
the fee are untouched, and the dialog says nothing about either.

No write occurs before "Update Status", so the control is safe; the label is the defect.
Recorded here because the task file asks explicitly for sightings of withdraw/refund UI.

---

### E26 + E28 — Two more calendar dates rendered as instants · P2 · MYK9-384

Fourth appearance of a pattern with three prior issues (MYK9-311, MYK9-352 → MYK9-377,
MYK9-366), each fixed only at the call site reported.

| Surface | Says | Truth |
| --- | --- | --- |
| My Shows entry card ×**61** | `Entries close Jan 1, 2027` | `entry_close_date = 2027-01-02` |
| Show detail page | `ENTRIES CLOSE  Jan 2` | ✓ |
| Career → Past Results ×2 | `7/31/2026` | trial is **Aug 1**; the run schedule says `SATURDAY, AUG 1` and the header `AUG 1–3` |

`formatShortDate` (`lib/format/dates.ts:130`) resolves an **instant**; the calendar-safe
`formatEntryDate` sits 50 lines above it in the same file and is what MYK9-366's PR #2005
switched `UpcomingShowsSection.tsx:236` to. That PR left `PastResultsSection.tsx:160` — its
sibling in the same Competitions tab — untouched. `formatDateMMDDYYYY` is safe for a bare
`YYYY-MM-DD` (so all the date-of-birth call sites are fine) and shifts for a timestamp.

The issue carries a sweep of same-shaped call sites so the fix is not scoped to two lines
again. Note `components/shows/overview/MoreFromClub.tsx:87` already hand-patches around this
by appending `T00:00:00` — a tell that the trap has been hit and worked around before.

---

### E9 — 389 requests to render My Shows, 252 of them one per dog · P2 · unchanged

Measured with one fresh browser context per route, tracking every request to a terminal event:

| Route | requests | settled | unsettled | load |
| --- | --- | --- | --- | --- |
| `/exhibitor/entries` | **389** | 389 | **0** | 8.1 s |
| `/account` | 43 | 43 | 0 | 5.3 s |
| `/shows` | 44 | 44 | 0 | 5.1 s |
| `/notifications` | 43 | 43 | 0 | 4.5 s |

```
252  /rest/v1/manual_results   <- one per dog
 24  /rest/v1/classes
 23  /rest/v1/trial_visibility_overrides
 23  /rest/v1/show_visibility_settings
 23  /rest/v1/class_visibility_overrides
```

Chain unchanged from the last walk: `DogStrip` renders all 252 dogs unsliced →
`DogStripCard:26` calls `useTitleProgress(dogId)` → one GET each, for a strip showing ~6
cards at a time. A further 69 are `useSelfCheckinMap` resolving the check-in cascade one
class at a time across three tables.

**Zero unsettled requests, zero non-2xx, on every route.** Posted to MYK9-289 (reopened
today, In Review behind PR #2018): nothing hangs in a real browser, and the 389-request
per-dog burst is the exhibitor-only asymmetry that explains why only this role fails an
idle-window assertion.

---

## Prior findings re-verified

**Resolved — confirmed in the browser, not merely merged.**

| Prior | Verdict | Evidence |
| --- | --- | --- |
| **E10** / MYK9-290 — list truncated at 1000 rows | **RESOLVED** | Two requests, `0-999/*` (1000 rows) + `1000-1274/*` (275 rows) = 1275, the full row count including soft-deleted. The page reads `253 entries`, which equals distinct (dog, show) registrations **exactly** |
| **E11** / MYK9-291 — soft-deleted entries say "Show cancelled" | **RESOLVED** | **0** occurrences of "Show cancelled", **0** of "Unknown Dog" (was 40 of each) |
| **E14** / MYK9-292 — "Paid in full" while $90 owed | **RESOLVED** | `ENTRY FEES $180.00 outstanding balance · Contact the club to settle`. Reconciles exactly: $90 Heartland (3×$30) + $90 fixture show |
| **E18** / MYK9-293 — dog delete fails silently | **RESOLVED** | Deleting a dog with paid entries surfaces *"This dog has paid or scored entries. Scratch or refund them before deleting."* verbatim, and the row is **not** removed (`dogs_live` unchanged at 252) |
| **E17** — 41 entries in no status bucket | **RESOLVED** | `Any status 253 = Pending 4 + Accepted 249 + Waitlist 0`. `All 253 = Upcoming 61 + Completed 192`. Both reconcile to the DB (61 upcoming / 192 past registrations) |
| **E13** / MYK9-367 — wizard quotes less than the cart | **RESOLVED** | Wizard step 3 now reads `Amount Due: $32.10` with the 7% service fee itemised, matching the cart |
| **E21** / MYK9-369 — no search across 252 dogs | **RESOLVED** | `Search dogs by call name`, `1 of 252 dogs shown`. Verified across 8 queries |
| **E22** / MYK9-370 — no show names, inconsistent receipts | **RESOLVED** | Recent rows name the show; older ones are labelled `Historical payment` with *"Historical receipt unavailable — Contact support"*. Arithmetic exact: `$321.00 − $112.35 = $208.65`, "8 payments, 3 refunds" reconciles to the rows |
| Closed show's Enter CTA | **RESOLVED** (holds) | `/shows/<closed>/register` dead-ends at "ENTRIES CLOSED" with "Message the show team" |
| MYK9-218 — dogs list unbounded | **RESOLVED** | `Showing 1 to 25 of 252` |

**Unchanged:** E9, E15, E16, E19, E20 — all filed this run.

**Not reached:** E3 (waitlist tab vs widget), E4 (Upcoming vs Withdrawn), E7 (entry-number
reuse), E8 (show dates), E12/MYK9-294 (post-payment confirmation), E23 (a past show still
accepting entries — still true in the data, but no longer reachable since Heartland closed).
MYK9-245, MYK9-215, MYK9-208, MYK9-122, MYK9-196 — no fixture state exercises them.

---

## Corrections to my own measurement

Four first readings were wrong, all in the direction of inventing a defect. This is the
section the secretary walks showed carries the most signal, so it is recorded in full.

1. **"Willow's registration numbers render blank."** The dog-detail Registrations section
   appeared to show `Registration Number` with no value for all three registries, while the
   wizard and the dog strip printed them. I was about to file a two-surfaces contradiction.
   The numbers were there — `P1A7F82FF`, `EAB60D7B6`, `SR03F80DD1`. My own `grep -v` filter,
   added to suppress the 252-dog list noise, matched `^P[0-9A-F]`, `^SR` and `^E[0-9A-F]` and
   stripped exactly the values I was looking for.

2. **"Title Progress says 0/3 for titles the Overview says 1 of 3."** Career → Title Progress
   appeared to contradict the Overview card. It does not: `SCN 33% · 1/3 qualifying legs` and
   `SIA 33% · 1/3` are both there and agree. I had read only the tail of a long list of
   *unearned* titles, which are correctly `0/3`.

3. **"The sex picker renders no options."** `getByRole('option', {name: /^female$/i})` timed
   out and `$$eval` for exact `Male`/`Female` text returned `[]`. The options are proper
   `role="option"` elements — their accessible names are `"Male ♂"` and `"Female ♀"`, and my
   anchored regex excluded the gender symbol. The 2026-09-01 walk recorded the identical trap
   on the breed picker; I re-walked into it anyway.

4. **"The wizard search does not match ZZ Walk Dog."** A first probe reported 0 hits. A
   proper sweep of 8 queries showed `ZZ`, `Walk`, `ZZ Walk` and `zz walk dog` all return
   `1 of 252 dogs shown`. The first probe read the DOM before the debounce settled.

One near-miss worth recording as a *non*-finding: the guarded dog delete fires
`POST /rpc/soft_delete_dog` **twice** for one confirm click. I nearly filed a double-submit.
The successful delete on a different dog fires it exactly **once** — so this is React Query
retrying a failed mutation, not a double write. Checking the success case is what
distinguished them.

**Method notes that mattered.** The `/exhibitor/entries` settle measurement was run with one
**fresh context per route** specifically because the 2026-09-01 walk's first reading of
"seven requests never settle" turned out to be requests its own `page.goto` had cancelled.
And the "958 Awaiting results" figure is a count of DOM leaf nodes, which is roughly 2× the
row count — the page renders responsive duplicate copies. The finding does not depend on the
number: **zero** rows show a result, and that is what the assertion rests on.

---

## Safe-mutation accounting

**Everything created this run was undone. Counts asserted before and after.**

| Object | Action | Verified |
| --- | --- | --- |
| Dog `ZZ Walk Dog 2026-09-04` (`19ca3071-…`) | created → edited → **soft-deleted** | `deleted_at = 2026-09-04 21:51:05Z` |
| AKC registration `ZZWALK0904` | created on that dog | removed with the dog |
| `dogs_live` | 252 → 253 → **252** | asserted at each step |
| `entries_live` | **1235 → 1235** | unchanged — no entry created |

No payment was made (none was possible). No entry, show, or record I did not create was
modified. No withdraw or refund was attempted. Every destructive click was anchored to the
row that owns it, the confirm dialog was asserted present before being reached into, and the
expected post-delete count was recorded before each click.

**Residue from the 2026-09-01 walk is still present and still needs a human:** dog
`ZZ Walk Dog 2026-09-01` (`14b94184-…`) with 2 paid entries, plus 2 `stripe_orders` rows and
2 sandbox payment intents. It cannot be cleaned up through the app — `soft_delete_dog` refuses
with `MK002` (correctly), and withdraw/refund are off-limits to this walk. That contradiction
in the task file is unchanged and will keep producing residue on every run that can pay;
noted on MYK9-388.

No source edits, PRs, merges, migrations or function deploys were made. The only repo write
is this report.

---

## Linear — filed 2026-09-04

Every dedup search used `includeArchived: true`, matched on task area / route / object /
symptom rather than title, and was run against the 2026-09-03 Codex walk's issues
(MYK9-366..370) as well as the 2026-09-01 walk's.

| Issue | Finding | Priority |
| --- | --- | --- |
| [MYK9-380](https://linear.app/myk9-platform/issue/MYK9-380) | **E27** — signed-out visitors get "Show Not Found" on every show | High |
| [MYK9-381](https://linear.app/myk9-platform/issue/MYK9-381) | **E29 + E19** — run schedule can never show a result or a judge | High |
| [MYK9-336](https://linear.app/myk9-platform/issue/MYK9-336) | **E24** — **reopened**, AC 2 unmet on a third surface | Medium |
| [MYK9-289](https://linear.app/myk9-platform/issue/MYK9-289) | **E9** — commented with the settle measurement and the 389-request breakdown the issue asked for | High |
| [MYK9-382](https://linear.app/myk9-platform/issue/MYK9-382) | P2/P3 parent | Medium |
| ├ [MYK9-383](https://linear.app/myk9-platform/issue/MYK9-383) | **E25** — "I need to withdraw from this class" | Medium |
| ├ [MYK9-384](https://linear.app/myk9-platform/issue/MYK9-384) | **E26 + E28** — two more calendar-dates-as-instants | Medium |
| ├ [MYK9-385](https://linear.app/myk9-platform/issue/MYK9-385) | **E16 + E15** — "Not entered" on 191 entered dogs; waived → "Unknown" | Medium |
| ├ [MYK9-386](https://linear.app/myk9-platform/issue/MYK9-386) | **E20** — card offered for a club with no Stripe account | Medium |
| ├ [MYK9-387](https://linear.app/myk9-platform/issue/MYK9-387) | **E30** — one entry count stated three ways | Low |
| └ [MYK9-388](https://linear.app/myk9-platform/issue/MYK9-388) | fixture rollforward + `exhibitor2` credential drift | Medium |

**Label deviation, recorded deliberately.** The task file asks for `p0`/`p1`, `source:claude`,
`walk:exhibitor` labels. **None of those four labels exists in this workspace** (the full team
label set is: vacation-blocked, needs-richard, auto:yellow, auto:green, Claude, Codex, Parked,
Human Tester, Wait for Launch, Test, Bug, Feature, Improvement). Rather than create four new
labels on a shared workspace unasked, I used the established convention every prior walk has
used — `Claude` + `Bug`, with Linear **Priority** carrying the severity (High = P1, Medium =
P2, Low = P3). Worth reconciling in the task file or by creating the labels once.

Coverage gaps, harness bugs and the corrections section were **not** filed, per the task file.
The one exception is MYK9-388, which the task file explicitly instructs be opened when no show
is enterable.

---

## Confidence

| Finding | Confidence | Basis |
| --- | --- | --- |
| E27 | **High** | Reproduced 3 shows × 2 paths in fresh guest contexts; the absent network request is decisive; code path traced |
| E29, E19 | **High** | DB-to-pixel reconciliation on named entries; both mappers read and quoted; wire selects inspected |
| E24 | **High** | Followed the CTA to the refusing cart; the missing guard named against the one that exists |
| E26, E28 | **High** | Three surfaces compared against the DB value; both helpers read; the fixed sibling identified |
| E15, E16, E20, E30 | **High** | Browser counts reconciled to SQL; source line named for each |
| E25 | **High** on the copy, **medium** on impact | Dialog text captured verbatim; the harm is inferred from the vocabulary collision, not observed |
| E9 | **High** | Two independent measurements, four routes, fresh context each |
