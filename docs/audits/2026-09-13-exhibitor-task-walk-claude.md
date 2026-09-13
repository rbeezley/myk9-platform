# Exhibitor Task Walk — 2026-09-13 (Claude)

> **Scope:** functional walk of the exhibitor's real task surface, with the intent
> lens from [`docs/INTENT.md`](../INTENT.md). Nothing else walks this role —
> `role-intent-walk` rotates judge / club-admin / site-admin only. The question is:
> **does the exhibitor's job actually work end to end?**

|                |                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| Baseline SHA   | worktree cut from `origin/main` at `a752cda22` (`fix(supabase): regenerate types for the retired classes.judge_name`)  |
| Surface        | deployed staging `myk9-platform-myk9show.vercel.app`, headless Chromium 1440×1000, tz America/Chicago                  |
| Accounts       | `exhibitor@myk9t.com` (259 dogs / 1272 entries at start) **and** `exhibitor2@myk9t.com` (0/0) — both sign in           |
| Stripe         | **payment completed in sandbox**, `cs_test_b1VgK1VC…` asserted before any card digits                                  |
| Findings       | 6 new (E38–E43): **2 P1**, 2 P2, 2 P3                                                                                 |
| Prior findings | **10 confirmed resolved in the browser**, 1 regressed, 1 partially fixed, 1 masked rather than fixed                   |
| Mutations      | 1 dog + 1 registration + 1 paid entry created; residue recorded (cannot be removed — see accounting)                   |

Prior walks: [`2026-09-06`](2026-09-06-exhibitor-task-walk-claude.md) (E32–E37),
[`2026-09-04`](2026-09-04-exhibitor-task-walk-claude.md) (E24–E31),
[`2026-09-01`](2026-09-01-exhibitor-task-walk-claude.md) (E9–E23),
[`2026-07-02`](2026-07-02-exhibitor-elderly-ux-audit-claude.md) (E1–E8).

---

## Headline

**Two P1s, and one of them is a regression that landed yesterday.**

- **The judge vanished from every exhibitor schedule row.** 1030 rows read `Judge TBD`;
  **zero** render a judge, though five of Heartland's ten classes hold *confirmed* assignments
  for Test Judge. Migration `20260912234500_drop_classes_judge_name` was applied to the live
  database on 2026-09-12 and the exhibitor's timeline still resolves the judge name from that
  dropped column. This is **E19 / MYK9-381 regressed** — the 2026-09-06 walk verified it fixed
  with "902 rows read `· Judge Test Judge`, 0 occurrences of `Judge TBD`".

- **$30 of live debt is reported as paid on every exhibitor surface, while the cart still offers
  to charge it.** An order marked `paid` overrides the entry-level `pending` for *every* entry in
  that order, so the fee card says `Paid in full`, My Payments says `Amount due $0.00 · Current
  entries are paid up`, and the entry's own card is badged `Paid` — while `/cart` holds that same
  dog-and-class for `$30.00` and the nav badge reads `1`.

**The second one also explains why E37 looks fixed and is not.** MYK9-423 (the `$90` balance
whose "Finish Payment" landed on an empty cart) could not be reproduced this run for a reason
that is worse than a fix: **there is no longer any "Finish Payment" affordance at all** — 0
occurrences — because the balance it was attached to is now computed as `$0.00`. The dead end was
not repaired; the debt was made invisible. MYK9-423 is still **In Progress**, and this is
material to it.

**What genuinely improved.** The paid-entry journey is in good shape: wizard `$32.10` = cart
`$32.10` = Stripe `$32.10` = `amount_cents 3210`, the return carries a real `session_id`, and the
confirmation is immediate, specific and reassuring. Guest discovery, the Results tab count, the
receipt destination, the breed picker's a11y semantics and the 260-dog picker search are all
confirmed fixed in the browser.

---

## Precondition — is any show enterable? **Yes, and payable.**

Checked first, as required.

