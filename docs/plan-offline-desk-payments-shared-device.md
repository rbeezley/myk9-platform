# Offline desk payments on a shared device (MYK9-2479 design pass)

> **Status:** Active

Linear: MYK9-2479, parked on 2026-11-27 after Codex round 7 on #4461 (draft). This extends [`plan-offline-desk-payments.md`](plan-offline-desk-payments.md) § 2 "A form-wide change waits for the form's unsent payments" and settles the round 7 findings before any more code. App paths are under `apps/myk9show/src/`, queue files under `packages/replication/src/`.

## 1. What exists, and why

- **Desk payments are owned by an account.** `DeskPaymentsTable.usesAccountOwnedRows()` is true. The record and its queue row are stamped with the queue owner (`writeAndQueue`). Every read the form makes (`getAllOrThrow`, `getByShowOrThrow`) returns only the signed-in account's rows. This was the plan's § 6 "owner scoping" criterion: B must never see, retry or remove A's payment.
- **Another account's queue row is held, not sent.** Upload runs under the signed-in account, and a row stamped with another account waits until that account signs in again (plan § 2 "Identity"). Signing out with unsent work warns but does not block (`components/layout/signOutWarning.ts`). It counts desk payments, because `summarizeUnsentWork` counts every non-score row as an "other change" (`services/replication/unsentWork.ts`).
- **The device can already read every account's queue.** `readDeviceUnsentWork` reads all of it in one transaction for the sign-out warning and the ringside "Scores not sent" list. `getAllOrThrowIncludingOtherAccounts` and `getReplicatedRowIncludingOtherAccounts` already exist on `ReplicatedTable`, for sync cleanup.
- **The round 6 guard reads one account.** `formChangeBlockedBy` calls `unsentForEnrollment`, which uses `getAllOrThrow`. So on a shared laptop, B's Payment Due is not held by A's queued cash (the round 7 P1).
- **Payment Due is a reversal.** It nets the form's ledger to zero and sets paid to 0 (the `record_enrollment_payment` comment in `20260925181937_myk9_677_show_payments_ledger.sql`). A payment that arrives after it is recorded on top, so the form reads paid by that amount.

## 2. The rule this pass adopts

**A late payment is a real payment.** The cash is in the drawer. The server records money when it arrives, and that is not wrong. What must not happen is a form-wide change made **on a device that knows about unsent money for that form** while that money is out of sight. Each case follows from that:

| Where the unsent payment is  | Payment Due / Paid in Full: Online on that form | Why                                                                                           |
| ---------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| This device, this account    | Held. Named, with amount (as today)             | Her own line is beside the balance                                                            |
| This device, another account | **Held. Not named**                             | The device knows. B cannot see or act on it, so the change waits                              |
| Another device               | Goes through; the payment lands later, on top   | No device can know. This is the same as a paper slip posted later. The ledger shows both rows |

**The second row is the round 7 fix.** `unsentForEnrollment` reads through `getAllOrThrowIncludingOtherAccounts` and returns `{ mine, others }`: `mine` is the payments stamped with the signed-in account, and `others` is a count. With others present, she reads: "Not changed: a payment for this form was saved on this device under another account and has not reached myK9Show yet. It sends when that account signs in here again." It gives no amount and no account name. The owner scoping in § 6 holds, because B learns only that something is waiting, and that is the same fact the sign-out warning already tells A. A read that fails still refuses the change (`FORM_CHANGE_UNREADABLE`).

**The third row is accepted and written down**, so the next review does not reopen it. Closing it would take a server rule that orders money by when it was received, trusting device clocks. That is a migration and a change to money semantics, out of scope.

**B is stuck until A signs in.** On that one form, B cannot use Payment Due or Paid in Full: Online while A's payment waits. Record Payment and refunds still work. A shared laptop with two desk accounts and a form-wide change on the same form is rare, and the way out is real: A signs in and the payment sends. Letting B override with a confirmation was rejected, because that is the choice the guard exists to remove.

## 3. The round 7 P2s

1. **Cross-tab refresh.** Accepted, as in round 4. A second tab re-reads on focus and every 15 s while a line shows (`useDeskPaymentLines.ts`). No `BroadcastChannel`.
2. **Payment details in failure logs.** The queue-failure log in `ReplicationSyncProvider.tsx` logs a desk payment's mutation id, table and error code only, never its `rpc.args` or payload. A test asserts that the logged context has no amount, date or reference.
3. **A future received date.** Record Payment refuses, before saving, a received date after today on the show's calendar. This is the server's own rule ("received date % is after today", `20261114013900_myk9_1961_refunded_fee_not_owed.sql:480`), and the show's time zone comes from `getTrialTimezone`. It is in the dialog, so no queued payment can later be refused for it.
4. **Captive Wi-Fi with an expired token.** Owner resolution for a new queue entry tries the live `getSession()` first and falls back to the persisted id only on a throw (`mutation-identity.ts`). On captive Wi-Fi the refresh can hang rather than throw. A desk save gives the live lookup 2 s, then uses the persisted id, the same fallback on a timeout. Upload still checks the live account, and a mismatch holds the row as today. This is scoped to desk payments, so ringside ownership (MYK9-1204) is unchanged.

## 4. Do nothing, or delete

- **Close #4461 and stay online-only.** This keeps plan § 3's note ("No connection. Write the payment down…"). It is cheapest, and the December mock show does not need offline payments. Against it: the owner rejected "only tell her she is offline", the SWT Access-laptop parity bar is local-first, and #4461's core (save, replay under one id, states) has held since round 5. Rounds 6 and 7 found only the edges of the form-wide guard.
- **Remove the form-wide guard entirely,** applying "a late payment is real" to every row of the table. It is simpler, but on this device the line is shown right beside the button. Holding there is cheap, and it is what round 6 asked for.

**Recommendation:** adopt § 2 and § 3 on #4461, and set the stop now: **if round 8 finds a P1 in code this pass adds, close #4461** and stay online-only until after launch.

## 5. Testing

- **Real queue and IndexedDB, two accounts** (extending `deskPaymentHeld.test.ts`):
  - A queues offline and B is signed in: B's Payment Due is held, and the message has no amount.
  - A signs back in, the payment uploads, and B's change is free.
  - A's own held message is unchanged.
  - An unreadable store refuses the change.
- **Hook:** `useEnrollmentLedgerActions.formChange.test.ts` covers the "another account" message for both form-wide actions.
- **Logs:** a failed desk payment's logged context carries no amount, date or reference.
- **Date:** a received date after today on the show's calendar is refused before `queuePayment` is called, and today is accepted.
- **Owner lookup:** with `getSession` never resolving (fake timers), the local save commits within 2 s under the persisted id. A mismatched live account at upload holds the row.
- **Gate:** the whole app suite runs once shuffled, typecheck, lint, then Codex round 8 on #4461.
