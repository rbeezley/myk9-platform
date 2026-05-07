-- Heritage Trial Pages — schema additions (Phase 0).
-- Plan: docs/plans/2026-05-07-heritage-trial-pages-plan.md §4.4
-- Findings: docs/plans/2026-05-07-heritage-pre-flight-findings.md
--
-- Adds:
--   * shows.landing_style       — visual brand (per-show, per Option B decision)
--   * trials.registry_id        — sanctioning body (per-trial; supports dual-licensing later)
--   * trials.confirmation_date  — when the formal Heritage email goes out
--   * trials.timezone           — IANA name; required for countdown + email date formatting
--   * entries.confirmation_email_sent_at / message_id / status
--                               — idempotent send, bounce tracking
--
-- The pg_cron schedule that drives the confirmation email lives in a SEPARATE
-- migration (193_heritage_cron.sql) so the schema change can be reviewed and
-- pushed independently from the project-level pg_cron extension install.

begin;

-- ─── shows.landing_style ─────────────────────────────────────────────────
-- 'default' = existing trial-detail layout. 'heritage' = engraved Heritage layout.
-- Closed enum (CHECK constraint) because the renderer is the only thing that
-- knows how to render each value; adding a new style is a code change anyway.
alter table public.shows
  add column landing_style text not null default 'default'
  check (landing_style in ('default', 'heritage'));

comment on column public.shows.landing_style is
  'Visual brand applied to the show''s public trial pages. ''default'' renders the existing layout; ''heritage'' renders the engraved Heritage layout (see features/heritage/landing).';

-- ─── trials.registry_id ──────────────────────────────────────────────────
-- Sanctioning body. Open-ended (no CHECK) because new registries are added as
-- data via @/features/registries, not as schema migrations. Default 'AKC' so
-- existing rows are valid without backfill.
alter table public.trials
  add column registry_id text not null default 'AKC';

comment on column public.trials.registry_id is
  'Sanctioning body id. Read with getRegistry(trial.registry_id). Per-trial because dual-sanctioned (e.g. AKC + UKC) events exist.';

-- ─── trials.confirmation_date ────────────────────────────────────────────
-- When the formal Heritage confirmation email is sent (typically ~6 days
-- before the trial, after the draw is complete). NULL means no draw / no
-- formal confirmation step for this trial.
alter table public.trials
  add column confirmation_date timestamptz;

comment on column public.trials.confirmation_date is
  'Date the Heritage confirmation email is sent for entrants of this trial. NULL = no formal confirmation step.';

-- ─── trials.timezone ─────────────────────────────────────────────────────
-- IANA timezone name. Used for countdown rendering and date formatting in
-- exhibitor-facing surfaces (landing page, entry blank, email).
alter table public.trials
  add column timezone text not null default 'America/New_York';

comment on column public.trials.timezone is
  'IANA timezone name (e.g. America/Chicago). Used to format dates on landing page, entry blank, and confirmation email.';

-- ─── entries — confirmation email tracking ───────────────────────────────
-- Idempotency: the daily cron only sends to entries where confirmation_email_sent_at IS NULL.
-- Bounce tracking: the resend-webhook function flips status to 'bounced' / 'failed'.
alter table public.entries
  add column confirmation_email_sent_at timestamptz;

alter table public.entries
  add column confirmation_email_message_id text;

alter table public.entries
  add column confirmation_email_status text not null default 'pending'
  check (confirmation_email_status in ('pending', 'sent', 'bounced', 'failed'));

comment on column public.entries.confirmation_email_sent_at is
  'Set when the Heritage confirmation email has been queued/sent. The send function skips entries with a non-null value, making cron retries idempotent.';

comment on column public.entries.confirmation_email_message_id is
  'Resend message id, captured at send time for bounce/complaint correlation via the resend-webhook function.';

comment on column public.entries.confirmation_email_status is
  'Lifecycle: pending → sent → (bounced|failed). Trial chair surfaces use this to identify entrants whose confirmation did not deliver.';

commit;
