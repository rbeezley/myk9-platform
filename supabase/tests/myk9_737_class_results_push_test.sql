-- Behavioral test for MYK9-737: the "Results Posted" push is claimed once per
-- class, at the moment its qualification results become visible under the
-- release gate (public.resolve_class_result_visibility). All fixtures roll back.
--
-- Covers:
--   1. Default preset (no settings row = 'open'): a running class claims
--      nothing even though qualification is 'immediate'; completing it claims
--      once; a second attempt claims nothing.
--   2. 'standard' preset: scoring-finalization with a lagging status claims.
--   3. Held for manual release ('review' class override): completing and
--      finalizing claim nothing; setting results_released_at claims.
--   4. A soft-deleted class never claims.
--   5. Wiring: trg_notify_class_results_push is on classes; the per-entry
--      trg_notify_entry_scoring_push and its function are gone.
--   6. No client role can read the claim table or run the claim function.
--
-- The trigger's network half (Vault secrets + net.http_post) is not driven
-- here: Vault is unset on the CI database, where the trigger returns before
-- claiming, exactly as notify_class_status_push does. The claim function is the
-- whole decision, so it is what these arms exercise.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000737001', 'MYK9-737 Results Push Club');

INSERT INTO public.shows (id, name, organization, club_id, start_date, end_date)
VALUES
  ('00000000-0000-0000-0000-000000737002', 'MYK9-737 Default Show', 'AKC',
   '00000000-0000-0000-0000-000000737001', current_date, current_date),
  ('00000000-0000-0000-0000-000000737012', 'MYK9-737 Standard Show', 'AKC',
   '00000000-0000-0000-0000-000000737001', current_date, current_date);

INSERT INTO public.trials (id, show_id, name, date)
VALUES
  ('00000000-0000-0000-0000-000000737003', '00000000-0000-0000-0000-000000737002',
   'MYK9-737 Default Trial', current_date),
  ('00000000-0000-0000-0000-000000737013', '00000000-0000-0000-0000-000000737012',
   'MYK9-737 Standard Trial', current_date);

-- The 'standard' preset, materialized the way the app writes a show row.
INSERT INTO public.show_visibility_settings
  (show_id, placement_timing, qualification_timing, time_timing, faults_timing)
VALUES ('00000000-0000-0000-0000-000000737012', 'class_complete', 'immediate', 'class_complete', 'class_complete');

INSERT INTO public.classes (id, trial_id, name, status, is_scoring_finalized, results_released_at, deleted_at)
VALUES
  -- A: default show, running.
  ('00000000-0000-0000-0000-0000007370a1', '00000000-0000-0000-0000-000000737003',
   'MYK9-737 A default', 'in_progress', false, NULL, NULL),
  -- B: standard show, running.
  ('00000000-0000-0000-0000-0000007370b1', '00000000-0000-0000-0000-000000737013',
   'MYK9-737 B standard', 'in_progress', false, NULL, NULL),
  -- C: default show, held for manual release by a class override.
  ('00000000-0000-0000-0000-0000007370c1', '00000000-0000-0000-0000-000000737003',
   'MYK9-737 C held', 'in_progress', false, NULL, NULL),
  -- D: default show, completed but soft-deleted.
  ('00000000-0000-0000-0000-0000007370d1', '00000000-0000-0000-0000-000000737003',
   'MYK9-737 D deleted', 'completed', true, NULL, now());

INSERT INTO public.class_visibility_overrides (class_id, preset)
VALUES ('00000000-0000-0000-0000-0000007370c1', 'review');

-- The fixture classes must start unclaimed, or every arm below is vacuous.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM private.class_results_push_sent
    WHERE class_id IN (
      '00000000-0000-0000-0000-0000007370a1', '00000000-0000-0000-0000-0000007370b1',
      '00000000-0000-0000-0000-0000007370c1', '00000000-0000-0000-0000-0000007370d1'
    )
  ) THEN
    RAISE EXCEPTION 'FIXTURE a fixture class was already claimed';
  END IF;
  -- Positive control: the resolver really does show A's qualification while
  -- it runs, so arm 1's "no claim while running" is the done-guard at work.
  IF NOT (SELECT qualification_visible
          FROM public.resolve_class_result_visibility('00000000-0000-0000-0000-0000007370a1')) THEN
    RAISE EXCEPTION 'FIXTURE default-preset qualification is not immediate';
  END IF;
