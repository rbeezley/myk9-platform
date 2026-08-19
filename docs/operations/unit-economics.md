# Unit Economics & Break-Even

> **Status:** Reference

What one entry actually earns the platform, what it costs to keep the platform
running, and how many entries a month clear the difference. Written 2026-08-18
against the fee logic in the tree at that date — re-derive rather than trust the
numbers if `platform_settings.platform_fee_percent` or the Stripe contract has
moved since.

Every dollar figure here is a **model**, not a measurement. The platform has no
real users yet, so nothing below has been observed. The formulas are the durable
part; the inputs are assumptions and are labelled as such.

---

## 1. How a charge is actually structured

Three properties of the implementation drive everything downstream. Confirm each
against the code before reusing this model, because changing any one of them
invalidates section 3.

| Property                                             | Where                                                                                                                                                              | Consequence                                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| The platform fee is **added on top**, not carved out | [`stripe-checkout/index.ts`](../../apps/myk9show/supabase/functions/stripe-checkout/index.ts) pushes a separate `Platform Fee` line item                           | The club receives the full entry fee; the exhibitor pays entry + 7%                                            |
| **Separate charges and transfers**                   | Charge lands on the platform; [`cron-process-payouts`](../../apps/myk9show/supabase/functions/cron-process-payouts/index.ts) calls `stripe.transfers.create` later | The platform is merchant of record and pays Stripe's fee on the **whole** charge, including the club's portion |
| Connected accounts are **Express**                   | [`stripe-connect-onboard/index.ts`](../../apps/myk9show/supabase/functions/stripe-connect-onboard/index.ts) — `type: 'express'`                                    | Adds a per-active-account monthly fee that scales with **clubs**, not entries                                  |

The fee percent is authoritative from the `platform_settings` singleton, falling
back to the `PLATFORM_FEE_PERCENT` secret and then to the `DEFAULT_FEE_PERCENT`
of 7 in [`_shared/platformFee.ts`](../../apps/myk9show/supabase/functions/_shared/platformFee.ts).
It was raised 3 → 7 on 2026-06-10 precisely because 3% did not cover Stripe.

---

## 2. The formula

For a single checkout of `N` entries:

```
  N  = entries in one checkout (cart size)
  E  = entry fee, dollars              (club keeps this)
  p  = platform fee fraction           (0.07)
  s  = Stripe percentage fraction      (0.029 US domestic card)
  f  = Stripe flat fee, dollars        (0.30 per transaction)

  customer pays        C    = N·E·(1 + p)
  Stripe takes              = s·C + f
  club receives             = N·E
  platform net         Net  = p·N·E − s·N·E·(1 + p) − f

  net per entry             = E·( p − s·(1 + p) ) − f/N
```

**The flat `f` is per checkout, not per entry.** That single fact is the most
important thing in this document: it makes the platform's effective take rate a
function of cart size, which no pricing page shows and which is easy to model
wrongly by reasoning about one entry in isolation.

Two derived quantities worth keeping:

- **Asymptotic take rate** (large carts): `p − s·(1+p)` = 3.90% at s=0.029, 3.26% at s=0.035.
- **Minimum viable entry fee** for a one-entry cart to break even:
  `E > f / (p − s·(1+p))` = **$7.70** at s=0.029. Below that, single-entry carts
  lose money on every transaction.

---

## 3. Net per entry at E = $25

Two Stripe columns. 2.9% + 30¢ is the published US domestic-card rate and is the
right base case. 3.5% is a stress case — you reach it with a meaningful share of
international cards (+1.5%) or as deliberate padding.

|    Entries per cart | Customer pays | Net @ 2.9% + 30¢ | Take rate | Net @ 3.5% + 30¢ | Take rate |
| ------------------: | ------------: | ---------------: | --------: | ---------------: | --------: |
|                   1 |        $26.75 |           $0.674 |     2.70% |           $0.514 |     2.06% |
|                   2 |        $53.50 |           $0.824 |     3.30% |           $0.664 |     2.66% |
|                   3 |        $80.25 |           $0.874 |     3.50% |           $0.714 |     2.86% |
| **4–5** _(typical)_ |       $107.00 |       **$0.899** | **3.60%** |       **$0.739** | **2.96%** |
|                   9 |       $240.75 |           $0.941 |     3.76% |           $0.781 |     3.12% |
|                   ∞ |             — |           $0.974 |     3.90% |           $0.814 |     3.26% |

