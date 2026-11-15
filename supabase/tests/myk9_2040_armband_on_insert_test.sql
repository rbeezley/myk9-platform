-- MYK9-2040: an entry inserted already 'confirmed' (a secretary's mail-in) gets
-- an armband by the same rule as acceptance, and an entry that leaves
-- 'confirmed' loses its confirmation mark so a re-acceptance is sent again.
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
VALUES
  ('00000000-0000-0000-0000-000002040006', 'Confirmed Dog', 'Conf', '',
   '00000000-0000-0000-0000-000002040002'),
  ('00000000-0000-0000-0000-000002040007', 'Pending Dog', 'Pend', '',
   '00000000-0000-0000-0000-000002040002');
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES
  ('00000000-0000-0000-0000-000002040006', 'AKC', 'SR20400001', true),
  ('00000000-0000-0000-0000-000002040007', 'AKC', 'SR20400002', true);

-- Inserted already confirmed, and inserted pending.
INSERT INTO public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
                            entry_status, payment_status, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000002040008',
   '00000000-0000-0000-0000-000002040006', '00000000-0000-0000-0000-000002040005',
   '00000000-0000-0000-0000-000002040003', '00000000-0000-0000-0000-000002040004',
   '00000000-0000-0000-0000-000002040002', 'confirmed', 'pending', 25),
  ('00000000-0000-0000-0000-000002040009',
   '00000000-0000-0000-0000-000002040007', '00000000-0000-0000-0000-000002040005',
   '00000000-0000-0000-0000-000002040003', '00000000-0000-0000-0000-000002040004',
   '00000000-0000-0000-0000-000002040002', 'pending', 'pending', 25);

DO $$
DECLARE
  v_armband text;
  v_ledger text;
BEGIN
  SELECT armband INTO v_armband FROM public.entries
  WHERE id = '00000000-0000-0000-0000-000002040008';
  IF v_armband IS DISTINCT FROM '200' THEN
    RAISE EXCEPTION 'FAIL insert confirmed: expected armband 200 (show start), found %', v_armband;
  END IF;

  SELECT armband_number INTO v_ledger FROM public.armbands
  WHERE show_id = '00000000-0000-0000-0000-000002040003'
    AND dog_id = '00000000-0000-0000-0000-000002040006' AND is_available = FALSE;
  IF v_ledger IS DISTINCT FROM '200' THEN
    RAISE EXCEPTION 'FAIL insert confirmed: expected an assigned armbands row 200, found %', v_ledger;
  END IF;

  SELECT armband INTO v_armband FROM public.entries
  WHERE id = '00000000-0000-0000-0000-000002040009';
  IF v_armband IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL insert pending: expected no armband, found %', v_armband;
  END IF;
  RAISE NOTICE 'PASS insert: confirmed gets an armband, pending does not';
END;
$$;

-- Acceptance of the pending entry still numbers on from the same rule.
UPDATE public.entries SET entry_status = 'confirmed'
WHERE id = '00000000-0000-0000-0000-000002040009';

DO $$
DECLARE
  v_armband text;
BEGIN
  SELECT armband INTO v_armband FROM public.entries
  WHERE id = '00000000-0000-0000-0000-000002040009';
  IF v_armband IS DISTINCT FROM '201' THEN
    RAISE EXCEPTION 'FAIL accept: expected armband 201, found %', v_armband;
  END IF;
  RAISE NOTICE 'PASS accept: the update path still assigns the next number';
END;
$$;

-- The confirmation went out, then the entry left 'confirmed'.
UPDATE public.entries
SET confirmation_email_sent_at = now(), confirmation_email_status = 'sent'
WHERE id = '00000000-0000-0000-0000-000002040008';

UPDATE public.entries SET entry_status = 'submitted'
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
    RAISE EXCEPTION 'FAIL leave confirmed: expected sent_at NULL and status pending, found % / %',
      v_sent, v_status;
  END IF;
  IF v_armband IS DISTINCT FROM '200' THEN
    RAISE EXCEPTION 'FAIL leave confirmed: the armband must survive, found %', v_armband;
  END IF;
  RAISE NOTICE 'PASS leave confirmed: the mark is cleared';
END;
$$;

-- Re-accept: eligible for a new confirmation, same armband.
UPDATE public.entries SET entry_status = 'confirmed'
WHERE id = '00000000-0000-0000-0000-000002040008';

DO $$
DECLARE
  v_sent timestamptz;
  v_armband text;
BEGIN
  SELECT confirmation_email_sent_at, armband INTO v_sent, v_armband
  FROM public.entries WHERE id = '00000000-0000-0000-0000-000002040008';
  IF v_sent IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL re-accept: expected confirmation_email_sent_at NULL, found %', v_sent;
  END IF;
  IF v_armband IS DISTINCT FROM '200' THEN
    RAISE EXCEPTION 'FAIL re-accept: expected the same armband 200, found %', v_armband;
  END IF;
  RAISE NOTICE 'PASS re-accept: eligible for a new confirmation with the same armband';
END;
$$;

ROLLBACK;
