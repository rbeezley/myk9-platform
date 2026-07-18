-- MP-28 (security-audit-2026-07-17-money-path): sync_enrollment_on_payment_success
-- was the only SECURITY DEFINER money function pinned to search_path = public
-- instead of the hardened '' + fully-qualified pattern used everywhere else
-- (migration 132). The body already qualified every reference, so this is a
-- pure re-pin: identical logic, search_path = ''.

begin;

create or replace function public.sync_enrollment_on_payment_success()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handler_id    uuid;
  v_enrollment_id uuid;
begin
  -- Only act when status transitions to 'succeeded' for the first time
  if new.status is distinct from 'succeeded' then
    return new;
  end if;
  if old.status = 'succeeded' then
    return new;  -- already processed, idempotent guard
  end if;

  -- Both show_id and customer_id are required to create a meaningful enrollment
  if new.show_id is null or new.customer_id is null then
    return new;
  end if;

  -- Resolve the exhibitor/handler from the Stripe customer record
  select person_id into v_handler_id
  from public.stripe_customers
  where id = new.customer_id;

  if v_handler_id is null then
    return new;
  end if;

  -- Upsert enrollment (one row per handler per show)
  insert into public.enrollments (
    show_id,
    handler_id,
    payment_status,
    payment_reference,
    total_amount,
    payment_method
  )
  values (
    new.show_id,
    v_handler_id,
    'paid',
    new.stripe_payment_intent_id,
    new.amount_cents,
    'online'
  )
  on conflict (show_id, handler_id) do update
    set payment_status    = 'paid',
        payment_reference = excluded.payment_reference,
        total_amount      = excluded.total_amount,
        payment_method    = 'online',
        updated_at        = now()
  returning id into v_enrollment_id;

  -- Link all entries in this order to the enrollment
  if v_enrollment_id is not null
     and new.entry_ids is not null
     and cardinality(new.entry_ids) > 0 then
    update public.entries
    set registration_id = v_enrollment_id
    where id = any(new.entry_ids);
  end if;

  -- Store the enrollment reference on the order row
  new.enrollment_id := v_enrollment_id;

  return new;
end;
$$;

commit;
