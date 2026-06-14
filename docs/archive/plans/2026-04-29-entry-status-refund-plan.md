# Entry Status & Refund Plan — 2026-04-29

## Context

During the April 29 session we aligned on a consistent entry status vocabulary and identified
three gaps to address in the next session:

1. **"Moved" display bug** — entries marked `moved` in the DB show as "Pending" in the UI
2. **Scratched status** — exhibitor pulls from a class; no refund; not the same as Withdrawn
3. **Withdrawn reason tracking** — Withdrawn has two specific AKC reasons, both trigger a refund
4. **Refund tracking** — full and partial refunds, manual processing for now

---

## Agreed Status Vocabulary (already implemented)

| Dropdown     | UI Badge     | DB Value      | Email Badge  | Purpose                                      |
|--------------|--------------|---------------|--------------|----------------------------------------------|
| Pending      | Pending      | `submitted`   | Pending      | Awaiting secretary review                    |
| Accepted     | Accepted     | `confirmed`   | Accepted     | Entry confirmed, dog will compete            |
| Waitlisted   | Waitlisted   | `submitted`*  | Waitlisted   | In the waitlist queue                        |
| Not Accepted | Not Accepted | `not_accepted`| Not Accepted | Secretary declined the entry                 |
| Missing Info | Missing Info | `submitted`   | Missing Info | Entry incomplete; secretary uses comment     |
| Withdrawn    | Withdrawn    | `withdrawn`   | —            | In-season dog or judge change; refund due    |
| Scratched    | Scratched    | `scratched`   | —            | Pulled from class after closing; no refund   |
| Moved        | Moved        | `moved`       | —            | Entry moved to another class (read-only)     |

\* Waitlist tracked in `waitlist_entries` table.

---

## Phase 1 — Fix "Moved" Display Bug

**Problem:** `mapEntryStatus('moved')` falls through to the default `EntryStatus.PENDING`,
so moved entries show a "Pending" badge instead of "Moved".

**Files:**
- `apps/myk9show/src/utils/entryManagementUtils.ts` — add `case 'moved': return EntryStatus.CANCELLED` 
  (repurpose CANCELLED enum for Moved display, or add a new enum value)
- Actually cleaner: add `MOVED = 'moved'` to `EntryStatus` enum in
  `apps/myk9show/src/types/show-registration-types.ts` and handle it throughout

**Display:** Show a grey "Moved" badge. Optionally surface the destination class from
`special_requests` (already stored as "Moved up to Interior Advanced") as a tooltip or
sub-label. Moved entries should be read-only — no status dropdown.

---

## Phase 2 — Add Scratched to Dropdown

**Problem:** `scratched` exists in the DB constraint (migration 139) but is not in the
secretary dropdown.

**Files:**
- `apps/myk9show/src/components/entries/management/EntryListCard.tsx` — add
  `<DropdownMenuItem onClick={() => onStatusChange(entry.id, EntryStatus.SCRATCHED)}>Scratched</DropdownMenuItem>`
- `apps/myk9show/src/types/show-registration-types.ts` — add `SCRATCHED = 'scratched'` to enum
- `apps/myk9show/src/utils/entryManagementUtils.ts` — add mapper cases and badge (grey "Scratched"):
  - `mapEntryStatus('scratched')` → `EntryStatus.SCRATCHED`
  - `mapStatusToDb(EntryStatus.SCRATCHED)` → `'scratched'` [ADDED]
  - `getEntryStatusBadge(EntryStatus.SCRATCHED)` → grey "Scratched" badge
- `apps/myk9show/src/hooks/useEntryManagementActions.ts` — add `SCRATCHED` and `WITHDRAWN` to
  `statusToDecision` so email sends correct badge: SCRATCHED → `'scratched'`,
  CANCELLED(Withdrawn) → `'withdrawn'` [ADDED]

**No refund implied.** If club wants to give a discretionary refund for a scratch, that is
handled separately via the refund UI (Phase 4).

---

## Phase 3 — Withdrawn Reason Dialog

**Problem:** Withdrawn has two distinct AKC reasons that affect recordkeeping. Currently
no reason is recorded.

**Migration needed:** `175_withdrawal_reason.sql` — Add `withdrawal_reason` column to `entries` table: [ADDED migration number]
```sql
ALTER TABLE entries ADD COLUMN IF NOT EXISTS withdrawal_reason TEXT;
-- No new RLS policy needed: existing entries RLS already governs this column.
-- Secretaries can update entries they have access to via the existing secretary policy.
```

**UI:** When secretary selects "Withdrawn" from the dropdown, intercept the click and show
a small dialog before saving:

```
Title: "Record Withdrawal Reason"
Body:
  Reason (required): [dropdown]
    - In-Season Dog
    - Judge Change
  Notes (optional): [textarea]

Buttons: Cancel | Confirm Withdrawal
```

