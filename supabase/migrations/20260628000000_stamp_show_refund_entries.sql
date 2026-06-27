-- Atomic make-whole stamp for the bulk show-cancellation refund (stripe-refund-show).
--
-- The bulk refund issues ONE Stripe refund per PaymentIntent (full make-whole),
-- then must mark every entry on that intent refunded. Stamping entries one at a
-- time (a per-entry UPDATE loop) is NOT atomic: if entry A stamps and entry B
-- fails, a retry sees A as already-refunded, taints the whole intent, and skips
-- B forever — leaving the club overpaid (PR #974 review, finding P1b).
--
-- This function stamps ALL of an intent's entries in a SINGLE statement, so the
-- write is all-or-nothing: a failure stamps nothing and a retry redoes it
-- cleanly, and the plan's "already refunded" taint then only ever reflects a
-- PRE-EXISTING per-entry refund, never a half-finished show refund.
--
-- refund_amount is set to each entry's OWN entry_fee (a column reference, so
-- every row gets its own fee) — calculateShowPayoutCents deducts that per entry,
-- zeroing the club's share for the cancelled show.
--
-- Service-role only: the refund-column write guard (trg_restrict_entry_refund_columns)
-- still requires current_setting('role') = 'service_role', which PostgREST sets
-- from the service key the edge function calls with. SECURITY DEFINER does not
-- change that role GUC, so the guard passes exactly as the existing per-entry
-- service-role UPDATE does.

CREATE OR REPLACE FUNCTION public.stamp_show_refund_entries(
  p_entry_ids uuid[],
  p_notes text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.entries
  SET refund_amount = entry_fee,
      refunded_at = now(),
      refund_notes = COALESCE(NULLIF(btrim(p_notes), ''), 'Show cancelled — full refund'),
      payment_status = 'refunded'
  WHERE id = ANY(p_entry_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Only the service-role edge function may call this — never anon/authenticated.
REVOKE ALL ON FUNCTION public.stamp_show_refund_entries(uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stamp_show_refund_entries(uuid[], text) TO service_role;
