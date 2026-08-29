-- F30 behavioral contract: a club with shows cannot be deleted, while an empty
-- club can still be deleted. All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000f30001', 'F30 Club With Show'),
  ('00000000-0000-0000-0000-000000f30002', 'F30 Empty Club');

INSERT INTO public.shows (
  id, name, organization, start_date, end_date, club_id, status
)
VALUES (
  '00000000-0000-0000-0000-000000f30003',
  'F30 Protected Show',
  'AKC',
  DATE '2026-09-01',
  DATE '2026-09-02',
  '00000000-0000-0000-0000-000000f30001',
  'draft'
);

DO $$
BEGIN
  BEGIN
    DELETE FROM public.clubs
    WHERE id = '00000000-0000-0000-0000-000000f30001';
    RAISE EXCEPTION 'FAIL F30.1 deleting a club with a show succeeded';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'PASS F30.1 deleting a club with a show is refused';
  END;
END;
$$;

DELETE FROM public.clubs
WHERE id = '00000000-0000-0000-0000-000000f30002';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.clubs
    WHERE id = '00000000-0000-0000-0000-000000f30002'
  ) THEN
    RAISE EXCEPTION 'FAIL F30.2 deleting an empty club was refused';
  END IF;
  RAISE NOTICE 'PASS F30.2 deleting an empty club still works';
END;
$$;

ROLLBACK;
