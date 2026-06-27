-- Record WHEN an entry was withdrawn, for the voluntary-withdrawal refund.
--
-- The refund-cutoff comparison ("withdrew before the cutoff → full refund;
-- after → retain the fee") needs the actual withdrawal time. entries.updated_at
-- is NOT it — the update_entries_updated_at trigger (mig 003) bumps it on EVERY
-- update (scoring, edits, the refund write itself), so an entry withdrawn before
-- the cutoff and later touched after it would wrongly look "after cutoff" and
-- retain a fee.
--
-- "Gave up the spot" is one domain concept split across TWO entry_status
-- values: 'withdrawn' (EntryStatus.CANCELLED — the voluntary withdrawal that
-- chains into the refund dialog) and 'scratched' (EntryStatus.SCRATCHED — the
-- day-of ringside pull). The refund cutoff applies to both, so the trigger keys
-- on the SET {withdrawn, scratched}, not either value alone — stamping on the
-- main withdrawal path was the bug this migration originally missed.
--
-- A BEFORE UPDATE trigger stamps withdrawn_at the moment entry_status first
-- transitions INTO that set from an active status — capturing every path
-- (secretary status change, day-of pull, approved pull request) at the DB
-- level, not just one app code path. A move WITHIN the set (e.g. withdrawn →
-- scratched) freezes the original time, which is the give-up the refund is
-- about. Re-withdrawal (withdrawn → accepted → withdrawn) restamps to the
-- latest, since the spot was re-held and given up again.
--
-- The trigger is ALSO the only writer: outside an into-the-set transition it
-- forces withdrawn_at back to its prior value, so a manager cannot backdate or
-- clear this money-authoritative timestamp through a direct PostgREST UPDATE
-- (the same spirit as the refund-column write guard, mig 20260609220000).
--
-- See docs/plan-refund-policy-withdrawal.md (Phase 4).

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.stamp_entry_withdrawn_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Stamp only on the FIRST transition into a give-up status from outside the
  -- set; a move within the set ({withdrawn, scratched}) or any other update
  -- falls through to the freeze branch and keeps the original give-up time.
  IF new.entry_status IN ('withdrawn', 'scratched')
     AND (old.entry_status IS NULL
          OR old.entry_status NOT IN ('withdrawn', 'scratched')) THEN
    new.withdrawn_at := now();
  ELSE
    -- Freeze: ignore any caller-supplied change to withdrawn_at.
    new.withdrawn_at := old.withdrawn_at;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS stamp_entry_withdrawn_at ON public.entries;
CREATE TRIGGER stamp_entry_withdrawn_at
  BEFORE UPDATE ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_entry_withdrawn_at();

-- entries has a column-level SELECT allowlist for `authenticated`
-- (mig 20260620001929); the refund dialog reads withdrawn_at, so grant it.
-- Not sensitive (it's a timestamp); not granted to anon.
GRANT SELECT (withdrawn_at) ON public.entries TO authenticated;

-- Refresh PostgREST's schema cache so the Data API sees the new column at once.
NOTIFY pgrst, 'reload schema';
