-- MYK9-1563: merge one preference category atomically in the database.
--
-- The client used to read the whole user_preferences row, merge in memory and
-- upsert the whole blob, so two devices saving at the same moment erased each
-- other's change in any category. This function takes a row lock, merges ONLY
-- the named category's keys, and for theme fields keeps the value with the
-- newer themeChangedAt[field] (the per-field time shape from MYK9-1545).
--
-- SECURITY INVOKER on purpose: the table's RLS policy
-- (user_preferences_user_access, auth_user_id = auth.uid()) is what limits a
-- caller to their own row. A row owned by someone else is invisible to the
-- SELECT ... FOR UPDATE, so the function raises instead of writing.
CREATE OR REPLACE FUNCTION public.merge_user_preferences(
  p_user_id uuid,
  p_app text,
  p_category text,
  p_patch jsonb,
  p_theme_changed_at jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_row_id uuid;
  v_prefs jsonb;
  v_stored_times jsonb;
  v_patch jsonb;
  v_times jsonb;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'merge_user_preferences requires an authenticated user'
      USING ERRCODE = '42501';
  END IF;
  IF p_category NOT IN
     ('theme', 'competition', 'notifications', 'data', 'privacy', 'deviceOverrides') THEN
    RAISE EXCEPTION 'unknown preference category: %', p_category USING ERRCODE = '22023';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'p_patch must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF p_theme_changed_at IS NOT NULL AND jsonb_typeof(p_theme_changed_at) <> 'object' THEN
    RAISE EXCEPTION 'p_theme_changed_at must be a JSON object' USING ERRCODE = '22023';
  END IF;

  -- user_id is the caller's auth uid (the client passes useAuth().user.id, and
  -- every live row has user_id = auth_user_id). Refuse any other value, or a
  -- caller could pre-create a row for someone else's user_id and lock them out
  -- of their own preferences (the (user_id, app) key is unique).
  IF p_user_id IS DISTINCT FROM v_auth THEN
    RAISE EXCEPTION 'p_user_id must be the calling user' USING ERRCODE = '42501';
  END IF;

  -- Make sure the row exists. A row that already exists (even another user's)
  -- is left untouched here; RLS decides below whether this caller may lock it.
  INSERT INTO public.user_preferences (user_id, auth_user_id, app, preferences)
  VALUES (p_user_id, v_auth, p_app, '{}'::jsonb)
  ON CONFLICT (user_id, app) DO NOTHING;

  SELECT up.id, COALESCE(up.preferences, '{}'::jsonb)
    INTO v_row_id, v_prefs
    FROM public.user_preferences up
   WHERE up.user_id = p_user_id AND up.app = p_app
     FOR UPDATE;
  IF v_row_id IS NULL THEN
    RAISE EXCEPTION 'user_preferences row is not accessible to this user'
      USING ERRCODE = '42501';
  END IF;

  v_patch := p_patch;
  IF p_category = 'theme' AND p_theme_changed_at IS NOT NULL THEN
    v_stored_times := COALESCE(v_prefs -> 'themeChangedAt', '{}'::jsonb);
    -- Drop each incoming field whose stored change time is newer than the
    -- time the caller sent for it. Fields sent without a time always apply.
    SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
      INTO v_patch
      FROM jsonb_each(p_patch) AS e
     WHERE NOT (
       p_theme_changed_at ? e.key
       AND COALESCE((v_stored_times ->> e.key)::numeric, 0)
           > (p_theme_changed_at ->> e.key)::numeric
     );
    -- Stored times only ever move forward.
    SELECT COALESCE(jsonb_object_agg(k.key, k.t), v_stored_times)
      INTO v_times
      FROM (
        SELECT e.key,
               GREATEST(COALESCE((v_stored_times ->> e.key)::numeric, 0),
                        (e.value #>> '{}')::numeric) AS t
          FROM jsonb_each(p_theme_changed_at) AS e
      ) AS k;
    v_times := v_stored_times || v_times;
    v_prefs := jsonb_set(v_prefs, '{themeChangedAt}', v_times, true);
  END IF;

  v_prefs := jsonb_set(
    v_prefs,
    ARRAY[p_category],
    COALESCE(v_prefs -> p_category, '{}'::jsonb) || v_patch,
    true
  );

  UPDATE public.user_preferences
     SET preferences = v_prefs, updated_at = now()
   WHERE id = v_row_id;

  RETURN v_prefs;
END;
$function$;

REVOKE ALL ON FUNCTION public.merge_user_preferences(uuid, text, text, jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_user_preferences(uuid, text, text, jsonb, jsonb)
  TO authenticated;
