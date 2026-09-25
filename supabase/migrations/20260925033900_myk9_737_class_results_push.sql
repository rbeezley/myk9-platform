-- MYK9-737: the "Results Posted" push fires when results become VISIBLE, once
-- per class, not when each entry is scored.
--
-- Before: trg_notify_entry_scoring_push (20260703122000) posted to
-- push-trigger-scoring the moment an entry's scoring_completed_at went from
-- NULL to set. It never consulted the results release gate, so a show holding
-- results for manual release announced them on the exhibitor's phone before
-- anyone could see them, and every scored dog sent its own push.
--
-- After:
--   * The entry trigger and its function are dropped.
--   * A classes trigger fires on the three columns that move a class through
--     the release gate's states (status, is_scoring_finalized,
--     results_released_at) and asks private.claim_class_results_push whether
--     this is THE moment to announce: the class is done, its qualification
--     results are visible under the show's visibility settings, and no push
--     has been claimed for it yet. Only then does it post to
--     push-trigger-scoring, with the class, and the edge function notifies
--     each exhibitor once with all of their scored dogs in that class.
--   * Visibility is decided by public.resolve_class_result_visibility, the
--     canonical resolver the results views use (20260617150000; parity with
--     private.class_result_visibility is pinned by
--     myk9_126_class_result_visibility_parity_test.sql). Nothing here restates
--     the show -> trial -> class timing cascade.
--
-- Paths this produces:
--   * Default presets (qualification 'immediate' or 'class_complete'): the push
--     fires when the class completes or is scoring-finalized.
--   * manual_release: completing or finalizing claims nothing (qualification
--     is not visible yet); setting results_released_at does, and fires then.
--
-- Whose visibility: the push goes only to the signed-in owner, co-owner and
-- handler of scored entries. They read their results through
-- view_authenticated_entry_results and view_own_entry_results, which gate
-- result_status on vis.qualification_visible from this same resolver and
-- nothing else. The anon view_public_entry_results ALSO requires
-- results_released_at (MYK9-466, MYK9-552), but it is the public board, not
-- what these recipients see, so gating on it would delay the default-preset
-- push until a release that open shows may never do. MYK9-737 asks for the
-- default-preset push on completion.
--
-- "Done" (released, completed, or scoring-finalized) is the resolver's own
-- class-state rule (step 5 of resolve_class_result_visibility). It is needed
-- separately because an 'immediate' field is visible while the class is still
-- running, and "Results Posted" must not fire when a class STARTS.
--
-- Known limit: a secretary changing a class's visibility settings after it is
-- done (for example switching a held class to an open preset instead of
-- releasing it) changes visibility without touching classes, so no push fires
-- for that path.
--
-- Classes that are ALREADY done and visible when this migration runs are
-- claimed up front, so a later backfill that rewrites their status cannot
-- replay a push for results that were posted long ago.
--
-- Behavioral coverage: supabase/tests/myk9_737_class_results_push_test.sql

BEGIN;

-- ============================================================================
-- 1. One claim per class. Internal bookkeeping in the private schema: no
--    client role can read or write it.
-- ============================================================================

CREATE TABLE private.class_results_push_sent (
  class_id uuid PRIMARY KEY,
  sent_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE private.class_results_push_sent IS
  'MYK9-737: one row per class whose "Results Posted" push has been claimed. Written only by private.claim_class_results_push.';

ALTER TABLE private.class_results_push_sent ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.class_results_push_sent FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. The claim: done + qualification visible + not yet claimed.
-- ============================================================================

CREATE OR REPLACE FUNCTION private.claim_class_results_push(p_class_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_finalized boolean;
  v_released timestamptz;
  v_visible boolean;
  v_claimed uuid;
BEGIN
  SELECT c.status, c.is_scoring_finalized, c.results_released_at
    INTO v_status, v_finalized, v_released
  FROM public.classes c
  WHERE c.id = p_class_id
    AND c.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Done: the resolver's 'released' or 'completed' state (its step 5).
  IF NOT (
    v_released IS NOT NULL
    OR lower(coalesce(v_status, '')) = 'completed'
    OR v_finalized IS TRUE
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM private.class_results_push_sent WHERE class_id = p_class_id) THEN
    RETURN false;
  END IF;

  SELECT v.qualification_visible INTO v_visible
  FROM public.resolve_class_result_visibility(p_class_id) AS v;

  IF v_visible IS NOT TRUE THEN
    RETURN false;
  END IF;

  -- The primary key makes the claim single-winner under concurrent updates.
  INSERT INTO private.class_results_push_sent (class_id)
  VALUES (p_class_id)
  ON CONFLICT (class_id) DO NOTHING
  RETURNING class_id INTO v_claimed;

  RETURN v_claimed IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION private.claim_class_results_push(uuid) IS
  'MYK9-737: true exactly once per class, at the first moment it is done and its qualification results are visible (public.resolve_class_result_visibility).';

REVOKE ALL ON FUNCTION private.claim_class_results_push(uuid) FROM PUBLIC, anon, authenticated;

-- Classes already done and visible were announced (per entry) by the old
-- trigger; claim them so nothing replays.
DO $$
BEGIN
  PERFORM private.claim_class_results_push(c.id) FROM public.classes c;
END;
$$;

-- ============================================================================
-- 3. The classes trigger. Same Vault-backed PUSH_WEBHOOK_SECRET handshake as
--    notify_class_status_push (20260703122000).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_class_results_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  edge_function_base_url text;
  webhook_secret text;
BEGIN
  SELECT decrypted_secret
  INTO edge_function_base_url
  FROM vault.decrypted_secrets
  WHERE name = 'edge_function_base_url';

  SELECT decrypted_secret
  INTO webhook_secret
  FROM vault.decrypted_secrets
  WHERE name = 'push_webhook_secret';

  IF nullif(edge_function_base_url, '') IS NULL
    OR nullif(webhook_secret, '') IS NULL
  THEN
    RAISE NOTICE 'notify_class_results_push skipped because edge function config is not set';
    RETURN new;
  END IF;

  IF NOT private.claim_class_results_push(new.id) THEN
    RETURN new;
  END IF;

  PERFORM net.http_post(
    url := edge_function_base_url || '/push-trigger-scoring',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || webhook_secret
    ),
    body := jsonb_build_object(
      'type', 'UPDATE',
      'table', 'classes',
      'record', jsonb_build_object(
        'id', new.id,
        'name', new.name
      )
    )
  );

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_class_results_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_class_results_push ON public.classes;
CREATE TRIGGER trg_notify_class_results_push
  AFTER UPDATE OF status, is_scoring_finalized, results_released_at ON public.classes
  FOR EACH ROW
  WHEN (
    old.status IS DISTINCT FROM new.status
    OR old.is_scoring_finalized IS DISTINCT FROM new.is_scoring_finalized
    OR old.results_released_at IS DISTINCT FROM new.results_released_at
  )
  EXECUTE FUNCTION public.notify_class_results_push();

-- ============================================================================
-- 4. Retire the per-entry push.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_notify_entry_scoring_push ON public.entries;
DROP FUNCTION IF EXISTS public.notify_entry_scoring_push();

COMMIT;
