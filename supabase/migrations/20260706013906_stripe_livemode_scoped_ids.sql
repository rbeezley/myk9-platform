-- MP-04/MP-14: Scope persisted Stripe identifiers by test/live mode before
-- the fall 2026 live-mode cutover. Existing rows were created under sandbox
-- keys, so they are explicitly backfilled as livemode=false.

begin;

alter table public.stripe_customers
  add column if not exists livemode boolean;

update public.stripe_customers
set livemode = false
where livemode is null;

alter table public.stripe_customers
  alter column livemode set default false,
  alter column livemode set not null;

alter table public.stripe_customers
  drop constraint if exists stripe_customers_person_id_unique;

alter table public.stripe_customers
  add constraint stripe_customers_person_id_livemode_unique unique (person_id, livemode);

create index if not exists stripe_customers_livemode_idx
  on public.stripe_customers (livemode);

alter table public.club_stripe_accounts
  add column if not exists livemode boolean;

update public.club_stripe_accounts
set livemode = false
where livemode is null;

alter table public.club_stripe_accounts
  alter column livemode set default false,
  alter column livemode set not null;

alter table public.club_stripe_accounts
  drop constraint if exists club_stripe_accounts_club_id_key;

alter table public.club_stripe_accounts
  add constraint club_stripe_accounts_club_id_livemode_unique unique (club_id, livemode);

create index if not exists club_stripe_accounts_livemode_idx
  on public.club_stripe_accounts (livemode);

comment on column public.stripe_customers.livemode is
  'True when the Stripe customer was created with a live-mode secret key; false for test-mode rows.';

comment on column public.club_stripe_accounts.livemode is
  'True when the connected account belongs to live mode; false for sandbox/test-mode rows.';

commit;