END;
$$;

-- ============================================================================
-- 1. Default preset: nothing while running, once on completion.
-- ============================================================================

DO $$
BEGIN
  IF private.claim_class_results_push('00000000-0000-0000-0000-0000007370a1') THEN
    RAISE EXCEPTION 'FAIL a running class claimed the results push';
  END IF;

  UPDATE public.classes SET status = 'completed'
  WHERE id = '00000000-0000-0000-0000-0000007370a1';

  IF NOT private.claim_class_results_push('00000000-0000-0000-0000-0000007370a1') THEN
    RAISE EXCEPTION 'FAIL a completed default-preset class did not claim the results push';
  END IF;
  IF private.claim_class_results_push('00000000-0000-0000-0000-0000007370a1') THEN
    RAISE EXCEPTION 'FAIL the results push was claimed twice for one class';
  END IF;
  RAISE NOTICE 'PASS default preset: no push while running, one push on completion';
END;
$$;

-- ============================================================================
-- 2. Standard preset: scoring-finalized with a lagging status counts as done.
-- ============================================================================

DO $$
BEGIN
  UPDATE public.classes SET is_scoring_finalized = true
  WHERE id = '00000000-0000-0000-0000-0000007370b1';

  IF NOT private.claim_class_results_push('00000000-0000-0000-0000-0000007370b1') THEN
    RAISE EXCEPTION 'FAIL a scoring-finalized standard-preset class did not claim';
  END IF;
  RAISE NOTICE 'PASS standard preset: scoring finalization claims the push';
END;
$$;

-- ============================================================================
-- 3. Held for manual release: nothing until results_released_at is set.
-- ============================================================================

DO $$
BEGIN
  UPDATE public.classes SET status = 'completed', is_scoring_finalized = true
  WHERE id = '00000000-0000-0000-0000-0000007370c1';

  IF private.claim_class_results_push('00000000-0000-0000-0000-0000007370c1') THEN
    RAISE EXCEPTION 'FAIL a class held for manual release claimed before release';
  END IF;

  UPDATE public.classes SET results_released_at = now()
  WHERE id = '00000000-0000-0000-0000-0000007370c1';

  IF NOT private.claim_class_results_push('00000000-0000-0000-0000-0000007370c1') THEN
    RAISE EXCEPTION 'FAIL releasing a held class did not claim the results push';
  END IF;
  RAISE NOTICE 'PASS manual release: no push when completed, one push on release';
END;
$$;

-- ============================================================================
-- 4. A soft-deleted class never claims.
-- ============================================================================

DO $$
BEGIN
  IF private.claim_class_results_push('00000000-0000-0000-0000-0000007370d1') THEN
    RAISE EXCEPTION 'FAIL a soft-deleted class claimed the results push';
  END IF;
  RAISE NOTICE 'PASS a soft-deleted class never claims';
END;
$$;

-- ============================================================================
-- 5. Wiring.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_notify_class_results_push'
      AND tgrelid = 'public.classes'::regclass
      AND tgenabled <> 'D'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'FAIL trg_notify_class_results_push is missing or disabled on classes';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_notify_entry_scoring_push'
      AND tgrelid = 'public.entries'::regclass
  ) THEN
    RAISE EXCEPTION 'FAIL the per-entry scoring push trigger still exists';
  END IF;
  IF to_regprocedure('public.notify_entry_scoring_push()') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL public.notify_entry_scoring_push() still exists';
  END IF;
  RAISE NOTICE 'PASS the results push is wired to classes and the per-entry push is gone';
END;
$$;

-- ============================================================================
-- 6. No client role reaches the claim.
-- ============================================================================

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(r, 'private.class_results_push_sent', 'SELECT')
       OR has_table_privilege(r, 'private.class_results_push_sent', 'INSERT')
       OR has_table_privilege(r, 'private.class_results_push_sent', 'DELETE') THEN
      RAISE EXCEPTION 'FAIL % holds a privilege on private.class_results_push_sent', r;
    END IF;
    IF has_function_privilege(r, 'private.claim_class_results_push(uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL % can execute private.claim_class_results_push', r;
    END IF;
    IF has_function_privilege(r, 'public.notify_class_results_push()', 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL % can execute public.notify_class_results_push', r;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS no client role can read the claim table or run the claim';
END;
$$;

ROLLBACK;
