-- MYK9-662 slice A: the per-show junior handler fee SETTING. Nothing reads it to price
-- an entry yet; pricing arrives in slice B (docs/plan-junior-handler-fee-v2.md).
--
-- Mirrors day_of_show_fee: nullable, and NULL or 0 both mean "no junior tier".
--
-- No GRANT/REVOKE: public.shows carries a table-level GRANT, so a new column is
-- visible exactly as pre_entry_fee and day_of_show_fee already are (both are shown on
-- public show pages). Verify against the applied database after `db push`, including
-- column-level ACLs.

begin;

alter table public.shows
  add column if not exists junior_handler_fee numeric;

-- Bounded above as well: numeric sorts NaN above every number, so a bare `>= 0`
-- admits it, and ROUND(NaN * 100)::int would then fail every entry on the show.
alter table public.shows
  drop constraint if exists shows_junior_handler_fee_bounded;
alter table public.shows
  add constraint shows_junior_handler_fee_bounded
  check (junior_handler_fee >= 0 and junior_handler_fee < 100000);

comment on column public.shows.junior_handler_fee is
  'MYK9-662: reduced per-show entry fee for a junior handler. NULL or 0 = no junior tier, mirroring day_of_show_fee.';

commit;
