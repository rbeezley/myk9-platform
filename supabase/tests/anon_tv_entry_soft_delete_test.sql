-- MYK9-149 / SA-2026-07-29-08 behavioral contract.
-- A soft-deleted entry in an otherwise public show must be absent to anon,
-- while a live entry in that same show remains visible to the TV board.
-- All fixtures roll back.

BEGIN;

SET LOCAL ROLE service_role;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000149001', 'MYK9-149 TV Club');

INSERT INTO public.shows (
  id, name, organization, start_date, end_date, club_id, status
)
VALUES (
  '00000000-0000-0000-0000-000000149002',
  'MYK9-149 TV Show',
  'AKC',
  current_date,
  current_date + 1,
  '00000000-0000-0000-0000-000000149001',
  'published'
);

INSERT INTO public.trials (id, show_id, name, date)
VALUES (
  '00000000-0000-0000-0000-000000149003',
  '00000000-0000-0000-0000-000000149002',
  'MYK9-149 Trial',
  current_date
);

INSERT INTO public.classes (id, trial_id, name, status)
VALUES (
  '00000000-0000-0000-0000-000000149004',
  '00000000-0000-0000-0000-000000149003',
  'Container Novice',
  'in_progress'
);

INSERT INTO public.people (id, first_name, last_name)
VALUES ('00000000-0000-0000-0000-000000149005', 'TV', 'Handler');

-- Two dogs, because entries_dog_class_unique_idx is
-- UNIQUE (dog_id, class_id) WHERE entry_status NOT IN ('withdrawn','scratched').
-- It does NOT exclude soft-deleted rows, so two 'confirmed' entries for one dog
-- in one class collide on INSERT, before the soft-delete below ever runs.
INSERT INTO public.dogs (id, name, call_name, breed, owner_id)
VALUES
  (
    '00000000-0000-0000-0000-000000149006',
    'TV Dog',
    'TV',
    'Beagle',
    '00000000-0000-0000-0000-000000149005'
  ),
  (
    '00000000-0000-0000-0000-000000149009',
    'TV Dog Two',
    'TV2',
    'Beagle',
    '00000000-0000-0000-0000-000000149005'
  );

INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, armband,
  is_in_ring, is_scored
)
VALUES
  (
    '00000000-0000-0000-0000-000000149007',
    '00000000-0000-0000-0000-000000149006',
    '00000000-0000-0000-0000-000000149004',
    '00000000-0000-0000-0000-000000149002',
    '00000000-0000-0000-0000-000000149003',
    '00000000-0000-0000-0000-000000149005',
    'confirmed',
    '149-live',
    false,
    false
  ),
  (
    '00000000-0000-0000-0000-000000149008',
    '00000000-0000-0000-0000-000000149009',
    '00000000-0000-0000-0000-000000149004',
    '00000000-0000-0000-0000-000000149002',
    '00000000-0000-0000-0000-000000149003',
    '00000000-0000-0000-0000-000000149005',
    'confirmed',
    '149-deleted',
    false,
    false
  );

UPDATE public.entries
SET deleted_at = now()
WHERE id = '00000000-0000-0000-0000-000000149008';

SET LOCAL ROLE anon;

DO $$
DECLARE
  visible_ids uuid[];
BEGIN
  SELECT array_agg(e.id ORDER BY e.id)
  INTO visible_ids
  FROM public.entries AS e
  WHERE e.show_id = '00000000-0000-0000-0000-000000149002';

  IF visible_ids IS DISTINCT FROM ARRAY['00000000-0000-0000-0000-000000149007'::uuid] THEN
    RAISE EXCEPTION
      'FAIL anon TV read returned %, expected only the live entry', visible_ids;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.entries AS e
    WHERE e.id = '00000000-0000-0000-0000-000000149008'
  ) THEN
    RAISE EXCEPTION 'FAIL anon TV read returned a soft-deleted entry';
  END IF;

  RAISE NOTICE 'PASS anon TV entry reads exclude soft-deleted rows and retain live rows';
END;
$$;

ROLLBACK;
