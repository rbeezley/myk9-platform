-- MYK9-2115: the secretary can read what a sent show email said.
-- email_log stores no body. email_log_contents keeps the subject and html of SHOW-SCOPED emails
-- only (the senders skip auth emails, club access requests and support). It is service-role
-- only: RLS on with no policies, no grants to anon or authenticated. The one read path is
-- get_show_email_content, which applies the same permission as get_show_email_delivery_history.
BEGIN;

CREATE TABLE public.email_log_contents (
  email_log_id uuid PRIMARY KEY REFERENCES public.email_log(id) ON DELETE CASCADE,
  subject text NOT NULL,
  html text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_log_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_log_contents FORCE ROW LEVEL SECURITY;

-- Default privileges grant anon full CRUD on every new public table: revoke explicitly.
REVOKE ALL ON public.email_log_contents FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.email_log_contents TO service_role;

-- Deny-all disposition: no API role reads or writes a stored copy directly. The senders write
-- through service_role (BYPASSRLS); readers go through get_show_email_content (SECURITY DEFINER).
CREATE POLICY email_log_contents_deny_all
  ON public.email_log_contents
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.get_show_email_content(p_email_log_id uuid)
RETURNS TABLE (subject text, html text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
  v_found boolean;
BEGIN
  IF p_email_log_id IS NULL THEN
    RAISE EXCEPTION 'email_log_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT log.show_id, true INTO v_show_id, v_found
  FROM public.email_log AS log
  WHERE log.id = p_email_log_id;

  -- No such email_log row (for example the id of a failed lifecycle attempt that never reached
  -- email_log): no row back, which the app reads as "a copy was not kept". Ids are random UUIDs
  -- and an empty answer says nothing about any show, so this is not a probe.
  IF NOT COALESCE(v_found, false) THEN
    RETURN;
  END IF;

  -- The row exists but is not this caller's (or has no show): not authorized.
  IF v_show_id IS NULL OR NOT public.can_manage_show_lifecycle_email(v_show_id) THEN
    RAISE EXCEPTION 'not authorized to read show email history' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT contents.subject, contents.html
  FROM public.email_log_contents AS contents
  WHERE contents.email_log_id = p_email_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_show_email_content(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_show_email_content(uuid) TO authenticated;

COMMIT;
