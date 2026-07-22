# Pull Management — Separate Show-Day Pull State from Refund Accounting

> **Status:** Active

> **Phase:** 2 implementation ready on MYK9-23; migration/deployment remains gated on the Stripe cutover. Pre-launch blocker: NO.

> **Decided:** 2026-06-25 (brainstorm with owner).

> **Related (Stripe-gated):** [`plan-stripe-golive-enforcement.md`](plan-stripe-golive-enforcement.md) — the two Stripe-gated plans should surface together when Stripe go-live work starts. Cross-linked 2026-07-12 (day-of consolidation pass, `improve-audit-2026-07-11/008-secretary-dayof-plan-consolidation.md`).

---

## Problem

`ScratchRequest` (the type powering `PullManagementTab`) conflates two concerns with different ownership, timing, and write paths:

1. **Show-day pull state** — offline-first, written at ringside by the secretary: *was this entry pulled, when, and why?*
2. **Refund accounting** — online, written post-show via a secretary action or Stripe: *was a refund issued, for how much, and did it clear?*

The three refund fields (`refund_status`, `refund_amount`, `stripe_payment_intent_id`) are `?` optional bolted-on additions to a type that only needs to describe a ringside pull event. The replication layer owns pull state; Stripe owns refund state. Mixing them creates a false dependency: the offline-first ringside UI appears to need Stripe awareness, and the Stripe reconciliation path appears to need ringside data.

A secondary problem: the codebase uses "scratch"/"scratched" as both the type name and user-facing label. The domain term is **pulled**. This plan standardizes on "pulled" everywhere.

---

## Domain model (clarified 2026-06-25)

### Pulled vs. Absent

These are different states with different inputs and different secretary actions:

| State | What happened | How it's recorded | Refund eligible? |
|-------|--------------|-------------------|-----------------|
| **Pulled (before close)** | Secretary or exhibitor removed the entry before entries closed for that class | `entry_status = 'scratched'`; `pull_timing = 'before_close'` | Club policy — commonly yes |
| **Pulled (after close)** | Entry removed after the class entry window closed | `entry_status = 'scratched'`; `pull_timing = 'after_close'` | Club policy — commonly no |
| **Absent** | Dog never checked in, no pull was recorded | `check_in_status` remains un-checked-in; scoresheet row = "Absent" | Club policy — typically no |
| **Pulled → no refund** | Secretary decided no refund after reviewing the pull | Same as absent from the scoring side | Decision made: no |

Pulled-without-refund and absent look identical on the scoresheet ("Absent"), but they are different inputs: one was a deliberate pre-show act, one was a no-show. The secretary needs to distinguish them — a pulled dog (especially before close) may still warrant a courtesy note or follow-up.

### Refund policy is club-owned — defaults + override

Which pulled entries get refunds is a **club policy decision**, not a system rule. The system provides **simple, opinionated defaults** to reduce decision fatigue, while always allowing the secretary to override any default for any entry. There will always be exceptions; the system must never block them.

**Default behavior (sensible starting point):**
- Pulled before close → pre-select "Issue refund" (most common outcome)
- Pulled after close → pre-select "Deny" (most common outcome)
- Timing unknown (`pull_timing = null`) → no pre-selection; both buttons appear; secretary must make an explicit choice

**Override UX:** Each pulled entry in the reconciliation view shows an **"Issue refund" / "Deny" button pair**. The default pre-selects one button (highlighted); the secretary can click the other to override with no confirmation required. The default is a suggestion, not a gate. No dropdown, no modal — two buttons, one click.

**Null timing rule (`pull_timing = null`):** When `pull_timing` cannot be determined — because `entry_deadline` is not populated, `pulled_at` is null, or the entry was pulled before this feature shipped — the system shows "Timing unknown" in the timing column and presents both buttons without pre-selection. The secretary makes the call. This is the correct fallback: show less automation, not wrong automation.

**Legacy data:** Existing `entry_status = 'scratched'` entries pre-dating this feature will have `pull_timing = null` at query time. They are handled identically to the null-timing case above — no migration needed, no data cleanup required before shipping.

