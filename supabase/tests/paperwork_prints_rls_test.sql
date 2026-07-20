-- Behavioral RLS and immutability test for paperwork_prints.
-- Run after 20260720100000_create_paperwork_prints.sql; all fixtures roll back.

BEGIN;

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000000711', 'First', 'Secretary', '00000000-0000-0000-0000-000000000701'),
  ('00000000-0000-0000-0000-000000000712', 'Second', 'Secretary', '00000000-0000-0000-0000-000000000702'),
  ('00000000-0000-0000-0000-000000000713', 'Other', 'User', '00000000-0000-0000-0000-000000000703');

INSERT INTO public.shows (id, name, organization, start_date, end_date, is_nationals)
VALUES
  ('00000000-0000-0000-0000-000000000721', 'Paperwork Show', 'AKC', CURRENT_DATE, CURRENT_DATE, false),
  ('00000000-0000-0000-0000-000000000722', 'Other Show', 'AKC', CURRENT_DATE, CURRENT_DATE, false);

INSERT INTO public.trials (id, show_id, name, date)
VALUES ('00000000-0000-0000-0000-000000000731', '00000000-0000-0000-0000-000000000721', 'Trial 1', CURRENT_DATE);

INSERT INTO public.classes (id, trial_id, name, status)
VALUES ('00000000-0000-0000-0000-000000000741', '00000000-0000-0000-0000-000000000731', 'Container Novice', 'upcoming');

INSERT INTO public.user_roles (user_id, role_id, show_id, is_active, auth_user_id)
SELECT person_id, role_id, '00000000-0000-0000-0000-000000000721', true, auth_id
FROM (
  VALUES
    ('00000000-0000-0000-0000-000000000711'::uuid, '00000000-0000-0000-0000-000000000701'::uuid),
    ('00000000-0000-0000-0000-000000000712'::uuid, '00000000-0000-0000-0000-000000000702'::uuid)
) AS staff(person_id, auth_id)
CROSS JOIN LATERAL (SELECT id AS role_id FROM public.roles WHERE name = 'secretary' LIMIT 1) role_row;

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
INSERT INTO public.paperwork_prints (
  id, show_id, trial_id, class_id, scope_kind, report_id, coverage, fingerprint,
  printed_by, printed_by_name, printed_at
) VALUES (
  '00000000-0000-0000-0000-000000000751',
  '00000000-0000-0000-0000-000000000721',
  '00000000-0000-0000-0000-000000000731',
  '00000000-0000-0000-0000-000000000741',
  'class', 'check-in-sheet', '{"classIds":["00000000-0000-0000-0000-000000000741"]}',
  'sha256:first', '00000000-0000-0000-0000-000000000701', 'First Secretary', now()
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000702', true);
DO $$
DECLARE visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM public.paperwork_prints;
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'FAIL co-secretary saw % print rows; expected 1', visible_count;
  END IF;
  RAISE NOTICE 'PASS co-secretary reads shared Show print history';
END;
$$;

INSERT INTO public.paperwork_prints (
  id, show_id, scope_kind, report_id, coverage, fingerprint,
  printed_by, printed_by_name, printed_at
) VALUES (
  '00000000-0000-0000-0000-000000000752',
  '00000000-0000-0000-0000-000000000721',
  'show', 'armband-labels', '{"calendarDays":["2026-07-20"]}',
  'sha256:second', '00000000-0000-0000-0000-000000000702', 'Second Secretary', now()
);

UPDATE public.paperwork_prints
SET voided_at = now(), voided_by = '00000000-0000-0000-0000-000000000702', void_reason = 'Wrong label stock'
WHERE id = '00000000-0000-0000-0000-000000000751';

DO $$
BEGIN
  BEGIN
    UPDATE public.paperwork_prints
    SET report_id = 'scoresheet'
    WHERE id = '00000000-0000-0000-0000-000000000752';
    RAISE EXCEPTION 'FAIL append-only facts were editable';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM = 'FAIL append-only facts were editable' THEN RAISE; END IF;
    RAISE NOTICE 'PASS append-only fact update rejected';
  END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000703', true);
DO $$
DECLARE visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM public.paperwork_prints;
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'FAIL unrelated user saw % print rows; expected 0', visible_count;
  END IF;
  RAISE NOTICE 'PASS unrelated authenticated user sees no print history';
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.paperwork_prints (
      id, show_id, scope_kind, report_id, coverage, fingerprint,
      printed_by, printed_by_name, printed_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000753',
      '00000000-0000-0000-0000-000000000722',
      'show', 'armband-labels', '{}', 'sha256:denied',
      '00000000-0000-0000-0000-000000000703', 'Other User', now()
    );
    RAISE EXCEPTION 'FAIL cross-Show insert succeeded';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE 'PASS cross-Show insert rejected';
  END;
END;
$$;

ROLLBACK;
