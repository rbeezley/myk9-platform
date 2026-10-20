-- MYK9-1265: isolated, rollback-only proof for cross-trial check-in and closed targets.
BEGIN;
INSERT INTO public.clubs (id, name) VALUES ('12650000-0000-0000-0000-000000000001', '1265 fixture');
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('12650000-0000-0000-0000-000000000003', '1265 fixture', 'AKC', current_date+10, current_date+11,
        '12650000-0000-0000-0000-000000000001', 'published');
INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES ('12650000-0000-0000-0000-000000000011', '12650000-0000-0000-0000-000000000003', 'Trial 1', current_date+10, 'AKC', 'Scent Work'),
       ('12650000-0000-0000-0000-000000000012', '12650000-0000-0000-0000-000000000003', 'Trial 2', current_date+11, 'AKC', 'Scent Work');
INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source)
VALUES ('12650000-0000-0000-0000-000000000021', '12650000-0000-0000-0000-000000000011', 'Source', 'Container', 'Novice', 'upcoming', 'manual'),
       ('12650000-0000-0000-0000-000000000022', '12650000-0000-0000-0000-000000000011', 'Same trial', 'Container', 'Advanced', 'upcoming', 'manual'),
       ('12650000-0000-0000-0000-000000000023', '12650000-0000-0000-0000-000000000012', 'Other trial', 'Interior', 'Novice', 'upcoming', 'manual'),
       ('12650000-0000-0000-0000-000000000024', '12650000-0000-0000-0000-000000000012', 'Complete', 'Interior', 'Advanced', 'completed', 'manual'),
       ('12650000-0000-0000-0000-000000000025', '12650000-0000-0000-0000-000000000012', 'Cancelled', 'Interior', 'Excellent', 'cancelled', 'manual');
INSERT INTO public.dogs (id, name, call_name, breed, status)
VALUES ('12650000-0000-0000-0000-000000000041', '1265 Dog', 'Fixture', 'Beagle', 'active');
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES ('12650000-0000-0000-0000-000000000041', 'AKC', 'SR12650001', true);
INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES ('12650000-0000-0000-0000-000000000002', '1265', 'Secretary', '12650000-0000-0000-0000-000000000102');
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '12650000-0000-0000-0000-000000000002', id, '12650000-0000-0000-0000-000000000001', true,
       '12650000-0000-0000-0000-000000000102' FROM public.roles WHERE name='secretary';
SET LOCAL ROLE service_role;
INSERT INTO public.entries (id, dog_id, show_id, class_id, trial_id, entry_status, check_in_status, payment_status, entry_fee, armband)
VALUES ('12650000-0000-0000-0000-000000000051', '12650000-0000-0000-0000-000000000041', '12650000-0000-0000-0000-000000000003',
        '12650000-0000-0000-0000-000000000021', '12650000-0000-0000-0000-000000000011', 'confirmed', 'checked-in', 'paid', 35, '1265');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '12650000-0000-0000-0000-000000000102', true);
SELECT set_config('request.jwt.claims', '{"sub":"12650000-0000-0000-0000-000000000102","role":"authenticated","app_metadata":{}}', true);
DO $$
DECLARE target uuid; state text;
BEGIN
  PERFORM public.move_up_entry('12650000-0000-0000-0000-000000000051', '12650000-0000-0000-0000-000000000023', '12650000-0000-0000-0000-000000000052');
  SELECT check_in_status INTO state FROM public.entries WHERE id='12650000-0000-0000-0000-000000000052';
  IF state IS DISTINCT FROM 'no-status' THEN RAISE EXCEPTION 'FAIL cross-trial check-in reset: %', state; END IF;
  PERFORM public.reverse_move_up_entry('12650000-0000-0000-0000-000000000052');
  SELECT check_in_status INTO state FROM public.entries WHERE id='12650000-0000-0000-0000-000000000051';
  IF state IS DISTINCT FROM 'checked-in' THEN RAISE EXCEPTION 'FAIL undo restores original check-in: %', state; END IF;

  UPDATE public.entries SET check_in_status='no-status' WHERE id='12650000-0000-0000-0000-000000000051';
  PERFORM public.move_up_entry('12650000-0000-0000-0000-000000000051', '12650000-0000-0000-0000-000000000023', '12650000-0000-0000-0000-000000000053');
  UPDATE public.entries SET check_in_status='checked-in' WHERE id='12650000-0000-0000-0000-000000000053';
  PERFORM public.reverse_move_up_entry('12650000-0000-0000-0000-000000000053');
  SELECT check_in_status INTO state FROM public.entries WHERE id='12650000-0000-0000-0000-000000000051';
  IF state IS DISTINCT FROM 'no-status' THEN RAISE EXCEPTION 'FAIL undo copied another trial check-in: %', state; END IF;

  UPDATE public.entries SET check_in_status='checked-in' WHERE id='12650000-0000-0000-0000-000000000051';
  PERFORM public.move_up_entry('12650000-0000-0000-0000-000000000051', '12650000-0000-0000-0000-000000000022', '12650000-0000-0000-0000-000000000054');
  SELECT check_in_status INTO state FROM public.entries WHERE id='12650000-0000-0000-0000-000000000054';
  IF state IS DISTINCT FROM 'checked-in' THEN RAISE EXCEPTION 'FAIL same-trial check-in: %', state; END IF;
  PERFORM public.reverse_move_up_entry('12650000-0000-0000-0000-000000000054');

  FOREACH target IN ARRAY ARRAY['12650000-0000-0000-0000-000000000024'::uuid, '12650000-0000-0000-0000-000000000025'::uuid] LOOP
    BEGIN
      PERFORM public.move_up_entry('12650000-0000-0000-0000-000000000051', target, gen_random_uuid());
      RAISE EXCEPTION 'FAIL closed target accepted: %', target;
    EXCEPTION WHEN SQLSTATE '22023' THEN
      IF SQLERRM <> 'This class is complete or cancelled and cannot accept a changed entry.' THEN RAISE; END IF;
    END;
  END LOOP;
  RAISE NOTICE 'PASS cross-trial reset, undo isolation, same-trial carry, complete/cancelled refusal';
END;
$$;
RESET ROLE;
ROLLBACK;
