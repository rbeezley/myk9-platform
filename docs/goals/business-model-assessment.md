# Business Model Assessment

> **Status:** Reference

An outside read of whether myK9Show works as a business, written 2026-08-18
alongside [`operations/unit-economics.md`](../operations/unit-economics.md). That
document answers "what does an entry earn and what does it cost to run" — the
arithmetic. This one answers "is that a business, and what is most likely to stop
it" — the judgement.

Read it as a second opinion to argue with, not a verdict. The financial inputs
come from the unit-economics model and inherit its assumptions; the market claims
are structural rather than measured, and § 7 says which ones to go verify.

---

## 1. The verdict

**Viable, at a scale worth being clear-eyed about.**

The model supports a solo living at modest market share and a small company at
high share. It does not support a venture-scale outcome. That is not a criticism —
it is a constraint that should _simplify_ decisions, because it rules out whole
categories of thinking (raising, hiring ahead of revenue, growth at negative
margin) that would otherwise consume attention.

The pricing structure is genuinely well chosen, the architecture makes the right
bet for the domain, and the engineering quality is unusual. The risk is not in any
of those. It is in § 3.

---

## 2. Break-even is the wrong number to watch

Break-even (~630 entries/month at full cost) is trivially achievable — one modest
show clears it — which makes it useless as a target. The number that matters is
what replaces an income.

At the modelled $0.90 net per entry, and ~900 entries per 200-exhibitor trial day:

| Target     | Entries/year | Trial days/yr | Active clubs¹ |
| ---------- | -----------: | ------------: | ------------: |
| Break-even |        7,600 |             8 |           1–2 |
| $60k/yr    |       67,000 |            74 |         15–20 |
| $100k/yr   |      111,000 |           123 |         25–30 |
| $250k/yr   |      278,000 |           309 |           60+ |

¹ At 2–3 shows per club per year, 2 trial days each.

**The business plan is "sign and retain about 20 clubs."** That is the whole thing.
It is concrete, it is plausible, and it is a number one person can hold in their
head and know by name. Every strategic question should be checked against it: does
this help sign or keep one of the twenty?

Two corollaries that the monthly framing hides:

- **Season, not month.** Dog-show activity clusters spring through fall,
  especially in northern climates. Annual break-even plus a reserve to carry
  winter is the real requirement.
- **Retention beats acquisition.** A club running eight shows amortizes its
  onboarding eight ways. Twenty clubs running two shows a year is a materially
  worse business than five running eight — identical entry count, four times the
  onboarding and four times the support surface.

---

## 3. The primary risk is commercial, not technical

Built pre-revenue, with zero users: Stripe Connect with separate charges and
transfers, offline-first replication with per-scope watermarks, ringside scoring,
AI natural-language query over the schema, PDF AcroForm filling for three
registries, premium subscriptions, SMS with 10DLC registration, web push, a docs
site, an admin health board with cron checks, weekly automated security audits,
and rotating role-journey UX audits.

Now the absence. `docs/` contains **no competitor analysis, no pricing research,
and no named design-partner club.** The engineering rigor is well above what most
funded startups ship. The commercial work is at zero.

### The structural tell

[`fall-2026-launch-readiness.md`](fall-2026-launch-readiness.md) defines
launch-ready entirely in terms of internal quality: scoring correctness, offline
reliability, replication behavior, class-status accuracy, UX confusion. Every gate
is something one person can verify alone at a keyboard.

No gate requires another human to say yes.

That is the definition a solo technical founder writes, and it can be satisfied
indefinitely without ever testing whether anyone wants the product. The failure
mode it produces is not shipping something bad — it is shipping something
excellent that nobody was waiting for, having spent the runway finding out.

**Recommended change to the scorecard:** add one gate — _a named club, a named
date, a signed commitment to run a real show._ Everything currently on the list
either serves that gate or waits behind it.

---

## 4. Single point of failure on show day

Shows run Saturday and Sunday. If something breaks at 7am Saturday at a
200-exhibitor trial and the operator is asleep, sick, or travelling, that club
falls back to paper — and in a sport this tightly networked, every club within two
states hears about it by Tuesday.

The offline-first architecture is the right bet against the common case and it was
made correctly: network loss is not show loss. It does not cover a bad deploy, an
auth failure, a dead device, or an evicted local store — and those are precisely
the failures that make paper necessary.

Three mitigations, in order of value:

1. **A trial packet that already exists on paper before the failure.** Tracked as
   **MYK9-198**, and worth reading for the design reasoning — the obvious version
   of this mitigation does not work.

   The intuitive answer is an in-app "print everything now" action. It is
   circular: if the failure is severe enough to need paper, the app that generates
   the paper is probably also unavailable. **Auth is the sharpest case** — a login
   that cannot complete leaves fully replicated data sitting on the disk and
   completely unreachable. A dead device and an evicted IndexedDB store are worse.
   An in-app action only helps when the app boots, auth succeeds, and the report
   path is healthy, which is close to the case where paper was not needed.

   So the packet must be generated **in advance** and delivered out-of-band:
   rendered to PDF at entry close and again the evening before each trial day,
   stored outside the app, and emailed — which puts it on mail infrastructure this
   platform does not control and a phone can reach at the venue.

   The endpoint is not the PDF. It is **printed paper in the trial box**, because
   a PDF on a laptop that will not boot is worth exactly nothing. The operator
   instruction is "print it and pack it," not "it is in your email."

2. **Stagger onboarding.** Do not let six clubs run the same weekend in the first
   season. A scheduling decision — free to make, expensive to skip.
