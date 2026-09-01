# Exhibitor Task Walk — 2026-09-01 (Claude)

> **Scope:** functional walk of the exhibitor's real task surface. Not a UX audit
> (`claude-role-ux-walk` owns that, currently disabled). The question here is:
> **does the exhibitor's job actually work end to end?**

| | |
| --- | --- |
| Baseline SHA | `924b2cbce` (`fix(show): bound monitoring buffers and repair build scripts (#1931)`) |
| Surfaces | local dev (worktree, port 5199) **and** deployed staging `myk9-platform-myk9show.vercel.app` |
| Accounts | `exhibitor@myk9t.com` (251 dogs / 1231 entries). `exhibitor2@myk9t.com` **sign-in rejected — auth drift** |
| Stripe | sandbox proven at the moment of payment (`cs_test_…`); 2 payments completed |
| Findings | 15 new (E9–E23), 2 recurrences of closed issues, 3 prior findings confirmed resolved |
| Artefacts | 66 screenshots + network captures in the session scratchpad |

---

## Precondition — is any show enterable?

**Yes.** Checked first, as required.

| Show | Entry close | Enterable today? |
| --- | --- | --- |
| `MYK9-109 Load Show 1` | 2027-01-02 | **Yes** — wizard opens at "Step 1 of 4" |
| `Heartland Scent Work Classic` | 2026-09-01 | **Yes** — closes at end of *today* |
| `MYK9-109 Load Show 2` / `3` | 2026-09-01 | Yes (same last day) |
| `ZZ Audit - *` | 2026-08-27 | No — correctly blocked |

Two notes that shaped the walk:

- **The designated show could not take money.** `MYK9-109 Load Club 1` has no Stripe
  Connect account, so Task 3 was completed on **Heartland Scent Work Classic** instead —
  the only club in the database with a Stripe account (`livemode: false`). See **E20**.
- **Heartland's entry window is open for a show that already ran** (Aug 1–3). See **E23**.

---

## Coverage

| # | Task area | Walked | Account | Notes |
| --- | --- | --- | --- | --- |
| 1 | Manage dog records | **Yes** | `exhibitor@` | Created dog + AKC registration through the UI. **Empty-state half not covered** — see gap below |
| 2 | Find and enter shows | **Yes** | signed-out + `exhibitor@` | Discovery works signed-out; wizard walked twice; closed-show path verified |
| 3 | Pay entry fees | **Yes** | `exhibitor@` | Two sandbox payments end to end, both succeeded |
| 4 | View entry status | **Yes** | `exhibitor@` | Highest-yield area — E10, E11, E14, E15, E16, E17 |
| 5 | Running order / ring assignments | **Partial** | `exhibitor@` | Run-schedule rows read; judge names wrong (E19). No published running order in fixtures to verify ordering |
| 6 | Announcements inbox | **Partial** | `exhibitor@` | Route reachable; no seeded announcements, so empty state only |
| 7 | Show-day check-in | **Not covered** | — | `/exhibitor/show-day` rendered My Shows content; no show is running today. **Coverage gap** |
| 8 | Review results | **Yes** | `exhibitor@` | Heartland; only 3 of 483 entries are scored — thinner fixture than the task file assumes |
| 9 | Review statistics | **Yes** | `exhibitor@` | Willow: verified against DB, **accurate** |

### Coverage gaps (not passes)

1. **`exhibitor2@myk9t.com` sign-in rejected** — `Invalid login credentials`. The account is
   confirmed, unbanned, has a password, and last signed in 2026-08-24. `E2E_EXHIBITOR_PASSWORD`
   (which `testUsers.ts:110` reads for this account) is **absent from `.env.local`**, and the
   shared password does not work. Per the task file this is auth drift, not an app bug.
   **Consequence: the genuine first-run empty state was never walked.** "Add your first dog"
   and "you have no entries yet" remain unverified this run.
2. **Show-day check-in (task 7)** — no show is running today; the route did not present a
   check-in surface.
3. **Announcements (task 6)** — inbox is empty in the fixtures; only the empty state was seen.

---

