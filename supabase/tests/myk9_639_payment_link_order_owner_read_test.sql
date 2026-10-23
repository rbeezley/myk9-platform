-- MYK9-639 (migration 20261023154300): an exhibitor reads the stripe_orders a
-- secretary's payment link settled for them, and ONLY those.
--
-- A payment-link order is written with customer_id NULL, so the customer arm
-- of stripe_orders_select never admits it and My Payments printed two of four
-- paid charges in the 2026-10-21 controlled replay. The repaired policy admits
-- a NULL-customer order through is_my_entry_payment_link_order(session), which
-- decides against the persisted link's COMPLETE original entry list -- the
-- order's own entry_ids hold only the accepted lines while amount_cents is the
-- whole charge, which is how the rejected first draft exposed a 7490-cent
-- mixed-handler charge to one of its two handlers.
--
-- Asserts, reading public.stripe_orders through RLS as `authenticated`:
--   1. The payer sees a link order whose link lists only their entries.
--   2. MIXED: a link covering handler A's and handler B's dogs, settled for A
--      alone (order.entry_ids = [A's entry]), is visible to NEITHER. This is
--      the privacy proof that rejected the first draft, pinned.
--   3. NONE ACCEPTED: a link order whose entry_ids is empty (every line
--      refunded) is still the payer's history -- decided from the link.
--   4. MISSING: a link naming an entry id that does not exist is denied.
--   5. CROSS-SHOW: a link whose show_id is not the entries' show is denied.
--   6. NO LINK: a NULL-customer order with no entry_payment_links row for its
--      session is denied (nothing persisted vouches for it).
--   7. NULL OWNER: a link whose only entry has no handler and a dog nobody
--      owns is denied -- NULL never authorizes (MYK9-939).
--   8. An unrelated account sees none of the above.
--   9. The customer arm is unchanged: an order keyed to the caller's
--      stripe_customers row is still visible.
--  10. Owner and co-owner of the dog read the link order the handler was
--      issued, as get_my_checkout_order already allows.
--  11. A soft-deleted entry keeps the payer's history readable: a withdrawal
--      and its refund are still the exhibitor's money.
--  12. EXECUTE on the helper is revoked from PUBLIC and anon, granted to
--      authenticated; a caller with no person row gets false.
--
-- Run with psql -X -v ON_ERROR_STOP=1 against a migrated local database;
-- every fixture rolls back.

begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000639901', 'MYK9-639 Link Club');

insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values
  ('00000000-0000-0000-0000-000000639911', 'MYK9-639 Link Show', 'AKC',
   current_date + 10, current_date + 11, '00000000-0000-0000-0000-000000639901', 'published'),
  ('00000000-0000-0000-0000-000000639912', 'MYK9-639 Other Show', 'AKC',
   current_date + 20, current_date + 21, '00000000-0000-0000-0000-000000639901', 'published');

insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000000639921', '00000000-0000-0000-0000-000000639911',
        'MYK9-639 Link Trial', current_date + 10, 'AKC');

insert into public.classes (id, trial_id, name, status)
values
  ('00000000-0000-0000-0000-000000639931', '00000000-0000-0000-0000-000000639921',
   'Container Novice A', 'upcoming'),
  ('00000000-0000-0000-0000-000000639932', '00000000-0000-0000-0000-000000639921',
   'Interior Novice A', 'upcoming'),
  ('00000000-0000-0000-0000-000000639933', '00000000-0000-0000-0000-000000639921',
   'Exterior Novice A', 'upcoming');

-- Actors: payer A (handler 1 / auth 101), handler B (2 / 102), unrelated C
-- (3 / 103), dog owner O (4 / 104), co-owner W (5 / 105). auth 199 has no
-- person row.
insert into public.people (id, first_name, last_name, auth_user_id)
select ('00000000-0000-0000-0000-00000063994' || n)::uuid, 'MYK9-639', 'Person ' || n,
       ('00000000-0000-0000-0000-0000006391' || lpad(n::text, 2, '0'))::uuid
from generate_series(1, 5) n;

insert into public.dogs (id, name, call_name, breed, owner_id, co_owner_id)
values
  ('00000000-0000-0000-0000-000000639951', 'MYK9-639 Dog A', 'Acorn', 'Beagle',
   '00000000-0000-0000-0000-000000639944', '00000000-0000-0000-0000-000000639945'),
  ('00000000-0000-0000-0000-000000639952', 'MYK9-639 Dog B', 'Birch', 'Beagle',
   '00000000-0000-0000-0000-000000639942', null),
  ('00000000-0000-0000-0000-000000639953', 'MYK9-639 Nobody''s Dog', 'Cedar', 'Beagle',
   null, null);

insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values
  ('00000000-0000-0000-0000-000000639951', 'AKC', 'SR6399001', true),
  ('00000000-0000-0000-0000-000000639952', 'AKC', 'SR6399002', true),
  ('00000000-0000-0000-0000-000000639953', 'AKC', 'SR6399003', true);

-- eA1, eA2: handler A on dog A. eB: handler B on dog B. eN: no handler on the
-- dog nobody owns (handler_id is set NULL after the insert, below any default).
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
                            entry_status, payment_status, entry_fee)
