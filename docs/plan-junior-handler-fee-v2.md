# Junior handler entry fee — restart plan (MYK9-662, v2)

> **Status:** Active

Tracking: MYK9-662 (parent MYK9-570). Supersedes the approach in PR #2546 (143 files, +5,400/-500,
24 commits, four review rounds). Follow-ups already filed from that PR: MYK9-872, MYK9-873,
MYK9-874, MYK9-875, MYK9-876.

## Goal

A show can charge a reduced **entry fee** for a junior handler. Nothing else. Slice 1 (PR #2342)
already shipped `deriveJuniorStatus`, `people.date_of_birth` and the print-only half.

## Why restart

The fee is small. The size came from one decision: derive junior status from a private date of
birth on **every** path that prices an entry (staff RPC, insert trigger, card checkout, webhook,
payment link), then keep the copies consistent through legacy rows, offline sync and cart
recovery. Each copy is another place the price can answer "is this person a junior on the trial
date?" (the MYK9-664 oracle), and each review round found another. Most findings were in code the
previous fix had added, which is the CLAUDE.md convergence signal to restructure, not patch.

## What the rulebooks say (verified in `docs/rulebooks/`)

- **AKC Scent Work:** a junior is under 18 **on the day of the trial**. A junior "need not have an
  AKC Junior Handler number to compete"; without one held before the trial they earn no award
  credit (glossary, "Junior Handler").
- **UKC Nosework:** a junior has not reached their 18th birthday **as of January 1st of the
  competition year** (Ch.1 §3), so the measuring date is fixed, not the trial date. UKC issues no
  number; the "UKC Junior program" is optional and gates awards, not entry. A club may request
  verification of age.
- **ASCA:** a floor of 8 and no upper age bound, so junior status cannot be derived.

So the number is not what makes someone a junior: age is. The number is evidence a club can check.

## Decisions already made (do not reopen)

From MYK9-662, Richard, 2026-09-18:

- The fee is **per show**, one "junior handler fee" beside the regular entry fee.
- It changes the **entry fee only**. The platform/processing split (MYK9-229) is untouched.
- Junior status is **derived**, never set by hand. Do not add a flag. _(Superseded for the online
  path in slice C: the exhibitor self-declares; see "Settled in slice C".)_
- `discounts` stays empty: this is a second fee, not a discount line.
- Refunds are **never automatic** (MYK9-876). Any refund needs human approval.
- The reduced fee is decided by **age only**, per the rulebooks. It never requires a junior handler
  number (Richard, 2026-09-29). A number on file is shown to the secretary as a way to verify.

Decided by Richard, 2026-09-29 (all recommendations accepted):

- **Derive once, store, never re-derive.** One trusted server function prices an entry at creation
  and the fee is stored on the entry. Checkout, webhook, payment links and refunds read the stored
  fee.
- **Privacy boundary:** _superseded in slice B._ The junior fee is charged only on an explicit
  secretary / site-admin override; nothing derives it from age or ownership (see "Settled in
  slice B").
- **The fee is fixed at entry creation**, then frozen.
- **`unknown` status** (no date of birth on file, or ASCA) prices at the normal tier, and an ASCA show
  hides the setting.
- **Self-asserted date of birth and number:** out of scope for this fee; file separately.

## Settled in slice B (Richard, 2026-09-30, MYK9-875 and the Codex P1 on #2611)

**Explicit secretary override only.** Slice B charges the junior fee ONLY when the show secretary
(club-appointed) or a site admin explicitly chooses "Charge junior handler fee" for an entry. The
override never reads a date of birth, is recorded (`entries.junior_fee_override_by`), and a
non-secretary asking is refused. There is no automatic age- or ownership-derived pricing.

History: the first design derived the fee for a dog's owner or co-owner who was a junior at the
trial (and, before that, via enrollments and prior entries). Each variant let a show manager
manufacture the relationship (a trial secretary can insert a dog with any `owner_id`) and read
back an age-dependent price, i.e. the MYK9-664 age oracle. The owner-derived arm was dropped at
Richard's direction; nothing in slice B calls `private.entry_handler_is_junior` or reads
`people_private`. The junior result is `LEAST(junior fee, normal fee)`; a junior fee of 0 or
NULL is no tier; the stored fee is frozen against direct client UPDATEs. Migration
`20260930214300_myk9_878_*` implements it.

## Settled in slice C (Richard, 2026-09-30, MYK9-879 comments)

**The exhibitor self-declares, for the online card path.** In the registration wizard the
registrant ticks "Handler is under 18 (junior handler fee)" for a dog entry, and card checkout
charges `LEAST(junior fee, normal fee)` for that dog's classes. These are club trials; the
secretary can call out misuse, so the declaration is recorded and shown to the secretary in
Entries Management (a "Junior fee (declared)" badge on the entry row, no new page).

- **It is about the HANDLER's age, not the dog's owner.** A parent owns the dog and registers it;
  the child handles it. The server honors the declaration whenever the show has a junior tier
  (`junior_handler_fee` > 0, not ASCA in the UI) and never looks at who owns the dog. The existing
  rule that an exhibitor may only enter dogs they own or co-own is unchanged and is not part of
  this slice.
- **No date of birth is read anywhere**, and junior status is never derived. This replaces the
  plan's "age only" rule for the online path; the secretary's desk override (slice B) is unchanged.
- **Stored, then frozen.** The declaration is stored on the cart line
  (`entry_cart_items.junior_fee_declared`) and recorded on the entry
  (`entries.junior_fee_declared`, a separate column from slice B's `junior_fee_override_by`
  secretary stamp, which never carries a non-secretary). A direct client write cannot set or
  change the entry column. Any line that settles an EXISTING entry (Finish Payment, the
  secretary payment link, the webhook's verification) charges that entry's frozen
  `entries.entry_fee` and never recomputes or rewrites it, so a later change to the show's fees or
  junior tier cannot re-price it; only NEW cart lines are priced from the tiers and the declaration.
  Declarations persist with the wizard draft (and are restored from the cart lines' flags on
  rehydrate). The server honors no declaration on an ASCA show.
- **One pricing function for the three Stripe paths.** `_shared/authoritativeFee.ts` takes the
  junior tier and the declaration and applies the same LEAST cap as `private.price_entry_fee` and
  the client's `getShowEntryFee`; `_shared/cartItemPricing.ts` prices cart lines for stripe-checkout
  and stripe-webhook, and existing entries for the secretary payment link.
- **No refund code added.** Nothing in this slice calls `stripe.refunds.create`; MYK9-872, 873,
  874 and 876 stay separate (see the PR).

## Slices

Ship each as its own small PR, each with one independent (Codex) review at the end, never a
review per patch.

**Slice A — show setting and entry-blank fee.** Nullable `shows.junior_handler_fee` with a bounded
CHECK (`>= 0 and < 100000`; `numeric` admits NaN through a bare `>= 0`), the field on the show
**edit** panel (hidden for ASCA), and the real fee in `buildEntryBlankProps.ts`, replacing the
hardcoded `$18.00`. It changes no price. Deliberately left out, each for a later slice or issue:
the show **creation** wizard (it would touch the atomic `create_show_with_children` RPC and the
clone path), the public premium-list PDF bodies, and the entry-blank **age** field. That field
stays null on purpose: MYK9-664 moved `date_of_birth` to `people_private` so no official-facing read
can derive a handler's age. No GRANT is needed (`public.shows` has a table-level grant), which must be
verified against the applied database after `db push`.

**Slice A2 — set the fee when creating a show.** Add the Junior Handler Fee field to the show creation
wizard's fees step (hidden for ASCA), carry it through the wizard store, the payload builder and the
clone-from-show path, and add `junior_handler_fee` to `create_show_with_children` (a new migration
that copies from the LATEST definition of that function, never an older one). Small, and independent
of pricing, so it can ship before or after slice B. Until it ships, a secretary sets the fee on the
show edit panel after creating the show.

**Slice B — staff and desk entries (show-day path).** `submit_show_entries` (cash, check,
waived) and the offline insert path charge the junior fee on an explicit secretary override, through
one trusted pricing function (see "Settled in slice B": the age/ownership-derived design was dropped). This is the highest-priority path for show-day
reliability and needs no Stripe changes.

**Slice C — exhibitor card checkout.** Quote and charge the exhibitor's declared junior fee
through the existing checkout (see "Settled in slice C"), reusing the frozen fee snapshot
(`entry_cart_items.entry_fee_cents`, verified against the authoritative price) rather than adding
a new one. The wizard's running-total preview (MYK9-838) belongs here and equals what checkout
charges.

## Salvage from PR #2546

Reuse (copy, do not cherry-pick the whole branch): `derive_junior_status` SQL and its tests, the
Deno mirror only if a Deno path still needs it, the entry-blank fee/age wiring, and the SQL
fixtures for junior, adult, missing date of birth, no junior tier, zero fee and ASCA.

Split out, not part of this fee: the cart-page re-quote skeleton, the offline shows backfill
(needed only if the column reaches the replica), cart recovery (MYK9-873), the checkout
double-click race (MYK9-872), and the durable refund claim (MYK9-874, MYK9-876).

## Pre-review checklist (lessons from PR #2546)

Answer these in each PR body before requesting review:

- Can any caller choose a handler **and** a trial date and read a price back? (The oracle.)
- Is any relationship or authorization check satisfiable by a row a show official controls?
- Does every fee path read the stored fee, or does one re-derive?
- What happens to a legacy row with a NULL fee? (Price at the normal tier, never junior.)
- Does any new code path call `stripe.refunds.create`? (It must not.)
- Does a refund and a fulfillment ever race on the same session?

## Testing phase

A slice is not done until these pass:

- Assertion-first tests for every value-sensitive step: the exact fee written for junior, adult,
  unknown and unrelated-handler entries, red before the fix.
- Behavioral SQL tests under `supabase/tests/` (CI-only; registering one is not running it), including
  the two-entry bootstrap case for decision 2.
- Full app suite shuffled (`pnpm vitest run --sequence.shuffle`), `pnpm typecheck`, `pnpm lint`,
  `pnpm qa:code-quality-ratchet`, and `pnpm format:check:changed`, each redirected to `.logs/`
  with the real exit status.
- Verify grants against the applied database after any `db push`, including column-level ACLs.

## Non-goals

A general coupon or discount engine, per-class or per-registry fee variation, anything touching
the platform fee split, automatic refunds of any kind, and verification of self-asserted dates of
birth.