## Findings

Numbered in the E-series continuing from **E8** (2026-07-02 audit).

| ID | P | Title | Status vs prior |
| --- | --- | --- | --- |
| **E12** | **P1** | Confirmation parks at "Payment Not Found Yet" after a **successful** payment | **regressed** (MYK9-207 / MYK9-98 family) |
| **E10** | **P1** | Entry list silently truncated at PostgREST's 1000-row cap; the count states the truncated number as fact | new (same class as MYK9-262, different call site) |
| **E11** | **P1** | Soft-deleted entries render as **"Show cancelled"** on live, published shows | new |
| **E14** | **P1** | "Paid in full" / "Amount due $0.00" while $90 is genuinely outstanding | new (E5 family) |
| **E18** | **P1** | Dog delete fails server-side and the UI says nothing, then removes the row anyway | new |
| **E9** | P2 | My Shows fires **one request per dog** (251) on the exhibitor's landing page | new — leading explanation for MYK9-289 |
| **E13** | P2 | Wizard "Total Due $30.00", cart charges **$32.10** — service fee undisclosed at the review step | new (MYK9-265 shape) |
| **E17** | P2 | Status filter buckets cover 183 of 224 entries — 41 unreachable by any filter | new (E2 family) |
| **E16** | P2 | Dog cards say **"Not entered"** for dogs that have entries | **unchanged** (E1 family) |
| **E19** | P2 | "Judge TBD" while every class carries an assigned judge | **unchanged** (E6) |
| **E20** | P2 | Card payment offered through the entire wizard for a club that cannot accept it | new |
| **E15** | P2 | `payment_status = 'waived'` renders as the badge **"Unknown"** | new |
| **E21** | P2 | Registration step 1 lists all 252 dogs with no search or filter | new |
| **E22** | P2 | Payment history "Show" column is `-` on every row; 3 of 5 paid rows have no receipt | new |
| **E23** | P3 | A show that already ran still accepts entries | new |

---

### E12 — Confirmation parks at "Payment Not Found Yet" after a payment that succeeded · **P1**

**The single most important finding in this walk.** `docs/roles/exhibitor.md` states that
*silence after payment is the scariest state*; this is that state, with the terminal message
actively contradicting reality.

**Reproduction (staging, 2026-09-01 19:20 UTC):**

1. Entered `ZZ Walk Dog 2026-09-01` in Heartland, paid **$37.45** with `4242 4242 4242 4242`.
2. Session asserted `cs_test_…` before any digits were typed.
3. Returned to the app 8.6 s after clicking Pay.
4. `t = 0–30 s` → "Checking your payment status. This can take up to 30 seconds."
5. `t = 30–60 s` → **"Payment Not Found Yet — We can't find this payment on this account yet.
   Do not submit another payment."** Never reached the success state within 60 s.

**The payment had already succeeded.** From the database:

```
stripe_orders  ac6442b3-716d-4e05-8dc5-adba8d635f22
  status = succeeded   amount_cents = 3745
  paid_at    2026-09-01 19:20:52.768+00
  created_at 2026-09-01 19:20:52.849+00     <-- 81 ms after payment
entries        c2c67bdc-0429-402d-8c91-03e1466fa870
  entry_status = paid  payment_status = paid  entry_fee = 35.00
```

The client polled `stripe_orders` **12 times over 30 s** and got zero rows every time:

```
406 /rest/v1/stripe_orders?select=id,status,amount_cents,entry_ids,show_id,paid_at,…
    {"code":"PGRST116","details":"The result contains 0 rows",
     "message":"Cannot coerce the result to a single JSON object"}
```

**This is not a webhook race** — the row was committed 81 ms after payment, long before the
poll window opened.

**It resolves later.** Re-opening `/checkout/success?session_id=…` minutes afterwards renders
"Entry Submitted Successfully!" with **zero** 406s, for both payments. So the row becomes
readable; it simply is not readable to the client during the window that matters.

**Not an ownership problem** (ruled out): `stripe_customers.id = 4d57f630-…` maps to
`person_id = 6fd402f4-…` (`exhibitor@myk9t.com`) and that mapping was created **2026-06-20**,
months before these orders.

