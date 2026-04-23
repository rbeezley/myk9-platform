-- =============================================================================
-- Migration 151: submit_show_entries RPC
--
-- Replaces the multi-step client-side entry submission with a single
-- server-side function that:
--   1. Enforces idempotency (entry_submissions table)
--   2. Verifies dog ownership or secretary/admin role
--   3. Validates fees server-side (rejects client-supplied fee mismatches)
--   4. Gates waived/secretary_paid payment methods to authorized users
--   5. Inserts entries in a single implicit transaction
--   6. Tightens the entries_insert RLS policy so direct inserts are
--      restricted to secretaries/club admins; exhibitors go through this RPC
--
-- NOTE: Armband assignment (assign_armband RPC) is intentionally left to the
-- client to call after submission. The armbands table uses a counter-based
-- sequential assignment scheme that is complex to fold safely into this
-- transaction without risking deadlocks on concurrent submissions.
-- =============================================================================

-- =============================================================================
-- 1. Idempotency table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.entry_submissions (
  id          UUID        PRIMARY KEY,
  result      JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only the owner (SECURITY DEFINER function) and admins need to read this table.
-- Regular users should not be able to read other users' submission records.
ALTER TABLE public.entry_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entry_submissions_select_own" ON public.entry_submissions
  FOR SELECT TO authenticated
  USING (
    -- The result contains the submission_id; allow reading if caller can also
    -- see at least one entry_id in the result. This is a coarse guard —
    -- SECURITY DEFINER handles the real gating.
    public.is_site_admin()
  );

-- =============================================================================
-- 2. submit_show_entries function
-- =============================================================================

CREATE OR REPLACE FUNCTION public.submit_show_entries(
  p_show_id         uuid,
  p_registration_id uuid,    -- existing enrollments.id
  p_entries         jsonb,   -- array of {dog_id, class_id, handler_name, payment_method, client_fee_cents}
  p_submission_id   uuid,    -- idempotency key (client generates with crypto.randomUUID())
  p_payment_method  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry         jsonb;
  v_dog_id        uuid;
  v_class_id      uuid;
  v_handler_name  text;
  v_client_cents  int;

  v_show_pre_fee  numeric;
  v_show_dos_fee  numeric;
  v_show_start    date;
  v_class_fee     numeric;
  v_server_fee    numeric;
  v_server_cents  int;

  v_show_club_id  uuid;
  v_is_official   boolean;

  v_entry_id      uuid;
  v_entry_ids     uuid[] := '{}';

  v_result        jsonb;
BEGIN
  -- -------------------------------------------------------------------------
  -- 1. Idempotency check: return previous result for duplicate submission_id
  -- -------------------------------------------------------------------------
  SELECT result INTO v_result
  FROM public.entry_submissions
  WHERE id = p_submission_id;

  IF FOUND THEN
    RETURN v_result;
  END IF;

  -- -------------------------------------------------------------------------
  -- 2. Load show fee info and club_id for authorization checks
  -- -------------------------------------------------------------------------
  SELECT pre_entry_fee, day_of_show_fee, start_date, club_id
  INTO   v_show_pre_fee, v_show_dos_fee, v_show_start, v_show_club_id
  FROM   public.shows
  WHERE  id = p_show_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'show % not found', p_show_id
      USING ERRCODE = '22023';
  END IF;

  -- -------------------------------------------------------------------------
  -- 3. Check if caller is a show official (secretary or club admin for this show)
  -- -------------------------------------------------------------------------
  v_is_official := (
    public.is_site_admin()
    OR public.is_show_secretary(p_show_id)
    OR public.is_club_admin(v_show_club_id)
  );

  -- -------------------------------------------------------------------------
  -- 4. Payment method authorization
  -- -------------------------------------------------------------------------
  IF p_payment_method IN ('waived', 'secretary_paid') AND NOT v_is_official THEN
    RAISE EXCEPTION 'unauthorized payment method: % requires secretary or admin role', p_payment_method
      USING ERRCODE = '42501';
  END IF;

  -- -------------------------------------------------------------------------
  -- 5. Per-entry validation and insert
  -- -------------------------------------------------------------------------
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_dog_id       := (v_entry->>'dog_id')::uuid;
    v_class_id     := (v_entry->>'class_id')::uuid;
    v_handler_name := v_entry->>'handler_name';
    v_client_cents := (v_entry->>'client_fee_cents')::int;

    -- 5a. Ownership check: caller must own the dog OR be an official
    IF NOT v_is_official THEN
      IF NOT EXISTS (
        SELECT 1
        FROM   public.dogs   d
        JOIN   public.people p ON p.id = d.owner_id
        WHERE  d.id = v_dog_id
          AND  p.auth_user_id = auth.uid()
      ) THEN
        RAISE EXCEPTION 'caller does not own dog %', v_dog_id
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- 5b. Server-side fee computation
    --     Priority: show-level fee (day-of-show if show has started, else pre-entry)
    --               → class-level fee → 0 (classes can be free)
    SELECT entry_fee INTO v_class_fee
    FROM   public.classes
    WHERE  id = v_class_id;

    IF CURRENT_DATE >= v_show_start AND v_show_dos_fee IS NOT NULL THEN
      v_server_fee := v_show_dos_fee;
    ELSIF v_show_pre_fee IS NOT NULL THEN
      v_server_fee := v_show_pre_fee;
    ELSIF v_class_fee IS NOT NULL THEN
      v_server_fee := v_class_fee;
    ELSE
      v_server_fee := 0;
    END IF;

    -- Convert server fee (dollars DECIMAL) to cents for comparison
    v_server_cents := ROUND(v_server_fee * 100)::int;

    IF ABS(v_client_cents - v_server_cents) > 1 THEN
      RAISE EXCEPTION 'fee mismatch for class %: client sent % cents, server expects % cents',
        v_class_id, v_client_cents, v_server_cents
        USING ERRCODE = '22023';
    END IF;

    -- 5c. Insert entry row
    INSERT INTO public.entries (
      show_id,
      class_id,
      dog_id,
      handler,
      entry_fee,
      entry_status,
      payment_status,
      submitted_at,
      registration_id
    )
    VALUES (
      p_show_id,
      v_class_id,
      v_dog_id,
      v_handler_name,
      v_server_fee,
      'submitted',
      CASE
        WHEN p_payment_method IN ('waived') THEN 'waived'
        ELSE 'pending'
      END,
      now(),
      p_registration_id
    )
    RETURNING id INTO v_entry_id;

    v_entry_ids := array_append(v_entry_ids, v_entry_id);
  END LOOP;

  -- -------------------------------------------------------------------------
  -- 6. Record submission for idempotency
  -- -------------------------------------------------------------------------
  v_result := jsonb_build_object(
    'entry_ids',       to_jsonb(v_entry_ids),
    'registration_id', to_jsonb(p_registration_id),
    'submission_id',   to_jsonb(p_submission_id)
  );

  INSERT INTO public.entry_submissions (id, result)
  VALUES (p_submission_id, v_result);

  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users (exhibitors call this via the client)
GRANT EXECUTE ON FUNCTION public.submit_show_entries(uuid, uuid, jsonb, uuid, text)
  TO authenticated;

-- =============================================================================
-- 3. Tighten entries_insert RLS policy
--
-- Direct INSERT on entries is now restricted to secretaries and club admins.
-- Exhibitors must go through the submit_show_entries RPC (SECURITY DEFINER),
-- which enforces ownership, fee validation, and payment-method authorization.
-- =============================================================================

DROP POLICY IF EXISTS "entries_insert" ON public.entries;

CREATE POLICY "entries_insert" ON public.entries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_site_admin()
    OR (
      -- Secretary or club admin for ANY show (show-scoped check performed inside RPC)
      EXISTS (
        SELECT 1
        FROM   public.user_roles ur
        JOIN   public.roles      r  ON r.id  = ur.role_id
        JOIN   public.people     p  ON p.id  = ur.user_id
        WHERE  p.auth_user_id = auth.uid()
          AND  ur.is_active   = true
          AND  (ur.expires_at IS NULL OR ur.expires_at > now())
          AND  r.name IN ('secretary', 'trial_secretary', 'club_admin', 'site_admin')
      )
    )
  );

NOTIFY pgrst, 'reload schema';
