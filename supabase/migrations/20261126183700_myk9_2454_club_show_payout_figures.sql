-- MYK9-2454: a club's Collected, Refunded, owed and Paid per show, the same figures the owner's
-- payout ledger shows.
--
-- Owner decision A (2026-11-26): one SECURITY DEFINER function returns each show's figures,
-- computed the way the payout run computes them; the club Payments tab only renders the result.
-- A club admin cannot compute them in the browser: entries.refund_amount is service-role-only.
-- financial_reconciliation_orders (stripe_orders) is not a substitute: its Refunded includes the
-- platform fee on a whole-show refund, and its Collected is the checkout snapshot, not the live
-- entry fee.
--
-- FORMULAS MIRRORED (change together):
--   apps/myk9show/supabase/functions/_shared/payoutCalc.ts   calculateShowPayoutCents -> owed_cents
--   apps/myk9show/supabase/functions/cron-process-payouts/processShow.ts  (sends that figure)
--   apps/myk9show/src/features/payments/payoutLedger.ts       sumOnlineCollectedCents -> collected_cents
--                                                             sumRefundedCents        -> refunded_cents
--                                                             pickCanonicalPayout     -> payout_* columns
--   apps/myk9show/src/features/payments/clubShowPayoutFigures.ts maps these rows for the app.
-- One population for all three money figures: entries paid ONLINE with payment_status 'paid' or
-- 'refunded'. Desk payments (cash, check, waived) never ran through Stripe and never enter a
-- transfer. Each entry rounds on its own (round(fee * 100)); summing dollars first would not.
-- No entry or show deleted_at filter: the payout run and the owner ledger have none, and a
-- soft-deleted show's money is real (show_deleted says so).
--
-- paid_cents is the canonical row's amount only when it is 'completed' AND above 0. The payout
-- run closes a fully refunded show's parked row as completed at $0; that is not a payment, and
-- the tab must not read "Paid $0.00" as though money moved.
--
-- AUTHORIZATION: private.can_administer_club (20261120004700_myk9_2209_club_admin_grant_revoke):
-- a live account that is a site admin or holds an active, unexpired CLUB-WIDE club_admin row
-- (user_roles.show_id IS NULL) for this club. public.is_club_admin is show-blind, so a
-- show-pinned-only admin passes it; the client opens Payments only for a club-wide grant
-- (hasClubAdminScope, ScopeType.CLUB), and this function matches that. An unauthorized call
-- RAISEs 42501, never an empty set that could read as "$0".
--
-- No PII: no exhibitor, dog or customer column, and no Stripe transfer id.

DROP FUNCTION IF EXISTS public.club_show_payout_figures(uuid);

CREATE FUNCTION public.club_show_payout_figures(p_club_id uuid)
RETURNS TABLE (
  show_id uuid,
  show_name text,
  show_end_date date,
  show_deleted boolean,
  collected_cents bigint,
  refunded_cents bigint,
  owed_cents bigint,
  payout_id uuid,
  payout_status text,
  payout_amount_cents bigint,
  payout_failure_reason text,
  payout_completed_at timestamptz,
  payout_created_at timestamptz,
  paid_cents bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  IF p_club_id IS NULL THEN
    RAISE EXCEPTION 'club_show_payout_figures: a club is required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT private.can_administer_club(p_club_id) THEN
    RAISE EXCEPTION 'club_show_payout_figures: not authorized for this club'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH club_shows AS (
    SELECT s.id, s.name, s.end_date, s.deleted_at
      FROM public.shows s
     WHERE s.club_id = p_club_id
  ),
  money AS (
    SELECT e.show_id AS money_show_id,
           SUM(round(COALESCE(e.entry_fee, 0) * 100))::bigint AS collected,
           SUM(round(COALESCE(e.refund_amount, 0) * 100))::bigint AS refunded,
           SUM(GREATEST(0, round(COALESCE(e.entry_fee, 0) * 100)
                           - round(COALESCE(e.refund_amount, 0) * 100)))::bigint AS owed
      FROM public.entries e
      JOIN club_shows cs ON cs.id = e.show_id
     WHERE e.payment_method = 'online'
       AND e.payment_status IN ('paid', 'refunded')
     GROUP BY e.show_id
  ),
  -- pickCanonicalPayout: completed > processing > not yet sent > failed, then newest.
  canonical AS (
    SELECT DISTINCT ON (sp.show_id)
           sp.show_id AS payout_show_id,
           sp.id AS canonical_id,
           sp.status AS canonical_status,
           sp.amount_cents::bigint AS canonical_amount_cents,
           sp.failure_reason AS canonical_failure_reason,
           sp.completed_at AS canonical_completed_at,
           sp.created_at AS canonical_created_at
      FROM public.show_payouts sp
      JOIN club_shows cs ON cs.id = sp.show_id
     ORDER BY sp.show_id,
              CASE
                WHEN sp.status = 'completed' THEN 3
                WHEN sp.status = 'processing' THEN 2
                WHEN sp.status IN ('pending', 'awaiting_approval', 'approved', 'held') THEN 1
                ELSE 0
              END DESC,
              sp.created_at DESC NULLS LAST,
              sp.id DESC
  )
  SELECT cs.id,
         cs.name::text,
         cs.end_date::date,
         cs.deleted_at IS NOT NULL,
         COALESCE(m.collected, 0)::bigint,
         COALESCE(m.refunded, 0)::bigint,
         COALESCE(m.owed, 0)::bigint,
         c.canonical_id,
         c.canonical_status,
         c.canonical_amount_cents,
         c.canonical_failure_reason,
         c.canonical_completed_at,
         c.canonical_created_at,
         CASE
           WHEN c.canonical_status = 'completed' AND c.canonical_amount_cents > 0
             THEN c.canonical_amount_cents
           ELSE 0
         END::bigint
    FROM club_shows cs
    LEFT JOIN money m ON m.money_show_id = cs.id
    LEFT JOIN canonical c ON c.payout_show_id = cs.id
   WHERE m.money_show_id IS NOT NULL
      OR c.payout_show_id IS NOT NULL
   ORDER BY cs.end_date DESC NULLS LAST, cs.id;
END;
$$;

COMMENT ON FUNCTION public.club_show_payout_figures(uuid) IS
  'MYK9-2454: per show of a club, online Collected, Refunded and owed cents (the payout run''s formula, payoutCalc.ts) and the canonical payout row; paid_cents counts only a completed payout above $0. Site admin or club-wide club admin only (private.can_administer_club); 42501 otherwise.';

REVOKE ALL ON FUNCTION public.club_show_payout_figures(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_show_payout_figures(uuid) TO authenticated, service_role;
