-- Round-22 review (PR #625): the UPDATE trigger added in 20260611240000 only
-- fires on UPDATE. A direct INSERT (allowed for secretaries/club_admins via
-- entries_insert RLS policy) can still set payment_method='online',
-- payment_status='paid', and any entry_fee — forging a paid-online row that
-- inflates the next payout transfer.
--
-- Fix: add a BEFORE INSERT companion trigger that blocks non-service-role from
-- inserting rows with the Stripe-backed field combination. The webhook always
-- runs as service_role and is unaffected.
--
-- Guard rules (non-service-role only):
--   A. Cannot INSERT with payment_method='online' AND
--      payment_status IN ('paid','refunded') — the webhook is the only path
--      that legitimately creates paid online entries.
--   B. Cannot INSERT with stripe_payment_intent_id IS NOT NULL — only the
--      webhook (service_role) stamps this column.

begin;

create or replace function public.entries_protect_payment_fields_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select current_setting('role', true)) = 'service_role' then
    return new;
  end if;

  -- A. Block inserting a forged paid-online entry.
  if new.payment_method = 'online'
     and new.payment_status in ('paid', 'refunded') then
    raise exception
      'Paid online entries can only be created by the payment service'
      using errcode = '42501';
  end if;

  -- B. Block inserting a stripe_payment_intent_id directly.
  if new.stripe_payment_intent_id is not null then
    raise exception
      'stripe_payment_intent_id can only be set by the payment service'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_entries_protect_payment_fields_insert on public.entries;

create trigger trg_entries_protect_payment_fields_insert
  before insert
  on public.entries
  for each row
  execute function public.entries_protect_payment_fields_insert();

commit;
