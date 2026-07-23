-- Persist the secretary's explicit "Deny refund" choice for pulled entries.
-- A successful Stripe refund is already authoritative via refund_amount /
-- refunded_at, so only the denial needs a separate durable decision. This lets
-- the payout ledger distinguish unresolved pulls from reviewed no-refund pulls.

BEGIN;

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS refund_decision text,
  ADD COLUMN IF NOT EXISTS refund_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'entries_refund_decision_check'
       AND conrelid = 'public.entries'::regclass
  ) THEN
    ALTER TABLE public.entries
      ADD CONSTRAINT entries_refund_decision_check
      CHECK (refund_decision IN ('denied'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS entries_refund_decided_by_idx
  ON public.entries (refund_decided_by)
  WHERE refund_decided_by IS NOT NULL;

-- Block direct client writes. The SECURITY DEFINER RPC below runs as its owner
-- and is the only authenticated path that may write these fields.
CREATE OR REPLACE FUNCTION public.restrict_entry_refund_decision_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- A reinstated entry needs a fresh decision if it is pulled again later.
  -- This runs for every role, including service-role lifecycle mutations.
  IF TG_OP = 'UPDATE'
     AND old.entry_status = 'scratched'
     AND new.entry_status IS DISTINCT FROM 'scratched' THEN
    new.refund_decision := NULL;
    new.refund_decided_at := NULL;
    new.refund_decided_by := NULL;
    RETURN new;
  END IF;

  IF current_user IN ('postgres', 'service_role') THEN
    RETURN new;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF new.refund_decision IS NOT NULL
       OR new.refund_decided_at IS NOT NULL
       OR new.refund_decided_by IS NOT NULL THEN
      RAISE EXCEPTION 'refund decisions are written only through set_entry_refund_decision'
        USING ERRCODE = '42501';
    END IF;

    RETURN new;
  END IF;

  IF new.refund_decision IS DISTINCT FROM old.refund_decision
     OR new.refund_decided_at IS DISTINCT FROM old.refund_decided_at
     OR new.refund_decided_by IS DISTINCT FROM old.refund_decided_by THEN
    RAISE EXCEPTION 'refund decisions are written only through set_entry_refund_decision'
      USING ERRCODE = '42501';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_entry_refund_decision_columns ON public.entries;
CREATE TRIGGER trg_restrict_entry_refund_decision_columns
  BEFORE UPDATE ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_entry_refund_decision_columns();

DROP TRIGGER IF EXISTS trg_restrict_entry_refund_decision_columns_insert ON public.entries;
CREATE TRIGGER trg_restrict_entry_refund_decision_columns_insert
  BEFORE INSERT ON public.entries
  FOR EACH ROW
  WHEN (
    new.refund_decision IS NOT NULL
    OR new.refund_decided_at IS NOT NULL
    OR new.refund_decided_by IS NOT NULL
  )
  EXECUTE FUNCTION public.restrict_entry_refund_decision_columns();

CREATE OR REPLACE FUNCTION public.set_entry_refund_decision(
  p_entry_id uuid,
  p_decision text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
  v_club_id uuid;
  v_entry_status text;
  v_payment_method text;
  v_payment_status text;
  v_refund_amount numeric;
  v_refund_decision text;
BEGIN
  IF p_decision <> 'denied' THEN
    RAISE EXCEPTION 'unsupported refund decision: %', p_decision
      USING ERRCODE = '22023';
  END IF;

  SELECT e.show_id,
         s.club_id,
         e.entry_status,
         e.payment_method,
         e.payment_status,
         e.refund_amount,
         e.refund_decision
    INTO v_show_id,
         v_club_id,
         v_entry_status,
         v_payment_method,
         v_payment_status,
         v_refund_amount,
         v_refund_decision
    FROM public.entries e
    JOIN public.shows s ON s.id = e.show_id
   WHERE e.id = p_entry_id
     AND e.deleted_at IS NULL
     FOR UPDATE OF e;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'entry % not found', p_entry_id
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_site_admin()
    OR public.is_show_secretary(v_show_id)
    OR (v_club_id IS NOT NULL AND public.is_club_admin(v_club_id))
  ) THEN
    RAISE EXCEPTION 'not authorized to decide refund for entry %', p_entry_id
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(v_entry_status, '') <> 'scratched'
     OR COALESCE(v_payment_method, '') <> 'online'
     OR COALESCE(v_payment_status, '') <> 'paid'
     OR COALESCE(v_refund_amount, 0) > 0 THEN
    RAISE EXCEPTION 'entry % is not an unresolved paid-online pull', p_entry_id
      USING ERRCODE = '22023';
  END IF;

  IF v_refund_decision = 'denied' THEN
    RETURN;
  END IF;

  UPDATE public.entries
     SET refund_decision = 'denied',
         refund_decided_at = now(),
         refund_decided_by = auth.uid(),
         updated_at = now()
   WHERE id = p_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_entry_refund_decision(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_entry_refund_decision(uuid, text) TO authenticated;

GRANT SELECT (refund_decision, refund_decided_at, refund_decided_by)
  ON public.entries TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
