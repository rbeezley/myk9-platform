-- MYK9-2040: an entry re-accepted from a back-to-review status is a new
-- confirmation (its confirmation mark is cleared); day-of moves and a decline
-- keep the mark.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000002040001', 'MYK9-2040 Club');
INSERT INTO public.people (id, first_name, last_name)
VALUES ('00000000-0000-0000-0000-000002040002', 'Armband', 'Owner');
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          starting_armband_number)
VALUES ('00000000-0000-0000-0000-000002040003', 'MYK9-2040 show', 'AKC',
        current_date, current_date, '00000000-0000-0000-0000-000002040001',
        'published', 200);
INSERT INTO public.trials (id, show_id, name, date, registry_id)
VALUES ('00000000-0000-0000-0000-000002040004',
        '00000000-0000-0000-0000-000002040003', 'Trial', current_date, 'AKC');
INSERT INTO public.classes (id, trial_id, name, status)
VALUES ('00000000-0000-0000-0000-000002040005',
        '00000000-0000-0000-0000-000002040004', 'Container Novice', 'upcoming');
INSERT INTO public.dogs (id, name, call_name, breed, owner_id)
VALUES ('00000000-0000-0000-0000-000002040006', 'Accepted Dog', 'Acc', '',
        '00000000-0000-0000-0000-000002040002');
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES ('00000000-0000-0000-0000-000002040006', 'AKC', 'SR20400001', true);

INSERT INTO public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
                            entry_status, payment_status, entry_fee)
VALUES ('00000000-0000-0000-0000-000002040008',
        '00000000-0000-0000-0000-000002040006', '00000000-0000-0000-0000-000002040005',
        '00000000-0000-0000-0000-000002040003', '00000000-0000-0000-0000-000002040004',
        '00000000-0000-0000-0000-000002040002', 'submitted', 'pending', 25);

-- Sanity: acceptance still assigns the armband by the existing rule.
UPDATE public.entries SET entry_status = 'confirmed'
WHERE id = '00000000-0000-0000-0000-000002040008';

DO $$
DECLARE
  v_armband text;
BEGIN
  SELECT armband INTO v_armband FROM public.entries
  WHERE id = '00000000-0000-0000-0000-000002040008';
  IF v_armband IS DISTINCT FROM '200' THEN
    RAISE EXCEPTION 'FAIL accept: expected armband 200 (show start), found %', v_armband;
  END IF;
  RAISE NOTICE 'PASS accept: acceptance assigns the armband';
END;
$$;

-- The confirmation went out, then the entry was scratched (a day-of move).
UPDATE public.entries
SET confirmation_email_sent_at = now(), confirmation_email_status = 'sent'
WHERE id = '00000000-0000-0000-0000-000002040008';

UPDATE public.entries SET entry_status = 'scratched'
WHERE id = '00000000-0000-0000-0000-000002040008';

-- scratched is not back-to-review, so scratched -> confirmed keeps the mark.
UPDATE public.entries SET entry_status = 'confirmed'
WHERE id = '00000000-0000-0000-0000-000002040008';

DO $$
DECLARE
  v_sent timestamptz;
BEGIN
  SELECT confirmation_email_sent_at INTO v_sent
  FROM public.entries WHERE id = '00000000-0000-0000-0000-000002040008';
  IF v_sent IS NULL THEN
    RAISE EXCEPTION 'FAIL scratched -> confirmed: the mark must be kept';
  END IF;
  RAISE NOTICE 'PASS scratched -> confirmed: the mark is kept';
END;
$$;

-- A declined entry keeps its mark, so the date-based sender cannot email it.
UPDATE public.entries SET entry_status = 'not_accepted'
WHERE id = '00000000-0000-0000-0000-000002040008';

DO $$
DECLARE
  v_sent timestamptz;
  v_status text;
BEGIN
  SELECT confirmation_email_sent_at, confirmation_email_status INTO v_sent, v_status
  FROM public.entries WHERE id = '00000000-0000-0000-0000-000002040008';
  IF v_sent IS NULL OR v_status IS DISTINCT FROM 'sent' THEN
    RAISE EXCEPTION 'FAIL confirmed -> not_accepted: expected the mark kept, found % / %',
      v_sent, v_status;
  END IF;
  RAISE NOTICE 'PASS confirmed -> not_accepted: the mark is kept';
END;
$$;

-- Re-acceptance from a back-to-review status clears it: eligible, same armband.
UPDATE public.entries SET entry_status = 'confirmed'
WHERE id = '00000000-0000-0000-0000-000002040008';

DO $$
DECLARE
  v_sent timestamptz;
  v_status text;
  v_armband text;
BEGIN
  SELECT confirmation_email_sent_at, confirmation_email_status, armband
  INTO v_sent, v_status, v_armband
  FROM public.entries WHERE id = '00000000-0000-0000-0000-000002040008';
  IF v_sent IS NOT NULL OR v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'FAIL not_accepted -> confirmed: expected sent_at NULL and status pending, found % / %',
      v_sent, v_status;
  END IF;
  IF v_armband IS DISTINCT FROM '200' THEN
    RAISE EXCEPTION 'FAIL not_accepted -> confirmed: expected the same armband 200, found %', v_armband;
  END IF;
  RAISE NOTICE 'PASS not_accepted -> confirmed: eligible for a new confirmation, same armband';
END;
$$;

ROLLBACK;