| Show                           | Show dates      | Entries close | Club Stripe-capable? | Enterable today?                  |
| ------------------------------ | --------------- | ------------- | -------------------- | --------------------------------- |
| `MYK9-109 Load Show 1`         | Oct 24–26, 2026 | 2026-11-24    | **yes**              | **Yes — walked, entered and paid**|
| `Heartland Scent Work Classic` | Oct 24–26, 2026 | 2026-11-24    | **yes**              | Yes (the results/stats fixture)   |
| `MYK9-109 Load Show 2` / `3`   | Oct 24–26, 2026 | 2026-11-24    | no                   | Yes, unpayable by design          |
| `ZZ Audit - *`                 | Aug 28–29, 2026 | 2026-08-27    | mixed                | No — genuinely closed             |
| `[E2E MYK9-336] Past Due`      | Aug 10–11, 2026 | 2026-08-09    | yes                  | No — genuinely closed             |

**The fixture defect the 09-06 walk recorded on MYK9-388 is unchanged and has drifted further:**
all four live shows still close entries **29 days after the show has finished**
(`start 2026-10-24`, `entry_close 2026-11-24`). Every My Shows card reads `Entries close Nov 24,
2026` under `Sat, Oct 24, 2026`. It is the seed formula, not app drift, and it also leaves
Heartland carrying `completed`, scored entries on a future-dated show. Not filed separately.

---

## Coverage

| #   | Task area                        | Walked      | Account           | Notes                                                                                                                              |
| --- | -------------------------------- | ----------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Manage dog records               | **Yes**     | **both**          | Created a dog + an AKC registration through the wizard's inline form, both verified in the DB. Empty-state half covered on `exhibitor2` |
| 2   | Find and enter shows             | **Yes**     | signed-out + both | Guest discovery healthy. Wizard walked end to end. Closed-show Enter CTA **not** re-walked — see gap 1                              |
| 3   | Pay entry fees                   | **Yes**     | `exhibitor@`      | Completed in sandbox. Money exact on five surfaces; confirmation immediate. **But an existing unpaid entry is reported paid — E38**  |
| 4   | View entry status                | **Yes**     | both              | Status buckets reconcile exactly (`257 = 2 + 255`). **Waitlist still contradicts itself — E41**                                     |
| 5   | Running order / ring assignments | **Yes**     | `exhibitor@`      | **Judge regressed to `Judge TBD` on all 1030 rows — E39.** No published run *times* in the fixtures, so ordering is still untested  |
| 6   | Announcements inbox              | **Partial** | both              | Correct empty state on both accounts; **0 announcements exist platform-wide**, so nothing else is testable                          |
| 7   | Check in on show day             | **Partial** | `exhibitor@`      | 253 `Check In` controls render and 8 entries show `checked in`. No show runs today, so the day-of path is untested                  |
| 8   | Review results                   | **Yes**     | `exhibitor@`      | **`Results 1` now derives correctly** and matches the one released class and its three placements exactly                           |
| 9   | Review statistics                | **Partial** | `exhibitor@`      | Title progress and Activity read correctly per dog. **Strip vs profile disagree — E40.** Career/Records tabs not opened             |

### Coverage gaps (not passes)

1. **Closed-show Enter CTA.** Five genuinely closed shows exist this run (`ZZ Audit - *`,
   `[E2E MYK9-336] Past Due`), so unlike 09-06 the fixture *was* available and I did not walk it.
   This is my omission, not a missing fixture — the next walk should cover it and E24/MYK9-336.
2. **Show-day check-in (task 7).** No show is running today.
3. **Announcements (task 6).** Zero announcements exist in the database; the populated state has
   still never been walked, three walks running.
4. **Published run times (task 5).** The fixtures carry no published schedule times.
5. **Dog Career / Records tabs (task 9).** Present in the tab list but my locator never opened
   them; the per-dog statistics claim rests on the Overview only.

---

## Findings

E-series continuing from **E37** (2026-09-06 walk).

