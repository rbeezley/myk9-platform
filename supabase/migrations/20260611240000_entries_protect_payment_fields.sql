-- Round-21 review (PR #625): entries.entry_fee and entries.payment_method are
-- writable by anyone with can_manage_show() via the entries_update RLS policy.
-- payoutCalc.ts filters on payment_method='online' and sums entry_fee, so:
--   • Inflating entry_fee on a paid online entry inflates the Stripe transfer.
--   • Flipping payment_method to 'online' on a desk entry includes it in a
--     transfer that was never backed by a Stripe charge.
-- payoutCalc.ts already protects against payment_status forgery (by keying on
-- refund_amount rather than payment_status). This migration extends the same
-- protection to entry_fee, payment_method, and stripe_payment_intent_id.
--
-- Guard rules (non-service-role only):
--   A. entry_fee: cannot change once payment_method='online' AND
--      payment_status IN ('paid','refunded'). This locks in what Stripe actually
--      charged; desk-entry fee edits (cash/check/waived) are still allowed.
--   B. payment_method: cannot flip TO or FROM 'online' once payment_status is
--      'paid' or 'refunded'. Desk payments can still be updated between
--      desk-payment methods (cash→check, etc.).
--   C. stripe_payment_intent_id: cannot be set to a non-null value by
--      non-service-role. Only the webhook (service_role) should stamp this.
--
-- The webhook always runs as service_role and is unaffected by all three guards.

begin;

create or replace function public.entries_protect_payment_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select current_setting('role', true)) = 'service_role' then
    return new;
  end if;

  -- A. Lock entry_fee for paid online entries.
  if old.payment_method = 'online'
     and old.payment_status in ('paid', 'refunded')
     and new.entry_fee is distinct from old.entry_fee then
    raise exception
      'entry_fee cannot be changed for a paid online entry'
      using errcode = '42501';
  end if;

  -- B. Lock payment_method flip that involves 'online' for any paid entry.
  if old.payment_status in ('paid', 'refunded')
     and new.payment_method is distinct from old.payment_method
     and (old.payment_method = 'online' or new.payment_method = 'online') then
    raise exception
      'payment_method cannot be flipped to or from online for a paid entry'
      using errcode = '42501';
  end if;

  -- C. Block non-service-role from stamping stripe_payment_intent_id.
  if new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
     and new.stripe_payment_intent_id is not null then
    raise exception
      'stripe_payment_intent_id can only be set by the payment service'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_entries_protect_payment_fields on public.entries;

create trigger trg_entries_protect_payment_fields
  before update of entry_fee, payment_method, stripe_payment_intent_id
  on public.entries
  for each row
  when (
    new.entry_fee is distinct from old.entry_fee
    or new.payment_method is distinct from old.payment_method
    or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
  )
  execute function public.entries_protect_payment_fields();

commit;