values
  ('00000000-0000-0000-0000-000000639961', '00000000-0000-0000-0000-000000639951',
   '00000000-0000-0000-0000-000000639931', '00000000-0000-0000-0000-000000639911',
   '00000000-0000-0000-0000-000000639921', '00000000-0000-0000-0000-000000639941',
   'confirmed', 'paid', 35),
  ('00000000-0000-0000-0000-000000639962', '00000000-0000-0000-0000-000000639951',
   '00000000-0000-0000-0000-000000639932', '00000000-0000-0000-0000-000000639911',
   '00000000-0000-0000-0000-000000639921', '00000000-0000-0000-0000-000000639941',
   'confirmed', 'paid', 35),
  ('00000000-0000-0000-0000-000000639963', '00000000-0000-0000-0000-000000639952',
   '00000000-0000-0000-0000-000000639931', '00000000-0000-0000-0000-000000639911',
   '00000000-0000-0000-0000-000000639921', '00000000-0000-0000-0000-000000639942',
   'confirmed', 'paid', 35),
  ('00000000-0000-0000-0000-000000639964', '00000000-0000-0000-0000-000000639953',
   '00000000-0000-0000-0000-000000639933', '00000000-0000-0000-0000-000000639911',
   '00000000-0000-0000-0000-000000639921', '00000000-0000-0000-0000-000000639941',
   'confirmed', 'paid', 35);
update public.entries set handler_id = null
where id = '00000000-0000-0000-0000-000000639964';

do $$
begin
  if not exists (
    select 1 from public.entries
    where id = '00000000-0000-0000-0000-000000639964' and handler_id is null
  ) then
    raise exception 'FIXTURE the no-owner entry still has a handler';
  end if;
end;
$$;

-- The persisted links: the stripe-payment-link edge function's exact insert.
insert into public.entry_payment_links
  (id, show_id, entry_ids, stripe_checkout_session_id, status, amount_cents)
values
  ('00000000-0000-0000-0000-000000639971', '00000000-0000-0000-0000-000000639911',
   array['00000000-0000-0000-0000-000000639961', '00000000-0000-0000-0000-000000639962']::uuid[],
   'cs_myk9_639_a_only', 'paid', 7000),
  ('00000000-0000-0000-0000-000000639972', '00000000-0000-0000-0000-000000639911',
   array['00000000-0000-0000-0000-000000639961', '00000000-0000-0000-0000-000000639963']::uuid[],
   'cs_myk9_639_mixed', 'paid', 7000),
  ('00000000-0000-0000-0000-000000639973', '00000000-0000-0000-0000-000000639911',
   array['00000000-0000-0000-0000-000000639962']::uuid[],
   'cs_myk9_639_none_accepted', 'paid', 3500),
  ('00000000-0000-0000-0000-000000639974', '00000000-0000-0000-0000-000000639911',
   array['00000000-0000-0000-0000-000000639961', '00000000-0000-0000-0000-000000639999']::uuid[],
   'cs_myk9_639_missing', 'paid', 7000),
  ('00000000-0000-0000-0000-000000639975', '00000000-0000-0000-0000-000000639912',
   array['00000000-0000-0000-0000-000000639961']::uuid[],
   'cs_myk9_639_cross_show', 'paid', 3500),
  ('00000000-0000-0000-0000-000000639977', '00000000-0000-0000-0000-000000639911',
   array['00000000-0000-0000-0000-000000639964']::uuid[],
   'cs_myk9_639_null_owner', 'paid', 3500);

