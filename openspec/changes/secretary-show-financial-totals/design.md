## Context

The codebase has three financial-adjacent surfaces:

- `FinancialReport` on the Reports page: show-scoped and printable, but currently filters `ReportEntry.paymentStatus` as though it were accepted/waitlisted entry state.
- `ShowFinancialSummary`: a richer show-level component, but it is not wired into a production route and uses older payment semantics.
- Entry Management: the canonical place to review and change payment state.

The remediation should improve the existing printable report, not add a new page. If Entry Management needs a faster route later, it should deep-link to the report with `?report=financial-report`.

## Goals / Non-Goals

**Goals:**

- Keep the canonical closeout artifact on the existing Reports page.
- Separate entry status from payment status in report props.
- Normalize current and legacy payment statuses:
  - paid: `paid`, `paid_online`, `paid_by_check`, `paid_by_cash`
  - pending: `pending`
  - waived: `waived` or comped entries
  - refunded: `refunded`, `partial_refund`
- Compute totals from persisted financial fields available in report data:
  - `entry_fee`
  - `discount_amount`
  - `payment_status`
  - `payment_method`
  - `refund_amount`
  - `comped`
- Preserve show-level trial and class context for grouped evidence.
- Add tests before considering the row implementation-complete.

**Non-Goals:**

- Do not create a new Financials page.
- Do not build accounting exports beyond the printable report in this slice.
- Do not change payment mutation workflows.
- Do not mark S8.1 or S8.2 complete; those still need their own reconciliation/refund verification.

## Design

### Report Data Shape

Extend `ReportEntry` with:

- `entryStatus`
- `discountAmount`
- `refundAmount`
- `comped`

Keep `paymentStatus` as the financial status. The report mapper should copy these fields from `DbEntry` alongside the existing entry fee and payment method.

### Totals

Create a pure totals helper near the report so the arithmetic is unit-testable. For active closeout entries, include entries whose entry status is accepted-like or show-day/current:

- include: accepted, confirmed, checked-in, competing, in-ring, completed, scored, paid, pending-payment, submitted
- exclude from the default accepted/current report: waitlist, waitlisted, withdrawn, scratched, not_accepted, rejected, missing_info
- waitlist mode shows waitlisted entries separately.

For each included entry:

- gross = `entryFee`
- discount = `discountAmount`
- waived = gross - discount for comped/waived entries
- collected = paid amount inferred from gross - discount, excluding pending/waived/refunded entries
- refunded = `refundAmount` when present, otherwise gross - discount for fully refunded entries
- outstanding = gross - discount for pending entries
- net retained = collected - refunded

### Report Layout

Add a compact summary table at the top:

- Entries
- Gross fees
- Discounts
- Waived/comped
- Collected
- Refunded
- Outstanding
- Net retained

Then print payment-method and trial breakdowns, followed by the existing exhibitor grouped detail table with added status, discount, refund, and net columns.

### Testing

- Unit-test totals helper with mixed cash/check/online/pending/waived/refunded/partial-refund entries.
- Render-test Financial Report totals and waitlist filtering.
- Mapping-test that `entry_status`, `payment_status`, `discount_amount`, `refund_amount`, and `comped` are preserved separately.
- Run OpenSpec validation and focused Vitest files.

## Risks / Trade-offs

- Some legacy rows use `payment_status = paid`; normalize it as paid online for totals, but keep the raw status visible in details.
- Without a dedicated `paid_amount` on entries, collected amount is inferred from entry fee minus discount. This matches current entry-level fields and should be revisited if entry-level partial payments are introduced.
- Fully refunded rows without `refund_amount` fall back to net fee as refunded so the report remains conservative.
