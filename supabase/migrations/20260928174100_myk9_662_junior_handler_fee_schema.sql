-- MYK9-662 (MYK9-570 slice 2): the money half of the junior handler feature.
--
-- Decisions (Richard, 2026-09-18, on MYK9-570): the reduced fee is PER SHOW — one
-- "junior handler fee" beside the regular entry fee, set when building the show. It
-- applies to the entry fee only; the platform/card-processing split (MYK9-229) is
-- untouched.
-- Decision (Richard, 2026-09-28): a handler's self-entered date of birth
-- qualifies for the reduced fee. Secretary verification is not required;
-- clubs may check eligibility when needed.
--
-- `shows.junior_handler_fee` mirrors `day_of_show_fee`'s own convention: nullable,
-- and a value of NULL or 0 both mean "no junior tier configured" (0 is what the
-- fee-section forms persist for a blank input — see 20260829030000's header for why
-- that decision was made for day_of_show_fee, and `submit_show_entries` applies the
-- identical "> 0" test rather than IS NOT NULL alone). A club that wants a free
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
-- NO new derivation function. 20260924231700 (MYK9-664) already moved junior-status
-- derivation entirely into `private.handler_is_junior_at` / `private.entry_handler_is_junior`,
-- specifically so that NOTHING reachable by an API role derives it live from a date of
-- birth — a manager who could ask "is this handler a junior at date X?" on demand could
-- edit a trial's date and bisect the handler's 18th birthday in about a dozen probes
-- (that migration's header, and its own closing guard: a `public` function taking a
-- `date` argument with "junior" in its name FAILS THE PUSH). `submit_show_entries`
-- reuses that existing, already-security-reviewed mechanism directly (rebuilt in the
-- next migration) rather than adding a second, parallel derivation — which is also
-- simply reusing slice 1's rule, since `private.handler_is_junior_at` already IS the
-- SQL mirror of `deriveJuniorStatus()` (its own header says so).
--
-- The one place a NEW live derivation from a raw date of birth is legitimate is the
-- three Stripe edge functions (_shared/authoritativeFee.ts): they run under
-- `service_role`, which is not a caller-controlled role the way a secretary/manager
-- account is — there is no "ask again with an edited trial date" oracle exposed to an
-- exhibitor through checkout, since nothing there lets a payer edit a trial's date and
-- reprice. `service_role` also already holds an explicit
-- `GRANT SELECT ON public.people_private TO service_role` (20260924231700), so those
-- edge functions read `people_private.date_of_birth` directly, same as `update_person_details()`
-- does today for the write side.

begin;

alter table public.shows
  add column if not exists junior_handler_fee numeric;

alter table public.shows
  add constraint shows_junior_handler_fee_nonnegative
  check (junior_handler_fee >= 0);

comment on column public.shows.junior_handler_fee is
  'MYK9-662: the reduced per-show entry fee for a junior handler, applied by submit_show_entries via private.entry_handler_is_junior() (MYK9-664). NULL or 0 = no junior tier configured, mirroring day_of_show_fee''s convention.';

commit;
