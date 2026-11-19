-- MYK9-2065: the mailing address the premium prints for the show's Secretary and Chair.
--
-- Asserted: the setter is refused to anon by the grant and to a non-manager with 42501; a club
-- secretary can set and clear it (empty becomes NULL); a role nobody holds raises P0002 and a
-- steward role is refused; the 500-character limit holds; and get_show_officials returns the
-- address for secretary and chairman to anon and authenticated callers, and never for a steward.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000206501', 'Mailing Address Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES (
  '00000000-0000-0000-0000-000000206503',
  'Mailing Address Show',
  'AKC',
  current_date,
  current_date,
  '00000000-0000-0000-0000-000000206501',
  'published'
);

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000206511', 'Mail', 'Secretary', '00000000-0000-0000-0000-000000206101'),
  ('00000000-0000-0000-0000-000000206512', 'Mail', 'Chair', '00000000-0000-0000-0000-000000206102'),
  ('00000000-0000-0000-0000-000000206513', 'Mail', 'Steward', '00000000-0000-0000-0000-000000206103'),
  ('00000000-0000-0000-0000-000000206514', 'Mail', 'Bystander', '00000000-0000-0000-0000-000000206104');

-- The Secretary manages the show through a club appointment; naming alone grants nothing.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000206511', r.id,
       '00000000-0000-0000-0000-000000206501', true,
       '00000000-0000-0000-0000-000000206101'
FROM public.roles r WHERE r.name = 'secretary';

INSERT INTO public.show_officials (show_id, person_id, role)
VALUES
  ('00000000-0000-0000-0000-000000206503', '00000000-0000-0000-0000-000000206511', 'secretary'),
  ('00000000-0000-0000-0000-000000206503', '00000000-0000-0000-0000-000000206512', 'chairman'),
  ('00000000-0000-0000-0000-000000206503', '00000000-0000-0000-0000-000000206513', 'steward');

-- 1. anon is refused by the grant.
SET LOCAL ROLE anon;

DO $$
BEGIN
  BEGIN
    PERFORM public.set_show_official_mailing_address(
      '00000000-0000-0000-0000-000000206503', 'secretary', '00000000-0000-0000-0000-000000206511', 'PO Box 1');
    RAISE EXCEPTION 'FAIL anon executed set_show_official_mailing_address';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  RAISE NOTICE 'PASS anon cannot execute set_show_official_mailing_address';
END;
$$;

RESET ROLE;

-- 2. A signed-in user who does not manage the show gets 42501.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000206104', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000206104', 'role', 'authenticated')::text,
  true
);

DO $$
BEGIN
  BEGIN
    PERFORM public.set_show_official_mailing_address(
      '00000000-0000-0000-0000-000000206503', 'secretary', '00000000-0000-0000-0000-000000206511', 'PO Box 1');
    RAISE EXCEPTION 'FAIL a non-manager set an official mailing address';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  RAISE NOTICE 'PASS a non-manager is refused (42501)';
END;
$$;

-- 3. The club secretary sets and clears it, and the rules around the role.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000206101', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000206101', 'role', 'authenticated')::text,
  true
);

DO $$
DECLARE
  show constant uuid := '00000000-0000-0000-0000-000000206503';
  stored text;
BEGIN
  PERFORM public.set_show_official_mailing_address(show, 'secretary', '00000000-0000-0000-0000-000000206511', '  PO Box 9' || E'\n' || 'Tulsa, OK  ');
  PERFORM public.set_show_official_mailing_address(show, 'chairman', '00000000-0000-0000-0000-000000206512', 'PO Box 77');

  SELECT o.premium_mailing_address INTO stored
  FROM public.get_show_officials(show) o WHERE o.role = 'secretary';
  IF stored IS DISTINCT FROM 'PO Box 9' || E'\n' || 'Tulsa, OK' THEN
    RAISE EXCEPTION 'FAIL the secretary address was not stored trimmed: %', coalesce(stored, '<null>');
  END IF;

  PERFORM public.set_show_official_mailing_address(show, 'chairman', '00000000-0000-0000-0000-000000206512', '   ');
  SELECT o.premium_mailing_address INTO stored
  FROM public.get_show_officials(show) o WHERE o.role = 'chairman';
  IF stored IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL an empty address did not clear to NULL: %', stored;
  END IF;
  PERFORM public.set_show_official_mailing_address(show, 'chairman', '00000000-0000-0000-0000-000000206512', 'PO Box 77');

  -- A steward never carries a premium address.
  BEGIN
    PERFORM public.set_show_official_mailing_address(show, 'steward', '00000000-0000-0000-0000-000000206513', 'PO Box 5');
    RAISE EXCEPTION 'FAIL the steward role accepted a premium mailing address';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  -- The 500-character limit.
  BEGIN
    PERFORM public.set_show_official_mailing_address(show, 'secretary', '00000000-0000-0000-0000-000000206511', repeat('x', 501));
    RAISE EXCEPTION 'FAIL a 501-character address was accepted';
  EXCEPTION WHEN string_data_right_truncation THEN
    NULL;
  END;
  PERFORM public.set_show_official_mailing_address(show, 'secretary', '00000000-0000-0000-0000-000000206511', repeat('x', 500));

  RAISE NOTICE 'PASS the secretary can set and clear; steward and length are refused';
