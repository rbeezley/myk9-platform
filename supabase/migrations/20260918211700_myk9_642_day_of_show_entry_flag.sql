-- =============================================================================
-- MYK9-642: one rule decides BOTH the fee tier and `entries.is_day_of_show`.
--
-- `submit_show_entries` priced an entry at the day-of-show tier from the show's
-- start date and then never wrote `entries.is_day_of_show` at all, so the column
-- kept its `false` default (migration 127). A mail-in taken at the desk on show
-- day after entries closed was charged $35 and certified to UKC as a pre-entry:
-- the function decided the entry was day-of-show when it picked the fee, then
-- recorded that it was not. The UKC Nosework Trial Report reads that column for
-- "Number of PreEntries" / "Number of DayOfShow Entries", which is what the club
-- certifies to the registry.
--
-- THE PREDICATE. Taken from the registries, not from the fee schedule:
--   UKC Nose Work rules, "Pre-entry and Pre-entry only": "Pre-entries must be
--   submitted by a specific date and are normally lower in price than
--   day-of-trial entries." (docs/rulebooks/ukc-nose-work-rules.txt)
--   UKC, "Day-of-show entry": "Most clubs allow entries to be taken on the day
--   of a show or trial."
--   ASCA scent detection rules 1.5.11 names the same two buckets.
-- So an entry is a PRE-entry only while the pre-entry deadline has not passed.
-- Past `entry_close_date` — the point this function already stops accepting
-- entries from anyone but an official — it is a day-of-show entry. The show's
-- start date is the fallback for a show with no close date configured, and is
-- the rule the fee tier has always used.
--
-- CONSEQUENCE, deliberate and called out on the PR: an entry a secretary takes
-- AFTER entries close but BEFORE the show starts now prices at the day-of tier,
-- where it used to price at pre-entry. That window is official-only (exhibitors
-- are refused by the entry-close guard above), and charging the higher tier for
-- an entry the registry will not count as a pre-entry is the point of the tier.
-- Making the flag and the fee disagree in that window is what this issue is.
--
-- BOUNDARIES. `start_date` and `entry_close_date` are both timestamptz stored at
-- midnight UTC, so both are read as their UTC calendar date and never
-- re-interpreted in another zone. "Today" is the calendar date in the show's
-- entry-window timezone, the same expression the entry-open / entry-close guards
-- already use -- the fee tier previously used CURRENT_DATE (UTC), which in a
-- negative zone flipped to the day-of tier during the evening BEFORE the show.
-- Entries are still open ON the close date, so day-of starts the day AFTER it
-- (`>`), while the start date itself counts (`>=`).
--
-- The client restates the identical rule in
-- apps/myk9show/src/features/_shared/isDayOfShowEntry.ts, which both
-- `getShowEntryFee` and the offline late-entry writer call. Change one, change
-- the other, or the two judgements drift apart again.
--
-- Rebuilt from 20260914184500_block_entries_into_started_classes.sql, the LATEST
-- migration defining this function (`grep -l "CREATE OR REPLACE FUNCTION
-- public.submit_show_entries" supabase/migrations/`), so no intervening change
-- is reverted. The only edits are the `v_is_day_of_show` variable and its
-- assignment, the fee CASE now reading it, and `is_day_of_show` in the INSERT.
--
-- Behavioral coverage: supabase/tests/submit_entries_day_of_show_flag_test.sql
-- (behavioral SQL tests run only in CI -- no container runtime locally).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_show_entries(p_show_id uuid, p_registration_id uuid, p_entries jsonb, p_submission_id uuid, p_payment_method text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_entry              jsonb;
  v_dog_id             uuid;
  v_class_id           uuid;
  v_handler_name       text;
  v_handler_person_id  uuid;
  v_caller_person_id   uuid;
  v_exhibitor_profile_id uuid;
  v_client_cents       int;
  v_submission_source  text;

  v_show_pre_fee  numeric;
  v_show_dos_fee  numeric;
  -- timestamptz, NOT date: `shows.start_date` is a timestamptz stored at
  -- midnight UTC, and assigning it into a `date` casts through the session
  -- TimeZone. The UTC calendar date is the value every other reader of this
  -- column uses, so take it explicitly below instead of inheriting a GUC.
  v_show_start    timestamptz;
  v_class_fee     numeric;
  v_server_fee    numeric;
  v_server_cents  int;

  v_show_club_id  uuid;
  v_show_open     timestamptz;
  v_show_close    timestamptz;
  v_show_tz       text;
  v_is_official   boolean;
  v_is_day_of_show boolean;

  v_trial_id      uuid;
  v_class_status  text;
  v_class_name    text;
  v_trial_name    text;
  v_class_running boolean;
  v_class_label   text;
  v_entry_id      uuid;
  v_capacity      record;
  v_entry_pairs   jsonb[] := '{}';
  v_outcomes      jsonb[] := '{}';

  v_result        jsonb;
BEGIN
  SELECT s.pre_entry_fee, s.day_of_show_fee, s.start_date, s.club_id,
         s.entry_open_date, s.entry_close_date,
         COALESCE(
           (SELECT t.timezone
              FROM public.trials t
             WHERE t.show_id = s.id
             ORDER BY t.date NULLS LAST, t.id
             LIMIT 1),
           'America/New_York'
         )
  INTO   v_show_pre_fee, v_show_dos_fee, v_show_start, v_show_club_id,
         v_show_open, v_show_close, v_show_tz
  FROM   public.shows s
  WHERE  s.id = p_show_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'show % not found', p_show_id
      USING ERRCODE = '22023';
  END IF;

  v_is_official := (
    public.is_site_admin()
    OR public.is_show_secretary(p_show_id)
    OR public.is_club_admin(v_show_club_id)
  );

  SELECT p.id INTO v_caller_person_id
  FROM public.people p
  WHERE p.auth_user_id = auth.uid();

  SELECT ep.id
  INTO v_exhibitor_profile_id
  FROM public.enrollments en
  JOIN public.exhibitor_profiles ep ON ep.person_id = en.handler_id
  WHERE en.id = p_registration_id
    AND en.show_id = p_show_id
    AND (v_is_official OR en.handler_id = v_caller_person_id)
  LIMIT 1;

  IF NOT v_is_official AND v_exhibitor_profile_id IS NULL THEN
    RAISE EXCEPTION 'registration % does not belong to the caller', p_registration_id
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('entrysubmission:' || p_submission_id::text));

  SELECT es.result INTO v_result
  FROM public.entry_submissions es
  WHERE es.id = p_submission_id;

  IF FOUND THEN
    IF v_result->>'registration_id' IS DISTINCT FROM p_registration_id::text THEN
      RAISE EXCEPTION 'submission % belongs to another registration', p_submission_id
        USING ERRCODE = '42501';
    END IF;
    RETURN v_result;
  END IF;

  IF NOT v_is_official
     AND v_show_open IS NOT NULL
     AND (now() AT TIME ZONE v_show_tz)::date < (v_show_open AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'entry period has not opened for show %', p_show_id
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_official
     AND v_show_close IS NOT NULL
     AND (now() AT TIME ZONE v_show_tz)::date > (v_show_close AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'entry period has closed for show %', p_show_id
      USING ERRCODE = '42501';
  END IF;

  IF p_payment_method IN ('waived', 'secretary_paid', 'group_payment') AND NOT v_is_official THEN
    RAISE EXCEPTION 'unauthorized payment method: % requires secretary or admin role', p_payment_method
      USING ERRCODE = '42501';
  END IF;

  -- MYK9-642. ONE rule, evaluated once per submission so every entry in the
  -- same call lands in the same registry bucket even if the clock crosses
  -- midnight mid-loop. See the header for the rulebook citations and for why
  -- this is the entry-close deadline rather than the fee's old start-date test.
  --
  -- Deliberately placed HERE, after the replay short-circuit and after the
  -- entry-window guards: `AT TIME ZONE v_show_tz` raises invalid_parameter_value
  -- on a malformed trials.timezone, and evaluating it earlier would make a bad
  -- zone throw on a REPLAYED submission that previously returned its cached
  -- result, and throw for an official on a path only exhibitors reached before.
  v_is_day_of_show := (
    (
      v_show_close IS NOT NULL
      AND (now() AT TIME ZONE v_show_tz)::date > (v_show_close AT TIME ZONE 'UTC')::date
    )
    OR (
      v_show_start IS NOT NULL
      AND (now() AT TIME ZONE v_show_tz)::date >= (v_show_start AT TIME ZONE 'UTC')::date
    )
  );

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_dog_id       := (v_entry->>'dog_id')::uuid;
    v_class_id     := (v_entry->>'class_id')::uuid;
    v_handler_name := v_entry->>'handler_name';
    v_handler_person_id := NULLIF(v_entry->>'handler_id', '')::uuid;
    v_client_cents := (v_entry->>'client_fee_cents')::int;
    v_submission_source := COALESCE(
      NULLIF(v_entry->>'submission_source', ''),
      CASE WHEN v_is_official THEN 'organizer' ELSE 'self_service' END
    );

    IF v_submission_source NOT IN ('self_service', 'organizer', 'show_desk') THEN
      RAISE EXCEPTION 'invalid submission source: %', v_submission_source
        USING ERRCODE = '22023';
    END IF;

    IF v_submission_source IN ('organizer', 'show_desk') AND NOT v_is_official THEN
      RAISE EXCEPTION 'submission source % requires a show official', v_submission_source
        USING ERRCODE = '42501';
    END IF;

    IF v_handler_person_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.people p WHERE p.id = v_handler_person_id
    ) THEN
      RAISE EXCEPTION 'handler % not found', v_handler_person_id
        USING ERRCODE = '22023';
    END IF;

    IF NOT v_is_official AND v_handler_person_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.dogs d
      WHERE d.id = v_dog_id
        AND v_handler_person_id IN (d.owner_id, d.co_owner_id)
    ) THEN
      RAISE EXCEPTION 'caller cannot assign handler % for dog %', v_handler_person_id, v_dog_id
        USING ERRCODE = '42501';
    END IF;

    v_handler_person_id := COALESCE(v_handler_person_id, v_caller_person_id);

    IF NOT v_is_official AND NOT EXISTS (
      SELECT 1
      FROM public.dogs d
      JOIN public.people p ON p.id = d.owner_id
      WHERE d.id = v_dog_id
        AND p.auth_user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'caller does not own dog %', v_dog_id
        USING ERRCODE = '42501';
    END IF;

    SELECT c.entry_fee, t.id, c.status, c.name, t.name
    INTO   v_class_fee, v_trial_id, v_class_status, v_class_name, v_trial_name
    FROM   public.classes c
    JOIN   public.trials t ON t.id = c.trial_id
    WHERE  c.id = v_class_id
      AND  t.show_id = p_show_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'class % does not belong to show %', v_class_id, p_show_id
        USING ERRCODE = '22023';
    END IF;

    -- MYK9-516. Entry close is a DATE guard (entry_close_date, above). A class's
    -- own status is a separate axis: on show day the judge starts running a
    -- class and its status moves to 'in_progress', then 'completed', while the
    -- close date may still be days away. Without this the wizard could commit an
    -- entry into a ring that is already running -- a refund and a secretary
    -- phone call, on the money path.
    --
    -- Officials are exempt, on the same v_is_official predicate the entry-open,
    -- entry-close and payment-method guards already use: a secretary taking a
    -- gate entry for a class in the ring is the normal late-entry case. (Product
    -- rule assumed pending Richard's confirmation -- recorded on MYK9-516.)
    --
    -- ERRCODE 42501 matches the sibling non-official guards in this function, so
    -- PostgREST answers 403 and the RAISE message -- not a generic one -- is
    -- what the wizard shows: `submitShowEntries` wraps the PostgREST error with
    -- `createDatabaseError`, which keeps `message`, and `submitPaymentStep`
    -- toasts `getErrorMessage(error)`. The message is therefore exhibitor-facing
    -- prose, deliberately, and is asserted verbatim by
    -- supabase/tests/submit_entries_started_class_test.sql.
    -- Which class, in words. One stale cart line otherwise fails the whole
    -- submission with a message naming nothing, and the exhibitor has to guess
    -- which of five chips to remove.
    v_class_label := COALESCE(NULLIF(v_class_name, ''), 'This class')
      || COALESCE(' (' || NULLIF(v_trial_name, '') || ')', '');

    -- `classes.status` LAGS. `refresh_class_scoring_state` writes 'in_progress'
    -- only once the first score lands, so from the moment dogs are in the ring
    -- until somebody scores one the column still reads 'upcoming' -- the exact
    -- window an exhibitor is most likely to be entering a class being judged.
    -- Ringside never trusts the column alone either (`getEffectiveClassStatus`
    -- derives it from `is_in_ring` and scoring state), so neither does this.
    --
    -- The scored predicate is `is_scored = true`, copied from the LATEST
    -- definition of public.refresh_class_scoring_state
    -- (20260904160000_exclude_absent_entries_from_class_rollup.sql), not invented
    -- here: two notions of "this class has been scored" would drift.
    SELECT EXISTS (
      SELECT 1
      FROM   public.entries e
      WHERE  e.class_id = v_class_id
        AND  e.deleted_at IS NULL
        AND  (e.is_in_ring IS TRUE OR e.is_scored IS TRUE)
    )
    INTO v_class_running;

    -- No NOT v_is_official here, deliberately. A cancelled class is not running
    -- late, it is not happening: no ring, no judge, no paperwork. The official
    -- carve-out below exists for a desk entry into a class that IS running and
    -- has nothing to offer here, so nobody may buy an entry into a cancelled
    -- class. (Assumed product rule, recorded on MYK9-516 with the other one.)
    IF v_class_status = 'cancelled' THEN
      RAISE EXCEPTION 'This class was cancelled, so it can no longer be entered: %', v_class_label
        USING ERRCODE = '42501';
    END IF;

    IF NOT v_is_official AND (v_class_status = 'in_progress' OR v_class_running) THEN
      RAISE EXCEPTION 'This class has already started, so it can no longer be entered online. Contact the show secretary about a late entry: %', v_class_label
        USING ERRCODE = '42501';
    END IF;

    IF NOT v_is_official AND v_class_status = 'completed' THEN
      RAISE EXCEPTION 'This class has finished, so it can no longer be entered: %', v_class_label
        USING ERRCODE = '42501';
    END IF;

    -- A blank Day-of-Show Fee persists as 0.00, not NULL, so COALESCE never falls
    -- through to the pre-entry fee: from the show's start date every entry priced
    -- at zero. The client displayed the correct fee and this wrote 0, so the
    -- receipt said $30.00 while entries.entry_fee and enrollments.total_amount
    -- were both 0 -- nothing on screen contradicted the record.
    --
    -- Zero means "no day-of tier", not "free". Mirrors getShowEntryFee in
    -- components/shows/RegistrationWorkflow/PaymentStep/utils.ts, which was fixed
    -- for the same reason; the server is authoritative, so it must agree.
    -- MYK9-642: the tier now reads the SAME boolean that is stored on the row,
    -- so the receipt and the registry report can no longer disagree about what
    -- kind of entry this is. (Was: an inline CURRENT_DATE >= v_show_start test.)
    v_server_fee := COALESCE(
      CASE
        WHEN v_is_day_of_show
             AND v_show_dos_fee IS NOT NULL
             AND v_show_dos_fee > 0
          THEN v_show_dos_fee
        ELSE v_show_pre_fee
      END,
      v_class_fee,
      0
    );

    v_server_cents := ROUND(v_server_fee * 100)::int;
    IF v_client_cents IS NOT NULL AND v_client_cents < v_server_cents THEN
      RAISE EXCEPTION 'fee mismatch: client sent % cents, server requires % cents',
        v_client_cents, v_server_cents
        USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO v_capacity
    FROM public.evaluate_entry_capacity(
      v_class_id,
      v_dog_id,
      v_exhibitor_profile_id,
      v_handler_person_id,
      v_submission_source,
      v_is_official
    );

    IF v_capacity.outcome = 'waitlisted' THEN
      v_outcomes := array_append(v_outcomes, jsonb_build_object(
        'dog_id', v_dog_id,
        'class_id', v_class_id,
        'outcome', 'waitlisted',
        'entry_id', NULL,
        'waitlist_entry_id', v_capacity.waitlist_entry_id,
        'waitlist_position', v_capacity.waitlist_position,
        'fee_cents', 0,
        'capacity_override', false,
        'denial_reason', NULL
      ));
      CONTINUE;
    END IF;

    IF v_capacity.outcome = 'denied' THEN
      v_outcomes := array_append(v_outcomes, jsonb_build_object(
        'dog_id', v_dog_id,
        'class_id', v_class_id,
        'outcome', 'denied',
        'entry_id', NULL,
        'waitlist_entry_id', NULL,
        'waitlist_position', NULL,
        'fee_cents', 0,
        'capacity_override', false,
        'denial_reason', v_capacity.denial_reason
      ));
      CONTINUE;
    END IF;

    INSERT INTO public.entries (
      show_id,
      trial_id,
      class_id,
      dog_id,
      handler,
      handler_id,
      entry_fee,
      entry_status,
      payment_status,
      payment_method,
      submitted_at,
      registration_id,
      capacity_override,
      is_day_of_show
    )
    VALUES (
      p_show_id,
      v_trial_id,
      v_class_id,
      v_dog_id,
      v_handler_name,
      v_handler_person_id,
      v_server_fee,
      'submitted',
      CASE
        WHEN p_payment_method IN ('secretary_paid', 'group_payment') THEN 'paid'
        WHEN p_payment_method IN ('waived') THEN 'waived'
        ELSE 'pending'
      END,
      p_payment_method,
      now(),
      p_registration_id,
      COALESCE(v_capacity.capacity_override, false),
      v_is_day_of_show
    )
    RETURNING id INTO v_entry_id;

    v_entry_pairs := array_append(v_entry_pairs,
      jsonb_build_object('entry_id', v_entry_id, 'dog_id', v_dog_id));
    v_outcomes := array_append(v_outcomes, jsonb_build_object(
      'dog_id', v_dog_id,
      'class_id', v_class_id,
      'outcome', 'created',
      'entry_id', v_entry_id,
      'waitlist_entry_id', NULL,
      'waitlist_position', NULL,
      'fee_cents', v_server_cents,
      'capacity_override', COALESCE(v_capacity.capacity_override, false),
      'denial_reason', NULL
    ));
  END LOOP;

  v_result := jsonb_build_object(
    'entries', to_jsonb(v_entry_pairs),
    'outcomes', to_jsonb(v_outcomes),
    'registration_id', p_registration_id,
    'submission_id', p_submission_id
  );

  INSERT INTO public.entry_submissions (id, result)
  VALUES (p_submission_id, v_result);

  RETURN v_result;
END;
$function$;

-- Explicit role decisions, restating the LIVE grants rather than inventing them
-- (verified: anon false, authenticated true, service_role true). CREATE OR REPLACE
-- preserves privileges, so these are a no-op against the current database and exist
-- so the grant decision is recorded with the definition.
REVOKE EXECUTE ON FUNCTION public.submit_show_entries(uuid, uuid, jsonb, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_show_entries(uuid, uuid, jsonb, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_show_entries(uuid, uuid, jsonb, uuid, text) TO service_role;

COMMIT;
