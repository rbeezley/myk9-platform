-- MYK9-2286: an ASCA premium download is logged; an unknown org is still refused.
-- All fixtures roll back.
BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000228601', 'MYK9-2286 Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES (
  '00000000-0000-0000-0000-000000228602',
  'MYK9-2286 Show',
  'ASCA',
  current_date,
  current_date + 1,
  '00000000-0000-0000-0000-000000228601',
  'published'
);

DO $$
DECLARE
  org_value text;
BEGIN
  FOREACH org_value IN ARRAY ARRAY['AKC', 'UKC', 'ASCA'] LOOP
    INSERT INTO public.premium_generations (show_id, club_id, org)
    VALUES (
      '00000000-0000-0000-0000-000000228602',
      '00000000-0000-0000-0000-000000228601',
      org_value
    );
    RAISE NOTICE 'PASS % premium generation inserts', org_value;
  END LOOP;

  BEGIN
    INSERT INTO public.premium_generations (show_id, club_id, org)
    VALUES (
      '00000000-0000-0000-0000-000000228602',
      '00000000-0000-0000-0000-000000228601',
      'XYZ'
    );
    RAISE EXCEPTION 'FAIL unknown org was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS unknown org is refused';
  END;
END;
$$;

ROLLBACK;
