-- MYK9-1254: authenticated may no longer UPDATE every column of
-- public.show_lifecycle_email_jobs.
--
-- 20260708120000 gave authenticated a table-level UPDATE and 20260805090000 revoked
-- only INSERT and DELETE. The RLS update policy admits any caller passing
-- can_manage_show_lifecycle_email(show_id) (secretaries, club managers), so such a
-- caller could PATCH server-owned columns through PostgREST: a far-future
-- claimed_until makes a job look in flight forever (a stuck email), and the
-- attempt_id / idempotency_key / rendered_* / email_log_id columns are the send
-- handler's own bookkeeping.
--
-- A column GRANT cannot narrow a table-level one, so revoke the table-level UPDATE
-- first, then grant UPDATE on exactly the columns the browser writes:
--   subject, body, secretary_note  (editLifecycleEmailJob, api.ts)
--   status, skipped_at             (skipLifecycleEmailJobs, api.ts)
-- Every other column (attempt_id, claimed_until, idempotency_key, rendered_*, ...)
-- is writable by service_role alone. Naming only the allowed columns means this
-- migration never references attempt_id, so it is independent of the migration
-- that adds that column. Table-level SELECT is untouched.

REVOKE UPDATE ON TABLE public.show_lifecycle_email_jobs FROM authenticated;
REVOKE UPDATE ON TABLE public.show_lifecycle_email_jobs FROM anon;

GRANT UPDATE (subject, body, secretary_note, status, skipped_at)
  ON public.show_lifecycle_email_jobs TO authenticated;
