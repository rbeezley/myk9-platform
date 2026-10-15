-- =============================================================================
-- MYK9-1162: lifecycle email step `registration_number_needed`.
--
-- A secretary can now hold a mail-in entry that has no registration number. The
-- exhibitor is told once (and again on the secretary's "Send reminder"), by a
-- sixth lifecycle step the club enables or disables with the other five.
--
--   1. Both step_type CHECKs (steps and jobs) gain the sixth value. The inline
--      CHECKs from 20260708120000 are unnamed, so the constraint is found by
--      its definition rather than by an assumed name.
--   2. ensure_show_lifecycle_email_steps seeds the sixth step. Copied from its
--      LATEST definition, 20260710080000 (search_path = '', SECURITY DEFINER);
--      EXECUTE is revoked from PUBLIC, anon and authenticated (SA-022).
--   3. Existing shows are backfilled by calling that function per show.
--   4. service_role may EXECUTE entry_awaiting_registration_number (20261014214300
--      granted only authenticated). send-lifecycle-email runs with the service
--      client and asks it whether a job's entry is still held; a service-role
--      read of the entry-results views is no substitute, because their row gate
--      is the caller (auth.uid()).
--   5. At most ONE waiting or failed registration_number_needed email per entry
--      (partial unique index). Send reminder re-sends that one rather than adding
--      a second, so no browser tab, page visit or Scheduled emails batch can leave
--      two sendable emails for the same dog.
--
-- Rollback: re-apply the 20260710080000 function and the five-value CHECKs
-- (delete any registration_number_needed rows first).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_table text;
  v_constraint text;
  v_dropped integer;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['show_lifecycle_email_steps', 'show_lifecycle_email_jobs'] LOOP
    v_dropped := 0;
    FOR v_constraint IN
      SELECT c.conname
        FROM pg_constraint c
       WHERE c.conrelid = ('public.' || v_table)::regclass
         AND c.contype = 'c'
         AND pg_get_constraintdef(c.oid) LIKE '%step_type%'
         AND pg_get_constraintdef(c.oid) LIKE '%results_available%'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v_table, v_constraint);
      v_dropped := v_dropped + 1;
    END LOOP;
    -- Exactly the one step_type CHECK: a miss would leave the old CHECK in place
    -- (refusing the new value) beside the new one.
    IF v_dropped <> 1 THEN
      RAISE EXCEPTION 'MYK9-1162: expected to drop exactly one step_type CHECK on %, dropped %',
        v_table, v_dropped;
    END IF;
  END LOOP;
END
$$;

ALTER TABLE public.show_lifecycle_email_steps
  ADD CONSTRAINT show_lifecycle_email_steps_step_type_check CHECK (
    step_type IN (
      'accepted',
      'waitlisted',
      'two_week_reminder',
      'day_before_reminder',
      'results_available',
      'registration_number_needed'
    )
  );

ALTER TABLE public.show_lifecycle_email_jobs
  ADD CONSTRAINT show_lifecycle_email_jobs_step_type_check CHECK (
    step_type IN (
      'accepted',
      'waitlisted',
      'two_week_reminder',
      'day_before_reminder',
      'results_available',
      'registration_number_needed'
    )
  );

CREATE OR REPLACE FUNCTION public.ensure_show_lifecycle_email_steps(p_show_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.show_lifecycle_email_steps (show_id, step_type, is_enabled)
  VALUES
    (p_show_id, 'accepted', true),
    (p_show_id, 'waitlisted', true),
    (p_show_id, 'two_week_reminder', true),
    (p_show_id, 'day_before_reminder', true),
    (p_show_id, 'results_available', true),
    (p_show_id, 'registration_number_needed', true)
  ON CONFLICT (show_id, step_type) DO NOTHING;
$$;

-- SA-022 (20260710080000): only the new-show trigger, running as the SECURITY
-- DEFINER owner, seeds steps. That migration revoked PUBLIC only; the decision is
-- stated for the two API roles here, so nobody calls it directly.
REVOKE ALL ON FUNCTION public.ensure_show_lifecycle_email_steps(uuid) FROM PUBLIC, anon, authenticated;

-- Backfill: existing shows get the sixth step (enabled, like the other five).
SELECT public.ensure_show_lifecycle_email_steps(s.id) FROM public.shows s;

GRANT EXECUTE ON FUNCTION public.entry_awaiting_registration_number(uuid, uuid, text, timestamptz)
  TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS show_lifecycle_email_jobs_one_outstanding_number_needed
  ON public.show_lifecycle_email_jobs (entry_id)
  WHERE step_type = 'registration_number_needed' AND status IN ('ready', 'failed');

COMMIT;
