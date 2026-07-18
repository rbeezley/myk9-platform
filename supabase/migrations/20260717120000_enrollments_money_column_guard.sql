-- MP-15 (security-audit-2026-07-17-money-path): enrollments money columns
-- were writable by the enrollment owner. The 054-era registrations_update_own
-- policy survived the 130 rename, and only payment_status ever got a column
-- guard (migration 110) — so an exhibitor could PATCH their own row via
-- PostgREST and forge paid_amount / refund_amount / discount_amount, which the
-- secretary reconciliation views read directly. Not money-movement (payouts
-- and refunds key exclusively on trigger-guarded entries.* columns) but a
-- staff-facing integrity hole.
--
-- Guarded columns: paid_amount, discount_amount, refund_amount, refund_notes,
-- refunded_at. Deliberately NOT guarded: total_amount and payment_reference —
-- those are self-declared at registration (the exhibitor wizard writes them
-- when submitting mail-in/check enrollments) and are reconciled by staff
-- against paid_amount, which is the guarded source of truth.
--
-- Allowed writers mirror migration 110's set for the same table (the
-- secretary desk-payment flow runs as an authenticated secretary, so
-- service-role-only — the entries-table pattern — would break it).
--
-- Legit flows verified against the WHEN clauses below:
--   * exhibitor wizard INSERT: paid_amount = 0, no refund/discount → no fire
--   * exhibitor wizard UPDATE (add entries): paid_amount omitted via
--     preservePaidAmountForPending, refund columns untouched → no fire
--   * secretary desk payment / refund recording: allowed via has_role
--   * stripe_orders trigger (132) and edge functions: service_role bypass

begin;

create or replace function public.restrict_enrollment_money_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Reaching here means a guarded money column is being written (trigger
  -- WHEN clauses do the change detection).
  if session_user = 'postgres'
    or (select current_setting('role', true)) = 'service_role'
  then
    return new;
  end if;
  if (select public.is_platform_admin()) then
    return new;
  end if;
  if (select public.has_role('secretary'::text)) then
    return new;
  end if;
  raise exception
    'paid_amount, discount_amount, and refund columns on enrollments can only be modified by the service role, a platform admin, or a secretary'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_restrict_enrollment_money_columns on public.enrollments;

create trigger trg_restrict_enrollment_money_columns
  before update on public.enrollments
  for each row
  when (
    old.paid_amount is distinct from new.paid_amount
    or old.discount_amount is distinct from new.discount_amount
    or old.refund_amount is distinct from new.refund_amount
    or old.refund_notes is distinct from new.refund_notes
    or old.refunded_at is distinct from new.refunded_at
  )
  execute function public.restrict_enrollment_money_columns();

drop trigger if exists trg_restrict_enrollment_money_columns_insert on public.enrollments;

create trigger trg_restrict_enrollment_money_columns_insert
  before insert on public.enrollments
  for each row
  when (
    coalesce(new.paid_amount, 0) <> 0
    or coalesce(new.discount_amount, 0) <> 0
    or new.refund_amount is not null
    or new.refund_notes is not null
    or new.refunded_at is not null
  )
  execute function public.restrict_enrollment_money_columns();

commit;
