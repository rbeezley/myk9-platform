-- platform_settings: a single-row table holding operator-wide config that must
-- be changeable without a deploy. First occupant: platform_fee_percent, which
-- previously lived in THREE hand-synced places (the PLATFORM_FEE_PERCENT secret,
-- the _shared/platformFee.ts fallback, and the client cart preview constant).
-- stripe-checkout and the cart preview now both read this row; the env var
-- becomes a boot fallback only.
--
-- Singleton: id boolean PK DEFAULT true CHECK (id) — only the row id=true can
-- exist (a second insert collides on the PK).
--
-- Write model: site-admin-only, enforced two ways (defense in depth):
--   * RLS — authenticated may SELECT (the cart preview needs the rate); only
--     is_site_admin() may UPDATE; INSERT/DELETE have no policy (default deny).
--   * a write-guard trigger that survives even if RLS were disabled, allowing
--     UPDATE/DELETE only from a site admin or the service role.
-- The seed INSERT runs BEFORE the trigger is created so the migration (which
-- runs as postgres, neither site-admin nor service_role) isn't blocked by it.

begin;

create table if not exists public.platform_settings (
  id boolean primary key default true,
  platform_fee_percent numeric(5, 2) not null default 7
    check (platform_fee_percent >= 0 and platform_fee_percent <= 20),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.people (id) on delete set null,
  constraint platform_settings_singleton check (id)
);

comment on table public.platform_settings is
  'Single-row operator config (id=true). platform_fee_percent is the authoritative platform fee, read by stripe-checkout + the cart preview.';

-- Seed the singleton at the current 7% rate (pre-trigger, so the migration owner
-- isn''t blocked by the write guard below).
insert into public.platform_settings (id, platform_fee_percent)
values (true, 7)
on conflict (id) do nothing;

-- Grants. The edge function uses the service role (bypasses grants + RLS); these
-- cover the authenticated app paths. No anon access (cart entry requires auth).
grant select, update on public.platform_settings to authenticated;

alter table public.platform_settings enable row level security;
alter table public.platform_settings force row level security;

-- Any authenticated user may read the rate (cart preview).
drop policy if exists platform_settings_select on public.platform_settings;
create policy platform_settings_select
  on public.platform_settings
  for select
  to authenticated
  using (true);

-- Only site admins may change it.
drop policy if exists platform_settings_update on public.platform_settings;
create policy platform_settings_update
  on public.platform_settings
  for update
  to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

-- Write guard: independent of RLS, allow UPDATE/DELETE only from a site admin
-- or the service role. Protects the fee + the singleton even if RLS is ever
-- toggled off. Manual fixes use BEGIN; SET LOCAL ROLE service_role; (ops runbook).
create or replace function public.guard_platform_settings_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_site_admin()
     or (select current_setting('role', true)) = 'service_role' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  raise exception 'platform_settings is writable only by a site admin';
end;
$$;

drop trigger if exists trg_guard_platform_settings_write on public.platform_settings;
create trigger trg_guard_platform_settings_write
  before update or delete on public.platform_settings
  for each row
  execute function public.guard_platform_settings_write();

commit;
