-- Security audit remediation (2026-07-10): SA-021, SA-022, SA-027.
--
-- SA-021: support_tickets, support_ticket_messages, show_lifecycle_email_steps,
--   show_lifecycle_email_jobs, show_lifecycle_email_attempts all have
--   ENABLE ROW LEVEL SECURITY + scoped policies + explicit GRANTs, but were
--   never FORCE'd (both migrations postdate the 20260703121000 FORCE sweep).
--   Table-owner-role queries and pg_dump under the owner bypass non-FORCE RLS.
-- SA-022: ensure_show_lifecycle_email_steps(uuid) is SECURITY DEFINER with no
--   authz check and was never REVOKE'd from PUBLIC, so any caller (including
--   anon) could insert default lifecycle-step rows for an arbitrary show.
-- SA-027: can_manage_show_lifecycle_email, ensure_show_lifecycle_email_steps,
--   and ensure_show_lifecycle_email_steps_for_new_show use
--   `set search_path = public` instead of the repo-standard
--   `set search_path = ''` with fully-qualified references. All references in
--   these bodies are already schema-qualified, so this is a behavior-preserving
--   idiom fix, not a logic change.
--
-- See openspec/changes/security-audit-remediation/design.md (Decision D3).

begin;

-- SA-021: FORCE RLS on the five tables that reintroduced the SA-017 gap.
alter table public.support_tickets force row level security;
alter table public.support_ticket_messages force row level security;
alter table public.show_lifecycle_email_steps force row level security;
alter table public.show_lifecycle_email_jobs force row level security;
alter table public.show_lifecycle_email_attempts force row level security;

-- SA-022: only the trg_ensure_show_lifecycle_email_steps trigger (running as
-- the SECURITY DEFINER function owner) should be able to seed default steps.
revoke all on function public.ensure_show_lifecycle_email_steps(uuid) from public;

-- SA-027: pin search_path = '' and keep all references fully-qualified.
-- Bodies are unchanged from 20260708120000_show_lifecycle_emails.sql — only
-- the `set search_path` clause changes.

create or replace function public.can_manage_show_lifecycle_email(p_show_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.is_site_admin()
    or public.is_show_secretary(p_show_id)
    or exists (
      select 1
      from public.shows s
      where s.id = p_show_id
        and s.club_id is not null
        and (
          public.is_club_admin(s.club_id)
          or public.is_trial_secretary(s.club_id)
        )
    ),
    false
  );
$$;

create or replace function public.ensure_show_lifecycle_email_steps(p_show_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.show_lifecycle_email_steps (show_id, step_type, is_enabled)
  values
    (p_show_id, 'accepted', true),
    (p_show_id, 'waitlisted', true),
    (p_show_id, 'two_week_reminder', true),
    (p_show_id, 'day_before_reminder', true),
    (p_show_id, 'results_available', true)
  on conflict (show_id, step_type) do nothing;
$$;

create or replace function public.ensure_show_lifecycle_email_steps_for_new_show()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ensure_show_lifecycle_email_steps(new.id);
  return new;
end;
$$;

commit;
