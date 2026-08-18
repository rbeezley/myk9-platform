-- =============================================================================
-- Migration 20260816140000: defensible SMS consent record (plan L6).
--
-- `notification_preferences.sms_enabled` has existed since 005 as a bare
-- boolean. The plan is blunt about why that is not enough: TCPA requires a
-- timestamped record of the DISCLOSURE LANGUAGE SHOWN at opt-in, plus the
-- source, plus automatic STOP/HELP handling. "The box was ticked at some point"
-- is not a defence, and the penalty is per-message.
--
-- The subtlety worth encoding: consent attaches to a PHONE NUMBER, not to an
-- account. If an exhibitor changes their number, the new number has not
-- consented — prior consent does not transfer, and continuing to send is a
-- fresh violation. So the consented number is pinned here rather than read
-- from people.phone at send time.
--
-- This migration is deliberately provider-agnostic: no Twilio/10DLC specifics.
-- Choosing a provider and completing A2P registration are separate, and the
-- consent record must exist and be correct before either matters.
-- =============================================================================

begin;

alter table public.notification_preferences
  add column if not exists sms_phone_e164 text,
  add column if not exists sms_opt_in_at timestamptz,
  add column if not exists sms_consent_text_version text,
  add column if not exists sms_opt_in_source text,
  add column if not exists sms_opt_out_at timestamptz;

comment on column public.notification_preferences.sms_phone_e164 is
  'The exact number that consented, E.164. Consent does not transfer to a new number — clear the consent columns when this changes.';
comment on column public.notification_preferences.sms_opt_in_at is
  'When consent was given. Null means no defensible consent regardless of sms_enabled.';
comment on column public.notification_preferences.sms_consent_text_version is
  'Identifier of the disclosure wording actually shown (e.g. sms-consent-v1). TCPA requires proving WHAT they agreed to, not just that they agreed.';
comment on column public.notification_preferences.sms_opt_in_source is
  'Where consent was captured (e.g. account-settings, entry-checkout) — needed to reconstruct the flow during a dispute.';
comment on column public.notification_preferences.sms_opt_out_at is
  'Set on STOP. Kept rather than deleting the row: proving WHEN sending stopped is as important as proving consent began.';

-- E.164: leading +, country digit 1-9, up to 15 digits total. Rejects the
-- pretty-printed forms a UI will happily submit ("(210) 555-0142").
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notification_preferences'::regclass
      and conname = 'notification_preferences_sms_phone_e164_format'
  ) then
    alter table public.notification_preferences
      add constraint notification_preferences_sms_phone_e164_format
      check (sms_phone_e164 is null or sms_phone_e164 ~ '^\+[1-9][0-9]{6,14}$');
  end if;
end $$;

-- The invariant that actually protects us: sms_enabled true REQUIRES a
-- consented number, a timestamp, and the wording version. A future code path
-- that flips the boolean without recording consent fails loudly here rather
-- than silently sending unconsented messages.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notification_preferences'::regclass
      and conname = 'notification_preferences_sms_consent_complete'
  ) then
    alter table public.notification_preferences
      add constraint notification_preferences_sms_consent_complete
      check (
        sms_enabled is not true
        or (
          sms_phone_e164 is not null
          and sms_opt_in_at is not null
          and sms_consent_text_version is not null
        )
      );
  end if;
end $$;

-- Partial index for the send path: only rows that could legitimately receive a
-- message. Keeps the eventual sender from scanning the whole table.
create index if not exists notification_preferences_sms_sendable_idx
  on public.notification_preferences (auth_user_id)
  where sms_enabled = true and sms_opt_out_at is null;

commit;
