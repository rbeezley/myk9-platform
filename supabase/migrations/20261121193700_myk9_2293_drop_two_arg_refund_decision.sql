-- MYK9-2293: drop set_entry_refund_decision(uuid, text).
--
-- MYK9-2249 (20261120223700) added set_entry_refund_decision(uuid, text, text), which requires a
-- reason and queues the denial email, and kept the two-argument version for Show Desk tabs left
-- open across that deploy. While it stays, a denial can be recorded with no reason and no email.
-- The client has called only the three-argument form since #4234, and a Deploy myK9Show release
-- has carried it. A tab still on an older bundle now gets PGRST202 from PostgREST: its denial is
-- not saved and it shows its own "couldn't save" error; nothing is written. A tab on a current
-- bundle reads that error as "restart the app" (isRefundDecisionRpcMissing).
--
-- The three-argument version, its body and its grants are untouched. Nothing here moves money.

DROP FUNCTION IF EXISTS public.set_entry_refund_decision(uuid, text);

DO $$
BEGIN
  IF to_regprocedure('public.set_entry_refund_decision(uuid, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'MYK9-2293: set_entry_refund_decision(uuid, text) is still installed';
  END IF;
  IF to_regprocedure('public.set_entry_refund_decision(uuid, text, text)') IS NULL THEN
    RAISE EXCEPTION 'MYK9-2293: set_entry_refund_decision(uuid, text, text) is missing';
  END IF;
END;
$$;
