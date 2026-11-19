-- MYK9-2201: shows.premium_content_draft keeps the secretary's premium edits, and
-- shows.premium_content_draft_at is stamped by the server (20261119235300).
--   1. Saving a draft stamps draft_at; the client cannot choose it.
--   2. Updating an unrelated column leaves the draft and its time alone.
--   3. Clearing the draft clears the time.
--   4. A draft is never a publication field: published_premium_at stays untouched.
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. Everything rolls back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000220101', 'Premium Draft Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES (
  '00000000-0000-0000-0000-000000220103',
  'Premium Draft Show',
  'AKC',
  current_date,
  current_date,
  '00000000-0000-0000-0000-000000220101',
  'draft'
);

DO $$
DECLARE
  v_at timestamptz;
  v_after timestamptz;
BEGIN
  IF (SELECT premium_content_draft_at FROM public.shows
       WHERE id = '00000000-0000-0000-0000-000000220103') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1 a new show must have no draft time';
  END IF;

  UPDATE public.shows
     SET premium_content_draft = '{"narratives":{"showHours":"7am"},"supplemental":{}}'::jsonb,
         premium_content_draft_at = '2001-01-01T00:00:00Z'
   WHERE id = '00000000-0000-0000-0000-000000220103';
  SELECT premium_content_draft_at INTO v_at FROM public.shows
   WHERE id = '00000000-0000-0000-0000-000000220103';
  IF v_at IS NULL OR v_at < now() - interval '1 minute' THEN
    RAISE EXCEPTION 'FAIL 1 draft_at must be the server time, got %', v_at;
  END IF;
  RAISE NOTICE 'PASS 1 draft save stamps the server time';

  UPDATE public.shows SET name = 'Renamed Draft Show'
   WHERE id = '00000000-0000-0000-0000-000000220103';
  SELECT premium_content_draft_at INTO v_after FROM public.shows
   WHERE id = '00000000-0000-0000-0000-000000220103';
  IF v_after IS DISTINCT FROM v_at THEN
    RAISE EXCEPTION 'FAIL 2 an unrelated update moved draft_at: % -> %', v_at, v_after;
  END IF;
  RAISE NOTICE 'PASS 2 unrelated update leaves the draft time alone';

  UPDATE public.shows SET premium_content_draft = NULL
   WHERE id = '00000000-0000-0000-0000-000000220103';
  IF (SELECT premium_content_draft_at FROM public.shows
       WHERE id = '00000000-0000-0000-0000-000000220103') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 3 clearing the draft must clear its time';
  END IF;
  RAISE NOTICE 'PASS 3 clearing the draft clears the time';

  IF (SELECT published_premium_at FROM public.shows
       WHERE id = '00000000-0000-0000-0000-000000220103') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 4 a draft must not publish anything';
  END IF;
  RAISE NOTICE 'PASS 4 draft never touches publication state';
END;
$$;

ROLLBACK;
