-- Round-11 review (PR #625): show secretaries could not read
-- club_stripe_accounts, so the publish gate's useClubStripeAccount query
-- silently returned no row for them (RLS filters, it does not error) and
-- canEnableOnlineEntries(null) blocked publishing EVEN WHEN the club's
-- payouts are enabled — a workflow-breaking false negative for the primary
-- publishing persona. show_payouts_select anticipated exactly this with its
-- is_show_secretary clause; this is the missing twin. Scoped the same way:
-- a secretary reads the account of a club they run a show FOR (migration
-- 163's show-scoped overload, never the zero-arg global alias).

begin;

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

commit;
