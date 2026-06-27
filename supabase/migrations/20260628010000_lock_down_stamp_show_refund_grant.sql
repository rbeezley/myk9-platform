-- Least-privilege fix for stamp_show_refund_entries (migration 20260628000000).
--
-- That migration did `REVOKE ALL ... FROM PUBLIC`, but Supabase's default
-- privileges still GRANT EXECUTE on new public functions to `authenticated` and
-- `anon`, so post-deploy verification found both could call the refund-stamp
-- RPC. The refund-column write guard (trg_restrict_entry_refund_columns) already
-- blocks any non-service_role caller from actually stamping (the UPDATE raises),
-- so there is no mutation exposure — but only the stripe-refund-show edge
-- function (service_role) should be able to call this at all. Lock it down.

REVOKE EXECUTE ON FUNCTION public.stamp_show_refund_entries(uuid[], text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stamp_show_refund_entries(uuid[], text) TO service_role;
