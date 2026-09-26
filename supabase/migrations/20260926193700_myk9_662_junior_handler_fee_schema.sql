-- MYK9-662 (MYK9-570 slice 2): the money half of the junior handler feature.
--
-- Decisions (Richard, 2026-09-18, on MYK9-570): the reduced fee is PER SHOW — one
-- "junior handler fee" beside the regular entry fee, set when building the show. It
-- applies to the entry fee only; the platform/card-processing split (MYK9-229) is
-- untouched. Junior status stays derived, never a hand-set flag (slice 1).
--
-- `shows.junior_handler_fee` mirrors `day_of_show_fee`'s own convention: nullable,
-- and a value of NULL or 0 both mean "no junior tier configured" (0 is what the
-- fee-section forms persist for a blank input — see 20260829030000's header for why
-- that decision was made for day_of_show_fee, and `submit_show_entries` below applies
-- the identical "> 0" test rather than IS NOT NULL alone). A club that wants a free
-- junior entry can already waive an individual entry via payment_method='waived'; a
-- $0 junior TIER is not a case this slice needs to support.
--
-- No new GRANT/REVOKE: `public.shows` has always carried a table-level GRANT (not
-- `people`'s column allowlist), so a new column inherits the same visibility as
-- `pre_entry_fee` / `day_of_show_fee` automatically — verified live pre-push (see the
-- migration-auditor note in the PR). Those two fees are already shown on public show
-- browsing pages, so `anon` reading a junior fee alongside them is consistent, not a
-- new exposure.
--
-- `public.derive_junior_status` is the server-side mirror of `deriveJuniorStatus()`
-- (apps/myk9show/src/features/registries/juniorHandlerPolicy.ts). It returns the KIND
-- only ('junior' | 'adult' | 'unknown') — pricing never needs the age or the rulebook
-- citation. Edge functions (Deno, a separate deploy tree from apps/myk9show/src) get
-- their own TS mirror in supabase/functions/_shared/authoritativeFee.ts; SQL callers
-- (submit_show_entries) use this one. Three independent restatements of the same rule
-- already exist in this codebase for the day-of-show tier (client TS, edge Deno TS,
-- SQL) — this follows that established pattern. Change the rule, change all three.
--
-- Registry rules, quoted in full in juniorHandlerPolicy.ts:
--  - AKC:  under 18 on the day of the trial.
--  - UKC:  under 18 as of January 1 of the competition year (a FIXED date, not the
--          trial date — a handler who turns 18 in March is still a junior at a
--          November UKC trial).
--  - ASCA: states a floor of 8 and NO ceiling at all — not derivable. Returns
--          'unknown', same as a missing date of birth. 'unknown' never buys a
--          discount: the safe default when junior status cannot be proven is the
--          full adult-tier price, not a free assumption of eligibility.
--
-- `age(measure_date, birth_date)` gives the same "completed years" value as the TS
-- `completedYearsBetween` (both are calendar-aware, both treat a birthday exactly ON
-- the measuring date as "already had it") — verified against the boundary case in the
-- behavioral test. Negative (a date of birth after the measuring date) is bad data,
-- not a very young handler, and returns 'unknown' rather than a wrong 'junior'.

begin;

alter table public.shows
  add column if not exists junior_handler_fee numeric;

comment on column public.shows.junior_handler_fee is
  'MYK9-662: the reduced per-show entry fee for a junior handler (see submit_show_entries and derive_junior_status). NULL or 0 = no junior tier configured, mirroring day_of_show_fee''s convention.';

create or replace function public.derive_junior_status(
  p_date_of_birth date,
  p_trial_date date,
  p_registry_id text
)
returns text
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  v_measure_on date;
  v_age int;
begin
  if p_date_of_birth is null or p_trial_date is null then
    return 'unknown';
  end if;

  -- ASCA states a floor and no ceiling: not derivable (see header). Any other,
  -- unrecognized registry_id is treated the same way — never invent a discount
  -- on data this function does not recognize. trials.registry_id is validated to
  -- one of AKC/UKC/ASCA by trg_enforce_show_registry_on_trial, so this branch is
  -- a defensive fallback, not a live case.
  if p_registry_id not in ('AKC', 'UKC') then
    return 'unknown';
  end if;

  v_measure_on := case
    when p_registry_id = 'UKC' then make_date(extract(year from p_trial_date)::int, 1, 1)
    else p_trial_date
  end;

  v_age := extract(year from age(v_measure_on, p_date_of_birth))::int;

  -- A date of birth after the measuring date is bad data, not a very young
  -- handler (mirrors juniorHandlerPolicy.ts's `age < 0` guard).
  if v_age < 0 then
    return 'unknown';
  end if;

  return case when v_age < 18 then 'junior' else 'adult' end;
end;
$fn$;

comment on function public.derive_junior_status(date, date, text) is
  'MYK9-662: server-side mirror of deriveJuniorStatus() in apps/myk9show/src/features/registries/juniorHandlerPolicy.ts (kind only: junior/adult/unknown). Used by submit_show_entries to price the junior handler fee. Change one, change the other.';

-- Safe to expose: pure computation, no data access, no side effects (same reasoning
-- as derive_registry_id in 20260915163500). `anon` stays revoked — it never submits
-- entries.
revoke all on function public.derive_junior_status(date, date, text) from public;
revoke all on function public.derive_junior_status(date, date, text) from anon;
grant execute on function public.derive_junior_status(date, date, text) to authenticated;
grant execute on function public.derive_junior_status(date, date, text) to service_role;

commit;
