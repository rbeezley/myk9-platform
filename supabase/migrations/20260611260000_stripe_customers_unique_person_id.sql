-- Round-21 review (PR #625): stripe_customers.person_id has only a plain index,
-- not a UNIQUE constraint. Two concurrent checkouts for the same person can
-- both find no existing row, both create a Stripe customer, and both INSERT —
-- leaving two rows for the same person_id. Future .maybeSingle() calls then
-- fail with a multiple-rows error, breaking all future checkout attempts for
-- that user.
--
-- Fix: add a UNIQUE constraint. The getOrCreateStripeCustomer() function in
-- stripe-checkout is separately updated to handle the resulting unique violation
-- gracefully (delete the orphaned Stripe customer and re-query the winner row).

begin;

-- Clean up any duplicate person_id rows before adding the constraint.
-- Keep the most-recently-inserted row per person_id (created_at desc) — UUIDv4
-- is random so max(id) would be lexicographic, not insertion-order. In practice
-- duplicates have never occurred in production; this is a pre-condition guard.
delete from public.stripe_customers
where id not in (
  select distinct on (person_id) id
  from public.stripe_customers
  order by person_id, created_at desc
);

alter table public.stripe_customers
  add constraint stripe_customers_person_id_unique unique (person_id);

commit;