**Mechanism not established.** I can prove the symptom and rule out ownership and webhook lag;
I cannot say why the row is unreadable for ~30 s. The proof that would settle it: server-side
timing of when the row first becomes `SELECT`-able as the exhibitor's role.

**Why this is a regression.** MYK9-207 (Done, PR #1686) has the acceptance criterion
*"reliably reaches the … state on a real phone without manual action, including after a
transient network failure during the initial poll window"*, and its fix added slow
auto-re-checking every 15–30 s. No recovery occurred in the 30 s I observed past the deadline.
MYK9-98 is the same family again. This is the **third** occurrence.

Credit where due: the copy **"Do not submit another payment"** is exactly right and almost
certainly prevents double charges. That is what keeps this P1 rather than P0.

**Severity note:** rated P1, not P0 — the money path itself is correct end to end. It is the
confirmation that fails.

---

### E10 — Entry list truncated at 1000 rows; the count reports the truncated number as fact · **P1**

`postgrestGetUserEntries` (`apps/myk9show/src/services/database/entries/search.ts:163-173`)
selects from `view_authenticated_entry_results` with `.order('created_at')` and **no
`.range()` or `.limit()`**, so PostgREST's default `db-max-rows` applies.

Measured in the browser:

```
status=200  rows=1000  content-range: 0-999/*   bytes=2,077,628
```

The account has **1231 live + 40 deleted = 1271** own entry rows. **271 rows never arrive.**
The page then renders `224 entries` — stating the truncated figure as the total, with no
pagination, no "showing N of M", and no warning.

For a real exhibitor this means entries they have paid for are simply absent from My Shows —
no ring time, no check-in, no receipt. It is the "empty is not evidence of emptiness" family
one level up: *truncated* presented as *complete*.

**MYK9-262** ("useMyLifetimeStats silently truncates at 1000 rows and reports the cap as the
total") is the identical defect, fixed in a different hook. This call site did not get the fix.

**Trigger threshold is high** for an individual exhibitor (>1000 class-entry rows), which is
why this is P1 rather than P0 — but it is unbounded and silent.

---

### E11 — Soft-deleted entries render as "Show cancelled" on live, published shows · **P1**

`apps/myk9show/src/pages/MyEntriesPage/modules/useMyEntriesData.ts:192`:

```ts
const isShowCancelled = Boolean(entry.deleted_at);
```

That reads the **entry's** soft-delete flag. Every downstream string says *show*:
`entryStatus` becomes `EntryStatus.CANCELLED`, and `getContextualStatusMessage`
(`myEntriesUtils.tsx:242`) renders **"Show cancelled"**.

Measured: **40 cards** reading `Cancelled · Paid · Unknown Dog · Show cancelled`. The database
has exactly **40 soft-deleted entries** for this account, across two shows:

| Show | Deleted entries | `shows.status` | `shows.deleted_at` |
| --- | --- | --- | --- |
| Heartland Scent Work Classic | 32 | `published` | `null` |
| MYK9-109 Load Show 1 | 8 | `published` | `null` |

**Neither show is cancelled.** One of them is the upcoming Jan 2027 show the exhibitor would
be travelling to. An exhibitor who believes these cards does not show up.

"Unknown Dog" compounds it: the dogs are soft-deleted too and are correctly excluded from the
dogs query, so the name cannot resolve — the entry list shows tombstones the dog list does not.
Each also still displays a **"Paid"** badge, implying money is held against a cancelled thing.

---

### E14 — "Paid in full" and "Amount due $0.00" while $90 is outstanding · **P1**

Two surfaces, one fact, and both are wrong in the same direction.

| Surface | Says |
| --- | --- |
| My Shows fee card | `ENTRY FEES — Paid in full` |
| `/exhibitor/payments` | `Amount due $0.00` · "Current entries are paid up." |
| Database | 3 entries `entry_status=submitted`, `payment_status=pending`, `$30.00` each |

```
Ranger  Heartland Scent Work Classic  submitted / pending  $30.00
Juni    Heartland Scent Work Classic  submitted / pending  $30.00
Maple   Heartland Scent Work Classic  submitted / pending  $30.00
```

**Cause:** `isCurrentSummaryEntry` (`features/payments/entryBalanceSummary.ts:163`) returns
`false` for `isPastShowEntry`, so once a show's date passes, unpaid balances leave every
exhibitor-facing money surface. Heartland ran Aug 1–3.

The scoping rule is defensible. The **copy is not**: "Paid in full" and "Current entries are
paid up" are unqualified claims, and there is **no surface anywhere in the app** where the
exhibitor can see that $90 is owed. `docs/roles/exhibitor.md` requires "Whether they paid —
paid status is always visible."

The entry rows themselves do carry `Payment unresolved` for this case
(`myEntriesUtils.tsx:168`) — but those rows are among the ones E10 truncates away.

*(The 4th pending row is `promotion-expired`, which per the recorded product decision stays
pending deliberately; it is excluded from the $90.)*

---

### E18 — Dog delete fails server-side, silently, and the list removes the row anyway · **P1**

Attempting to delete `ZZ Walk Dog 2026-09-01` (2 paid entries):

```
POST 400 /rest/v1/rpc/soft_delete_dog   {"p_dog_id":"14b94184-…"}
  {"code":"MK002","message":"This dog has paid or scored entries.
                             Scratch or refund them before deleting."}
```

Three `403`s precede it on the same interaction.

**The server guard is correct and good.** The client handling is not:

1. **No error is surfaced.** Scanning the rendered page for `fail|error|unable|cannot|denied`
   returns `[]`. The exhibitor sees nothing.
2. **The confirm dialog promises the opposite:** *"You are about to delete ZZ Walk Dog
   2026-09-01 **and 2 entries**. This action cannot be undone."* It counts the very entries
   that will cause the server to refuse, and offers to delete them.
3. **The list lies.** On `/dogs` the dog vanished from the list while the count label still
   read `252 dogs` — the count was right and the list was wrong. Nothing was deleted:
   `dogs_live = 252`, `walkdog_deleted = 0`.

An exhibitor who deletes a dog is told nothing, sees it disappear, and it is still there.

---

### E9 — My Shows fires one request per dog (251) on the exhibitor's landing page · P2

`/exhibitor/entries` is where `/` redirects a signed-in exhibitor. Measured on two clean runs
(identical both times):

```
380 /rest/v1 requests to render one page
    251  manual_results          <-- one per dog
     22  classes
     21  show_visibility_settings
     21  trial_visibility_overrides
     21  class_visibility_overrides
      7  rpc/get_show_class_hide_counts
```

Proof it is per-dog: **251 requests, 251 distinct `dog_id=eq.<uuid>` filters**, fired as a
burst within **18 ms**.

**Chain:** `MyEntriesPage` renders `<DogStrip dogs={dogs ?? []}>` (all 251, unsliced) →
`DogStrip.tsx:94` maps every dog to `<DogStripCard>` → `DogStripCard.tsx:26` calls
`useTitleProgress(dogId)` → `useQualifyingManualResultsQuery` → one `manual_results` GET each.
It is a horizontally-scrolling strip showing ~6 cards at a time, with no virtualisation.

*(Aside: `components/exhibitor/TitleProgressCard.tsx` has the same unsliced per-dog pattern
and **no importers** — dead code.)*

#### This is the leading explanation for MYK9-289

MYK9-289 asks why five exhibitor routes fail `assertAppApiRequestsSettled`, and says outright:
*"Whoever picks this up should get those URLs first."* It was closed today (16:49) by PR #1934,
which only **exposes** the URLs in CI logs — the diagnosis is still open. Two contributions:

1. **On a real browser the five routes settle.** Local and staging, `networkidle` reached on
   all five; across 380 requests, **zero** failed to receive a response. So this is not a
   hanging request.
2. **A 251-request burst is exactly what would fail an idle-window check before a route
   transition** — and it explains the part MYK9-289 flags as the puzzle: *"Only the exhibitor
   role fails. Public, secretary, admin and judge pass."* Only the exhibitor lands on a page
   that fans out over 251 dogs.

**Correction to my own measurement, recorded because it nearly became a false finding:** my
first run reported "7 requests never settle" and a later one "10 requests with no response".
Both were my harness, not the app — I navigated to `/exhibitor/entries` when sign-in had
already landed there, and my own navigation cancelled the first load's in-flight requests,
which then never emit a terminal event. Two clean runs that excluded pre-navigation requests
showed `noresp = 0`. This is the same shape as MYK9-244 ("a navigation abort racing an
in-flight fetch"), which is worth weighing before treating the CI assertion as an app fault.

---

### E13 — Wizard quotes $30.00; the cart charges $32.10 · P2

Reproduced on **both** local and staging, and at two price points:

| Step | Load Show 1 | Heartland |
| --- | --- | --- |
| Wizard step 3 — "Total Due" / "Amount Due" | **$30.00** | **$35.00** |
| Cart — "Total" / pay button | **$32.10** | **$37.45** |
| Actually charged (`stripe_orders.amount_cents`) | — | **3745** |

Wizard step 3 is titled *"Payment — Review fees and payment"* and carries a *"Payment
Summary — Amount Due: $30.00"*. The exhibitor ticks the entry agreement and clicks
**"Submit & pay"** against that number. The 7% service fee appears only on the next screen.

This is the shape MYK9-265 was filed for — *a quote lower than the charge*.

**What is right:** the cart's disclosure is genuinely excellent (service fee exact, Stripe fee
approximate, "the club receives 100% of the entry fees"), and **cart total equals the actual
charge exactly** ($37.45 = 3745 cents = $35.00 + $2.45). The defect is confined to the wizard
step whose stated job is to review the fees.

**Also confirmed:** no multi-dog discount is quoted anywhere. MYK9-265's closure as
"not a feature" holds — no P1 regression there.

---

### E17 — 41 entries belong to no status bucket · P2

The filter block, verbatim, on one screen:

```
WHEN     All 224   Upcoming 47   Completed 177     -> 47 + 177 = 224  consistent
STATUS   Any 224   Pending 2   Accepted 181   Waitlist 0   -> 183, NOT 224
```

**41 entries are unreachable by any status filter.** They reconcile exactly to
**40 E11 ghost cards + 1 E15 "Unknown" waived entry**. An exhibitor filtering by status can
never see them, and the "Any status 224" chip promises they are covered.

---

### E16 — Dog cards say "Not entered" for dogs that have entries · P2 · unchanged

The dog strip labels **212 of 252** dogs "Not entered", including all five seeded dogs:

| Dog | Card says | Database |
| --- | --- | --- |
| Juni | Not entered | 2 live entries (1 `submitted`/pending, 1 `promotion-expired`) |
| Maple | Not entered | 2 live entries |
| Ranger | Not entered | 2 live entries |
| Willow | Not entered | 2 `completed` entries |
| ZZ Walk Dog | Not entered | **2 entries just paid for, this session** |

The underlying value is `upcomingClassCount`, so the *count* is defensible — Heartland is in
the past. The **label is not**: "Not entered" is a claim about entered-ness, rendered from a
measure of upcoming-ness. This is E1 inverted and reproduces on the deployed build.

Sharpest instance: immediately after paying $37.45 twice, the dog's own card said
**"Not entered"**.

---

### E19 — "Judge TBD" while every class has a judge · P2 · unchanged (E6)

Run-schedule rows read `Saturday Trial · Judge TBD`. The database:

| Show | Classes | With `classes.judge_name` | `judge_assignments` rows |
| --- | --- | --- | --- |
| Heartland Scent Work Classic | 9 | **9** (`Test Judge`) | 5 (`Test Judge`) |
| MYK9-109 Load Show 1 | 4 | **4** (`Test Judge`) | 0 |

The exhibitor-facing row reads neither source. E6 from the 2026-07-02 audit, still present.

---

### E20 — Card payment offered end to end for a club that cannot accept it · P2

`MYK9-109 Load Club 1` has no `club_stripe_accounts` row. Despite that, the exhibitor can:
select dogs → select classes → reach a payment step offering **"Credit/Debit Card (Online
Payment) — Secure online payment via credit or debit card"** → agree to the entry agreement →
"Submit & pay" → reach a cart quoting $32.10 → click **"Pay $32.10 and confirm entry"**.

Only then: *"This club's payment account is not set up to receive online entry fees."*

The message itself is clear and well-worded. The problem is its position: the whole job is
done before the impossibility is disclosed. This is the same shape as the prior walk's finding
that a closed show's Enter CTA let the user begin an impossible task — which **is** now fixed
(see Resolved). Only one club in the database can currently take money, so this is the default
experience for most fixtures.

---

### E15 — A waived entry renders as the badge "Unknown" · P2

`getPaymentStatusBadge` (`myEntriesUtils.tsx:156-179`) has cases for paid, pending, refunded
and partial-refund, and **no case for `PaymentStatus.WAIVED`** — it falls to
`default → <Badge>Unknown</Badge>`.

`mapPaymentStatus` maps `'waived'` correctly (`entryManagementUtils.ts:43`), so the value
arrives intact and is dropped at the badge.

Observed on Scout (armband 103, `confirmed` / `waived`, `$0.00`): the card reads
**"Accepted · Unknown"** where the truth is "nothing to pay". One entry today, but a waived
fee is a favour the club did the exhibitor, rendered as a shrug.

---

### E21 — Registration step 1 lists all 252 dogs with no search · P2

Step 1 renders every dog as a full card (call name, registered name, breed, sex, DOB, and all
three registration numbers) with **no search box, no filter, and no recently-used section**.
Finding one dog means scrolling past 251 others. `docs/INTENT.md` sets the target for entering
a show at *"That took 30 seconds"*.

Note the `/dogs` page **does** have "Search your dogs by name or breed…". The wizard, where it
matters more, does not — an existing component that simply is not reused.

---

### E22 — Payment history has no show names and inconsistent receipts · P2

`/exhibitor/payments`, all 8 rows:

```
Date          Show   Description          Amount    Status     Receipt
Aug 18, 2026   -     Refund               -$37.45   Refunded   No receipt (refunded)
Aug 18, 2026   -     Online entry fees     $37.45   Paid       No receipt available
…
Jun 27, 2026   -     Online entry fees     $32.10   Paid       Receipt
```

- The **Show column is `-` on every row.** The exhibitor cannot tell which show they paid for
  — the one thing a payment history exists to answer.
- **3 of 5** paid rows say "No receipt available"; 2 have one. No explanation for the split.

**E5 is otherwise resolved here** — see below.

---

### E23 — A show that already ran still accepts entries · P3

`Heartland Scent Work Classic` ran **2026-08-01 → 08-03**; its `entry_close_date` is
**2026-09-01**. `entryCloseGuard.ts` compares only against the close date, never against
`start_date`/`end_date`, so today the wizard happily accepts and charges for entries into a
show that finished a month ago. I paid into it twice.

In practice a secretary sets close before start, so this is latent — but nothing in the
product enforces it, and it made the fixtures' state confusing to reason about.

---

## Prior findings re-verified

| Prior | Verdict | Evidence |
| --- | --- | --- |
| **E1** — dog card contradicts dog's own entry state | **unchanged** → **E16** | 212/252 cards say "Not entered"; five seeded dogs all have entries |
| **E2** — stat card vs list counts disagree | **unchanged** → **E17** | Status buckets 183 vs "Any status 224" |
| **E5** — "Total paid" above rows that sum to more; refund silently netted | **RESOLVED** | `Gross paid $208.65 − Refunds $112.35 = Net paid $96.30`; arithmetic exact, refunds now appear as their own rows, "5 payments, 3 refunds" reconciles |
| **E6** — "Judge TBD" while judges assigned | **unchanged** → **E19** | 9/9 Heartland classes carry `judge_name` |
| **E3** (waitlist tab vs widget), **E4** (Upcoming vs Withdrawn), **E7** (entry-number reuse), **E8** (show dates) | **not reached** | No waitlisted or withdrawn-with-widget fixture state in this account; entry numbering not re-tested |
| Closed show's Enter CTA begins an impossible task | **RESOLVED** | `/shows/<closed>/register` dead-ends at **"ENTRIES CLOSED — This show is no longer accepting normal online entries"** with "Message the show team" |
| **MYK9-265** — multi-dog discount quoted | **not recurring** | No discount quoted at any step |
| **MYK9-215**, **MYK9-208**, **MYK9-122**, **MYK9-196**, **MYK9-245** | **not reached** | Fixture state for waitlist-vanish, Completed-tab counting and dropped-show cases not present |

---

## Corrections to my own measurement

Three first readings were wrong, all in the direction of inventing defects. Recorded because
this is where the useful signal hides.

1. **"Seven requests never settle on all five MYK9-289 routes."** They were the *same seven*
   with monotonically growing age across navigations — the tell I initially read as "this is
   session-wide, therefore serious". They were requests my own `page.goto` had cancelled;
   Playwright emits no terminal event for those. Two clean runs excluding pre-navigation
   requests: **zero** unanswered. Had I filed this, MYK9-289 would have received a fabricated
   diagnosis.
2. **"`/shows`, `/account`, `/notifications` render almost nothing"** (471, 702, 322 chars vs
   80,708 for My Entries). The screenshot showed `/shows` rendering perfectly. My
   `bodyChars` metric was measuring a page that is genuinely short. `/` also *redirects* to
   `/exhibitor/entries`, which is why two "different" routes had byte-identical output.
3. **"The breed picker renders no options."** `[role="option"]:visible` returned 0 and I was
   one step from filing a blocked registration flow. The screenshot showed "Labrador
   Retriever" plainly listed — the options simply are not `role="option"`.

A fourth, on the headline finding: I first observed the post-payment stall for only ~15 s and
was ready to call it a hang. The page's own copy budgets 30 s, so that observation proved
nothing, and a replay of the same session id rendered success immediately. Only a **second**
payment with a full 60 s window established E12. The first reading was not wrong so much as
worthless — and it would have been reported as a confirmed defect on a 15-second look.

---

## Safe-mutation accounting

**Created, and NOT cleaned up — needs a human.** Cleanup is blocked by design.

| Object | ID | State |
| --- | --- | --- |
| Dog `ZZ Walk Dog 2026-09-01` | `14b94184-2bf0-4101-8138-2e4a54361bb3` | **live** |
| Entry (Container Novice A) | `48e7e169-d58f-41c7-a93e-1aa5a3bb5dd5` | **live**, paid $35.00 |
| Entry (Exterior Excellent) | `c2c67bdc-0429-402d-8c91-03e1466fa870` | **live**, paid $35.00 |
| AKC registration `ZZWALK0901` | on the dog above | live |
| `stripe_orders` | `d89c28fb-…`, `ac6442b3-…` | $37.45 each, sandbox — **persist by design** |
| Stripe sandbox PIs | `pi_3UAx9v…`, `pi_3UAxEh…` | persist by design |

**Why cleanup failed:** `soft_delete_dog` refuses with `MK002 — "This dog has paid or scored
entries. Scratch or refund them before deleting."` (E18). The task file forbids attempting
withdraw or refund, and both are deferred post-fall features, so there is **no sanctioned path
to undo a paid entry**. The Supabase MCP connection is read-only, so SQL cleanup was also
unavailable.

**This is a contradiction in the task definition, not a judgement call I made:** "pay with a
throwaway dog … soft-delete the entry and dog at the end" is unsatisfiable while the paid-entry
guard exists and refunds are off-limits. Worth resolving in the task file before the next run,
or every run will leave residue. Note the accumulation is now 2 orders and 2 live entries on
the canonical exhibitor fixture.

I did **not** delete, withdraw, refund, or modify any record I did not create. No source edits,
commits, PRs, pushes, migrations or function deploys were made.

**One tension to flag:** the task's Hard constraint says "no completed payments", while the Safe
mutation boundary explicitly instructs completing Checkout in sandbox behind a `cs_test_` gate
and describes the gate mechanism in detail. I followed the specific instruction over the general
one and asserted `cs_test_` before every card entry. Worth reconciling the two sections.

---

## Linear — filed 2026-09-01

All five confirmed P1s are filed. Every dedup search used `includeArchived: true`.

| Issue | Finding | Priority |
| --- | --- | --- |
| [MYK9-294](https://linear.app/myk9-platform/issue/MYK9-294/checkout-confirmation-parks-at-payment-not-found-yet-after-a-payment) | **E12** — confirmation parks at "Payment Not Found Yet" after a payment that succeeded | High |
| [MYK9-290](https://linear.app/myk9-platform/issue/MYK9-290/my-shows-entry-list-truncates-at-postgrests-1000-row-cap-and-reports) | **E10** — entry list truncates at PostgREST's 1000-row cap and reports the cap as the total | High |
| [MYK9-291](https://linear.app/myk9-platform/issue/MYK9-291/soft-deleted-entries-tell-the-exhibitor-show-cancelled-on-live) | **E11** — soft-deleted entries say "Show cancelled" on live published shows | High |
| [MYK9-292](https://linear.app/myk9-platform/issue/MYK9-292/paid-in-full-and-amount-due-dollar000-while-the-exhibitor-owes) | **E14** — "Paid in full" while $90 is outstanding | High |
| [MYK9-293](https://linear.app/myk9-platform/issue/MYK9-293/dog-delete-fails-server-side-with-no-error-shown-and-the-list-removes) | **E18** — dog delete fails silently and the list removes the row anyway | High |

**Deviation from the draft plan, recorded deliberately.** Draft D1 proposed *re-opening* MYK9-207.
E12 was filed as a new issue (MYK9-294) linked to MYK9-207 and MYK9-98 instead. MYK9-207 was a
paid-then-*refunded* cart parked by a suspected network blip, and its fix (PR #1686) did ship —
the "Payment Not Found Yet" state I hit is that fix's own copy behaving correctly. E12 is a
paid-and-*succeeded* order whose row provably exists and is unreadable for ~30 s. Re-opening
would have marked a real fix as failed and buried a distinct trigger underneath it.

Cross-links recorded: MYK9-290 ↔ MYK9-262 (identical truncation defect, different hook);
MYK9-291 ↔ MYK9-245; MYK9-292 ↔ MYK9-235 and MYK9-290; MYK9-294 ↔ MYK9-207, MYK9-98.

P2 and P3 findings (E9, E13, E15, E16, E17, E19, E20, E21, E22, E23) are **report-only** and
were not filed.

### Still needing a decision, not filed

- **MYK9-289** — post E9's evidence and consider re-opening: the five routes *do* settle in a
  real browser, and the 251-request per-dog burst explains why only the exhibitor role fails.
  PR #1934 added observability, not a diagnosis.
- **Fixtures** — only `Heartland Scent Work Club` has a Stripe account and its entry window
  closed at end of 2026-09-01; `MYK9-109 Load Show 1`, the show this task file designates,
  cannot take payment at all. Task 3 is unwalkable as specified next run.
- **Auth drift** — `E2E_EXHIBITOR_PASSWORD` is missing from `.env.local`, so `exhibitor2@`
  cannot sign in and the first-run empty state is unwalkable.

---

## Confidence

| Finding | Confidence | Basis |
| --- | --- | --- |
| E10, E11, E15, E17, E19 | **High** | Exact DB-to-pixel reconciliation; named source line |
| E12 | **High** on symptom, **none** on mechanism | Reproduced with a real payment; DB timings; ownership and webhook lag ruled out |
| E9, E13, E16, E20, E21, E22 | **High** | Reproduced on local *and* staging |
| E14 | **High** | Two surfaces, DB rows, and the exact filter that excludes them |
| E18 | **High** | Captured the 400/MK002 response and the absent error |
| E23 | Medium | Latent; depends on secretary practice |
