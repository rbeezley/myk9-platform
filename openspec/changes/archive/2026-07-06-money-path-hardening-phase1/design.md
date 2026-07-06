## Context

MP-01's RPC persistence fix is already present in
`20260704210000_persist_payment_method_submit_entries.sql`: `submit_show_entries` now writes
`payment_method = p_payment_method` for the offline submission path, and
`submitEntriesPaymentMethod.source.test.ts` pins that contract. This change treats that migration
as the baseline and completes Phase 1 by adding the missing MP-02 status-transition guard.

Before that MP-01 migration, `submit_show_entries` accepted `p_payment_method`, used it for the
waived and `secretary_paid` authorization check, and used it to choose the initial
`payment_status`, but the entry INSERT omitted `payment_method`. Secretary-recorded check/cash
entries could therefore be misclassified and later feed payout calculations incorrectly.

`entries_protect_payment_fields()` currently guards `entry_fee`, `payment_method`, and
`stripe_payment_intent_id`, but not `payment_status`. That leaves the payout predicate's status
input writable by show managers. This change is schema/RPC integrity work under existing entry
submission and payment workflows; it does not add a user-facing surface and does not change
offline replication contracts directly.

## Goals / Non-Goals

**Goals:**

- Preserve and verify the entry payment method persistence supplied by the existing
  `submit_show_entries` migration.
- Prevent non-`service_role` writers from moving an online entry into `paid` or `refunded`.
- Keep desk-payment staff workflows intact for `cash`, `check`, `waived`, and `secretary_paid`.
- Preserve the legitimate Stripe/webhook write path through the existing `service_role` role check.
- Add assertion-first tests that prove the previous incorrect value and the new guard behavior.
- Leave an explicit pre-go-live audit query for existing `online` rows without Stripe intent IDs.

**Non-Goals:**

- No UI, page, dialog, or workflow surface is added.
- No MP-03, MP-04, or later money-path findings are implemented in this phase.
- No blanket correction of existing production/staging rows is performed.
- No shared database push or edge-function deploy is run without confirmation.

## Decisions

1. **Persist `p_payment_method` in the RPC INSERT.**

   This is already implemented by `20260704210000_persist_payment_method_submit_entries.sql`.
   Keep it in the Phase 1 focused test set so MP-01 and MP-02 ship together as one money-path
   gate, but do not duplicate the RPC migration.

   Alternative considered: infer desk methods later from registration/cart state. Rejected because
   payout integrity needs the row to be correct at creation time, and the RPC already has the
   intended method.

2. **Use a dedicated `entries.payment_status` transition guard.**

   Add a `before update` trigger that fires when `payment_status` changes. It SHALL return
   immediately for `current_setting('role', true) = 'service_role'`. For non-service writers, it
   SHALL reject transitions into `paid` or `refunded` when the row's effective payment method is
   `online`.

   Alternative considered: fold this into `entries_protect_payment_fields()`. A separate trigger is
   easier to rollback and limits the blast radius of a high-risk payment-status change.

3. **Guard online rows against same-update relabeling.**

   The payment-status trigger should reject transitions into `paid`/`refunded` when either the old
   or new row method is `online`. This prevents a single update from relabeling an online row to a
   desk method and marking it paid in the same statement. Legitimate desk-payment rows whose old
   and new methods are both non-online remain governed by existing staff/RLS authorization.

4. **Keep tests close to the database contract.**

   Use the existing database/source-test style in `apps/myk9show/src/test/database` where possible.
   At minimum, tests must assert the RPC definition inserts `payment_method`, the status trigger
   exists and blocks online paid/refunded transitions for non-service roles, and the `service_role`
   bypass remains present. If a runnable Supabase harness exists for these migrations, add behavior
   tests there.

## Risks / Trade-offs

- **Risk: blocking legitimate Stripe paid marking** -> Mitigation: service-role bypass is mandatory,
  and tests must prove the bypass remains.
- **Risk: blocking legitimate desk-payment staff workflows** -> Mitigation: the guard only blocks
  online rows moving into payout-eligible paid/refunded states.
- **Risk: deployed migration breaks payment recording** -> Mitigation: make the status trigger a
  standalone object; rollback is a follow-up migration dropping that trigger.
- **Risk: existing mislabeled rows remain payout-eligible** -> Mitigation: ship an explicit audit
  query and require row-by-row human disposition before live payouts.

## Migration Plan

1. Confirm the existing `submit_show_entries` migration and source contract remain green.
2. Add a migration for the `entries.payment_status` transition guard.
3. Run focused database/source tests, typecheck/lint as required by touched files, and migration
   auditor review.
4. Before any shared database push, run `supabase db push --dry-run` and request confirmation.
5. After push, verify a real or staging online payment path can still mark entries paid through
   the service-role path.
6. Before live cutover, run and record:

   ```sql
   SELECT count(*)
   FROM entries
   WHERE payment_method = 'online'
     AND stripe_payment_intent_id IS NULL
     AND payment_status IN ('paid', 'refunded');
   ```

   Every remaining row must be zero or documented with a row-level rationale.

## Open Questions

- Whether to split the RPC fix and payment-status trigger into two migrations or one migration will
  be decided during implementation based on local migration conventions and test ergonomics.
