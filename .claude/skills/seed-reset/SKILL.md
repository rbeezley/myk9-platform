---
name: seed-reset
description: "Use when reseeding dev/staging demo data, when e2e or demo accounts can't sign in (400s), when a role sees empty pages after a reseed, or when someone asks to 'reset the database', 'fix the test accounts', or 'reseed demo data'."
user-invocable: true
---

# Seed Reset

Dev/staging run on the idempotent `seed-demo.sql` demo dataset (clean-wiped 2026-06-17): the lean set of two clubs, the three Heartland shows, six dogs and the role accounts. The MYK9-109 load fixture (63 load dogs and 504 entries on the demo show, three load clubs and shows with 189 dogs) is a separate, opt-in file, `supabase/seed-load-fixture.sql` (MYK9-558). Most "data is broken" reports after a reseed are one of the known gaps below — check those before writing any SQL, and read the abort headings before deciding the seed is broken.

## Canonical accounts

Sign-in-capable accounts are the `@myk9t.com` set (exhibitor, secretary, judge, clubadmin, chairman, steward, testadmin — see the table in the `audit-pages` skill). They replaced `e2e-*@test.myk9.com` on 2026-08-23, when that undeliverable domain was retired. `exhibitor2@myk9t.com` also exists on staging and can sign in; `exhibitor3/4/5` are declared in `testUsers.ts` but are not present on staging. The `audit-pages` table lists five of the seven, not chairman or steward. All e2e accounts share one password kept in `.env.local`.

## Known failure modes after a reseed

