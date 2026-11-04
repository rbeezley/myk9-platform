-- Behavioral test for MYK9-1563: public.merge_user_preferences merges ONE
-- category atomically, keeps the newer theme field by themeChangedAt, and only
-- ever writes the caller's own row (RLS, SECURITY INVOKER). Fixtures roll back.
--
-- Two devices that read the same row and then save are modelled as two calls
-- made one after the other. That proves the function merges against the STORED
-- row, never the client's copy (a lost-update proxy). It does not prove
-- concurrency: true atomicity relies on the SELECT ... FOR UPDATE row lock.

BEGIN;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000015a1', true);

-- ============================================================================
-- 1. Different categories from two devices both survive.
-- ============================================================================
SELECT public.merge_user_preferences(
  '00000000-0000-0000-0000-0000000015a1', 'myk9show', 'privacy', '{"shareStats": true}'::jsonb);
SELECT public.merge_user_preferences(
  '00000000-0000-0000-0000-0000000015a1', 'myk9show', 'competition', '{"autoAdvance": true}'::jsonb);

DO $$
DECLARE
  v jsonb;
BEGIN
  SELECT preferences INTO v FROM public.user_preferences
   WHERE user_id = '00000000-0000-0000-0000-0000000015a1' AND app = 'myk9show';
  IF v #>> '{privacy,shareStats}' IS DISTINCT FROM 'true'
     OR v #>> '{competition,autoAdvance}' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'FAIL two categories did not both survive: %', v;
  END IF;
  RAISE NOTICE 'PASS updates to different categories both survive';
END;
$$;

-- ============================================================================
-- 2. Same theme field: the newer change time wins, in either arrival order.
-- ============================================================================
SELECT public.merge_user_preferences(
  '00000000-0000-0000-0000-0000000015a1', 'myk9show', 'theme',
  '{"mode": "dark"}'::jsonb, '{"mode": 9000}'::jsonb);
-- An older edit from the other device lands late.
SELECT public.merge_user_preferences(
  '00000000-0000-0000-0000-0000000015a1', 'myk9show', 'theme',
  '{"mode": "light", "fontSize": "large"}'::jsonb, '{"mode": 5000, "fontSize": 6000}'::jsonb);

DO $$
DECLARE
  v jsonb;
BEGIN
  SELECT preferences INTO v FROM public.user_preferences
   WHERE user_id = '00000000-0000-0000-0000-0000000015a1' AND app = 'myk9show';
  IF v #>> '{theme,mode}' IS DISTINCT FROM 'dark' THEN
    RAISE EXCEPTION 'FAIL older theme write overwrote the newer mode: %', v;
  END IF;
  IF v #>> '{theme,fontSize}' IS DISTINCT FROM 'large' THEN
    RAISE EXCEPTION 'FAIL the unrelated field in the late write was dropped: %', v;
  END IF;
  IF (v #>> '{themeChangedAt,mode}')::numeric <> 9000
     OR (v #>> '{themeChangedAt,fontSize}')::numeric <> 6000 THEN
    RAISE EXCEPTION 'FAIL stored change times moved backwards or went missing: %', v;
  END IF;
  RAISE NOTICE 'PASS the older theme write loses, the unrelated field applies';
END;
$$;

SELECT public.merge_user_preferences(
  '00000000-0000-0000-0000-0000000015a1', 'myk9show', 'theme',
  '{"mode": "light"}'::jsonb, '{"mode": 12000}'::jsonb);

DO $$
DECLARE
  v jsonb;
BEGIN
  SELECT preferences INTO v FROM public.user_preferences
   WHERE user_id = '00000000-0000-0000-0000-0000000015a1' AND app = 'myk9show';
  IF v #>> '{theme,mode}' IS DISTINCT FROM 'light'
     OR (v #>> '{themeChangedAt,mode}')::numeric <> 12000 THEN
    RAISE EXCEPTION 'FAIL a newer theme write did not apply: %', v;
  END IF;
  RAISE NOTICE 'PASS a newer theme write replaces the stored value';
END;
$$;

-- ============================================================================
-- 3. RLS: another user cannot merge into this row, and a bad category fails.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000015b2', true);

DO $$
DECLARE
  v_state text;
BEGIN
  BEGIN
    PERFORM public.merge_user_preferences(
      '00000000-0000-0000-0000-0000000015a1', 'myk9show', 'privacy', '{"shareStats": false}'::jsonb);
    RAISE EXCEPTION 'FAIL user B merged into user A''s row';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  RAISE NOTICE 'PASS another user cannot merge into the row (%)', v_state;
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.merge_user_preferences(
      '00000000-0000-0000-0000-0000000015b2', 'myk9show', 'bogus', '{}'::jsonb);
    RAISE EXCEPTION 'FAIL an unknown category was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  RAISE NOTICE 'PASS an unknown category is rejected';
END;
$$;

-- Squat: user B passing user A's id (or any id that is not B's) is refused and
-- creates no row.
DO $$
DECLARE
  v_n integer;
BEGIN
  BEGIN
    PERFORM public.merge_user_preferences(
      '00000000-0000-0000-0000-0000000015c3', 'myk9show', 'privacy', '{}'::jsonb);
    RAISE EXCEPTION 'FAIL a caller passed another user''s user_id';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  SELECT count(*) INTO v_n FROM public.user_preferences
   WHERE user_id = '00000000-0000-0000-0000-0000000015c3';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL a row was created for another user''s user_id';
  END IF;
  RAISE NOTICE 'PASS passing another user''s user_id raises 42501 and creates no row';
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v jsonb;
BEGIN
  SELECT preferences INTO v FROM public.user_preferences
   WHERE user_id = '00000000-0000-0000-0000-0000000015a1' AND app = 'myk9show';
  IF v #>> '{privacy,shareStats}' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'FAIL user A''s row changed after user B''s rejected call: %', v;
  END IF;
  RAISE NOTICE 'PASS user A''s row is unchanged';
END;
$$;

-- Anon cannot execute the function at all.
DO $$
BEGIN
  IF has_function_privilege('anon',
       'public.merge_user_preferences(uuid, text, text, jsonb, jsonb)', 'EXECUTE')
     OR has_function_privilege('public',
       'public.merge_user_preferences(uuid, text, text, jsonb, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon or PUBLIC can execute merge_user_preferences';
  END IF;
  RAISE NOTICE 'PASS anon and PUBLIC cannot execute the function';
END;
$$;

ROLLBACK;
