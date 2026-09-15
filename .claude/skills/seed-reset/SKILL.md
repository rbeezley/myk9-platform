---
name: seed-reset
description: "Use when reseeding dev/staging demo data, when e2e or demo accounts can't sign in (400s), when a role sees empty pages after a reseed, or when someone asks to 'reset the database', 'fix the test accounts', or 'reseed demo data'."
user-invocable: true
---

# Seed Reset

Dev/staging run on the idempotent `seed-demo.sql` demo dataset (clean-wiped 2026-06-17). Most "data is broken" reports after a reseed are one of the known gaps below — check those before writing any SQL, and read the abort headings before deciding the seed is broken.

## Canonical accounts

Sign-in-capable accounts are the `@myk9t.com` set (exhibitor, secretary, judge, clubadmin, chairman, steward, testadmin — see the table in the `audit-pages` skill). They replaced `e2e-*@test.myk9.com` on 2026-08-23, when that undeliverable domain was retired. `exhibitor1/3/4/5@myk9t.com` remain demo fixture rows holding no roles. All e2e accounts share one password kept in `.env.local`.

## Known failure modes after a reseed

| Symptom                                                              | Cause                                                                              | Fix                                                                                                                          |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Sign-in 400 for a `@myk9t.com` account                               | Supabase Auth passwords drifted from `.env.local` — auth state, not code           | Reset the auth passwords (admin API or dashboard), don't debug the app                                                       |
| Secretary/club-admin pages empty                                     | Missing club-scoped role grants                                                    | `seed-demo.sql` §10 grants them (fixed #804) — confirm those rows exist in `roles`/`role_permissions`                        |
| Feature works for admin, not other roles                             | RBAC seed gap                                                                      | Inventory `roles`, `permissions`, `role_permissions` in ONE query batch before writing any INSERT (CLAUDE.md debugging rule) |
| The seed ABORTS or WARNS about entries, enrollments or Stripe orders | The money guards in section 0 of `seed-demo.sql` refused to cascade something away | Copy the full error text and find its heading in the next section. An abort here is the guard working, not the seed breaking |

## When the seed aborts: the money guards

Section 0 of `seed-demo.sql` refuses, on purpose, to delete rows that carry real money. Every message below is quoted from the seed, so search this file for the sentence you saw. Each one names the count; the three broad guards also print the first 10 ids.

**Before you delete anything the guard named:** decide whether it is real. If it is, record what you are about to lose first. Hard-deleting an entry cascades its `entry_status_history` away, and a `stripe_orders` row that lists that entry in `entry_ids` keeps pointing at the deleted id with no error, because that column has no foreign key. Soft-deleting never clears any of these guards: none of them look at `deleted_at`, deliberately, because a soft-deleted row still cascades. Never widen a guard to get past it.

To see the rows with their evidence, the named CTEs need their dependencies. Copy `scope_shows`, `stray` and the CTE you want from the guard block (find it with `grep -n 'substantiated AS (' supabase/seed-demo.sql` and siblings; the line offsets printed in the seed's own error text are stale) and run, for example:

```sql
SELECT * FROM stray WHERE id IN (SELECT id FROM substantiated);
```

`substantiated` alone returns only ids and cannot tell a real check payment from fixture noise; `stray` carries `payment_method`, `entry_fee`, `payment_reference`, `payment_received_on`, `payment_notes`, the refund columns and `stripe_payment_intent_id`.

### ABORT: `paid or refunded entr(ies) with a real payment trail sit on a show, trial, class or dog this reseed deletes`

An entry with money evidence sits on a show, trial, class or dog the seed deletes. Evidence means any of: a Stripe payment intent, a `stripe_orders` row listing the entry, a `payment_reference`, any of the three refund columns, a `payment_method` set to anything but `waived` (NULL does not count), a `payment_received_on` date, `payment_notes`, or any `entry_status_history` row. A walk or manual test left it there (MYK9-526).

1. Run the query above and look at each id's evidence.
2. A zero-fee `secretary_paid` entry with nothing else behind it (`payment_method = 'secretary_paid'`, `entry_fee = 0.00`, no reference, no history, no order) is fixture noise and safe to hard-delete. That false abort is MYK9-539.
3. Anything else is real. Record the trail, then hard-delete the entry by id: `DELETE FROM public.entries WHERE id IN (...)`. If a `stripe_orders` row lists the entry, deal with that order first under the Stripe heading below; deleting the entry does not fix the order.

### WARNING: `entr(ies) on data this reseed deletes carry no payment trail`

A `paid` or `refunded` status label with nothing behind it: no history, no Stripe record, no reference, and a method that is NULL or `waived`. Usually a status set by hand. Not an abort for this guard: the reseed continues and the cascades remove them. The list is capped at 10 ids. One exception: if such an entry hangs off the demo exhibitor's enrollment on show `...010`, the narrower guard below aborts on the label alone.

### ABORT: `paid or refunded enrollment(s) sit on a show this reseed deletes`

`enrollments.show_id` is ON DELETE CASCADE, and a paid or refunded enrollment sits on a seed-deleted show (MYK9-528). Run `enrollment_stray` as a SELECT with `scope_shows`. Two constraints point into `enrollments` and will block a bare delete with a 23503: `entries.registration_id` (NO ACTION) and `stripe_orders.enrollment_id` (RESTRICT). Clear the enrollment's entries first, following the entries heading above. If a `stripe_orders` row is what blocks it, that is the Stripe case below, not a row to delete. Then hard-delete the enrollment by id; there is no soft-delete column to set instead.

### ABORT: `Stripe order(s) point at a show this reseed deletes, or at an enrollment on one of those shows`

Both `stripe_orders` scope FKs are ON DELETE RESTRICT since migration `20260915191700` (MYK9-527), so the seed refuses before the FK would fail with a raw violation. Run `order_stray` as a SELECT with `scope_shows`. There is no surviving show to reassign to: the seed deletes every show in scope. Two honest exits:

- **Keep the ledger row, lose the link.** `UPDATE public.stripe_orders SET show_id = NULL, enrollment_id = NULL WHERE id IN (...)`. This clears the guard, keeps the payment intent, checkout session, amount and fee split, and puts the row in exactly the class `docs/operations/stripe-ledger-orphans.md` says is kept deliberately. This is the default.
- **Delete the row** only as a reviewed step, which for a solo operator means reconciling it against Stripe first. `stripe_order_refunds.order_id` is RESTRICT too, so a refunded order will not delete without its refund rows.

That decision record covers rows that are ALREADY orphaned; do not copy its prune SQL for these, since its predicate requires both scope columns to be NULL and will match nothing here.

### WARNING: `stripe_orders row(s) already have BOTH show_id and enrollment_id nulled by an earlier reseed`

Fires on every reseed while any fully-orphaned order exists (22 on staging as of 2026-09-15). These rows are counted and kept on purpose (MYK9-527); the reseed never touches them. Do nothing. `docs/operations/stripe-ledger-orphans.md` is the record of that decision and the only place they get pruned.

### ABORT: `paid or refunded entr(ies) hang off the demo exhibitor's enrollment on show ...010`

The older, narrower guard on the demo exhibitor's own enrollment, reached through `entries.registration_id`. It prints a count only, no ids, and fires on the `paid`/`refunded` label alone, trail or not. Find them with:

```sql
SELECT e.* FROM public.entries e
JOIN public.enrollments en ON en.id = e.registration_id
WHERE (en.id = 'dededede-0000-0000-0000-000000000070'
    OR (en.show_id = 'dededede-0000-0000-0000-000000000010'
        AND en.handler_id = (SELECT id FROM public.people WHERE lower(email) = 'exhibitor@myk9t.com')))
  AND e.payment_status IN ('paid', 'refunded');
```

Then follow the entries heading above: decide, record, hard-delete.

### Preflight refusals

Messages beginning `seed-demo preflight:` are a different category: a misconfigured database, not a money stray. The `trial_packet_snapshots` ones need packet objects removed through the Storage API before reseeding; the person, role and auth ones mean a canonical account is missing or duplicated. None of them is cleared by deleting entries.

## Reseeding procedure

1. Confirm target is dev/staging — **never** run seed SQL at a production ref without explicit instruction. Project ref: `sojmvhhwsjxmfistvzbe`.
2. Reseed is a shared-system write: confirm with the user first (Auto Mode rule).
3. Run `seed-demo.sql` with its output captured to a file. It is idempotent over its own rows, but it ABORTS by design rather than cascade away an entry, enrollment or Stripe order that carries real money, and it WARNS about rows it removed. Afterwards `grep -i warning` the captured output, because a warning in 400 lines of output is easy to miss and the rows it names are gone. An abort is the guard working; find its heading above before touching any SQL.
4. Verify, in one query batch: demo shows/trials/classes/entries exist; §10 role grants exist; `auth.users` rows exist for all seven `@myk9t.com` sign-in accounts.
5. Smoke-test sign-in for secretary and exhibitor (two-step SmartSignInPage flow) before declaring done.

## Guardrails

- The demo exhibitor (`exhibitor@myk9t.com`) is a protected account with seeded dogs — don't delete or repurpose it.
- Person-delete is trigger-blocked when the person owns live dogs; surface the edge-fn error CODE rather than fighting it.
- After schema changes, re-check that seed SQL still satisfies CHECK constraints and enum values before pushing (memory: db-constraint-review).
- Never delete a row that carries a payment trail without recording the trail first. The seed's guards exist to stop the cascade from doing it silently; an operator doing it by hand without a record is the same loss.
