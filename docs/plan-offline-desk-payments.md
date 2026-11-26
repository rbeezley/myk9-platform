# Offline desk payments: cash and check recorded with no connection (MYK9-1936 step 3)

> **Status:** Active

Linear: MYK9-1936, step 3. The owner chose this shape on 2026-11-26: the payment is shown beside the balance, never inside it. It builds on step 1 (#4446, a client payment id on every desk payment) and step 2 (MYK9-1930, #4158, a late entry gets its form when it syncs). App paths are under `apps/myk9show/src/`, queue files under `packages/replication/src/`, migrations under `supabase/migrations/`.

**Acceptance (as the issue now reads).** With no connection, a secretary records cash or a check on an entry form as normal. It shows as "waiting to send" next to the form's balance, which stays the server's figure. When the connection returns it is sent without her doing anything. A payment the server refuses is shown to her with the reason, and no longer shows as waiting to send. Close-out totals say when payments are still waiting to send. The app never implies a payment reached the server when it has not. **Not included:** card payments at the table, refunds, "Payment Due", "Paid in Full: Online", and any change to what the Financial Report counts.

## 1. What exists, and why

- **The write is online and not optimistic, on purpose** (`hooks/useEnrollmentLedgerActions.ts:160-161`, MYK9-677). The server computes status and the paid total under the form's lock, and the form is patched only from its answer (`:179-186`). This plan keeps that: no local figure is ever adjusted.
- **The server answers a repeated id.** The core returns the form's answer for an id it already holds (`20261114013900_myk9_1961_refunded_fee_not_owed.sql:442-459`). Before that, the wrapper checks that the form exists and who may record (`20261126061937_myk9_1936_payment_id_same_date_and_reference.sql:39-48`). So a replay of a payment that landed can still meet a later refusal.
- **The queue** can carry an RPC with exact `args` (`MutationManager.ts:167-208`). `prepareMutation` commits a local row and its queue row in one transaction (`:230-262`). An RPC insert's result is discarded (`mutation-execute.ts:104-135`). A dependent mutation waits behind its dependency (`MutationUploadRunner.ts:239-252`). A timeout while the uplink probe says "up" spends the retry budget (`mutation-retry.ts:41-61`), so a dead letter is not proof of refusal. `22023` is retryable unless the RPC is listed in `RPC_PERMANENT_CODES` (`mutation-utils.ts:272-274`). Direct write RPCs have no shared deadline (`features/at-show/staleClass/completeStaleClassRpc.ts:10-17`).
- **Generic failure toast.** It offers Try again and Discard for any dead letter (`providers/ReplicationSyncProvider.tsx:779-828`). Scores are already excluded because they have their own list (`:778-780`).

## 2. The shape

**Saved before any network attempt.** A cash or check save first writes a local payment record keyed by its client payment id, in one transaction with its queue row (`prepareMutation`). The record holds the show, form, exhibitor's name, amount, method, received time and check number. The queue row is table `show_payments`, `INSERT`, row id = the client payment id, `rpc: record_enrollment_payment` with explicit args. Online, the save is then sent at once. Immediate delivery and every replay use the same id.

**A lost answer stays queued.** If the direct send gets its answer, the record and queue row are settled from it, as today. If it fails at the transport level, or gets no answer within 10 seconds (the precedent is 12 s, `completeStaleClassRpc.ts:17`), it stays queued under the same id. This covers venue Wi-Fi with no internet, where `navigator.onLine` stays true. The dialog closes, reading "Waiting to send. It will be sent on its own." (`features/at-show/scoresNotSent/unsentScoreReason.ts:64`). A refusal inside the wait stays in the dialog, as today.

**Beside the balance.** The form keeps the server's total, paid and due exactly as today, including "Amount not available" offline (`components/entries/management/enrollmentPayment.ts:209-226`). Under them, one line per local payment: "Cash $25.00 received at 10:14, waiting to send." No subtraction, no adjusted figure, no enrollments replica, no new server guard. The line goes when the payment is proven sent: an answer, or a ledger read listing its client payment id (add `client_payment_id` to `LEDGER_COLUMNS`, `services/database/show-payments.ts:59`).

**Paid in Full offline: disabled; Partial with an explicit amount.** Recommended over sending NULL. Offline the form shows no due, so she cannot see what "Paid in Full" would record. NULL is computed at arrival and can land as a different figure, or as $0 with no ledger row (`20261114013900…:496-505`), while she holds the cash. Partial records exactly what she took. "Paid in Full" is already disabled when the amount is unknown (`EnrollmentFullPaymentDialog.tsx:109`). Online it keeps sending NULL: its answer normally comes inside the wait, the server computes the due under lock, and a handed-off replay with the same id is answered by the dedupe if the first send landed. One residue remains: a NULL send handed off that never landed is computed at its replay.

**Failures: "Not sent yet", never a new id.**

| State        | When                                                                                                                            | She sees and may do                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Waiting      | Queued, no answer                                                                                                               | "Waiting to send." Nothing to do.                                                          |
| Not sent yet | A `max-retries` dead letter, or any refusal not yet confirmed                                                                   | **Try again**: the same mutation and id (`retryFailedMutation`, `MutationManager.ts:398`). |
| Not checked  | An access error: `42501`, or a ledger or form read that cannot see the row (RLS)                                                | "Not checked: this device cannot confirm it." **Try again** only. Never proof of absence.  |
| Refused      | A coded refusal (`22023`) on a form she can still read, **and** a ledger check by client payment id begun after it finds no row | "Could not be sent: <reason>." **Remove**.                                                 |

A proven success (an answer, or the ledger listing the id) settles the matching dead letter and deletes the local record. `RPC_PERMANENT_CODES` lists `22023` for the payment RPCs, and the dead letter keeps the Postgres code. Desk-payment mutations are excluded from the generic toast and its Discard, the way scores are (`ReplicationSyncProvider.tsx:778-780`). Their actions live only on the rows below.

**A late entry not yet synced.** The round-1 design stands. The entry's id is generated on the device (`features/registration/submitOfflineLateEntry.ts:286`) and kept by the server. The payment queues to a new RPC, `record_entry_form_payment(p_entry_id, …)`, with `dependsOn` the entry's insert (`core/ReplicatedTable.ts:275`). So it sends after the attach trigger has set the form (`20261119173700_myk9_1930_late_entry_gets_form.sql:393-450`). The RPC reads `entries.registration_id` and calls `record_enrollment_payment`, so the dedupe and permission are the same. It refuses with "entry % has no entry form" when the trigger skipped it (`:403-422`). A device-only form today shows no payment control (`components/entries/management/EnrollmentCard.tsx:267-275`); it gains Partial Payment only. **This RPC is the plan's one migration and only server change.** If the entry is refused, the payment waits behind it and reads "Waiting on the entry, which could not be sent."

**Where she sees what is waiting.** Close-out's "Payments received" group (`features/show-workbench/ShowCloseoutSummary.tsx:147-157`) adds "N payments waiting to send". It lists the device's unsettled payments with their state and actions, and the chip is not "Ready" while any wait. Each row names the exhibitor from the local record, so a payment whose form is gone is still reachable there. **Open form** uses the existing `?registration=` / `?entry=` link (`components/entries/management/entryManagementCockpitParams.ts:136-147`). The Financial Report adds, beside its warning (`components/reports/FinancialReport.tsx:46`): "N payments on this device have not been confirmed as sent; this report counts only what the server has recorded." Show Desk gets an "N payments not sent" pill linking to the close step, through the existing Finish-list link (`features/show-map/showDeskPendingSignals.ts:226,243`). No new page or filter.

**Identity.** Queue only when the queue owner resolves (`mutation-identity.ts:55-69`). Otherwise use the note below. A different account signing in holds the row (`MutationUploadRunner.ts:309-315`), and the sign-out guard already counts it (`services/replication/unsentWork.ts:229-252`).

## 3. Do nothing

Keep it online and say "No connection. Write the payment down and record it here when you're back online." It is cheap. But the owner rejected "only tell her she is offline", it puts a paper ledger back on show day, and venue Wi-Fi with no internet still ends in "could not confirm". The note stays for refunds, "Payment Due" and an unresolved identity.

## 4. Split

1. **Save, send and replay.** The local record and queue row in one transaction, the bounded wait and handoff, `RPC_PERMANENT_CODES`, the states with the ledger check, dead-letter settling, and exclusion from the generic Discard. Done when: payments save offline and send on return, a lost answer replays once, no path mints a new id for an unproven failure, and Remove appears only for a confirmed refusal.
2. **What she sees.** The waiting lines on the form, offline Paid in Full disabled, the close-out group and chip, the report line, and the Show Desk pill. Done when: criteria 1, 3, 4 and 5 hold online and offline, and no server figure changes.
3. **Late entry (migration).** `record_entry_form_payment`, its grants and SQL test, then Partial Payment on a device-only form with `dependsOn`. `supabase db push` before the app half merges. Done when: a payment taken on an unsynced late entry is recorded once on the form the server attaches.

## 5. Testing

- **Unit.** Assertion-first on the queue call: `toHaveBeenCalledWith('show_payments', 'INSERT', id, …, { name: 'record_enrollment_payment', args: expect.objectContaining({ p_client_payment_id: id }) })`. Then:
  - an offline save, then its replay;
  - an unreachable RPC while `navigator.onLine` is true (fake timers, or a `TypeError`), queued under the same id;
  - a reload during the wait, after which the record and line persist and replay once;
  - a coded refusal on a readable form whose id the ledger lacks, which becomes Refused;
  - a `42501`, or a ledger read that cannot see the row, which stays Not checked with no Remove;
  - a `max-retries` dead letter that the ledger later lists, which is settled and leaves no dead letter;
  - desk payments absent from the generic toast.
- **Replay twice.** The first send commits and then throws a transport error; the second gets the answer. One ledger row, an empty queue, no dead letter.
- **SQL** (`supabase/tests/`, CI only): `record_entry_form_payment` resolves the form, dedupes a repeated id, and refuses an entry with no form.
- **E2e** (one spec, a row in `docs/qa/e2e-suite-map.md`, a seeded form with money due, checked in `supabase/seed-demo.sql`). Offline: record a partial in cash, see the waiting line beside an unchanged balance and in close-out, then go online and see it clear with one ledger row. Online but unreachable: abort the RPC by route interception and see Waiting. Refused: answer with a `22023` body by route interception, never by writing to the shared database.
