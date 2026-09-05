-- Expose only the boolean payment-readiness decision to exhibitors. The
-- underlying Stripe account row remains protected by RLS because it contains
-- provider identifiers and payout state.

begin;

create or replace function public.can_accept_online_entry_payment(
  p_club_id uuid,
  p_livemode boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.club_stripe_accounts
    where club_id = p_club_id
      and livemode = p_livemode
      and payouts_enabled = true
  );
$$;

revoke all on function public.can_accept_online_entry_payment(uuid, boolean) from public;
revoke execute on function public.can_accept_online_entry_payment(uuid, boolean) from anon;
grant execute on function public.can_accept_online_entry_payment(uuid, boolean) to authenticated;

commit;
