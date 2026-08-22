## Why

The Support Inbox currently presents a failed ticket query as both an error and a successful empty queue with zero counts. That ambiguity can hide show-day support incidents from site administrators, so correcting it supports fall 2026 launch readiness by keeping operational failure states explicit and recoverable.

Original request: `start batch 1`

## What Changes

- Make loading, query-error, successful-empty, and successful-data rendering mutually exclusive on the existing Support Inbox.
- Show ticket counts as unavailable during a query error instead of presenting zeroes as facts.
- Always provide meaningful operator-facing error copy, including when an `Error` has a blank message.
- Add a keyboard-accessible Retry action that reissues the existing React Query request and permits recovery to current data or a genuine empty result.
- Add assertion-first focused tests for populated and blank errors, Retry behavior, and recovery.
- Preserve post-merge browser replay at 1440×900 and 768×1024 as the closure evidence gate.

This does not duplicate an existing surface. The fix stays inside `/admin/support` and uses its existing query hook; linking elsewhere would not make this queue's unavailable state honest.

### Non-goals

- No new admin page, panel, dialog, notification system, or support-ticket data path.
- No database, RLS, API, persistence, or ticket mutation changes.
- No redesign of ticket diagnostics, replies, filtering, or status transitions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `support-tickets`: Require the operator inbox to represent ticket-query failures as explicit unknown states with unavailable counts, meaningful copy, Retry, and mutually exclusive recovery states.

## Impact

- `apps/myk9show/src/pages/admin/SupportInboxPage.tsx`
- `apps/myk9show/src/pages/admin/__tests__/SupportInboxPage.test.tsx`
- Existing `useSupportTickets` React Query result and `refetch`; no hook contract or dependency changes are expected.
- UX intent: preserves the Site Admin target feeling that platform health is knowable by distinguishing “unavailable” from “empty.”
