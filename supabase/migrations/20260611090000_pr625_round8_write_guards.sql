-- PR #625 round-8 review fixes (three write-surface gaps, same root cause:
-- guards that covered UPDATE/transition paths but not INSERT/creation paths).
--
-- 1. entries refund-column guard fired on UPDATE only, but the entries_insert
--    policy (migration 151) lets secretaries/club admins INSERT entries
--    directly — a forged refund_amount on INSERT (or delete + re-insert)
--    shrinks the payout cron's transfer. Now BEFORE INSERT OR UPDATE, with
--    WHEN clauses so the hot entries UPDATE path skips plpgsql entirely
--    unless a refund column actually changes.
-- 2. people early-adopter guard had the same INSERT gap (mitigated by the
--    UNIQUE auth_user_id + signup auto-creation, but closed here anyway).
-- 3. show_payouts_select leaked clubless shows' payouts to EVERY club admin:
--    shows.club_id is nullable (ON DELETE SET NULL) and is_club_admin(NULL)
--    means "admin of any club".

begin;

-- ---------------------------------------------------------------------------
-- 1. Refund columns: guard INSERT too, and stop running plpgsql on every
--    entries UPDATE. The WHEN clauses do the change detection, so the
--    function body only decides "is this writer allowed".
-- ---------------------------------------------------------------------------

create or replace function public.restrict_entry_refund_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Reaching here means a refund column is being written (trigger WHEN
  -- clauses). Only the stripe-refund-entry service role may do that; manual
  -- fixes use BEGIN; SET LOCAL ROLE service_role; (see the ops runbook).
  if (select current_setting('role', true)) = 'service_role' then
    return new;
  end if;
  raise exception
    'refund_amount, refund_notes, and refunded_at are written only by stripe-refund-entry';
end;
$$;

drop trigger if exists trg_restrict_entry_refund_columns on public.entries;

create trigger trg_restrict_entry_refund_columns
  before update on public.entries
  for each row
  when (
    old.refund_amount is distinct from new.refund_amount
    or old.refund_notes is distinct from new.refund_notes
    or old.refunded_at is distinct from new.refunded_at
  )
  execute function public.restrict_entry_refund_columns();

drop trigger if exists trg_restrict_entry_refund_columns_insert on public.entries;

create trigger trg_restrict_entry_refund_columns_insert
  before insert on public.entries
  for each row
  when (
    new.refund_amount is not null
    or new.refund_notes is not null
    or new.refunded_at is not null
  )
  execute function public.restrict_entry_refund_columns();

-- ---------------------------------------------------------------------------
-- 2. Early-adopter grant: same INSERT gap. The function gains a TG_OP branch
--    (OLD is unassigned on INSERT in plpgsql); both triggers share it.
--    Signup auto-creation inserts early_adopter_until as NULL, so the INSERT
--    trigger's WHEN clause never fires for it.
-- ---------------------------------------------------------------------------

create or replace function public.people_protect_early_adopter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and new.early_adopter_until is not distinct from old.early_adopter_until
  then
    return new;
  end if;
  if session_user = 'postgres'
    or (select current_setting('role', true)) = 'service_role'
    or public.is_site_admin()
  then
    return new;
  end if;
  raise exception 'Permission denied: early_adopter_until can only be changed by site admins'
    using errcode = '42501';
end;
$$;

drop trigger if exists people_protect_early_adopter_insert_trigger on public.people;

create trigger people_protect_early_adopter_insert_trigger
  before insert on public.people
  for each row
  when (new.early_adopter_until is not null)
  execute function public.people_protect_early_adopter();

-- The UPDATE trigger (before update OF early_adopter_until, migration
-- 20260609233000) keeps its definition; it picks up the new function body.

-- ---------------------------------------------------------------------------
-- 3. show_payouts_select: require a real club before asking is_club_admin,
--    so a clubless show's payout row is admin/secretary-only.
-- ---------------------------------------------------------------------------

drop policy if exists show_payouts_select on public.show_payouts;

create policy show_payouts_select
  on public.show_payouts for select to authenticated
  using (
    (select public.is_site_admin())
    or exists (
      select 1 from public.shows s
      where s.id = show_payouts.show_id
        and (
          (s.club_id is not null and public.is_club_admin(s.club_id))
          or public.is_show_secretary(s.id)
        )
    )
  );

commit;
