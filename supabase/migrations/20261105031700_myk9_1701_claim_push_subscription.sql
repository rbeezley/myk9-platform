-- MYK9-1701: on a shared device the second account could not turn push on.
-- push_subscriptions is keyed UNIQUE (endpoint) and its RLS only lets a user
-- touch their own rows, so account B's upsert onto an endpoint still owned by
-- account A was refused, and A's row kept sending pushes to the shared device.
--
-- claim_my_push_subscription reassigns the endpoint to the caller. The endpoint
-- is the capability: it is an unguessable URL that only the browser holding the
-- subscription can read, so a caller who presents it is that browser. The
-- caller can only ever claim for themselves (user_id = auth.uid()).

CREATE OR REPLACE FUNCTION public.claim_my_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL
     OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'Sign in to turn on push notifications'
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(btrim(p_endpoint), '') = ''
     OR coalesce(btrim(p_p256dh), '') = ''
     OR coalesce(btrim(p_auth), '') = '' THEN
    RAISE EXCEPTION 'endpoint, p256dh and auth are required'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth)
  VALUES (v_uid, p_endpoint, p_p256dh, p_auth)
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        license_key = NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_my_push_subscription(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_my_push_subscription(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_my_push_subscription(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.claim_my_push_subscription(text, text, text) IS
  'MYK9-1701: assigns the presented push endpoint to the caller, taking it from a previous account on a shared device. The endpoint is the capability: only the browser holding the subscription knows it. Caller-only (auth.uid()), non-anonymous.';
