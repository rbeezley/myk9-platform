-- MYK9-2067: get_show_judges returns each judge's city and state (AKC Ch. 3 §15) and nothing
-- else about where they live.
--   1. the output columns include city and state, and no street, zip, email or phone
--   2. anon still has EXECUTE, and PUBLIC does not
--   3. anon reads a published show's judge with city and state; a judge with none reads NULLs
--   4. anon reads nothing for a draft show
-- All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000206701', 'Judge City Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES
  ('00000000-0000-0000-0000-000000206702', 'Judge City Published', 'Judge City Club',
   CURRENT_DATE + 30, CURRENT_DATE + 31, '00000000-0000-0000-0000-000000206701', 'published'),
  ('00000000-0000-0000-0000-000000206703', 'Judge City Draft', 'Judge City Club',
   CURRENT_DATE + 40, CURRENT_DATE + 41, '00000000-0000-0000-0000-000000206701', 'draft');

INSERT INTO public.people (id, first_name, last_name, email, city, state)
VALUES
  ('00000000-0000-0000-0000-000000206711', 'Jane', 'Smith', 'jane-2067@example.test',
   'Springfield', 'IL'),
  ('00000000-0000-0000-0000-000000206712', 'Nora', 'Nocity', 'nora-2067@example.test', NULL, NULL);

SET LOCAL ROLE service_role;
INSERT INTO public.judge_assignments (id, person_id, show_id, status)
VALUES
  ('00000000-0000-0000-0000-000000206721', '00000000-0000-0000-0000-000000206711',
   '00000000-0000-0000-0000-000000206702', 'confirmed'),
  ('00000000-0000-0000-0000-000000206722', '00000000-0000-0000-0000-000000206712',
   '00000000-0000-0000-0000-000000206702', 'confirmed'),
  ('00000000-0000-0000-0000-000000206723', '00000000-0000-0000-0000-000000206711',
   '00000000-0000-0000-0000-000000206703', 'confirmed');
RESET ROLE;

-- 1. The output columns.
DO $$
DECLARE
  cols text[];
BEGIN
  SELECT array_agg(arg.name ORDER BY arg.ord)
    INTO cols
  FROM pg_proc p
  CROSS JOIN LATERAL unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS arg(name, mode, ord)
  WHERE p.oid = 'public.get_show_judges(uuid)'::regprocedure
    AND arg.mode = 't';

  IF NOT (cols @> ARRAY['city', 'state']) THEN
    RAISE EXCEPTION 'FAIL get_show_judges does not return city and state (got %)', cols;
  END IF;
  IF cols && ARRAY['email', 'phone', 'street', 'address', 'address_line1', 'address_line2',
                   'zip', 'zip_code', 'postal_code'] THEN
    RAISE EXCEPTION 'FAIL get_show_judges returns an address, email or phone column (got %)', cols;
  END IF;
  IF cols <> ARRAY['assignment_id', 'person_id', 'first_name', 'last_name', 'trial_id',
                   'class_id', 'status', 'city', 'state'] THEN
    RAISE EXCEPTION 'FAIL get_show_judges output columns changed beyond city and state (got %)', cols;
  END IF;
  RAISE NOTICE 'PASS get_show_judges returns city and state and no address, email or phone';
END;
$$;

-- 2. Grants.
DO $$
BEGIN
  IF NOT has_function_privilege('anon', 'public.get_show_judges(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon lost EXECUTE on get_show_judges';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_show_judges(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_show_judges(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL authenticated or service_role lost EXECUTE on get_show_judges';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(p.proacl) AS acl
    WHERE p.oid = 'public.get_show_judges(uuid)'::regprocedure
      AND acl.grantee = 0
  ) THEN
    RAISE EXCEPTION 'FAIL PUBLIC still has EXECUTE on get_show_judges';
  END IF;
  RAISE NOTICE 'PASS grants are anon, authenticated and service_role only';
END;
$$;

-- 3 and 4. What anon reads.
SET LOCAL ROLE anon;
DO $$
DECLARE
  jane record;
  nora record;
  draft_rows integer;
BEGIN
  SELECT * INTO jane
  FROM public.get_show_judges('00000000-0000-0000-0000-000000206702')
  WHERE person_id = '00000000-0000-0000-0000-000000206711';
  IF jane.city IS DISTINCT FROM 'Springfield' OR jane.state IS DISTINCT FROM 'IL' THEN
    RAISE EXCEPTION 'FAIL anon did not read Jane''s city and state (got % / %)', jane.city, jane.state;
  END IF;

  SELECT * INTO nora
  FROM public.get_show_judges('00000000-0000-0000-0000-000000206702')
  WHERE person_id = '00000000-0000-0000-0000-000000206712';
  IF nora.assignment_id IS NULL OR nora.city IS NOT NULL OR nora.state IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL a judge with no city should read NULL city and state';
  END IF;

  SELECT count(*) INTO draft_rows
  FROM public.get_show_judges('00000000-0000-0000-0000-000000206703');
  IF draft_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL anon read % judge row(s) of a draft show', draft_rows;
  END IF;
  RAISE NOTICE 'PASS anon reads city and state for a published show only';
END;
$$;
RESET ROLE;

ROLLBACK;
