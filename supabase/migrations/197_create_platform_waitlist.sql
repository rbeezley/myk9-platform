-- Pre-launch waitlist for myK9Show. Capture email + optional details from
-- the new editorial landing page so we can keep early adopters in the loop.
--
-- Read by: apps/myk9show/src/components/landing/v2/WaitlistFormLanding.tsx
-- (insert is the only operation; the table is intentionally never read from
-- the client, so RLS denies select to anon).
--
-- Schema notes:
--   - The slim landing form (shipping today) inserts only:
--     email, name, role, source, user_agent
--   - The reserved columns below (sports, current_system, switch_reason)
--     match the rich-form variant documented in the design hand-off
--     (docs/design_handoff_landing_page/source/WaitlistForm.tsx). They
--     are nullable and forward-compatible — when the "tell us more"
--     drawer is built, no migration is needed to start populating them.

create table if not exists public.platform_waitlist (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  name            text,
  role            text,
  -- Reserved for the rich-form variant (currently unused).
  sports          text[],
  current_system  text,
  switch_reason   text,
  source          text not null,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create unique index if not exists platform_waitlist_email_key
  on public.platform_waitlist (lower(email));

create index if not exists platform_waitlist_source_idx
  on public.platform_waitlist (source, created_at desc);

alter table public.platform_waitlist enable row level security;

-- Lock the table down by default; the policies below are the only paths in.
revoke all on public.platform_waitlist from public;
grant insert on public.platform_waitlist to anon, authenticated;
grant select on public.platform_waitlist to authenticated;

-- Anon visitors may insert their own row. They cannot read or modify
-- existing rows. Site admins manage the list out-of-band via SQL or
-- a future admin tool.
drop policy if exists "anon_can_insert_waitlist" on public.platform_waitlist;
create policy "anon_can_insert_waitlist"
  on public.platform_waitlist
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "site_admins_read_waitlist" on public.platform_waitlist;
create policy "site_admins_read_waitlist"
  on public.platform_waitlist
  for select
  to authenticated
  using (public.is_site_admin());

comment on table public.platform_waitlist is
  'Pre-launch signups from the myK9Show landing page. Insert-only from anon; site admins read.';
