-- Record WHEN an entry was withdrawn, for the voluntary-withdrawal refund.
--
-- The refund-cutoff comparison ("withdrew before the cutoff → full refund;
-- after → retain the fee") needs the actual withdrawal time. entries.updated_at
-- is NOT it — the update_entries_updated_at trigger (mig 003) bumps it on EVERY
-- update (scoring, edits, the refund write itself), so an entry withdrawn before
-- the cutoff and later touched after it would wrongly look "after cutoff" and
-- retain a fee.
--
-- A BEFORE UPDATE trigger stamps withdrawn_at the moment entry_status first
-- transitions INTO 'scratched' — capturing every withdrawal path (secretary
-- status change, day-of pull, approved pull request) at the DB level, not just
-- one app code path. Re-withdrawal (scratched → confirmed → scratched) restamps
-- to the latest withdrawal, which is the one the refund is about.
--
-- The trigger is ALSO the only writer: outside the scratched transition it
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
  IF new.entry_status = 'scratched' AND old.entry_status IS DISTINCT FROM 'scratched' THEN
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
