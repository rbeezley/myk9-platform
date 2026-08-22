-- Return show_name from financial_reconciliation_payouts, so the club
-- reconciliation card never renders an anonymous row of money.
--
-- WHY. The card resolved show names from TWO sources: the orders RPC (which
-- already returns show_name) and useClubPayoutHistory. That second source is a
-- PostgREST read with an `!inner` embed on shows, so it passes through the
-- shows_select policy, whose first predicate is `deleted_at is null`. This
-- function is SECURITY DEFINER and carries no such predicate, so the two
-- disagree about exactly one population: payouts belonging to a SOFT-DELETED
-- show. `soft_delete_show` has no guard against deleting a show that already
-- collected money, so that population is reachable, not theoretical.
--
-- The result was a reconciliation row reading "To transfer: $X" under the
-- literal label "Show" -- an unnamed sum on the one surface whose entire job is
-- letting a treasurer tie figures to real events -- while the payout list on
-- the card above omitted the same row entirely.
--
-- WHAT THIS DOES NOT DO. It does not change which rows are returned. A payout
-- that moved money is a financial fact, and a club admin is entitled to their
-- own club's payouts whether or not the show record was later soft-deleted;
-- hiding it would make the treasurer's books fail to tie for a reason the page
-- could never explain. This migration only makes the row identifiable.
--
-- The join is LEFT, not INNER: a payout whose show row is hard-deleted must
-- still be returned, still unnamed, rather than silently dropped.
--
-- Signature change (added show_name to RETURNS TABLE) means DROP + CREATE
-- rather than CREATE OR REPLACE, which resets the function's ACL -- so the
-- grants from 20260717130000 AND the tightening from
-- 20260728120000_advisor_grant_regrowth_guard are both restated below.

DROP FUNCTION IF EXISTS public.financial_reconciliation_payouts(text, uuid, uuid, integer, timestamptz, uuid);

CREATE FUNCTION public.financial_reconciliation_payouts(
  p_scope            text,
  p_club_id          uuid        DEFAULT NULL,
  p_show_id          uuid        DEFAULT NULL,
  p_limit            integer     DEFAULT 200,
  p_after_created_at timestamptz DEFAULT NULL,
  p_after_id         uuid        DEFAULT NULL
)
RETURNS TABLE (
  payout_id          uuid,
  show_id            uuid,
  show_name          text,
  status             text,
  amount_cents       integer,
  stripe_transfer_id text,
  scheduled_date     date,
  completed_at       timestamptz,
  failure_reason     text,
  created_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
BEGIN
  PERFORM public._financial_reconciliation_authorize(p_scope, p_club_id, p_show_id);

  RETURN QUERY
  SELECT sp.id, sp.show_id, s.name, sp.status, sp.amount_cents, sp.stripe_transfer_id,
         sp.scheduled_date, sp.completed_at, sp.failure_reason, sp.created_at
  FROM public.show_payouts sp
  LEFT JOIN public.shows s ON s.id = sp.show_id
  WHERE (
      p_scope = 'platform'
      OR (p_scope = 'show' AND sp.show_id = p_show_id)
      OR (p_scope = 'club' AND sp.show_id IN (
            SELECT s2.id FROM public.shows s2 WHERE s2.club_id = p_club_id))
    )
    AND (
      p_after_created_at IS NULL
      OR (sp.created_at, sp.id) > (p_after_created_at, p_after_id)
    )
  ORDER BY sp.created_at ASC, sp.id ASC
  LIMIT v_limit;
END;
$$;

-- Restate the full ACL: DROP discarded whatever the function held.
REVOKE ALL ON FUNCTION public.financial_reconciliation_payouts(
  text, uuid, uuid, integer, timestamptz, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_reconciliation_payouts(
  text, uuid, uuid, integer, timestamptz, uuid
) TO authenticated, service_role;

-- Reload PostgREST schema cache so the new signature is callable immediately.
NOTIFY pgrst, 'reload schema';

-- Reversible down path (run manually to roll back):
--   DROP FUNCTION IF EXISTS public.financial_reconciliation_payouts(text, uuid, uuid, integer, timestamptz, uuid);
--   then re-run 20260717130000's definition and 20260728120000's grants.
