-- Founding member: 12-month premium grant replaces premium-for-life flag.
-- Decision 2026-06-09 (docs/plans/2026-06-09-premium-launch-design.md): the
-- is_early_adopter boolean granted premium for life; the founding-member
-- program grants 12 months instead. Pre-launch, no compat shim: the boolean
-- is replaced outright by an expiry timestamp.

begin;

alter table public.people
  add column if not exists early_adopter_until timestamptz;

comment on column public.people.early_adopter_until is
  'Founding-member premium grant: premium tier until this date (typically grant date + 12 months). NULL = never granted. Set manually by site admins; see docs/operations/stripe-platform-setup.md.';

-- Anyone already flagged keeps a full 12 months from today.
update public.people
  set early_adopter_until = now() + interval '12 months'
  where is_early_adopter = true;

-- Port migration 186's self-grant protection to the new column. Unlike 186,
-- explicitly admit the postgres role (dashboard SQL editor, migrations) and
-- service_role: auth.uid() is NULL in those sessions, so is_site_admin()
-- returns false and the documented grant procedure would otherwise be blocked
-- by the very trigger meant to stop exhibitor self-grants.
create or replace function public.people_protect_early_adopter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.early_adopter_until is distinct from old.early_adopter_until then
    if session_user = 'postgres'
      or (select current_setting('role', true)) = 'service_role'
      or public.is_site_admin()
    then
      return new;
    end if;
    raise exception 'Permission denied: early_adopter_until can only be changed by site admins'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists people_protect_early_adopter_trigger on public.people;

create trigger people_protect_early_adopter_trigger
  before update of early_adopter_until on public.people
  for each row execute function public.people_protect_early_adopter();

-- The old column-scoped trigger was explicitly dropped above (CREATE OR
-- REPLACE FUNCTION does not drop triggers). No live code references the
-- boolean after this commit; generated TS types regenerate post-push.
alter table public.people drop column if exists is_early_adopter;

commit;
