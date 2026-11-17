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

-- Default privileges grant anon full CRUD on every new public table: revoke explicitly.
REVOKE ALL ON public.email_log_contents FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.email_log_contents TO service_role;

CREATE OR REPLACE FUNCTION public.get_show_email_content(p_email_log_id uuid)
RETURNS TABLE (subject text, html text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
BEGIN
  IF p_email_log_id IS NULL THEN
    RAISE EXCEPTION 'email_log_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT log.show_id INTO v_show_id
  FROM public.email_log AS log
  WHERE log.id = p_email_log_id;

  -- Same answer for "no such email" and "not yours": no probing for ids.
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