| ID      | P      | Title                                                                                | Status vs prior           | Filed    |
| ------- | ------ | ------------------------------------------------------------------------------------ | ------------------------- | -------- |
| **E39** | **P1** | `Judge TBD` on all 1030 schedule rows; no judge ever renders                          | **regression of E19**     | [MYK9-494](https://linear.app/myk9-platform/issue/MYK9-494) |
| **E38** | **P1** | An order's `paid` masks an entry's `pending`: $30 of live debt reported as paid        | recurrence of MYK9-292    | [MYK9-495](https://linear.app/myk9-platform/issue/MYK9-495) |
| **E40** | P2     | Dog strip calls total entries "upcoming classes"; the dog's own page disagrees        | recurrence of the E1 family | [MYK9-497](https://linear.app/myk9-platform/issue/MYK9-497) |
| **E41** | P2     | `Waitlist 1` chip filters to `0 entries`, above `My Wait List Positions #1`            | **partial regression of E32** | [MYK9-498](https://linear.app/myk9-platform/issue/MYK9-498) |
| **E42** | P3     | `Confirmation #` is a Stripe `pi_…` on success and `MK9-000113` on My Shows            | new                       | [MYK9-499](https://linear.app/myk9-platform/issue/MYK9-499) |
| **E43** | P3     | Breed is optional when adding a dog but required by the registration classes gate on   | new                       | [MYK9-500](https://linear.app/myk9-platform/issue/MYK9-500) |

Parent for the P2/P3 group: **[MYK9-496](https://linear.app/myk9-platform/issue/MYK9-496)**.

---

### E39 — The judge vanished from every exhibitor schedule row · **P1** · regression · [MYK9-494](https://linear.app/myk9-platform/issue/MYK9-494)

Reproduced **2/2** in fresh contexts, measured with **no navigation after load** so nothing
could have been aborted by the harness.

On `/shows/dededede-…0010` (Heartland), signed in as `exhibitor@`:

```
Willow · Interior Advanced
Saturday Trial · Judge TBD
```

| Measured                          | Count    |
| --------------------------------- | -------- |
| `Judge TBD`                       | **1030** |
| any rendered judge name           | **0**    |
| `Test Judge`                      | **0**    |

**Ground truth — the judges exist and are confirmed.** Five of Heartland's ten classes hold
`judge_assignments` rows with `status = 'confirmed'` for **Test Judge**, including
`Interior Advanced` on Saturday Trial, the exact row shown above:

| Class                          | Trial                       | Assignment status |
| ------------------------------ | --------------------------- | ----------------- |
| Container Novice A             | Saturday Trial              | **confirmed**     |
| Exterior Excellent             | Saturday Trial              | **confirmed**     |
| Interior Advanced              | Saturday Trial              | **confirmed**     |
| Buried Master                  | Sunday Trial                | **confirmed**     |
| Interior Novice B              | Sunday Trial                | **confirmed**     |
| (5 others)                     | ASCA / UKC Sunday trials    | none — `Judge TBD` is correct for these |

**The data reaches the browser.** On the same load, with no navigation afterwards:

```
200  /rest/v1/judge_assignments?select=id,person_id,show_id,trial_id,class_id,status,…   body 10,307 bytes
200  /rest/v1/classes?select=id,trial_id,name,description,level,element,…                body 38,171 bytes
```

So this is not a failed or aborted request. The rows arrive and the name still cannot resolve.

**Cause.** `supabase/migrations/20260912234500_drop_classes_judge_name.sql` runs
`ALTER TABLE public.classes DROP COLUMN judge_name;` and is **applied to the live database**
(present in `supabase_migrations.schema_migrations`, dated 2026-09-12 — yesterday). The
exhibitor's timeline still resolves the judge from that column:

```ts
// apps/myk9show/src/services/database/trials/timeline.ts:97-105
if (cls.judgeFirstName || cls.judgeLastName) { … }
if (!cls.judgeName) return { firstName: null, lastName: null };
```

`getShowScheduleTimelineRows` prefers the **replication-backed** path
(`replicatedClassesTable.getClassesByTrial`), and the replicated class row carries none of
`judgeFirstName`, `judgeLastName` or `judgeName` — `grep -rn judgeFirstName packages/*/src`
returns nothing. The PostgREST fallback in the same file (line 176) *does* embed
`judge_assignments`, but `readWithReplicationFallback` only falls back **on a throw**, and a
well-formed row with a null judge is not a throw. This is the "an empty result is not evidence of
emptiness" family the task file warns about, and the reason the fallback that would have saved
this never fires. `CompactScheduleTimeline.tsx:61` then renders `row.judgeName || 'Judge TBD'`.

Migration `20260912211500_get_show_judges_for_public_surfaces` landed immediately before the drop
and looks like the intended replacement; nothing on this surface calls it.

**Why P1.** Task 5 of `docs/roles/exhibitor.md` is "view the published running order and ring
assignments", and the judge is what an exhibitor plans a trial day around. It is also a *silent*
loss: `Judge TBD` is a plausible-looking state, so nobody reading the screen would know the
platform has the answer and is discarding it.

---

### E38 — An order's `paid` masks an entry's `pending`: $30 of live debt reported as paid everywhere · **P1** · [MYK9-495](https://linear.app/myk9-platform/issue/MYK9-495)

Reproduced **2/2** in fresh contexts.

**The debt is real, current and payable.** Read back from the browser *as the signed-in
exhibitor* (my privileged MCP connection cannot see this view at all — see Corrections):

```json
{"id":"fdf15504-…","entry_status":"submitted","payment_status":"pending","entry_fee":30.00,
 "is_own_entry":true,"registration_id":"dededede-…0070","armband":null}
```

It is the **only** unpaid own entry. The show (`Heartland Scent Work Classic`) is `published`,
`entry_close_date` is **2026-11-24** — 72 days out — and its club holds a `club_stripe_accounts`
row with `payouts_enabled`. The repo's own lifecycle vocabulary is explicit that this state owes
money: `apps/myk9show/src/types/entry-lifecycle.ts:8` — `'submitted', // Submitted, awaiting payment`.

**Every exhibitor money surface says it is paid.**

| Surface                       | What it says                                        |
| ----------------------------- | --------------------------------------------------- |
| My Shows fee card             | `ENTRY FEES · Paid in full`                          |
| My Payments                   | `Amount due $0.00` · *"Current entries are paid up."* |
| The card containing the entry | badge **`Paid`**, with a `Receipt` link              |
| Whole-page census             | `$30.00` **0** · `due of` **0** · `Payment Due` **0** · `Finish Payment` **0** |

Badge census across all 257 cards: `Paid` 255, `Partial Refund` 2, `Pending review` 1. **Not one
card carries an unpaid marker of any kind.**

**And the cart simultaneously offers to charge it.** In the same session, `/cart`:

```
Your Cart · Entering: Heartland Scent Work Classic
1 Entry · Juni (Border Collie) · Interior Advanced Preliminary · Advanced · $30.00
Total $32.10        [Pay $32.10 and confirm entry]
```

with the nav cart badge reading **`1`**. `entry_cart_items` confirms it is the same dog and the
same class as the unpaid entry (`dog dededede-…0043`, `class dec1a55e-…0040`), created 60 seconds
before the entry row.

**Mechanism — confirmed by code reading, consistent with every observation.**
`apps/myk9show/src/features/payments/entryBalanceSummary.ts:128`:

```ts
const paymentStatus = row.registration?.payment_status ?? row.payment_status ?? 'pending';
```

The order-level status wins unconditionally. `USER_ENTRIES_SELECT` embeds
`registration:registration_id (…, payment_status, …)`, and enrollment `dededede-…0070` is:

```
payment_status = 'paid'   paid_amount = 0.00   confirmation_number = MK9-000113
5 entries, of which 1 is payment_status='pending'   (entry statuses: paid, pending)
```

So one `paid` order silently marks all five of its entries paid, including the one that is not.
A partially-paid order is not exotic — it is exactly what
`8b261f81c fix(payments): keep recovered entries payable when full` exists to handle. The same
coalesce appears in two more places, one of them secretary-facing, so the debt may be hidden from
the secretary's attention list too:

- `apps/myk9show/src/utils/entryManagementUtils.ts:56` — `getEffectivePaymentStatus`
- `apps/myk9show/src/features/entry-operations/attentionClassification.ts:97`

**Why P1 on either reading.** The two states cannot both be true, and each is a money defect:

1. The entry is genuinely unpaid → the exhibitor owes $30 that **no** surface will admit, cannot
   discover, and has no affordance to settle. That is the silent limbo `docs/roles/exhibitor.md`
   task 4 forbids, on the platform's most trust-sensitive axis.
2. The entry is genuinely paid and the row is stale → the cart is about to take **$32.10 for a
   class this dog is already entered in**.

`AmountDueSection.tsx` carries `// INTENT: an exhibitor who owes money must never face a dead
end`. This is a dead end one level deeper than the one that comment was written for: not a broken
button, but a balance that reports zero.

**Relationship to MYK9-423 (E37, still In Progress).** That issue is the `$90` balance whose
`Finish Payment` landed on `Your cart is empty`. It did not reproduce this run — and the reason is
this finding. There is no `Finish Payment` control anywhere any more (0 occurrences) because
`amountDue` is now `$0.00`. **The dead end was not fixed; the debt was hidden.** Worth saying
plainly on MYK9-423 before it is closed.

---

### E40 — The dog strip calls total entries "upcoming classes"; each dog's own page disagrees · P2 · [MYK9-497](https://linear.app/myk9-platform/issue/MYK9-497)

Reproduced **2/2**. On My Shows the dog strip states an upcoming-class count per dog; the dog's
own page states a different number for the same dog at the same moment.

| Dog        | My Shows strip           | Dog page (`/dogs/<id>`)   | DB: unscored (genuinely to run) | DB: scored | Strip correct? |
| ---------- | ------------------------ | ------------------------- | ------------------------------- | ---------- | -------------- |
| **Willow** | `3 upcoming classes`     | `1 entry this season`     | **1**                           | 2          | **no**         |
| **Ranger** | `3 upcoming classes`     | —                         | **2**                           | 1          | **no**         |
| **Scout**  | `2 upcoming classes`     | —                         | **1**                           | 1          | **no**         |
| Juni       | `2 upcoming classes`     | —                         | 2                               | 0          | coincidentally |
| Maple      | `2 upcoming classes`     | —                         | 2                               | 0          | coincidentally |

The strip number equals **total entries** for all five dogs. It is right only for dogs with
nothing scored yet. Willow's page is the correct one — it lists exactly one upcoming run
(`SAT Oct 24 · Heartland Scent Work Classic · Interior Advanced · Accepted — you're in`) while
the strip promises three, two of which have already run and one of which **won its class**.

This is the **E1 shape** from the 2026-07-02 audit ("a dog card said '1 upcoming class' while the
dog's own profile said 'No upcoming entries'"), inverted: the card now overcounts rather than
undercounts. P2 rather than P1 because every per-entry detail is correct once opened and no money
or entry validity is affected — but "how many runs does my dog still have" is a show-day planning
number, and it is wrong for every dog that has competed.

---

### E41 — `Waitlist 1` filters to `0 entries`, directly above `My Wait List Positions #1` · P2 · partial regression of E32 · [MYK9-498](https://linear.app/myk9-platform/issue/MYK9-498)

Reproduced 2/2. Clicking the `Waitlist` status chip renders, on one screen:

```
Waitlist
1                      <-- the chip count

0 entries              <-- the filtered list

My Wait List Positions
#1
Juni
Interior Advanced · Heartland Scent Work Classic
[Withdraw]
```

**Ground truth.** `waitlist_entries` holds exactly one row and it is that one. The chip is right;
the list is wrong.

**What MYK9-417 fixed and what it left.** The 09-06 walk found `Waitlist 0` plus the prose *"No
waitlisted entries … Nothing to do here right now."* Both of those are genuinely gone: the count
now reads `1` (reconciled against `waitlist_entries`) and the false prose no longer renders. What
remains is the filtered list, which still comes from `filterEntriesByStatus` →
`isWaitlistEntry` → `getOperationalEntryState`, derived from the `entries` table where Juni's row
is `entry_status='submitted'` and can never match.

The result is that the fix **broke the invariant it was built on**. `filterEntriesByStatus`
carries:

> *Kept as one function so the filtered list and the tab counts can never drift apart — they are
> the same question asked about different sets.*

Before the fix, count and list agreed and both were wrong. Now the count is right, the list is
wrong, and they contradict each other on the same screen.

Rated P2, not P1 like its parent: the true information is immediately visible below the false
count, so the exhibitor is confused rather than misinformed about whether they hold a waitlist
place.

---

### E42 — `Confirmation #` means two different things · P3 · [MYK9-499](https://linear.app/myk9-platform/issue/MYK9-499)

The checkout success page, immediately after a real sandbox payment:

```
Entry Submitted Successfully!
Confirmation #
pi_3UF9ChAIej2Q9UtX1elHiNxh
Save this number for your records
```

The My Shows card for the Heartland order, same account:

```
Confirmation # MK9-000113
```

So the field an exhibitor is explicitly told to keep is a raw Stripe PaymentIntent id on one
surface and a `MK9-` number on another. Only the second is a myK9 identifier the club or the
secretary could act on; the first is an internal payment-processor id that appears nowhere else
in the exhibitor's own records. `enrollments.confirmation_number` is the column that holds the
real thing.

---

### E43 — Breed is optional when adding a dog and required by the registration every class gates on · P3 · [MYK9-500](https://linear.app/myk9-platform/issue/MYK9-500)

The `Add New Dog` dialog's **Essential** tab offers exactly `Call Name*`, `Date of Birth*` and a
sex picker — no breed. A dog created there stores `breed = ''` and the wizard renders it as
`Breed not set`.

Every class on `MYK9-109 Load Show 1` then refuses selection with *"Add this dog's AKC
registration before selecting this class."*, and the inline `Add New Registration` form it opens
**requires** a breed:

```
REGISTERED BREED* (REQUIRED)
Select breed
Please select a breed.
```

So the exhibitor is stopped three steps into entering a show by a required field the dog-creation
flow never asked for, and the failure surfaces only after they have chosen an organization and
typed a registration number. Small, but this is a first-entry path and the role's whole premise
is low computer-confidence. The fix is a link, not a page: ask for breed on the Essential tab, or
prefill it from the registration form back onto the dog.

---

## Prior findings re-verified

**Resolved — confirmed in the browser, not merely merged.**

| Prior                                                   | Verdict              | Evidence                                                                                                                              |
| ------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **E9** / MYK9-289 — exhibitor routes never settle       | **RESOLVED** (holds) | **0 unsettled** requests on all 6 routes, on **both** accounts. The only non-2xx are 3 abort-on-navigate probes my own script caused  |
| **E27** / MYK9-380 — guests get "Show Not Found"        | **RESOLVED** (holds) | Genuine guest context: `/shows` renders all 4 shows, no sign-in wall; direct nav to a show detail renders, 0 unsettled, 0 failed       |
| **E33** / MYK9-419 — tab hard-coded to `Results 0`      | **RESOLVED**         | Now reads `Results 1`, and exactly one class (`Container Novice A`) has `results_released_at` set with exactly 3 placements            |
| **E34** / MYK9-420 — "Receipt" destination had no money | **RESOLVED**         | Destination now contains `$32.10` and `Sep 13`; link is order-scoped with `aria-label="Receipt for MYK9-109 Load Show 1 in My Shows"`  |
| **E36** / MYK9-422 — breed picker had no listbox        | **RESOLVED**         | Breed popup now exposes `role="listbox"` and **213** `role="option"` children (was 0)                                                  |
| **E35** / MYK9-421 — `Browse All` badge 4 vs 8          | **RESOLVED**         | A single `Browse All 4` control, and 4 shows render. The flipping second tab is gone                                                   |
| MYK9-369 — no search across a 252-dog picker            | **RESOLVED**         | Wizard step 1 has a search; `260 of 260 dogs shown` → `1 of 260 dogs shown`                                                            |
| **E13** / MYK9-367 — wizard quotes less than the cart   | **RESOLVED** (holds) | Wizard `$32.10` = cart `$32.10` = Stripe `$32.10` = `stripe_orders.amount_cents 3210` (`3000 + 210`)                                   |
| **E31** / MYK9-294 — confirmation can't find payment    | **RESOLVED** (holds) | Returned to `/checkout/success?session_id=cs_test_b1VgK1VC…` — the real id; **0** occurrences of `%7BCHECKOUT_SESSION_ID%7D`          |
| MYK9-428 — refunds resolved from one derivation         | **RESOLVED** (holds) | `$642.00 − $112.35 = $529.65` before; `$674.10 − $112.35 = $561.75` after my `$32.10` payment. Exact on both readings                 |
| **E17** — entries in no status bucket                   | **RESOLVED** (holds) | `Any status 257 = Pending 2 + Accepted 255`; `All 257 = Upcoming 256 + Completed 1`; 257 = the 257 distinct (show, dog) groups in SQL   |
| MYK9-218 / MYK9-290 — unbounded / truncated lists       | **RESOLVED** (holds) | Dogs paginate; My Shows renders 257 cards with no timeout and counts computed over the full set                                        |

**Regressed:** E19 / MYK9-381 (`Judge TBD`) — filed as **E39**.

**Partially fixed:** E32 / MYK9-417 (waitlist) — filed as **E41**.

**Masked rather than fixed:** E37 / MYK9-423 — see the note at the end of E38. Commented on the
issue rather than filed again.

**Not reachable this run:** E4, E7, E8, E23, MYK9-245, MYK9-208, MYK9-122, MYK9-196 — no fixture
state exercises them. **E24 / MYK9-336** (closed-show cart) *was* reachable this run and I did not
walk it; recorded as coverage gap 1, not a pass. **E20 / MYK9-386**'s fixture (a club with no
Stripe account) still exists on Load Shows 2 and 3 and was not re-walked.

**Credential note:** both accounts sign in with `E2E_DEMO_EXHIBITOR_PASSWORD`. `exhibitor2`'s
empty states are truthful and well written on all four routes walked:

> `/exhibitor/entries` — *"Welcome! Let's get you set up · Add your dog once and we'll remember the details — entering a show takes about 30 seconds from here on."*
> `/dogs` — *"No dogs yet. Add your first dog to start tracking titles, training, and health records."*
> `/exhibitor/payments` — *"$0.00 · Current entries are paid up. · No payments yet."*
> `/notifications` — *"No notifications yet · Entry confirmations, Qs earned, and schedule updates will appear here."*

---

## Corrections to my own measurement

Eight first readings were wrong. **Two of them were fully drafted findings that do not exist**,
and both were killed by the same discipline: re-run it in one continuous context, and check what
your locator actually matched.

1. **A phantom P1: "the wizard says `In cart` while `/cart` says empty."** I had this written up as
   E37's shape reached from the wizard. It was **my own second click**. Driven properly in one
   continuous context it is completely coherent: click → `In cart`, `1 selected`, `Next` enabled,
   toast *"Added to cart"*, and `/cart` showing `$32.10`. My earlier runs had clicked the same
   checkbox across separate invocations, toggling the item **out** of the cart, and `entry_carts`
   also carries a 30-minute `expires_at` that made an untouched cart read as empty. Two
   independent artefacts stacking into a convincing false positive.

2. **A phantom P2: "a required breed is discarded on save."** My first read of
   `dog_registrations.breed` returned `""` right after a submit the dialog had *refused* until I
   picked `Labrador Retriever`. A later read of the same row returns `Labrador Retriever`. I
   cannot account for the difference between the two reads, and the current state is correct — so
   there is no defect to file. Recorded here rather than quietly dropped.

3. **My privileged MCP connection sees 0 rows in `view_authenticated_entry_results`.** My first
   attempt to check the unpaid entry against that view returned `[]`, which I briefly read as "the
   view excludes this row" — the mechanism for E38. It is `auth.uid()`-scoped, so it returns
   **nothing at all** over MCP (`select count(*)` = 0). The real measurement had to be taken from
   inside the browser as the signed-in exhibitor, with the anon key as `apikey` and the session
   JWT as the bearer. A privileged connection is not a superset of the user's view here.

4. **"Receipt on My Payments is inert text."** I matched the only node whose exact text is
   `Receipt` — the table's **`THEAD` column header**. The real control is an `<a>` in each row
   whose accessible name is its `aria-label` (*"Receipt for MYK9-109 Load Show 1 in My Shows"*),
   which is why `getByRole('link', {name: /^Receipt$/})` returned 0 and I twice concluded the
   affordance was missing. The aria-label is good practice; my locator assumed the visible text.

5. **`getByText('Female', {exact:true})` clicked a badge on a dog card behind the dialog.** The
   sex picker is portalled outside `[role="dialog"]`, and its options' accessible names carry a
   symbol — `Female ♀` — so the scoped `getByRole('option', {name:'Female'})` matched nothing and
   the unscoped text locator found a pink `Female` badge on an unrelated dog. Exactly the
   page-wide-locator hazard the task file warns about for destructive clicks, and the *third*
   consecutive walk to hit it on a picker. The sex picker itself is correct: `role="listbox"` with
   2 `role="option"`.

6. **`/^Select\b/` matched the wizard stepper, not a class.** It resolved to
   `"Select DogsChoose which dogs to registerDone"` — the step-1 breadcrumb. The class control is
   a **checkbox inside a `<label>`** with an `sr-only` "Select" span, so no button exists to
   match. I only found this by dumping the ancestor chain of the `Container` text node.

7. **"`exhibitor2` has 15 failing requests."** I flagged this as suspicious against
   `exhibitor@`'s 3. It is 5 navigations × the same 3 `ERR_ABORTED` probe requests
   (`trials`, `classes`, `judge_assignments` — all `?select=id`), aborted on unmount **by my own
   script navigating away**. Not a defect, and the count scales with how many routes I visited.

8. **A near-miss on E39 itself.** `judge_assignments?select=id` appears in that aborted set, which
   would have been a tidy and wrong explanation for `Judge TBD`. I re-measured with **no
   navigation after load** and the full `judge_assignments` select returns **200 with 10,307
   bytes**. The data arrives; the diagnosis had to move to the dropped column.

**Method note.** Every finding in this report was re-run in a **second fresh browser context**
before being written down. E38, E39, E40 and E41 all reproduced 2/2.

---

## Safe-mutation accounting

Counts asserted before and after every mutation.

| Object                                       | Action                                  | Verified                                                                                     |
| -------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| Dog `ZZ Walk Dog 2026-09-13` (`083b893f-…`)  | created via the UI                      | `dogs` live 259 → **260**; `sex=female`, `date_of_birth=2021-05-05` exactly as entered       |
| `dog_registrations` `5ace6d94-…`             | created via the wizard's inline form    | AKC, `SR09132026`, breed `Labrador Retriever`; correctly unblocked class selection            |
| Entry `e1e10e1d-…` · `Load 1 Class 1`        | created and **paid**                    | entries live 1272 → **1273**; `entry_status=paid`, `payment_status=paid`, `entry_fee=30.00`  |
| `stripe_orders` `bc7b6255-…`                 | created by the sandbox payment          | `succeeded`, `amount_cents=3210` (`3000 + 210`, rate 7.00), `paid_at 2026-09-13 08:56:08Z`   |
| `entry_carts` `e3981937-…`                   | transitioned by checkout                | `active` → `submitted`, carrying `cs_test_b1VgK1VC…`                                          |
| Load Show 1 class cart toggles               | added / removed while probing            | Net zero — that cart is `submitted`; no stray active cart for that show                       |

**The payment gate was mechanical, as required.** Two separate attempts aborted **before typing
any digits** because the URL was not yet a Stripe session — the first printed
`ABORTING PAYMENT: could not prove a cs_test_ session from the URL. No card digits typed.` when
`Submit & pay` turned out to hand off to `/cart` rather than Stripe. The run that paid asserted
`cs_test_` present **and** `cs_live_` absent first. No live-mode page ever received input. Only
the card number documented in the task file was used.

**Residue, and it cannot be cleaned up by this walk.** `ZZ Walk Dog 2026-09-13` holds a paid
entry, so `soft_delete_dog` refuses (correctly — the 09-06 walk verified that refusal surfaces the
`MK002` reason to the user), and withdraw/refund are outside this walk's mutation boundary. The
task file's instruction to "soft-delete the entry and dog at the end" **cannot be satisfied by any
walk that also completes a payment** — the two requirements are in direct conflict, and this is
now the third consecutive walk to leave a `ZZ Walk Dog <date>` behind for this reason
(`2026-09-06` and `2026-09-01` are still present). Visible accumulation: My Payments now lists
**15 payments**, and `stripe_orders` keeps growing with sandbox objects that no reseed removes.
Recorded on [MYK9-388](https://linear.app/myk9-platform/issue/MYK9-388).

**I did not touch the pre-existing Heartland cart item** (`edc3b395-…`, created 2026-09-12 18:52,
before this run) — it is another agent's fixture and it is the subject of E38. No withdraw or
refund was attempted. Every destructive click was anchored to the row that owns it, every dialog
submit was scoped to `[role="dialog"]`, and the dialog's presence was asserted before being
reached into. No source edits, PRs, merges, migrations or function deploys were made; the only
repo write is this report.

---

## A process note on filing

The task file specifies labels `p0` / `p1`, `source:claude` and `walk:exhibitor`. **None of those
labels exist in this workspace** — `list_issue_labels` for team MyK9-platform returns
`Claude`, `Codex`, `Bug`, `Feature`, `Improvement`, `Test`, `Parked`, `Human Tester`,
`Wait for Launch`, `needs-richard`, and the three `auto:*` labels. Every prior exhibitor walk used
`Claude` + `Bug` plus Linear's own priority field, and a `walk:exhibitor` query returns zero
issues. I followed the established convention rather than creating three new labels, which would
be a shared-system change this walk has no mandate to make. Severity is carried in the priority
field: P1 → Urgent/High, P2 → Medium, P3 → Low.
