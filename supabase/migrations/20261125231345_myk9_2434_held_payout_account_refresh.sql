-- =============================================================================
-- MYK9-2434: a held payout follows the club's reconnected Stripe account.
--
-- claim_show_payout_for_send (20261119041300_myk9_2170_payout_brake.sql) refreshed
-- club_stripe_account_id in its pending, awaiting_approval and approved branches
-- but not in the held branch. A club that reconnected Stripe while its payout was
-- held left the row pointing at the old account, so approve_show_payout looked up
-- the old destination and refused the reviewed (new) one.
--
-- Copied from 20261119041300 (its latest definition) with one change: the held
-- branch also sets club_stripe_account_id = p_account_id. Signature, SECURITY
-- DEFINER, search_path and grants are unchanged and restated.
--
-- Behavioral coverage (CI only): supabase/tests/myk9_2434_held_payout_account_refresh_test.sql
-- Rollback: re-run the claim_show_payout_for_send definition from 20261119041300.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_show_payout_for_send(
  p_show_id uuid,
  p_account_id uuid,
  p_destination text,
  p_amount_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_brake boolean;
  v_row public.show_payouts;
  v_id uuid;
  v_next text;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'A payout claim needs a positive amount' USING ERRCODE = '22023';
  END IF;

  -- Same transaction as the claim: switching the brake on waits for this
  -- claim to commit, or this claim sees it on. No row reads as on.
  SELECT ps.payouts_require_approval INTO v_brake
    FROM public.platform_settings ps
   WHERE ps.id
     FOR SHARE;
  v_brake := coalesce(v_brake, true);

  IF NOT EXISTS (
    SELECT 1
      FROM public.club_stripe_accounts csa
      JOIN public.shows s ON s.club_id = csa.club_id
     WHERE csa.id = p_account_id
       AND s.id = p_show_id
       AND csa.stripe_account_id = p_destination
  ) THEN
    RETURN jsonb_build_object('outcome', 'account_mismatch');
  END IF;

  SELECT * INTO v_row
    FROM public.show_payouts sp
   WHERE sp.show_id = p_show_id
     AND sp.status <> 'failed'
     FOR UPDATE;

  IF NOT FOUND THEN
    v_next := CASE WHEN v_brake THEN 'awaiting_approval' ELSE 'processing' END;
    BEGIN
      INSERT INTO public.show_payouts (
        show_id, club_stripe_account_id, amount_cents, status, scheduled_date
      )
      VALUES (p_show_id, p_account_id, p_amount_cents, v_next, current_date)
      RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      -- Another run inserted this show's live row first.
      RETURN jsonb_build_object('outcome', 'busy');
    END;
    RETURN jsonb_build_object(
      'outcome', CASE WHEN v_brake THEN 'awaiting_approval' ELSE 'claimed' END,
      'payout_id', v_id
    );
  END IF;

  IF v_row.status = 'pending' THEN
    v_next := CASE WHEN v_brake THEN 'awaiting_approval' ELSE 'processing' END;
    UPDATE public.show_payouts sp
       SET status = v_next,
           amount_cents = p_amount_cents,
           club_stripe_account_id = p_account_id
     WHERE sp.id = v_row.id;
    RETURN jsonb_build_object(
      'outcome', CASE WHEN v_brake THEN 'awaiting_approval' ELSE 'claimed' END,
      'payout_id', v_row.id
    );
  END IF;

  IF v_row.status = 'awaiting_approval' THEN
    UPDATE public.show_payouts sp
       SET amount_cents = p_amount_cents,
           club_stripe_account_id = p_account_id
     WHERE sp.id = v_row.id;
    RETURN jsonb_build_object('outcome', 'awaiting_approval', 'payout_id', v_row.id);
  END IF;

  IF v_row.status = 'approved' THEN
    IF v_row.approved_stripe_account_id = p_destination
       AND p_amount_cents <= v_row.approved_amount_cents THEN
      UPDATE public.show_payouts sp
         SET status = 'processing',
             amount_cents = p_amount_cents,
             club_stripe_account_id = p_account_id
       WHERE sp.id = v_row.id;
      RETURN jsonb_build_object(
        'outcome', 'claimed',
        'payout_id', v_row.id,
        'approved_amount_cents', v_row.approved_amount_cents
      );
    END IF;
    UPDATE public.show_payouts sp
       SET status = 'awaiting_approval',
           amount_cents = p_amount_cents,
           club_stripe_account_id = p_account_id,
           approved_at = NULL,
           approved_by = NULL,
           approved_amount_cents = NULL,
           approved_stripe_account_id = NULL,
           approval_reset_reason = CASE
             WHEN v_row.approved_stripe_account_id IS DISTINCT FROM p_destination
               THEN 'The club''s bank account changed after approval'
             ELSE format('The amount rose from %s to %s cents after approval',
                         v_row.approved_amount_cents, p_amount_cents)
           END
     WHERE sp.id = v_row.id;
    RETURN jsonb_build_object('outcome', 'approval_reset', 'payout_id', v_row.id);
  END IF;

  IF v_row.status = 'held' THEN
    -- Keep the hold and its reason; the amount and the club's account follow
    -- the run, so the figure owed, the figure a site admin approves later and
    -- the bank account that approval checks stay current (MYK9-2434).
    UPDATE public.show_payouts sp
       SET amount_cents = p_amount_cents,
           club_stripe_account_id = p_account_id
     WHERE sp.id = v_row.id;
    RETURN jsonb_build_object('outcome', 'held', 'payout_id', v_row.id);
  END IF;

  -- processing or completed: another run has it, or it is done.
  RETURN jsonb_build_object('outcome', 'busy', 'payout_id', v_row.id);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_show_payout_for_send(uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_show_payout_for_send(uuid, uuid, text, integer)
  TO service_role;

COMMIT;
