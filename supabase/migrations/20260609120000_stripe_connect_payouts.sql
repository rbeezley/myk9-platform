-- Stripe Connect: club Express accounts + per-show payout tracking.
-- Design: docs/plans/2026-06-09-stripe-payments-revision-design.md
-- Plan:   docs/plans/2026-06-09-stripe-connect-implementation.md (Phase 1)
--
-- Money model is hold-and-transfer: payments land on the platform Stripe
-- balance (unchanged checkout); cron-process-payouts transfers each closed
-- show's online entry fees to the club's Express account at end_date + 3 days.
-- All writes to both tables go through service-role edge functions; clients
-- only ever read.

begin;

-- ---------------------------------------------------------------------------
-- club_stripe_accounts — one Express account per club
-- ---------------------------------------------------------------------------

create table public.club_stripe_accounts (
  id                  uuid primary key default gen_random_uuid(),
  club_id             uuid not null unique references public.clubs(id) on delete cascade,
  stripe_account_id   text not null unique,
  onboarding_complete boolean not null default false,
  payouts_enabled     boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.club_stripe_accounts is
  'Stripe Connect Express account per club. Flags mirror Stripe account.updated webhooks; payouts_enabled gates newly enabling online entries and receiving transfers.';

drop trigger if exists club_stripe_accounts_updated_at on public.club_stripe_accounts;
create trigger club_stripe_accounts_updated_at
  before update on public.club_stripe_accounts
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- show_payouts — one live payout row per show
-- ---------------------------------------------------------------------------

create table public.show_payouts (
  id                      uuid primary key default gen_random_uuid(),
  show_id                 uuid not null references public.shows(id) on delete cascade,
  club_stripe_account_id  uuid references public.club_stripe_accounts(id),
  amount_cents            integer not null check (amount_cents >= 0),
  status                  text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  stripe_transfer_id      text,
  scheduled_date          date,
  failure_reason          text,
  completed_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

drop trigger if exists show_payouts_updated_at on public.show_payouts;
create trigger show_payouts_updated_at
  before update on public.show_payouts
  for each row execute function set_updated_at();

comment on table public.show_payouts is
  'Per-show transfer ledger written by cron-process-payouts. failed rows permit a retry row (partial unique index); insufficient-balance failures are benign and self-heal on the next daily run.';

-- Idempotency backstop: at most one live (non-failed) payout per show.
create unique index show_payouts_one_live_per_show
  on public.show_payouts(show_id) where status <> 'failed';

create index show_payouts_status_idx on public.show_payouts(status);

-- ---------------------------------------------------------------------------
-- entries.stripe_payment_intent_id — per-entry refund key
-- ---------------------------------------------------------------------------

-- Stamped by stripe-webhook when entries are created from a paid cart; lets
-- stripe-refund-entry refund a single entry out of a multi-entry payment.
-- NULL means the entry never went through Stripe (desk payments, pre-rollout
-- rows) and is therefore not refundable through the app.
alter table public.entries
  add column if not exists stripe_payment_intent_id text;

comment on column public.entries.stripe_payment_intent_id is
  'Stripe PaymentIntent that paid this entry (online entries only). Refund key for stripe-refund-entry; NULL = not refundable via Stripe.';

create index if not exists entries_stripe_payment_intent_idx
  on public.entries(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- ---------------------------------------------------------------------------
-- Grants — public tables are not auto-exposed to the Data API
-- ---------------------------------------------------------------------------

grant select on public.club_stripe_accounts to authenticated;
grant select on public.show_payouts to authenticated;
grant all on public.club_stripe_accounts to service_role;
grant all on public.show_payouts to service_role;

-- ---------------------------------------------------------------------------
-- RLS — read-only for clients, scoped by club; writes are service-role only
-- ---------------------------------------------------------------------------

alter table public.club_stripe_accounts enable row level security;
alter table public.club_stripe_accounts force row level security;
alter table public.show_payouts enable row level security;
alter table public.show_payouts force row level security;

-- Club admins see their own club's account; site admins see all.
-- is_club_admin(club_id) takes a per-row argument, so it cannot be an
-- initplan; table is O(clubs) rows, so the per-row call is acceptable.
create policy club_stripe_accounts_select
  on public.club_stripe_accounts for select to authenticated
  using (
    public.is_club_admin(club_stripe_accounts.club_id)
    or (select public.is_site_admin())
  );

-- Site admins, the show's club admins, and the SHOW-SCOPED secretary read
-- payouts. Deliberately the scoped is_show_secretary(show_id) overload
-- (migration 163), NOT the zero-arg global alias — payout amounts are
-- financially sensitive and a secretary of show A must not read show B's.
-- Per-row helper args cannot be initplans; one row per show keeps this cheap.
create policy show_payouts_select
  on public.show_payouts for select to authenticated
  using (
    (select public.is_site_admin())
    or exists (
      select 1 from public.shows s
      where s.id = show_payouts.show_id
        and (
          public.is_club_admin(s.club_id)
          or public.is_show_secretary(s.id)
        )
    )
  );

-- No insert/update/delete policies for authenticated: all mutations happen in
-- edge functions with the service role (bypasses RLS by design).

commit;