On confirm: call `onStatusChange` with the reason stored separately (new handler or extended
signature), then write `withdrawal_reason` to the DB alongside `entry_status = 'withdrawn'`.

**Files:**
- New component: `apps/myk9show/src/components/entries/management/WithdrawalReasonDialog.tsx`
- `apps/myk9show/src/components/entries/management/EntryListCard.tsx` — intercept Withdrawn
  click to open dialog instead of immediate status change
- `apps/myk9show/src/hooks/useEntryManagementActions.ts` — extend `handleStatusChange` to
  accept optional `withdrawalReason` param; pass it to the DB write
- `apps/myk9show/src/services/database/queries/secretaryEntryQueries.ts`:
  - `updateEntryStatus(entryId, status, withdrawalReason?)` — extend signature to accept and
    write `withdrawal_reason` column in the same UPDATE [ADDED]
  - Include `withdrawal_reason` in the `SELECT` in `getEntriesForShow`
- `apps/myk9show/src/types/entry-management-types.ts` — add `withdrawalReason?: string` to
  `EntryManagementEntry`

**Display:** Show withdrawal reason as a sub-label under the Withdrawn badge
(e.g. "Withdrawn — In-Season Dog").

---

## Phase 4 — Refund Tracking

**Problem:** No way to record that a refund was issued, how much, or by what method.

**Migration needed:** `176_refund_fields.sql` — Add refund fields to `registrations` table: [ADDED migration number]
```sql
ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS refund_notes TEXT,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
-- Existing RLS on registrations covers these columns; no new policies needed.
```

**UI:** On the `EnrollmentCard`, when payment status is changed to **Refunded** or
**Partial Refund**, a refund section expands inline (similar to the existing check/partial
payment panels):

```
Refund Amount: [$50.00]  ← pre-filled with paid amount; editable for partial
Refund Method: [dropdown]
  - Check Mailed
  - Cash Returned
  - Stripe (manual)
  - Other
Refund Notes: [text input]  ← e.g. "check mailed 5/1/2026"
```

On save: write `refund_amount`, `refund_notes`, `refunded_at = now()` to the `registrations`
row alongside the payment status change.

**Refund rules:**
- **Withdrawn** → full refund expected (but secretary manually processes; system records it)
- **Scratched** → no refund by default; club can override by manually setting Refunded
- **Club discretionary** → secretary sets Refunded or Partial Refund at any time with any amount

**Note:** Stripe auto-refund is deferred. For Stripe payments, secretary initiates the refund
in the Stripe dashboard and records it here as confirmation.

**Files:**
- `apps/myk9show/src/components/entries/management/EnrollmentCard.tsx` — add refund expansion
  panel (similar to `partialDialog` pattern already in the component)
- `apps/myk9show/src/hooks/useEntryManagementActions.ts` — extend
  `handleEnrollmentPaymentChange` to accept and write refund fields
- `apps/myk9show/src/services/database/queries/showRegistrationQueries.ts` — update
  `updateEnrollmentPaymentStatus` to write refund columns
- `apps/myk9show/src/types/entry-management-types.ts` — add `refundAmount?`, `refundNotes?`,
  `refundedAt?` to `EntryManagementEntry`
- `apps/myk9show/src/utils/enrollmentGrouping.ts` — add `refundAmount?`, `refundNotes?`,
  `refundedAt?` to `EnrollmentGroup` type and populate from entry data in
  `groupEntriesByEnrollment` so `EnrollmentCard` can read and display refund state [ADDED]
- `apps/myk9show/src/hooks/useEntryManagementData.ts` — include refund fields in the
  `getEntriesForShow` select

---

## Implementation Order

1. Phase 1 (Moved display fix) — quick, isolated, no migration
2. Phase 2 (Scratched dropdown) — quick, no migration
3. Phase 3 (Withdrawn reason dialog) — medium; requires migration + new dialog component
4. Phase 4 (Refund tracking) — largest; requires migration + expanded enrollment card UI

Phases 1 and 2 can ship together. Phases 3 and 4 can ship together since they're both
tied to the withdrawal/refund workflow.

---

## Testing Checklist

- [ ] Moved entry shows "Moved" badge; no status dropdown available
- [ ] Scratched appears in dropdown; saves correctly; shows grey "Scratched" badge
- [ ] Selecting Withdrawn opens reason dialog; dialog is required before saving
- [ ] Withdrawal reason visible under Withdrawn badge on enrollment card
- [ ] Refund section appears when payment status set to Refunded or Partial Refund
- [ ] Refund amount pre-fills from paid amount; editable for partial
- [ ] Refund data saved to DB and visible on reload
- [ ] Decision email: Scratched shows "Scratched" badge, Withdrawn shows "Withdrawn" badge (statusToDecision covers both)
- [ ] mapStatusToDb(SCRATCHED) writes 'scratched' to DB
- [ ] mapStatusToDb(MOVED) not needed — Moved is read-only, set by move-up query directly
- [ ] Existing entries unaffected (no data regression)
