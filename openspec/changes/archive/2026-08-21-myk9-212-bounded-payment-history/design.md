## Context

See `proposal.md` for motivation. `useMyPayments` currently owns the canonical online ledger read, `paymentYearFilter.ts` owns displayed local-year classification, and `ExhibitorPaymentsPage` owns the existing URL year selection. The data is online-only Stripe/account history rather than show-day operational state, so the replication layer is not appropriate.

## Goals / Non-Goals

**Goals:**

- Bound every PostgREST request and entry-ID list while retaining all-time completeness.
- Make selected-year server reads agree exactly with browser-local filing and totals.
- Preserve refunds whose owning payment predates the selected year.
- Keep one calm, trustworthy exhibitor ledger with no hidden truncation.

**Non-Goals:**

- No pagination controls, result caps, new ledger, receipt page, checkout path, schema, RLS, or Stripe writes.
- No migration to replication; this remains an explicitly online account-history query.

## Decisions

1. **Page all-time history instead of capping it.** Each order request uses a 100-row range and continues until exhausted. A hard cap was rejected because silently hiding money history violates the existing all-time contract; a new pagination UI would add unnecessary surface area.

2. **Use creation time plus UUID as the stable page order.** Repeated server range requests sort descending by both fields so tied timestamps cannot skip or duplicate rows. Timestamp-only paging was rejected because fixture and imported rows can share timestamps.

3. **Derive selected-year UTC instants from local midnights.** The URL year becomes local January 1 boundaries serialized to UTC, matching `paymentRowYear`. Fixed UTC-year boundaries were rejected because they disagree near New Year outside UTC.

4. **Union charge/refund ownership before presentation.** A selected-year order read includes payments and order-level refunds in range, then bounded entry-refund lookup finds older owning orders required for partial-refund rows. Filtering only by order dates was rejected because it would hide current-year refunds of older charges.

5. **Chunk entry follow-ups and page year metadata.** Related entry IDs are split into 100-ID requests. When a year is selected, lightweight paged date metadata retains all year options without reloading every monetary field.

## Risks / Trade-offs

- [Risk] All-time history still requires multiple requests for very old accounts. → Mitigation: each request is bounded and complete; query caching avoids needless repeat work.
- [Risk] Browser timezone changes can move a boundary row between years. → Mitigation: both retrieval and display intentionally use the current browser-local calendar contract.
- [Risk] Refund ownership adds extra reads for a selected year. → Mitigation: refund IDs and owning-order lookups are bounded and run only for selected-year views.

## Migration Plan

Ship as a normal frontend deployment with no schema or data migration. Roll back by reverting the implementation PR; persisted payment data is untouched.
