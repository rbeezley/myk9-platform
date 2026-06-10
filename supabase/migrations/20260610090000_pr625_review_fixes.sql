-- PR #625 review fixes (DB side).
-- 1. Secretaries couldn't read club_stripe_accounts, so the publish gate
--    (useClubStripeAccount in ShowStatusPill/EditShowDialog) saw NULL via
--    maybeSingle() and blocked publishing for fully-onboarded clubs whenever
--    the actor was a show secretary rather than a club admin.
-- 2. restrict_entry_refund_columns admitted only service_role, which blocked
--    the documented dashboard reconciliation path (the SQL editor runs as
--    postgres) — the same trap the early-adopter guard already fixed.

begin;

-- (1) Mirror show_payouts' secretary scoping: a secretary of any of the
-- club's shows may read the club's onboarding/payout flags. Per-row helper
-- args cannot be initplans; both tables stay small.
drop policy if exists club_stripe_accounts_select on public.club_stripe_accounts;
create policy club_stripe_accounts_select
  on public.club_stripe_accounts for select to authenticated
  using (
    public.is_club_admin(club_stripe_accounts.club_id)
    or (select public.is_site_admin())
    or exists (
      select 1 from public.shows s
      where s.club_id = club_stripe_accounts.club_id
        and public.is_show_secretary(s.id)
    )
  );

-- (2) Same bypass list as people_protect_early_adopter: postgres (dashboard
-- SQL editor, migrations), service_role (edge functions), site admins.
-- Exhibitors/secretaries via PostgREST remain blocked.
create or replace function public.restrict_entry_refund_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.refund_amount is distinct from old.refund_amount)
    or (new.refund_notes is distinct from old.refund_notes)
    or (new.refunded_at is distinct from old.refunded_at)
  then
    if session_user = 'postgres'
      or (select current_setting('role', true)) = 'service_role'
      or public.is_site_admin()
    then
      return new;
    end if;
    raise exception
      'refund_amount, refund_notes, and refunded_at are written only by stripe-refund-entry (or a site admin/operator)';
  end if;

  return new;
end;
$$;

commit;
