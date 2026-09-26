-- MYK9-781: the platform_settings singleton must never be deleted.
--
-- On 2026-09-26 the one row of public.platform_settings (fee percent, flat and
-- floor, stripe_livemode) was found missing on production. Every reader of it
-- failed closed: the exhibitor entry wizard (useClubStripeAccount's
-- fetchStripeLivemode), enforce_show_publish_gate() and stripe-checkout. The
-- owner re-inserted it by hand.
--
-- Nothing in the repo deletes the row, and the existing write guard
-- (trg_guard_platform_settings_write, 20260615180000, unchanged here) could not
-- have stopped every route that can:
--   * it ALLOWS a row DELETE from service_role or a site admin;
--   * it is a row trigger, so TRUNCATE (including the cascade from
--     `TRUNCATE public.people CASCADE`, through platform_settings.updated_by)
--     never reaches it;
--   * it fires only in the default session_replication_role, so a session in
--     `replica` mode skips it entirely.
--
-- This migration adds a refusal that no role gets past, alongside that guard:
--   * trg_block_platform_settings_delete   BEFORE DELETE   FOR EACH ROW
--   * trg_block_platform_settings_truncate BEFORE TRUNCATE FOR EACH STATEMENT
-- both ENABLE ALWAYS, so replica mode fires them too. Same-event triggers fire
-- in name order, so trg_block_* runs before trg_guard_* and every refused
-- DELETE reports MK781 with this message, not the guard's "writable only by a
-- site admin", which would misdescribe a removal.
--
-- There is deliberately no escape hatch. The singleton's lifecycle is
-- "created once by 20260615180000, then UPDATEd": every legitimate reset is an
-- UPDATE (which trg_guard_platform_settings_write still governs), and no path
-- in the repo, the seeds or the behavioral SQL tests deletes or truncates it.
-- Retiring the table is a DROP TABLE, which fires no trigger. Anything else
-- has to disable these triggers in a reviewed migration, which is the point.
--
-- Grants and RLS are unchanged.

begin;

create or replace function public.block_platform_settings_removal()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception using
    errcode = 'MK781',
    message = format(
      'platform_settings is a singleton and cannot be removed (%s refused).', tg_op
    ),
    detail = 'Checkout, the entry wizard and the show publish gate all read this row; without it they fail closed.',
    hint = 'Change its values with UPDATE instead.';
end;
$function$;

comment on function public.block_platform_settings_removal() is
  'MYK9-781: refuses every DELETE and TRUNCATE of the platform_settings singleton, for every role. Change values with UPDATE.';

revoke all on function public.block_platform_settings_removal() from public;
revoke all on function public.block_platform_settings_removal() from anon;
revoke all on function public.block_platform_settings_removal() from authenticated;

drop trigger if exists trg_block_platform_settings_delete on public.platform_settings;
create trigger trg_block_platform_settings_delete
  before delete on public.platform_settings
  for each row
  execute function public.block_platform_settings_removal();

drop trigger if exists trg_block_platform_settings_truncate on public.platform_settings;
create trigger trg_block_platform_settings_truncate
  before truncate on public.platform_settings
  for each statement
  execute function public.block_platform_settings_removal();

alter table public.platform_settings enable always trigger trg_block_platform_settings_delete;
alter table public.platform_settings enable always trigger trg_block_platform_settings_truncate;

commit;
