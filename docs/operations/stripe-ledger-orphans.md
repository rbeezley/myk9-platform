# Orphaned `stripe_orders` rows — accepted, counted, pruned only on review

> **Decision record.** Standing operator state, not a Linear task. Filed with MYK9-527 /
> PR [#2261](https://github.com/rbeezley/myk9-platform/pull/2261).

## What they are

`public.stripe_orders` carries two scope columns — `show_id` and `enrollment_id`. Until
migration `20260915191700_stripe_ledger_fks_restrict.sql` both were `ON DELETE SET NULL`
(`pg_constraint.confdeltype = 'n'`), so every show delete — including the enrollments
cascade a show delete fires — silently nulled the scope of any order that pointed at it.

As of 2026-09-16, **23 rows on the linked database (`sojmvhhwsjxmfistvzbe`) hold NULL in
both columns**, spanning 2026-06-10 .. 2026-09-15, $1,185.30 in total. Nothing joins them
to what they paid for any more.

The 23rd row was added deliberately, not by the bug this document describes.
`472bb590-6679-47af-bf0a-f073b2021146` ($64.20, `pi_3UFxuBAIej2Q9UtX38KBxSaL`,
`cs_test_b1iEYG7lFiOH02moOWCnmdWfs94KNO2vGuYLfJfOogtTrZeDpJU5C7WVMA`, `succeeded`,
created 2026-09-15) pointed at show `dededede-…011` and enrollment
`a44a9bd8-2c67-4838-b31d-48e9eaaa19b3`. Both scope columns were nulled by hand on
2026-09-16 to clear the `order_stray` arm of the reseed's money guard, with Richard's
approval and the scope recorded first. Its enrollment was **checkout-created**, not the
seed's fixed `…070`, so the show delete cascaded that enrollment away and nothing
re-inserts it — the reattach the `seed-reset` skill offers for fixed ids is impossible
here, which is why the row is recorded as detached for good rather than restored. Migration
`20260915191700` (MYK9-527) is what stops a reseed making more of these silently; this one
was a reviewed operator step, which is the only way new rows should ever arrive.

## The decision: keep them

They are **accepted and kept deliberately**, not scheduled for deletion.

- **Payment identity is intact.** Each row still carries `stripe_payment_intent_id`,
  `stripe_checkout_session_id`, `amount_cents`, the fee split
  (`platform_fee_cents` / `stripe_processing_fee_cents`) and `refunded_cents`. A refund or a
  reconciliation against Stripe resolves through the payment intent, which never depended on
  the scope columns. Deleting the rows would destroy the only local record of those charges.
- **What is lost is scope, and scope cannot be recovered.** There is no stamped-identity
  column to rebuild `show_id` from; the parent rows are gone.
- **They constrain nothing.** `ON DELETE RESTRICT` fires on a delete of the _parent_. A row
  whose `show_id` and `enrollment_id` are both NULL references no parent, so it can never
  block a show, enrollment or reseed. Verified by the rolled-back staging probe recorded on
  PR #2261 (`F527.2` deletes a show cleanly with all 22 rows present; `F527.5` counts them).

## They are counted on every reseed

`supabase/seed-demo.sql` raises a `WARNING` naming the count on every run, so the number is
visible rather than forgotten:

```
seed-demo: N stripe_orders row(s) already have BOTH show_id and enrollment_id nulled by an
earlier reseed and can no longer be joined to what they paid for (MYK9-527). They are left
in place deliberately … Prune only as a reviewed operator step.
```

The seed's stray guard deliberately does **not** match already-orphaned rows — matching them
would wedge every reseed on these 23. Pinned by
`apps/myk9show/src/test/database/seedDemoSelfCleaningRelationshipDeleteContract.test.ts`.

## Pruning — a reviewed operator step, never automatic

Do not add this to a cron, a seed, or a migration. If a prune is ever agreed, review the rows
first:

```sql
SELECT id, status, amount_cents, refunded_cents, stripe_payment_intent_id,
       stripe_checkout_session_id, created_at
FROM public.stripe_orders
WHERE show_id IS NULL AND enrollment_id IS NULL
ORDER BY created_at;
```

Reconcile each `stripe_payment_intent_id` against the Stripe dashboard, confirm no refund or
dispute is outstanding, then, inside a transaction and only for the ids you reviewed
(`stripe_order_refunds.order_id` is `ON DELETE RESTRICT`, so the refund rows go first):

```sql
BEGIN;
DELETE FROM public.stripe_order_refunds WHERE order_id IN ('<reviewed-id>', …);
DELETE FROM public.stripe_orders
WHERE id IN ('<reviewed-id>', …)
  AND show_id IS NULL AND enrollment_id IS NULL;  -- re-assert the orphan predicate
-- verify the counts, then COMMIT (or ROLLBACK).
COMMIT;
```

Never `DELETE … WHERE show_id IS NULL AND enrollment_id IS NULL` unqualified: the predicate
would also catch a brand-new order whose scope has not been written yet.
