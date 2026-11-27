# Offline desk payments: cash and check recorded with no connection (MYK9-1936 step 3)

> **Status:** Active

Linear: MYK9-1936, step 3. The owner chose this shape on 2026-11-26: the payment is shown beside the balance, never inside it. It builds on step 1 (#4446, a client payment id on every desk payment) and step 2 (MYK9-1930, #4158, a late entry gets its form when it syncs). App paths are under `apps/myk9show/src/`, queue files under `packages/replication/src/`, migrations under `supabase/migrations/`.

**Acceptance (as the issue now reads).** With no connection, a secretary records cash or a check on an entry form as normal. It shows as "waiting to send" next to the form's balance, which stays the server's figure. When the connection returns it is sent without her doing anything. A payment the server refuses is shown to her with the reason, and no longer shows as waiting to send. Close-out totals say when payments are still waiting to send. The app never implies a payment reached the server when it has not. **Not included:** card payments at the table, refunds, "Payment Due", "Paid in Full: Online", and any change to what the Financial Report counts.

## 1. What exists, and why

- **The write is online and not optimistic, on purpose** (`hooks/useEnrollmentLedgerActions.ts:160-161`, MYK9-677). The server computes status and the paid total under the form's lock, and the form is patched only from its answer (`:179-186`). This plan adjusts no local figure.
- **A repeated id is answered.** The core returns the form's answer for an id it already holds (`20261114013900_myk9_1961_refunded_fee_not_owed.sql:442-459`). The wrapper checks that the form exists and who may record before that (`20261126061937_myk9_1936_payment_id_same_date_and_reference.sql:39-48`), so a replay of a payment that landed can still meet a later refusal. An amount over the due is accepted (`20261114013900…:497-505`).
- **The queue.** It carries an RPC with exact `args` (`MutationManager.ts:167-208`). `prepareMutation` commits a local row and its queue row in one transaction (`:230-262`). An RPC insert's result is discarded (`mutation-execute.ts:104-135`). A dependent waits while its dependency is queued or dead-lettered (`MutationUploadRunner.ts:239-252`). A timeout while the uplink probe says "up" spends the retry budget (`mutation-retry.ts:41-61`), so a dead letter is not a refusal. `22023` retries unless the RPC is in `RPC_PERMANENT_CODES` (`mutation-utils.ts:272-274`). Direct write RPCs have no shared deadline (`features/at-show/staleClass/completeStaleClassRpc.ts:10-17`).
- **The generic failure toast** offers Try again and Discard for any dead letter (`providers/ReplicationSyncProvider.tsx:779-828`). Scores are excluded from it, because they have their own list (`:778-780`).

## 2. The shape

**Saved before any network attempt.** A cash or check save first writes a local payment record, keyed by its client payment id, in one transaction with its queue row (`prepareMutation`). The record holds the show, the form, the exhibitor's name, the amount, method, received time and check number. The queue row is table `show_payments`, `INSERT`, row id = the client payment id, `rpc: record_enrollment_payment` with explicit args. Online, the save is then sent at once. The first send and every replay use the same id.

**The amount received, always.** Every desk payment, online or offline, on its first send and on every replay, carries the explicit amount she typed: the money in the drawer. None ever sends NULL. **Paid in Full for cash and check was removed** (the owner's decision on 2026-11-27, after Codex round 4 on PR #4461): "Paid in Full" is online only (`markPaidOnline`), and every cash or check payment, the whole due or part of it, goes through the one Record Payment dialog, where she types the amount and nothing is filled in. So no figure the device read can go stale before it is sent, whether the due is known or reads "Amount not available". An amount over the balance lands as money on account, which is the truth about the cash received.

**A lost answer stays queued.** The queue is the only path that sends a desk payment (Codex round 3 on #4461; the direct send was removed). Online, the dialog asks the queue to send it at once and waits on that one mutation. An acknowledged send settles the record and queue row. A send that fails at the transport level, or gets no answer within 10 seconds (the precedent is 12 s, `completeStaleClassRpc.ts:17`), stays queued under the same id. This covers venue Wi-Fi with no internet, where `navigator.onLine` stays true. A refusal of the first send stays in the dialog; any other dead letter is shown on the payment's line.

**A form-wide change waits for the form's unsent payments** (Codex round 6 on #4461). "Payment Due" and "Paid in Full: Online" set what the whole form owes, on the server, at once. While this device holds a cash or check payment for the form that the server has not acknowledged, neither is sent: the payment would be recorded after it and undo it. She is told which payment it is, to wait for its line to clear or remove a refused one. A refund is not held, since it only takes back money the server already has. The form shows its lines from this device first, then again once a stopped payment's ledger check answers, so a slow check never hides a saved payment.

**Beside the balance.** The form keeps the server's total, paid and due exactly as today. Under them is one line per local payment, worded by what is known:

- "Cash $25.00 received at 10:14, waiting to send." No send has begun while the browser was online, so it never left the device.
- "Cash $25.00 received at 10:14, not confirmed. It will be sent again on its own." A send began and its outcome is unknown.

No subtraction, no adjusted figure, no enrollments replica, no new server guard. The line goes once the payment is proven recorded: an answer, or a ledger read that lists its client payment id (add `client_payment_id` to `LEDGER_COLUMNS`, `services/database/show-payments.ts:59`).

**Refresh after a replay.** A successful replay does three things for its show:

- reloads Entry Management's form money, `loadEntries` (`hooks/useEntryManagementData.ts:340`), which re-reads the enrollments (`services/database/entries/secretaryReadReplication.ts:185-208`);
- invalidates `['show-payments', showId]` (`showPaymentsQueryKey`, `show-payments.ts:63`);
- leaves open forms and an open close-out current without a reload.

The generic handler invalidates only `[tableName]` (`ReplicationSyncProvider.tsx:729-731`).

**States: unknown is never refused, and a new id is never minted.**

| State           | When                                                                                                                                     | She sees and may do                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Waiting to send | Queued, no send begun while online                                                                                                       | Nothing to do.                                                                             |
| Not confirmed   | A send began with no answer, or a `max-retries` dead letter                                                                              | **Try again**: the same mutation and id (`retryFailedMutation`, `MutationManager.ts:398`). |
| Not checked     | `42501`, a read the row may be hidden from, or a failed visibility check                                                                 | "This device cannot confirm it." **Try again** only.                                       |
| Refused         | A `22023` refusal, she passes the ledger's access check, **and** a ledger read by client payment id begun after the refusal finds no row | "Could not be sent: <reason>." **Remove**.                                                 |

**Ledger visibility.** An empty ledger read proves absence only for someone `show_payments_select` admits: a site admin, or a show office manager (`20260925181937_myk9_677_show_payments_ledger.sql:152-154`). Before reading, the check calls `is_site_admin` and `is_show_office_manager(show)`. Both are already granted to authenticated users (`154_fix_rls_recursion_people_policies.sql:99`, `20261004181900_myk9_1008_show_requires_club.sql:472`), so no migration is needed. If both are false, or either call fails, the payment stays Not checked.

A proven success settles the matching dead letter and deletes the local record. `RPC_PERMANENT_CODES` lists `22023` for the payment RPCs, and the dead letter keeps the Postgres code. Desk payments are excluded from the generic toast and its Discard, as scores are, and their actions live only on the rows below.

**A late entry not yet synced.** The entry's id is generated on the device (`features/registration/submitOfflineLateEntry.ts:286`) and kept by the server. The payment queues to a new RPC, `record_entry_form_payment(p_entry_id, …)`. Its `dependsOn` is `getUnsentMutationIdsForRow(entryId)` (`core/ReplicatedTable.ts:286`), which names a dead-lettered insert too. The payment therefore sends after the attach trigger has set the form (`20261119173700_myk9_1930_late_entry_gets_form.sql:393-450`). The RPC reads `entries.registration_id` and calls `record_enrollment_payment`, so the dedupe and permission are the same. With no form (`:403-422`), it refuses with "entry % has no entry form".

If the entry insert dead-letters, or lands with no form, the payment reads "Not confirmed: the entry it belongs to was not saved." She reconciles the cash in one of two ways:

- record it again on the entry once the entry exists;
- **Remove** it, when the cash is being returned or recorded on another form. The confirm dialog says so. This is allowed because the parent's own dead letter proves this payment was never sent, so no ledger row can hold its id.

A device-only form, which today has no payment control (`components/entries/management/EnrollmentCard.tsx:267-275`), gains Record Payment only. **This RPC is the plan's one migration and its only server change.**

**Where she sees it.**

- **Close-out.** The "Payments received" group (`features/show-workbench/ShowCloseoutSummary.tsx:147-157`) adds "N payments waiting to send" and "N payments not confirmed", and lists each with its state and actions. The chip is not "Ready" while any remain. Each row names the exhibitor from the local record, so a payment whose form is gone is still reachable. **Open form** uses the existing `?registration=` / `?entry=` link (`components/entries/management/entryManagementCockpitParams.ts:136-147`).
- **Financial Report.** A line beside its warning (`components/reports/FinancialReport.tsx:46`): "N payments on this device have not been confirmed as sent; this report counts only what the server has recorded."
- **Show Desk.** A pill, "N payments not confirmed". It links straight to the show's close step: `getResultsStepHref(showId, 'close')` (`features/results-tab/resultsTabRoutes.ts:96`). That is `/shows/:showId/results?step=close` (`routes/routeRegistry.ts:65`), which renders `ShowCloseStep` (`pages/secretary/ShowResultsSection.tsx:31-32,56`).

No new page or filter.

**Identity.** Queue only when the queue owner resolves (`mutation-identity.ts:55-69`); otherwise use the note in section 3. A different account signing in holds the row (`MutationUploadRunner.ts:309-315`). The sign-out guard counts it (`services/replication/unsentWork.ts:229-252`).

## 3. Do nothing

Keep it online and say "No connection. Write the payment down and record it here when you're back online." It is cheap. But the owner rejected "only tell her she is offline", it puts a paper ledger back on show day, and venue Wi-Fi with no internet still ends in "could not confirm". The note stays for refunds, "Payment Due" and an unresolved identity.

## 4. Split

1. **Save, send and replay.** The local record and queue row, explicit amounts, the bounded wait and handoff, `RPC_PERMANENT_CODES`, the states with the visibility and ledger checks, dead-letter settling, the refresh after a replay, and exclusion from the generic Discard. Done when:
   - a payment saves offline and sends on return;
   - a lost answer replays once;
   - no request carries a NULL amount;
   - no path mints a new id;
   - Remove appears only for a proven refusal.
2. **What she sees.** The lines on the form, the close-out group and chip, the report line, and the pill. Done when:
   - criteria 1, 3, 4 and 5 hold online and offline;
   - no server figure changes;
   - following the pill shows the affected payment.
3. **Late entry (migration).** `record_entry_form_payment`, its grants and SQL test, then Record Payment on a device-only form. `supabase db push` before the app half merges. Done when:
   - a payment on an unsynced late entry is recorded once, on the form the server attaches;
   - a failed parent reads as above.

## 5. Testing

- **Unit.** Assertion-first on the queue call: `toHaveBeenCalledWith('show_payments', 'INSERT', id, …, { name: 'record_enrollment_payment', args: expect.objectContaining({ p_client_payment_id: id, p_amount: 25 }) })`. Then:
  - a payment sends the amount she typed, not NULL;
  - an offline save, then its replay;
  - an unreachable RPC while `navigator.onLine` is true (fake timers, or a `TypeError`): queued under the same id and amount, reading Not confirmed;
  - a reload during the wait: the record and line persist and replay once;
  - after a replay, an open form and an open close-out update without a reload;
  - a `22023` with the access check passing and no ledger row: Refused;
  - a `42501`, or a failed access check: Not checked, with no Remove;
  - a `max-retries` dead letter the ledger later lists: settled, with no dead letter left;
  - a dead-lettered parent entry: the payment reads as above and offers Remove;
  - desk payments are absent from the generic toast.
- **Replay twice.** The first send commits and then throws a transport error; the second gets the answer. One ledger row, an empty queue, no dead letter.
- **SQL** (`supabase/tests/`, CI only): `record_entry_form_payment` resolves the form, dedupes a repeated id, and refuses an entry with no form.
- **E2e** (one spec, a row in `docs/qa/e2e-suite-map.md`, a seeded form with money due checked in `supabase/seed-demo.sql`):
  - offline: record a partial in cash, see the waiting line beside an unchanged balance and in close-out, then go online and see it clear with one ledger row;
  - unreachable: abort the RPC by route interception and see Not confirmed;
  - refused: answer with a `22023` body by route interception, never by writing to the shared database.

## 6. Carried into the PRs (Codex round 4, PR #4460)

The plan review stopped after four rounds. These are criteria for the implementation PRs, each of which gets its own independent review:

- **Late-entry recovery (PR 3).** When a dead-lettered entry insert is retried and succeeds, the original queued payment replays under its own id. Never "record it again", which would mint a second id. An entry that lands without a form has had its payment RPC attempted, so no parent dead letter proves it was never sent: that payment stays Not confirmed, with no Remove.
- **Owner scoping (PR 1, PR 2).** The local payment record is stamped with the queue owner. Form rows, close-out rows, counts and actions show only the signed-in owner's payments, including after an account switch on a shared desk device.
- **Paid in Full amount (PR 1).** Superseded: Paid in Full for cash and check was removed (the owner's decision on 2026-11-27, Codex round 4 on PR #4461). Record Payment sends the amount she typed, in whole cents; an amount that is not whole cents above $0 is not saved. The queue-argument test covers the amount.
- **Copy follows the queue state (PR 1, PR 2).** While the mutation is pending, the copy promises an automatic send and offers no Try again. Once it is dead-lettered, the copy says it will not send on its own and offers Try again (`retryFailedMutation`).
- **Reachable when close-out cannot load (PR 2).** The device's payment list on the close step renders independently of `ShowCloseStep`'s schedule and entries read gates. A test follows the pill with those inputs unavailable.