**Working number: $0.74 – $0.90 net per entry.**

The 4–5 row is the one to plan against. [`sms-10dlc-registration.md`](sms-10dlc-registration.md)
establishes ~4.5 entries per exhibitor per trial day (1–2 dogs × 2–4 classes) as
the volume basis, and a cart is normally one exhibitor entering one trial. That
figure is itself an assumption; it is the highest-value thing to replace with a
measurement once real carts exist.

### The cart-size lever

Moving the average cart from 1 entry to 4 raises net per entry by **33%** with no
price change. Anything that encourages entering every dog and class in one
checkout — rather than one entry at a time — is directly margin-accretive, and is
cheaper to build than a fee increase is to justify to clubs.

### The right instrument: a flat per-checkout component

The fee is a pure percentage; Stripe's cost is percentage **plus a flat 30¢**. That
mismatch is the whole reason the take rate moves with cart size. Recover the flat
cost with a flat component and the dependency disappears:

```
fee = (percent × subtotal) + $0.30 per checkout
```

| Entries per cart | Net today | With +$0.30 flat | Take rate |
| ---------------: | --------: | ---------------: | --------: |
|                1 |    $0.674 |       **$0.966** |     3.86% |
|                2 |    $0.824 |           $0.970 |     3.88% |
|                4 |    $0.899 |           $0.972 |     3.89% |
|                9 |    $0.941 |           $0.973 |     3.89% |

Net per entry is now flat at ~$0.97 regardless of `N`. On a 4-entry cart the
addition is $0.30 on $107 — 0.28%, invisible.

**A minimum fee floor is a different instrument for a different problem.** It
protects against cheap entries, not small carts, and at 7% it only binds below a
$14.29 subtotal — so a $1.00 floor does **nothing** at a $25 entry, where the fee
is already $1.75. It earns its place further down: at a $10 entry a one-entry cart
nets $0.09 today and $0.38 with the floor. Adopt it as a guard for fun matches and
single-class entries, not as the single-entry-cart fix.

Neither is implemented. Both helpers are pure percentage and `platform_settings`
has only `platform_fee_percent`. Tracked as **MYK9-197**, which also documents why
this is an atomic five-site change rather than a one-liner — the fee expression is
duplicated between the server and the client cart preview, and a 1¢ divergence
triggers checkout drift-healing rather than a rounding error.

---

## 4. Cost base

Confidence column: **Wired** = the integration exists in this repo and will bill.
**Certain** = published list price. **Estimate** = needs a real quote.

### Infrastructure

| Item                         | Monthly | Confidence | Note                                                                                                      |
| ---------------------------- | ------: | ---------- | --------------------------------------------------------------------------------------------------------- |
| Supabase Pro                 |     $25 | Certain    | Includes $10 compute credit                                                                               |
| Supabase compute above Micro |   $5–50 | Estimate   | Staging has already exceeded 80% CPU on ringside OCC conflict storms                                      |
| Supabase PITR (7-day)        |    $100 | Certain    | Not currently purchased. See MYK9-110 — backup/DR posture is one sentence in a rollback table             |
| Vercel Pro                   |     $20 | Certain    | Per seat                                                                                                  |
| Resend Pro                   |     $20 | Certain    | Free tier is 3,000/mo **and 100/day** — a show opening breaches the daily cap, not the monthly one        |
| Twilio fixed                 |   $3.15 | Certain    | Number $1.15 + 10DLC campaign ~$2; one-time brand registration extra                                      |
| Twilio usage                 |  $19–42 | Estimate   | ~$0.0109 all-in per SMS; range is 40%–100% opt-in at 2 shows/mo                                           |
| Sentry                       |   $0–26 | Certain    | Free ≤5k errors, Team $26. `SENTRY_DSN` is live                                                           |
| **Anthropic API**            |  $10–40 | **Wired**  | `ANTHROPIC_API_KEY` — `ask-myk9show` (Haiku 4.5), `ask-operator-support`, `generate-premium` (Sonnet 4.6) |
| **Google Maps Static**       |   $0–20 | **Wired**  | `GOOGLE_MAPS_STATIC_API_KEY` — 10k loads/mo free, then ~$2/1,000                                          |
| Domain + Workspace email     |      $9 | Certain    |                                                                                                           |

### Stripe, beyond the per-charge percentage

These are the costs most often left out of a take-rate model, because they are
not proportional to revenue.