| Symptom                                                              | Cause                                                                              | Fix                                                                                                                          |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Sign-in 400 for a `@myk9t.com` account                               | Supabase Auth passwords drifted from `.env.local` — auth state, not code           | Reset the auth passwords (admin API or dashboard), don't debug the app                                                       |
| Secretary/club-admin pages empty                                     | Missing club-scoped role grants                                                    | `seed-demo.sql` §10 grants them (fixed #804) — confirm those rows exist in `roles`/`role_permissions`                        |
| Feature works for admin, not other roles                             | RBAC seed gap                                                                      | Inventory `roles`, `permissions`, `role_permissions` in ONE query batch before writing any INSERT (CLAUDE.md debugging rule) |
| The seed ABORTS or WARNS about entries, enrollments or Stripe orders | The money guards in section 0 of `seed-demo.sql` refused to cascade something away | Copy the full error text and find its heading in the next section. An abort here is the guard working, not the seed breaking |

## When the seed aborts: the money guards

**Precondition (MYK9-538):** the entries/enrollments/Stripe guard is now the function `public.seed_demo_assert_no_paid_strays()`, added by migration `20260916213500`. Push that migration before the next reseed. Without it the seed aborts on `ERROR: 42883: function public.seed_demo_assert_no_paid_strays() does not exist` — before any parent delete, with the whole transaction rolled back, so the database is untouched. `supabase migration list` tells you whether the target database has it.

Section 0 of `seed-demo.sql` refuses, on purpose, to delete rows that carry real money. Every message below is quoted from the seed, so search this file for the sentence you saw. Each one names the count; five of them also print the first 10 ids — the exception is the already-orphaned-order WARNING further down, which reports a count only (MYK9-562: the seed used to carry a second, narrower `...010`-scoped Stripe-orders guard that also printed a count only; it was deleted because `order_stray` already covered its scope and always raised first). The whole file runs inside one `BEGIN`/`COMMIT` under `psql -v ON_ERROR_STOP=1 -f` (see the seed's header), which is why an abort leaves the database untouched rather than half-reseeded. The guards raise one at a time, so clearing one and rerunning can surface the next; that is expected, not a regression.

**Before you delete anything the guard named:** decide whether it is real. If it is, record what you are about to lose first. Hard-deleting an entry cascades its `entry_status_history` away, and a `stripe_orders` row that lists that entry in `entry_ids` keeps pointing at the deleted id with no error, because that column has no foreign key. Soft-deleting never clears any of these guards: none of them look at `deleted_at`, deliberately, because a soft-deleted row still cascades. Never widen a guard to get past it.

To see the rows with their evidence, the named CTEs need their dependencies. Since MYK9-538 the guard is no longer inline in the seed — `seed-demo.sql` § 0 just calls `SELECT public.seed_demo_assert_no_paid_strays();`, and the CTEs live in the function body. Read it from the database with `\sf public.seed_demo_assert_no_paid_strays` in `psql`, or from the repo with `grep -rl 'CREATE OR REPLACE FUNCTION public.seed_demo_assert_no_paid_strays()' supabase/migrations/` and open the LAST file listed (an older one may define an earlier shape). Copy `scope_shows`, `stray` and the CTE you want, prefix them with `WITH`, drop the trailing comma from the last one you pasted, and run, for example:

```sql
SELECT s.*,
       EXISTS (SELECT 1 FROM public.entry_status_history h WHERE h.entry_id = s.id) AS has_history,
       EXISTS (SELECT 1 FROM public.stripe_orders o WHERE o.entry_ids @> ARRAY[s.id]) AS in_order
FROM stray s
WHERE s.id IN (SELECT id FROM substantiated);
```

`substantiated` alone returns only ids and cannot tell a real check payment from fixture noise. `stray` carries `payment_method`, `entry_fee`, `payment_reference`, `payment_received_on`, `payment_notes`, the refund columns and `stripe_payment_intent_id`, but not the two `EXISTS` terms; the two extra columns above are what let you evaluate "no history, no order" below.

### ABORT: `paid or refunded entr(ies) with a real payment trail sit on a show, trial, class or dog this reseed deletes`

An entry with money evidence sits on a show, trial, class or dog the seed deletes. Evidence means any of: a Stripe payment intent, a `stripe_orders` row listing the entry, a `payment_reference`, any of the three refund columns, a `payment_received_on` date, `payment_notes`, or any `entry_status_history` row — each of those on its own, at any fee. A `payment_method` also counts on its own, at any fee, EXCEPT `waived` (never evidence) and `secretary_paid`, which counts only when the row also carries a non-zero `entry_fee`; a NULL method never counts. `secretary_paid` is carved out because it is the secretary wizard's default and is routinely written on a $0.00 entry where no money moved (MYK9-539); a NULL `entry_fee` reads as unpriced, so it lands on the lenient side too. A walk or manual test left the row there; the guard was added under MYK9-526.

1. Run the query above and look at each id's evidence.
2. A zero-fee `secretary_paid` entry with nothing else behind it (`payment_method = 'secretary_paid'`, `entry_fee = 0.00` or NULL, no reference, no history, no order) no longer reaches this abort at all — MYK9-539 moved it to the WARNING below, and the reseed cascades it away without stopping. If you still see one named here, it carries some other evidence from the list above; find which before deleting it.
3. Anything else is real. Record the trail (the `stray` row and its `entry_status_history` rows), then hard-delete the entry by id: `DELETE FROM public.entries WHERE id IN (...)`. If `in_order` is true, there is no repair: `entry_ids` has no foreign key, so the order keeps the deleted id and nothing will ever notice. Record the order id alongside the entry before you delete. The Stripe heading below is about an order's scope columns, not this.

### WARNING: `entr(ies) on data this reseed deletes carry no payment trail`

The full sentence is `carry no payment trail (no history, no Stripe record, no reference, no non-zero recorded payment)`. A `paid` or `refunded` status label with nothing behind it: no history, no Stripe record, no reference, and a method that is NULL, `waived`, or `secretary_paid` at a zero or NULL `entry_fee` (MYK9-539). Usually a status set by hand, or the wizard's default on an unpriced entry. Not an abort for this guard: the reseed continues and the cascades remove them. The list is capped at 10 ids, and each id prints its `payment_method` and `entry_fee` so you can judge it. One exception: if such an entry hangs off the demo exhibitor's enrollment on show `...010`, the narrower guard below aborts on the label alone.

### ABORT: `paid or refunded enrollment(s) sit on a show this reseed deletes`

`enrollments.show_id` is ON DELETE CASCADE, and a paid or refunded enrollment sits on a seed-deleted show (MYK9-528). Run `enrollment_stray` as a SELECT with `scope_shows`. Two constraints point into `enrollments` and will block a bare delete with a 23503: `entries.registration_id` (NO ACTION) and `stripe_orders.enrollment_id` (RESTRICT). Any entry with that `registration_id` blocks it, paid or not. Paid or refunded ones follow the entries heading above; plain pending ones can be deleted, or detached with `UPDATE public.entries SET registration_id = NULL WHERE registration_id = '...'`. If a `stripe_orders` row is what blocks it, that is the Stripe case below, not a row to delete. Then hard-delete the enrollment by id; there is no soft-delete column to set instead.

### ABORT: `Stripe order(s) point at a show this reseed deletes, or at an enrollment on one of those shows`

Both `stripe_orders` scope FKs are ON DELETE RESTRICT since migration `20260915191700` (MYK9-527), so the seed refuses before the FK would fail with a raw violation. Run `order_stray` as a SELECT with `scope_shows`.

**First, record the scope you are about to clear:** `SELECT id, show_id, enrollment_id, amount_cents FROM public.stripe_orders WHERE id IN (...)`, saved somewhere you will find again. Once a scope column is NULL there is no stamped identity to rebuild it from.

- **Default: detach, reseed, reattach, but only for fixed ids.** `UPDATE public.stripe_orders SET show_id = NULL, enrollment_id = NULL WHERE id IN (...)` clears the guard and keeps the payment intent, checkout session, amount and fee split. The seed re-inserts the demo shows `dededede-...010/011/012` (and `seed-load-fixture.sql` the load shows, when it is applied) and exactly one enrollment, `dededede-...070`, under the same fixed ids, so a `show_id`, or an `enrollment_id` equal to `...070`, can be restored with an `UPDATE` after the reseed and nothing is lost. **Any other `enrollment_id` is a checkout-created enrollment that the show delete cascades away and nothing re-inserts**, so the reattach will fail with a 23503 and the link is gone for good. For such a row, record the enrollment row itself before the reseed and treat the order as detached for good under the next bullet. As of 2026-09-15 the only order on staging that trips this guard is exactly that case.
- **If it stays detached,** the row joins the class `docs/operations/stripe-ledger-orphans.md` keeps deliberately. That record was written for orphans an earlier bug created and migration `20260915191700` exists to stop reseeds making more, so append the id and amount to that document; it carries a dated count and total that your row would silently falsify.
- **Delete the row** only as a reviewed step, which for a solo operator means reconciling it against Stripe first. `stripe_order_refunds.order_id` is RESTRICT too: the refund rows go first.

That decision record's prune SQL requires both scope columns to be NULL already and will match nothing here; do not copy it for these rows. The seed used to carry a narrower twin scoped to the demo exhibitor's enrollment on show `...010`; it was deleted (MYK9-562), not merely disabled, because `order_stray` above already covers that same scope and always raised first — it could never fire.

### WARNING: `stripe_orders row(s) already have BOTH show_id and enrollment_id nulled by an earlier reseed`

Fires on every reseed while any fully-orphaned order exists (22 on staging as of 2026-09-15). These rows are counted and kept on purpose (MYK9-527); the reseed never touches them. Do nothing. `docs/operations/stripe-ledger-orphans.md` is the record of that decision and the only place they get pruned.

### ABORT: `paid or refunded entr(ies) hang off the demo exhibitor's enrollment on show ...010`

The older, narrower guard on the demo exhibitor's own enrollment, reached through `entries.registration_id`. It prints its first 10 ids, like the other guards (MYK9-562), and fires on the `paid`/`refunded` label alone, trail or not. Find them with:

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

Messages beginning `seed-demo preflight:` are a different category: a misconfigured database, not a money stray. The `trial_packet_snapshots` ones need packet objects removed through the Storage API before reseeding. The person one means a canonical account is missing or duplicated in `people`; the role one means a row in `public.roles` is missing or renamed, nothing to do with accounts; the auth one almost always means the account exists exactly once but its `auth_user_id` is NULL, so link it rather than recreate it. None of them is cleared by deleting entries.

## Reseeding procedure

1. Confirm target is dev/staging — **never** run seed SQL at a production ref without explicit instruction. Project ref: `sojmvhhwsjxmfistvzbe`.
2. Reseed is a shared-system write: confirm with the user first (Auto Mode rule).
3. Run `seed-demo.sql` with its output captured to a file. It is idempotent over its own rows, but it ABORTS by design rather than cascade away an entry, enrollment or Stripe order that carries real money, and it WARNS about rows it removed. Afterwards `grep -i warning` the captured output, because a warning in 400 lines of output is easy to miss and the rows it names are gone. An abort is the guard working; find its heading above before touching any SQL.
4. Verify, in one query batch: demo shows/trials/classes/entries exist (the demo show `...010` holds 12 entries on the lean set; the seed's own postcondition aborts otherwise, and also if any MYK9-109 load row survived); §10 role grants exist; `auth.users` rows exist for all seven `@myk9t.com` sign-in accounts.
5. Smoke-test sign-in for secretary and exhibitor (two-step SmartSignInPage flow) before declaring done.
6. **Only for a load rehearsal or PDF calibration** (the 63-entry classes), apply `supabase/seed-load-fixture.sql` AFTER step 3, in its own `psql -v ON_ERROR_STOP=1 -f` run against the same URL. It is a second shared-system write: confirm it separately. It refuses to run twice (rerun `seed-demo.sql` first) and asserts its own totals (516 entries on `...010`, 1260 generated platform-wide). `.github/workflows/load-rehearsal.yml` applies it itself. Never leave it applied on staging when a club is testing: the staff dog picker searches every dog in the system, so a secretary sees all 252 load dogs.
7. **To remove the load fixture, rerun `seed-demo.sql` alone.** Section 0 still deletes every MYK9-109 id range, so a plain reseed returns the lean set.

## Guardrails

- Every destructive statement in `seed-demo.sql` is scoped to the seeded show ids (section 0 `scope_shows`), pinned by `seedDemoSelfCleaningRelationshipDeleteContract.test.ts`. Never widen it; a hand-created UAT show must survive a reseed. A "wipe staging" request is answered with the site-admin dashboard delete path, never a blanket delete.

- The demo exhibitor (`exhibitor@myk9t.com`) is a protected account with seeded dogs — don't delete or repurpose it.
- Person-delete is trigger-blocked when the person owns live dogs; surface the edge-fn error CODE rather than fighting it.
- After schema changes, re-check that seed SQL still satisfies CHECK constraints and enum values before pushing (memory: db-constraint-review).
- Never delete a row that carries a payment trail without recording the trail first. The seed's guards exist to stop the cascade from doing it silently; an operator doing it by hand without a record is the same loss.