-- The orders stripe-webhook records for those sessions: customer_id NULL,
-- entry_ids = the ACCEPTED lines only, amount_cents = the whole charge. The
-- mixed link settled for A alone; the none-accepted link settled nothing.
insert into public.stripe_orders
  (id, customer_id, stripe_payment_intent_id, stripe_checkout_session_id,
   amount_cents, status, order_type, show_id, entry_ids, metadata)
values
  ('00000000-0000-0000-0000-000000639981', null, 'pi_myk9_639_a_only', 'cs_myk9_639_a_only',
   7490, 'succeeded', 'entry', '00000000-0000-0000-0000-000000639911',
   array['00000000-0000-0000-0000-000000639961', '00000000-0000-0000-0000-000000639962']::uuid[],
   '{"entry_payment_link_id":"00000000-0000-0000-0000-000000639971","entry_count":2}'::jsonb),
  ('00000000-0000-0000-0000-000000639982', null, 'pi_myk9_639_mixed', 'cs_myk9_639_mixed',
   7490, 'succeeded', 'entry', '00000000-0000-0000-0000-000000639911',
   array['00000000-0000-0000-0000-000000639961']::uuid[],
   '{"entry_payment_link_id":"00000000-0000-0000-0000-000000639972","entry_count":1}'::jsonb),
  ('00000000-0000-0000-0000-000000639983', null, 'pi_myk9_639_none', 'cs_myk9_639_none_accepted',
   3745, 'succeeded', 'entry', '00000000-0000-0000-0000-000000639911',
   '{}'::uuid[],
   '{"entry_payment_link_id":"00000000-0000-0000-0000-000000639973","entry_count":0}'::jsonb),
  ('00000000-0000-0000-0000-000000639984', null, 'pi_myk9_639_missing', 'cs_myk9_639_missing',
   7490, 'succeeded', 'entry', '00000000-0000-0000-0000-000000639911',
   array['00000000-0000-0000-0000-000000639961']::uuid[],
   '{"entry_payment_link_id":"00000000-0000-0000-0000-000000639974","entry_count":1}'::jsonb),
  ('00000000-0000-0000-0000-000000639985', null, 'pi_myk9_639_cross', 'cs_myk9_639_cross_show',
   3745, 'succeeded', 'entry', '00000000-0000-0000-0000-000000639912',
   array['00000000-0000-0000-0000-000000639961']::uuid[],
   '{"entry_payment_link_id":"00000000-0000-0000-0000-000000639975","entry_count":1}'::jsonb),
  ('00000000-0000-0000-0000-000000639986', null, 'pi_myk9_639_no_link', 'cs_myk9_639_no_link',
   3745, 'succeeded', 'entry', '00000000-0000-0000-0000-000000639911',
   array['00000000-0000-0000-0000-000000639961']::uuid[],
   '{}'::jsonb),
  ('00000000-0000-0000-0000-000000639987', null, 'pi_myk9_639_null_owner', 'cs_myk9_639_null_owner',
   3745, 'succeeded', 'entry', '00000000-0000-0000-0000-000000639911',
   array['00000000-0000-0000-0000-000000639964']::uuid[],
   '{"entry_payment_link_id":"00000000-0000-0000-0000-000000639977","entry_count":1}'::jsonb);

-- The customer arm's positive control: a cart order keyed to A's own
-- stripe_customers row, exactly as before this migration.
insert into public.stripe_customers (id, person_id, stripe_customer_id)
values ('00000000-0000-0000-0000-000000639991', '00000000-0000-0000-0000-000000639941',
        'cus_myk9_639_payer');
insert into public.stripe_orders
  (id, customer_id, stripe_payment_intent_id, stripe_checkout_session_id,
   amount_cents, status, order_type, show_id, entry_ids)
values
  ('00000000-0000-0000-0000-000000639988', '00000000-0000-0000-0000-000000639991',
   'pi_myk9_639_cart', 'cs_myk9_639_cart', 3745, 'succeeded', 'entry',
   '00000000-0000-0000-0000-000000639911',
   array['00000000-0000-0000-0000-000000639961']::uuid[]);

