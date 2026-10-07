-- MYK9-1020: the summary view must count an in-ring entry as judge-day
-- capacity. All fixture rows roll back.
BEGIN;

DO $$
DECLARE
  v_definition text := pg_get_viewdef('public.judge_day_summary'::regclass, true);
  v_status text;
BEGIN
  FOREACH v_status IN ARRAY ARRAY[
    'submitted', 'paid', 'confirmed', 'checked-in', 'competing',
    'in-ring', 'pending-payment'
  ] LOOP
    IF position(quote_literal(v_status) IN v_definition) = 0 THEN
      RAISE EXCEPTION 'judge_day_summary misses capacity status %', v_status;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.judge_day_summary'::regclass
      AND 'security_invoker=true' = ANY (reloptions)
  ) THEN
    RAISE EXCEPTION 'judge_day_summary lost security_invoker';
  END IF;
END;
$$;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000001020010', 'MYK9-1020 Test Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date, pre_entry_fee,
                          default_judge_day_capacity)
VALUES ('00000000-0000-0000-0000-000001020100', 'MYK9-1020 Judge Day', 'AKC',
        current_date + 5, current_date + 5, '00000000-0000-0000-0000-000001020010',
        'published', (current_date - 10)::timestamptz,
        (current_date + 4)::timestamptz, 30, 125);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES ('00000000-0000-0000-0000-000001020200',
        '00000000-0000-0000-0000-000001020100', 'MYK9-1020 Trial',
        current_date + 5, 'AKC', 'Scent Work');

INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source,
                            entry_fee, max_entries, allow_waitlist)
VALUES ('00000000-0000-0000-0000-000001020300',
        '00000000-0000-0000-0000-000001020200', 'Interior Novice A',
        'Interior', 'Novice', 'upcoming', 'manual', 30, NULL, false);

INSERT INTO public.people (id, first_name, last_name, email)
VALUES ('00000000-0000-0000-0000-000001020001', 'Jamie', 'Judge',
        'myk9-1020-judge@example.test'),
       ('00000000-0000-0000-0000-000001020002', 'Alex', 'Exhibitor',
        'myk9-1020-exhibitor@example.test');

INSERT INTO public.judge_assignments (person_id, show_id, trial_id, class_id, status)
VALUES ('00000000-0000-0000-0000-000001020001',
        '00000000-0000-0000-0000-000001020100',
        '00000000-0000-0000-0000-000001020200',
        '00000000-0000-0000-0000-000001020300', 'confirmed');

INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
VALUES ('00000000-0000-0000-0000-000001020400', 'MYK9-1020 Dog', 'Scout',
        'Beagle', 'active', '00000000-0000-0000-0000-000001020002');

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES ('00000000-0000-0000-0000-000001020400', 'AKC', 'SR10200001', true);

INSERT INTO public.entries (id, show_id, trial_id, class_id, dog_id, entry_status)
VALUES ('00000000-0000-0000-0000-000001020500',
        '00000000-0000-0000-0000-000001020100',
        '00000000-0000-0000-0000-000001020200',
        '00000000-0000-0000-0000-000001020300',
        '00000000-0000-0000-0000-000001020400', 'in-ring');

DO $$
DECLARE
  v_summary_count integer;
  v_live_count integer;
BEGIN
  SELECT confirmed_count INTO STRICT v_summary_count
  FROM public.judge_day_summary
  WHERE show_id = '00000000-0000-0000-0000-000001020100'
    AND judge_id = '00000000-0000-0000-0000-000001020001';

  SELECT confirmed_count INTO STRICT v_live_count
  FROM public.get_judge_day_capacity_live(
    '00000000-0000-0000-0000-000001020001',
    '00000000-0000-0000-0000-000001020100', current_date + 5
  );

  IF v_summary_count <> 1 OR v_live_count <> 1 THEN
    RAISE EXCEPTION 'in-ring entry must occupy one judge-day spot: summary %, live %',
      v_summary_count, v_live_count;
  END IF;
END;
$$;

ROLLBACK;