3. **Accept the ceiling.** Twenty clubs is fine for one person; a hundred is not,
   and no amount of software fixes a support-hours problem. This is a second,
   independent reason the ~20-club plan in § 2 is the right one.

---

## 5. The pricing model is good — protect it

The exhibitor-paid percentage, added on top of the entry as a separate line item,
has one property worth more than any feature: **the club's cost to adopt is zero.**
No treasurer approves a budget line, no purchase decision, no procurement, no
invoicing, no collections. In a market of volunteer-run clubs that are structurally
cheap and slow to decide, removing the purchase decision entirely is the single
strongest thing about this business.

It also scales with the club's own pricing, so entry-fee inflation accrues without
a renegotiation.

The cost: the fee is exhibitor-visible, and in a small, tightly networked sport a
fee that feels high becomes a talking point quickly.

| Alternative                                | Assessment                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Flat $2.00–2.50 per entry                  | Easier to say out loud, matches how competitors price. But it forfeits the expensive entries — 7% of a $60 agility weekend entry is $4.20 against $2.00 flat |
| 7% capped per cart                         | Hold in reserve. Adopt if exhibitors actually say the fee felt high; not preemptively                                                                        |
| Club-paid SaaS or per-show licence         | **Avoid as the primary model.** Predictable MRR is tempting and it reintroduces exactly the purchase decision the current model removes                      |
| Keep 7%, add a flat per-checkout component | Recommended. Tracked as **MYK9-197**                                                                                                                         |

### Premium subscriptions are a second business

[`plan-google-apple-integrations.md`](../plan-google-apple-integrations.md) already
made this argument and it is right: a $4.99/mo tier is "an awkward sell to someone
competing six weekends a year."

Extending it: premium is a second customer type with a second go-to-market, run by
one person who has not finished the first. Signing twenty clubs is more tractable
than acquiring hundreds of consumer subscribers in a niche sport.

It is shipped and it is fine. The recommendation is narrow: **stop letting it pull
roadmap, and do not count it in the revenue model.** Treat it as retention and
delight.

---

## 6. Expense optimization — real, small, and pointed the wrong way

There is roughly **$100–150/month of genuine slack**, or 110–170 entries. Worth
taking; not worth optimizing.

- **Defer Supabase PITR ($100/mo)** — this is nearly the whole list. Pro already
  includes daily backups. PITR buys point-in-time granularity, which matters once
  a club's live show data is at stake. Buy it the week before the first real show.
  A _tested_ restore procedure (MYK9-110) is worth more than the add-on.
- **Sentry free tier** until 5k errors/month is exceeded.
- **`generate-premium` runs on Sonnet 4.6** — check whether Haiku suffices.
  `ask-myk9show` already uses Haiku correctly.
- **Stop adding services.** Each integration is recurring cost, plus a support
  surface, plus another thing that can page you on a Saturday.

### The cost that is not recurring

The platform is about to move other people's money without E&O insurance and
without attorney-reviewed terms — both already flagged as outstanding. One
cancelled show with five figures of entries in flight, or one club dispute over a
payout, is the kind of event that ends a one-person business. A few thousand
dollars of insurance and legal review outranks every line above.

### The cost that is not denominated in dollars

The cost structure is flat until roughly 10× current scale, which means cost
discipline buys almost nothing and cost paranoia costs real time. The scarce
resource is operator attention, and this repo already spends a great deal of it:
weekly security audits, rotating UX walks, nightly QA, a health board, code-quality
ratchets.

Every one was worth building. Not every one is worth _running weekly at zero
users_ — auditing an application nobody uses finds real bugs and produces no
revenue. Consider pausing the scheduled audits until a live club exists, then
restarting them against real traffic. That is the highest-value available cut and
it is not measured in dollars.

---

## 7. Claims to verify before relying on this

Ranked by how much the assessment moves if they are wrong.

1. **What competitors charge.** The single largest gap. If incumbents charge $3–4
   flat per entry, 7% on a $25 entry is a genuine advantage and belongs in the
   pitch. If they charge $1, there is a problem. Roughly two hours of research and
   it is currently unknown.
2. **Addressable entry volume.** The § 2 club counts assume ~900 entries per
   200-exhibitor trial day (from the SMS doc) and 2–3 shows per club per year.
   Neither is measured. The _structural_ claim is firmer: conformation is served by
   licensed superintendents while performance events are run by club trial
   secretaries, and this product serves the latter.
3. **Average cart size and entry-fee distribution.** The top two unknowns in the
   unit-economics model. Instrument at the first real show.
4. **Whether clubs will actually switch.** Incumbent inertia in volunteer
   organizations is severe and no amount of product quality overcomes it by
   itself. One design-partner club answers this and nothing else does.
5. **The Stripe Express active-account fee.** Verify on the dashboard; see the
   unit-economics cost base.

---

## 8. Recommended order

1. **Sign one design-partner club** for a real show this season. No technical
   prerequisite. Not started. Everything below waits on it.
2. **Write the competitor and pricing analysis** (§ 7 item 1).
3. **MYK9-196** — statement descriptor, before real money moves.
4. **Insurance quote and attorney review of terms**, before real money moves.
5. **MYK9-198** — the paper escape hatch.
6. **Instrument cart size and entry-fee distribution** at the first real show.
7. **Defer PITR** until step 1 has a date.

Steps 3–7 are a couple of weeks of work. Step 1 has no technical prerequisite and
has not started. That ordering is the entire point of this document.