-- Reads public.stripe_orders as `authenticated` for one auth user and returns
-- the ids visible among the fixture orders. `request.jwt.claims` is set as
-- well as the bare claim: auth.uid() reads whichever the installed build uses.
create function pg_temp.visible_orders(caller uuid) returns uuid[]
language plpgsql as $$
declare
  v_ids uuid[];
begin
  perform set_config('request.jwt.claim.sub', caller::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', caller, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into v_ids
  from public.stripe_orders
  where id between '00000000-0000-0000-0000-000000639981'
               and '00000000-0000-0000-0000-000000639988';
  reset role;
  return v_ids;
end;
$$;

create function pg_temp.assert_visible(label text, caller uuid, expected uuid[])
returns void language plpgsql as $$
declare
  v_actual uuid[] := pg_temp.visible_orders(caller);
begin
  if v_actual is distinct from expected then
    raise exception 'FAIL %: expected % visible, got %', label, expected, v_actual;
  end if;
  raise notice 'PASS %', label;
end;
$$;

-- 1, 3, 9: the payer sees their own-only link order, the none-accepted link
-- order, and the customer-arm cart order.
-- 2, 4, 5, 6, 7: the mixed, missing, cross-show, no-link and null-owner
-- orders are all denied to the payer.
select pg_temp.assert_visible('payer A reads exactly their own link history',
  '00000000-0000-0000-0000-000000639101',
  array['00000000-0000-0000-0000-000000639981',
        '00000000-0000-0000-0000-000000639983',
        '00000000-0000-0000-0000-000000639988']::uuid[]);

-- 2 again, from the other side: handler B owns one line of the mixed link and
-- none of its charge.
select pg_temp.assert_visible('handler B cannot read the mixed-handler charge',
  '00000000-0000-0000-0000-000000639102', '{}'::uuid[]);

-- 8: an unrelated account reads nothing.
select pg_temp.assert_visible('an unrelated account reads no order',
  '00000000-0000-0000-0000-000000639103', '{}'::uuid[]);

-- 10: dog A's owner and co-owner read the orders issued against their dog's
-- entries, and nothing keyed to A's customer row or to another dog.
select pg_temp.assert_visible('the dog owner reads the link orders for their dog',
  '00000000-0000-0000-0000-000000639104',
  array['00000000-0000-0000-0000-000000639981',
        '00000000-0000-0000-0000-000000639983']::uuid[]);
select pg_temp.assert_visible('the co-owner reads the link orders for their dog',
  '00000000-0000-0000-0000-000000639105',
  array['00000000-0000-0000-0000-000000639981',
        '00000000-0000-0000-0000-000000639983']::uuid[]);

-- 11: withdrawing eA2 (soft delete) does not erase the payer's charge history.
update public.entries set deleted_at = now()
where id = '00000000-0000-0000-0000-000000639962';
select pg_temp.assert_visible('a withdrawn entry keeps its link orders readable',
  '00000000-0000-0000-0000-000000639101',
  array['00000000-0000-0000-0000-000000639981',
        '00000000-0000-0000-0000-000000639983',
        '00000000-0000-0000-0000-000000639988']::uuid[]);

-- 12: ACL on the helper, and the no-person-row caller.
do $$
begin
  if has_function_privilege('anon', 'public.is_my_entry_payment_link_order(text)', 'EXECUTE') then
    raise exception 'FAIL anon can execute is_my_entry_payment_link_order';
  end if;
  if not has_function_privilege('authenticated',
       'public.is_my_entry_payment_link_order(text)', 'EXECUTE') then
    raise exception 'FAIL authenticated cannot execute is_my_entry_payment_link_order';
  end if;
  if (select proacl from pg_proc
      where oid = 'public.is_my_entry_payment_link_order(text)'::regprocedure) is null then
    raise exception 'FAIL is_my_entry_payment_link_order still carries the PUBLIC default EXECUTE';
  end if;
  raise notice 'PASS helper ACL';
end;
$$;

do $$
declare
  v_result boolean;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000639199', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000639199","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
  v_result := public.is_my_entry_payment_link_order('cs_myk9_639_a_only');
  reset role;
  if v_result then
    raise exception 'FAIL a caller with no person row was admitted to a link order';
  end if;
  raise notice 'PASS no person row is never an owner';
end;
$$;

rollback;