END;
$$;

RESET ROLE;

-- 4. get_show_officials carries the address for secretary and chairman only, to anon too.
RESET ROLE;
UPDATE public.show_officials
SET premium_mailing_address = CASE role WHEN 'chairman' THEN 'PO Box 88' ELSE 'PO Box 77' END
WHERE show_id = '00000000-0000-0000-0000-000000206503'
  AND role IN ('secretary', 'chairman', 'steward');

SET LOCAL ROLE anon;

DO $$
DECLARE
  show constant uuid := '00000000-0000-0000-0000-000000206503';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.get_show_officials(show) o
    WHERE o.role = 'secretary' AND o.premium_mailing_address = 'PO Box 77'
  ) THEN
    RAISE EXCEPTION 'FAIL anon cannot read the secretary premium address';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.get_show_officials(show) o
    WHERE o.role = 'chairman' AND o.premium_mailing_address = 'PO Box 88'
  ) THEN
    RAISE EXCEPTION 'FAIL anon cannot read the chairman premium address';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.get_show_officials(show) o
    WHERE o.role = 'steward' AND o.premium_mailing_address IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL a steward premium address leaked through get_show_officials';
  END IF;

  RAISE NOTICE 'PASS anon reads the secretary and chairman address, never a steward''s';
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000206104', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000206104', 'role', 'authenticated')::text,
  true
);

DO $$
DECLARE
  show constant uuid := '00000000-0000-0000-0000-000000206503';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.get_show_officials(show) o
    WHERE o.role = 'secretary' AND o.premium_mailing_address = 'PO Box 77'
  ) THEN
    RAISE EXCEPTION 'FAIL an unrelated signed-in user cannot read the secretary premium address';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.get_show_officials(show) o
    WHERE o.role = 'steward' AND o.premium_mailing_address IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL a steward premium address reached a signed-in caller';
  END IF;

  RAISE NOTICE 'PASS a signed-in caller reads the secretary address, never a steward''s';
END;
$$;

RESET ROLE;

-- 5. A person who no longer holds the role raises P0002 (the chairman is un-named by the owner role, as the table
--    allows no direct write to anyone else).
DELETE FROM public.show_officials
WHERE show_id = '00000000-0000-0000-0000-000000206503' AND role = 'chairman';
-- Another manager replaced the chairman while this tab still showed the old one.
INSERT INTO public.show_officials (show_id, person_id, role)
VALUES ('00000000-0000-0000-0000-000000206503', '00000000-0000-0000-0000-000000206514', 'chairman');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000206101', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000206101', 'role', 'authenticated')::text,
  true
);

DO $$
BEGIN
  BEGIN
    PERFORM public.set_show_official_mailing_address(
      '00000000-0000-0000-0000-000000206503', 'chairman', '00000000-0000-0000-0000-000000206512', 'PO Box 77');
    RAISE EXCEPTION 'FAIL an address for a replaced chairman did not raise';
  EXCEPTION WHEN no_data_found THEN
    NULL;
  END;

  IF EXISTS (
    SELECT 1 FROM public.get_show_officials('00000000-0000-0000-0000-000000206503') o
    WHERE o.role = 'chairman' AND o.premium_mailing_address IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL the old chairman address was written onto the replacement';
  END IF;

  RAISE NOTICE 'PASS a stale official raises P0002 and writes nothing onto the replacement';
END;
$$;

RESET ROLE;
ROLLBACK;