The system's job is to:
1. Surface the pull reason and timing to the secretary
2. Pre-select a sensible default decision based on timing (null timing = no pre-selection)
3. Let the secretary override any entry's decision without friction
4. Provide an "Issue refund / Deny" button pair per entry
5. Advisory-gate payout if unresolved refund decisions exist

The system must **not** enforce refund rules or automate refund creation (a Postgres trigger on `entry_status → 'scratched'` was explicitly rejected). Exceptions are too common and policies vary.

### Refunds must precede payout

Since the platform payout schedule is **Manual**, the secretary has a window between the show ending and payout request. If a refund is issued after the Stripe transfer to the club has already happened, the platform account has no funds to refund from. The wrap-up flow should surface an advisory pre-payout checklist item — not a hard block.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Rename `ScratchRequest` → `PullRecord` | Domain term is "pulled"; "scratch" is confusing noise |
| D2 | Remove `refund_status`, `refund_amount`, `stripe_payment_intent_id` from `PullRecord` | These belong on `entries` directly (they already exist as columns); `PullRecord` was projecting them unnecessarily |
| D3 | Add `pull_timing: 'before_close' \| 'after_close'` to `PullRecord` | Informs (does not automate) the secretary's refund eligibility decision |
| D4 | No automation — refunds are a manual secretary action | Too many exceptions; policy varies by club, reason, and timing |
| D5 | Reconciliation surface = Entry Management filtered to `status=pulled` | Reuse existing page + existing `RefundEntryDialog` (#885); no new page |
| D6 | Advisory pre-payout gate — not a hard block | Secretary owns the decision; system surfaces count of unresolved items |
| D7 | "Scratch" → "Pull" in all user-facing strings | Standardize on domain term |

---

## Out of scope

- Automated refund triggers (D4 above)
- New dedicated reconciliation page (D5 above — Entry Management is sufficient)
- Refund policy configuration per club (post-Phase 2; the system doesn't enforce policy, it informs)
- Bulk "deny all after-close pulls" action — implement reactively if secretaries ask for it

**Risk to track:** A secretary with 40+ pulled entries across multiple trials may find the row-action menu insufficient. If this surfaces as a real pain point, add a "Resolve all" bulk action on the filtered Entry Management view. Do not pre-build it.

---

## Implementation

### Phase 1 — Type split + terminology rename

**Files to change:**

- `apps/myk9show/src/services/database/day-of-operations/types.ts`
  - Rename `ScratchRequest` → `PullRecord`
  - Remove `refund_status`, `refund_amount`, `stripe_payment_intent_id` fields
  - Rename `scratch_reason` → `pull_reason`, `scratched_at` → `pulled_at`
  - Add `pull_timing: 'before_close' | 'after_close' | null`

- `apps/myk9show/src/services/database/day-of-operations/scratch.ts` → rename to `pull.ts`
  - Update query projections to drop refund fields (they stay on `entries`)
  - Populate `pull_timing` by comparing `pulled_at` against the trial's entry-close timestamp (derivable — no new column needed if the trial's `close_date`/`entry_deadline` is already in scope; otherwise write at pull time)

- `apps/myk9show/src/services/database/entries/lifecycle.ts`
  - Rename `requestScratch` → `requestPull`, `approveScratchRequest` → `approvePullRequest`, etc.
  - Update all callers

- `apps/myk9show/src/components/entries/PullManagementTab.tsx`
  - Update type alias (`PullRequest` alias already used here — update to `PullRecord`)
  - Remove any refund field renders from the pull list view
  - Update UI labels: "Scratch" → "Pull", "Scratched" → "Pulled"

**[ADDED] Additional callers to update** (grep `ScratchRequest\|requestScratch\|approveScratchRequest\|denyScratchRequest\|scratchEntryDayOf\|scratch_reason\|scratched_at` across the repo before starting — the full list from the Explore audit):
- `apps/myk9show/src/test/e2e/fixtures/phase4SeamHandlers.ts`
- `apps/myk9show/src/test/e2e/fixtures/phase4SeamHttp.ts`
- `apps/myk9show/src/test/phase4-seam/phase4SeamRoutes.test.ts`
- `apps/myk9show/src/components/entries/PullManagementTab.test.tsx`
- `apps/myk9show/src/services/database/day-of-operations/__tests__/scratch.replication.test.ts` → rename to `pull.replication.test.ts`
- `apps/myk9show/src/services/database/entries/lifecycle.test.ts`

Run `pnpm typecheck` after updating all callers to catch any missed references.

**DB migration:** Not required for the type split. `entry_status = 'scratched'` can stay as the DB value — the rename is type/UI only. `pull_timing` can be derived from existing timestamps at query time. If derivation is unreliable (entry close timestamp not always populated), add a `pull_timing` column in a small migration — evaluate in Task 1. **Either way, `pull_timing = null` is a valid runtime value** (see null timing rule above) — no migration is ever blocking for correctness.

### Phase 2 — Reconciliation surface

**Entry Management page (`EntryManagementPage.tsx`):**
- Expose `pull_reason` column in the table view when `status=pulled` filter is active
- Expose `pull_timing` column (`'Before close'` / `'After close'`) — this is the key signal for the secretary's refund decision
- Ensure the existing `RefundEntryDialog` action in `EntryRowActionMenu` is visible for pulled entries

**No new page.** Entry Management + `status=pulled` filter + `RefundEntryDialog` is the complete reconciliation flow.

**MYK9-23 implementation note (2026-07-22):** This reuses Entry Management via
`attention=pulled`; it does not duplicate the workflow on a new page. The
existing Stripe refund dialog remains the refund path. Explicit denials are
stored on `entries`, while successful refunds remain authoritative through the
existing refund amount/timestamp fields. The migration has not been applied to
the shared Supabase project.

### Phase 3 — Pre-payout advisory gate

In the post-show / wrap-up flow (wherever the payout request action lives — currently the admin payout ledger, `plan-admin-payout-ledger-platform-fee.md`):

- Query: count of `entry_status = 'scratched'` + `payment_status = 'paid'` + no refund decision recorded
- If count > 0: show advisory banner — "N pulled entries with unresolved refund decisions. Resolve these before requesting payout or handle out-of-band."
- Not a hard block — secretary can dismiss and proceed

### Phase 4 — Tests

- [x] Unit test: `PullRecord` type shape (no refund fields present)
- [x] Unit test: `pull_timing` derivation logic — before close, after close, and **null (entry_deadline missing or pulled_at null)**
- [x] Unit test: null timing rule — `pull_timing = null` produces no pre-selection (both buttons unselected)
- [x] Component test: `PullManagementTab` renders with `PullRecord` (no refund field access)
- [x] Component test: Entry Management pulled filter shows `pull_reason` + `pull_timing` columns; null timing shows "Timing unknown"
- [x] Component test: reconciliation row with `pull_timing = 'before_close'` pre-selects "Issue refund"; `'after_close'` pre-selects "Deny"; `null` shows both unselected
- [x] Component test: secretary override — clicking the non-default button updates selection without confirmation
- [x] Component test: pre-payout advisory renders when unresolved pulls exist, absent when none

---

## Open questions (resolve in Phase 1 Task 1)

- [ ] Is `pull_timing` derivable at query time from existing columns (`trials.entry_deadline` / `trials.close_date` vs `pulled_at`), or must it be written at pull time? If derivable, no migration needed.
- [ ] Does `PullManagementTab` render any refund state today that secretaries rely on? Audit before removing.
- [ ] Is `entry_status = 'scratched'` the right long-term DB value, or should it migrate to `'pulled'`? Defer unless a DB migration is needed for `pull_timing` anyway (batch it).

---

## Related plans

- [`plan-entry-payment-request.md`](plan-entry-payment-request.md) — Task 3.5 (auto-refund for system-caused make-whole cases) is the closest Phase 2 work; this split should land first or alongside it
- [`plan-admin-payout-ledger-platform-fee.md`](plan-admin-payout-ledger-platform-fee.md) — the pre-payout advisory gate (Phase 3 above) attaches here