| Item                        | Cost                        | Scales with | Note                                                                                                                                                              |
| --------------------------- | --------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Express active-account fee  | ~$2/mo per _active_ account | **Clubs**   | Billed on months with activity, so a dormant club is likely $0 — **verify this on the dashboard**; it is the difference between ~$40/mo and near-zero at 20 clubs |
| Payout to connected account | ~0.25% + $0.25              | Payouts     | Region and plan dependent — verify                                                                                                                                |
| Dispute / chargeback        | $15 each                    | Incidents   | ≈ **17 entries of profit** per dispute at $0.90                                                                                                                   |
| Refund processing fee       | Not returned                | Refunds     | Stripe keeps its cut on a refund, permanently                                                                                                                     |

### Business overhead

Not optional for a platform that moves other people's money, and routinely
omitted from software cost models.

| Item                                      | Monthly (amortized) | Note                                                    |
| ----------------------------------------- | ------------------: | ------------------------------------------------------- |
| Entity + registered agent + annual report |              $10–25 | EIN itself is free                                      |
| E&O / cyber liability insurance           |             $50–125 | Estimate — get a real quote                             |
| Accounting, tax prep, 1099-K handling     |             $50–150 |                                                         |
| Attorney review of TOS + privacy          |      one-time $1–3k | Already flagged as outstanding in the legal docs        |
| Apple ($99/yr) + Google ($25 once)        |                 $10 | Only if the PWA goes to the stores                      |
| Sales tax on the platform fee             |              Varies | Taxable as a service in some states — confirm per state |

### Scenarios

| Scenario             | Contents                                                                         |   Monthly |
| -------------------- | -------------------------------------------------------------------------------- | --------: |
| **A — Bare infra**   | Supabase Pro, Vercel, Resend, Twilio fixed, free Sentry, light Anthropic, domain |  **~$80** |
| **B — Launch-ready** | A + PITR, Small compute, Sentry Team, Twilio usage, Maps, 15 Express accounts    | **~$290** |
| **C — Full cost**    | B + insurance, accounting/legal, developer tooling                               | **~$565** |

---

## 5. Break-even

`entries per month = fixed monthly cost ÷ net per entry`

| Scenario         | Fixed/mo | @ $0.90/entry | @ $0.74/entry | Trial days¹ |
| ---------------- | -------: | ------------: | ------------: | ----------: |
| A — Bare infra   |      $80 |    89 entries |           108 |         0.1 |
| B — Launch-ready |     $290 |   322 entries |           392 |         0.4 |
| C — Full cost    |     $565 |   628 entries |           764 |         0.7 |

¹ At the ~900 entries per 200-exhibitor trial day basis from
[`sms-10dlc-registration.md`](sms-10dlc-registration.md).

**Break-even is under one modest show per month.** A single 200-exhibitor
two-day trial is ~1,800 entries ≈ $1,620 gross, clearing scenario C with about
$1,050 left. Ten shows a month is ~9,000 entries ≈ $8,100 gross, ~$7,500 net.

The shape is the ordinary SaaS one: marginal cost per entry is effectively zero
because every line in section 4 is flat-rate until an order of magnitude more
volume, while marginal revenue is $0.90. Brutal below break-even, near-pure
margin above it.

**The operational consequence: do not optimize infrastructure cost.** Cutting
$30/mo from the hosting bill is worth 33 entries. Signing one club that runs one
show is worth 900. Effort goes to club acquisition, not cost engineering.

---

## 6. What actually threatens the margin

Not volume. Break-even is under one show a month; the model clears it on the first
real club. What follows is ordered by expected cost, which is **not** the order a
first pass through this model suggests — the two items that look alarming
(post-payout refunds, the per-club Stripe fee) are the two that turn out to be
small, and the one with no code guard at all is the one that matters.

### a. Disputes — the only uncapped, unguardable loss

`handleDisputeCreated` in
[`stripe-webhook`](../../apps/myk9show/supabase/functions/stripe-webhook/index.ts)
is alert-only by design ("Alert-only for v1; dispute handling stays manual"). That
is the correct design: a cardholder dispute is raised by the bank, pulls the full
amount **plus a $15 fee** from the platform balance whenever it arrives, and there
is no point at which the platform can decline it. Unlike refunds, no guard is
possible. Prevention and evidence are the only levers.

One dispute costs ~17 entries of profit in fees alone; a disputed 4-entry cart is
~120 entries.

