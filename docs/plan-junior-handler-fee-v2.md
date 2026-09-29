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
- Junior status is **derived**, never set by hand. Do not add a flag.
- `discounts` stays empty: this is a second fee, not a discount line.
- Refunds are **never automatic** (MYK9-876). Any refund needs human approval.
- The reduced fee is decided by **age only**, per the rulebooks. It never requires a junior handler
  number (Richard, 2026-09-29). A number on file is shown to the secretary as a way to verify.

Decided by Richard, 2026-09-29 (all recommendations accepted):

- **Derive once, store, never re-derive.** One trusted server function prices an entry at creation
  and the fee is stored on the entry. Checkout, webhook, payment links and refunds read the stored
  fee.
- **Privacy boundary:** a junior fee is priced only for the dog's owner or co-owner, or a handler who
  enrolled themselves through the exhibitor flow. Whether "enrolled" needs provenance (MYK9-875) is
  settled inside slice B.
- **The fee is fixed at entry creation**, then frozen.
- **`unknown` status** (no date of birth on file, or ASCA) prices at the normal tier, and an ASCA show
  hides the setting.
- **Self-asserted date of birth and number:** out of scope for this fee; file separately.

## Open before slice B

Slice A needs none of the decisions above beyond what is recorded. Slice B still has one open
design point: whether enrollments need provenance so that "enrolled" can be trusted (MYK9-875). Settle
it at the start of slice B, not before.

## Slices

Ship each as its own small PR, each with one independent (Codex) review at the end, never a
review per patch.

**Slice A — show setting and print.** Nullable `shows.junior_handler_fee` with a bounded CHECK
(`>= 0 and < 100000`; `numeric` admits NaN through a bare `>= 0`), explicit `GRANT`s and
`REVOKE FROM anon` per the migration rules, the field in the show edit form (hidden for ASCA),
and the real fee/age in `buildEntryBlankProps.ts`. It changes no price. Nothing is charged
differently, so a secretary sees the setting but no entry is priced by it until slice B.

**Slice B — staff and desk entries (show-day path).** `submit_show_entries` (cash, check,
waived) and the offline insert path price a junior entry using the single derivation function
from decision 1, subject to decision 2. This is the highest-priority path for show-day
reliability and needs no Stripe changes.

**Slice C — exhibitor card checkout.** Quote and charge the stored/derived fee through the
existing checkout, reusing the frozen fee snapshot that already exists rather than adding a new
one. The wizard's running-total preview (MYK9-838) belongs here.

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