The cheapest prevention is unbuilt: **no statement descriptor is set anywhere in
the repo.** Charges reach the cardholder's statement under the platform account's
default name rather than the club's or show's, because the platform is merchant of
record. An exhibitor who entered "Cascade Kennel Club Fall Trial" sees an
unfamiliar name weeks later and calls the bank — the most common chargeback class
in event registration, and one field on a `payment_intent_data` object that both
session-creating functions already pass. Tracked as **MYK9-196**.

The evidence half is in better shape: `formatWithdrawalPolicy.ts` and
`WithdrawalPolicyCard.tsx` already disclose that service fees are non-refundable,
and `stripe-refund-entry` enforces that cap in code. Disclosure plus enforcement is
what wins a dispute. Assembling that evidence under Stripe's deadline is still
manual.

### b. Per-club cost — which is time, not the Stripe fee

The Express active-account fee is the visible per-club cost and the least of it.
Twenty clubs is on the order of $40/month even on the pessimistic reading, or
~44 entries — a line item, not a risk.

The per-club cost that actually binds is **operator time**. Onboarding a club,
walking a treasurer through Stripe Connect, and being reachable during that club's
show weekend is hours, and this is a one-person operation. Twenty clubs running two
shows a year is a materially worse business than five clubs running eight — same
entry count, four times the onboarding and four times the support surface.

Two consequences worth acting on:

- **Defer Connect onboarding until a club publishes a show with paid entries.**
  Avoids creating accounts for clubs that never run one, and sidesteps the fee
  question entirely.
- **Prefer depth over breadth in acquisition.** A club running eight shows
  amortizes its onboarding eight ways.

Switching Express → Standard would remove the monthly fee, but costs the embedded
onboarding and requires each club to hold a full Stripe account. Not worth it at
this magnitude.

### c. Cart economics

Real, bounded, and worth roughly $0.07–$0.29 per entry — the exact figure depends
on a cart-size distribution nothing currently measures. Single-entry carts at
2.06–2.70% are the worst business the platform does, and the payment-request path
is structurally exposed to them.

The fix is the flat per-checkout component in section 3, **not** a minimum fee
floor. Tracked as **MYK9-197**. Instrument cart size before building: if real carts
are reliably 4+, this is worth little and can wait.

### d. Post-payout clawback — narrow, and already guarded

Worth stating plainly because the transfer architecture invites the opposite
assumption. Both
[`stripe-refund-entry`](../../apps/myk9show/supabase/functions/stripe-refund-entry/index.ts)
and [`stripe-refund-show`](../../apps/myk9show/supabase/functions/stripe-refund-show/index.ts)
read `show_payouts.status` and return 422 `payout_already_sent` /
`payout_in_progress` rather than issuing money the platform cannot recover;
`stripe-refund-show` re-checks immediately before each refund to close the race
against the cron. **The platform does not silently absorb post-payout refunds.**

The exposure window is also small: payouts fire at `end_date` + 3 days, and most
withdrawal requests arrive before a show, not four days after it ends.

What remains is operational rather than financial. A legitimate post-payout refund
has no in-app path — the guard blocks it, and completing it means a manual Stripe
dashboard refund plus a transfer reversal, with no runbook.
`cron-process-payouts` already emails exactly that instruction on a post-transfer
mismatch, which is evidence the manual procedure is real and needed. The procedure
is now written down: [`post-payout-clawback.md`](post-payout-clawback.md). The
remaining in-app path is tracked as **MYK9-195**.

---

## 7. Inputs to replace with measurements

Ranked by how much the model moves when they turn out wrong.

1. **Average cart size.** Assumed 4–5 from the SMS doc's exhibitor basis. Nothing
   measures it. Swings net per entry between $0.67 and $0.94.
2. **Average entry fee.** Assumed $25 flat. Real shows are date-tiered
   (`pre_entry_fee` / `day_of_show_fee`) and vary by registry.
3. **Refund and dispute rate.** Assumed zero throughout. Each dispute is 17
   entries; each is pure subtraction.
4. **Active connected accounts per month.** Assumed 15 in scenario B.
5. **SMS opt-in rate.** The SMS doc already names this as its largest unknown.
6. **Actual Stripe rate.** 2.9% vs 3.5% is a 19% swing in net per entry. Read it
   off a real settlement, not a pricing page, once live-mode charges exist (MYK9-11).
