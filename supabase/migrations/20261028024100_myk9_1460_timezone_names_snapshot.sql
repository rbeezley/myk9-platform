-- MYK9-1460: stop reading pg_catalog.pg_timezone_names on hot paths.
--
-- pg_timezone_names is a set-returning view that reads every time-zone file
-- on disk on each query; `WHERE name = ...` does not help. Measured on the
-- live database on 2026-10-28: about 60 ms per lookup. Five functions used
-- it, three of them per row:
--
--   * waitlist_class_trial_has_passed, once per waiting row from
--     list_waitlist_offer_candidates (and from notify_mail_in_waitlist_head,
--     promote_waitlist_entry, promote_waitlist_entry_from_cron). Under load
--     the cron's offer step crossed PostgREST's 8 s statement_timeout:
--     "Offer step: canceling statement due to statement timeout" on
--     2026-10-20 and twice on 2026-10-23;
--   * get_account_today_entries_at, once per show (lateral join);
--   * create_show_with_children, once per trial (loop);
--   * submit_show_entries and send_waitlist_offer_message_internal, once
--     per call.
--
-- Fix: a snapshot of the zone names in an indexed table, and each function
-- reads it instead of the view. Every lookup keeps its exact `n.name`
-- semantics (same answers for valid, invalid, NULL and abbreviated zones),
-- so the five bodies change in that one relation name and nothing else.
-- They are copied from the LIVE definitions (pg_get_functiondef on
-- 2026-10-28, database and main both at 20261027235700).
--
-- Refresh: a Postgres upgrade that adds an IANA zone is not seen until a
-- migration re-runs the INSERT below; until then that zone falls back to
-- America/New_York, exactly as any unknown zone does today.

CREATE TABLE IF NOT EXISTS public.timezone_names (
  name text PRIMARY KEY
);

COMMENT ON TABLE public.timezone_names IS
  'Snapshot of pg_catalog.pg_timezone_names (MYK9-1460). Read by SECURITY DEFINER functions only; refresh with INSERT ... SELECT name FROM pg_catalog.pg_timezone_names ON CONFLICT DO NOTHING.';

INSERT INTO public.timezone_names (name)
SELECT n.name FROM pg_catalog.pg_timezone_names n
ON CONFLICT (name) DO NOTHING;

-- Internal lookup table: no API role reads it. All readers are SECURITY
-- DEFINER functions owned by postgres, which has BYPASSRLS, so forced RLS with
-- no policies denies every API role and leaves the readers working. This
-- project's default privileges grant anon full CRUD on new tables (MYK9-93),
-- so revoke explicitly. service_role keeps the default grant, like the other
-- RPC-owned tables (cart_checkout_leases, cart_spot_holds).
ALTER TABLE public.timezone_names ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timezone_names FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.timezone_names FROM PUBLIC;
REVOKE ALL ON TABLE public.timezone_names FROM anon;
REVOKE ALL ON TABLE public.timezone_names FROM authenticated;


-- waitlist_class_trial_has_passed: 1 lookup(s) now read public.timezone_names; body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.waitlist_class_trial_has_passed(p_class_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_trial_date date;
  v_show_id uuid;
  v_show_tz text;
BEGIN
  SELECT t.date, t.show_id
  INTO v_trial_date, v_show_id
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  WHERE c.id = p_class_id;

  IF v_trial_date IS NULL THEN
    RETURN false;
  END IF;

  v_show_tz := COALESCE(
    (SELECT t.timezone
       FROM public.trials t
      WHERE t.show_id = v_show_id
      ORDER BY t.date NULLS LAST, t.id
      LIMIT 1),
    'America/New_York'
  );
  v_show_tz := COALESCE(
    (SELECT n.name FROM public.timezone_names n WHERE n.name = v_show_tz),
    'America/New_York'
  );

  RETURN v_trial_date < (now() AT TIME ZONE v_show_tz)::date;
END;
$function$;


-- send_waitlist_offer_message_internal: 1 lookup(s) now read public.timezone_names; body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.send_waitlist_offer_message_internal(p_waitlist_entry_id uuid, p_sender_auth_user_id uuid, p_payment_link_url text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_show_id uuid;
  v_participant uuid;
  v_class_name text;
  v_dog_name text;
  v_offered_at timestamptz;
  v_offer_expires_at timestamptz;
  v_mail_in boolean;
  v_trial_tz text;
  v_session_tz text;
  v_deadline text;
  v_hours integer;
  v_deadline_line text;
  v_thread_id uuid;
  v_body text;
BEGIN
  SELECT t.show_id,
         ep.auth_user_id,
         nullif(btrim(c.name), ''),
         coalesce(nullif(btrim(d.call_name), ''), nullif(btrim(d.name), '')),
         w.offered_at,
         w.offer_expires_at,
         w.joined_via = 'mail_in',
         t.timezone
  INTO v_show_id, v_participant, v_class_name, v_dog_name, v_offered_at, v_offer_expires_at,
       v_mail_in, v_trial_tz
  FROM public.waitlist_entries w
  JOIN public.classes c ON c.id = w.class_id
  JOIN public.trials t ON t.id = c.trial_id
  LEFT JOIN public.exhibitor_profiles ep ON ep.id = w.exhibitor_id
  LEFT JOIN public.dogs d ON d.id = w.dog_id
  WHERE w.id = p_waitlist_entry_id
    AND w.status = 'offered';

  IF NOT FOUND THEN
    RETURN 'not_offered';
  END IF;
  IF v_participant IS NULL THEN
    RETURN 'no_account';
  END IF;
  IF p_sender_auth_user_id IS NULL THEN
    RETURN 'no_sender';
  END IF;

  -- (show_id, participant_id) is the thread's unique key and the lookup below
  -- uses both, so DO NOTHING can only meet this exhibitor's own thread.
  INSERT INTO public.show_message_threads (show_id, participant_id)
  VALUES (v_show_id, v_participant)
  ON CONFLICT (show_id, participant_id) DO NOTHING;

  SELECT smt.id
  INTO v_thread_id
  FROM public.show_message_threads smt
  WHERE smt.show_id = v_show_id
    AND smt.participant_id = v_participant;

  IF coalesce(v_mail_in, false) THEN
    -- MYK9-1002: a mail-in offer never expires, so it states no deadline.
    v_deadline_line := 'The club is holding it for you until they receive your payment. '
      || 'Pay the club directly and soon — they can release the spot if they don''t hear from you.';
  ELSE
    -- The offered class's own trial's zone, validated; New York otherwise.
    v_trial_tz := COALESCE(
      (SELECT n.name FROM public.timezone_names n WHERE n.name = v_trial_tz),
      'America/New_York'
    );
    -- Render in that zone WITH its abbreviation ("EDT"). to_char's TZ reads
    -- the session zone, so switch it for this one call and put it back.
    v_session_tz := current_setting('TimeZone');
    PERFORM set_config('TimeZone', v_trial_tz, true);
    v_deadline := to_char(v_offer_expires_at, 'Dy, Mon FMDD, FMHH12:MI AM TZ');
    PERFORM set_config('TimeZone', v_session_tz, true);

    -- The offer's own window, in whole hours.
    IF v_offered_at IS NOT NULL AND v_offer_expires_at IS NOT NULL THEN
      v_hours := round(extract(epoch FROM (v_offer_expires_at - v_offered_at)) / 3600)::integer;
    END IF;

    -- The Offer dialog's words: "They have 48 hours to pay (until ...)".
    v_deadline_line := CASE
      WHEN v_deadline IS NULL
        THEN 'Claim it by paying before the offer ends.'
      WHEN v_hours IS NOT NULL AND v_hours >= 1
        THEN 'You have ' || v_hours || CASE WHEN v_hours = 1 THEN ' hour' ELSE ' hours' END
          || ' to pay (until ' || v_deadline || ').'
      ELSE 'Claim it by paying before ' || v_deadline || '.'
    END;
  END IF;

  v_body := 'A spot opened'
    || coalesce(' for ' || v_dog_name, '')
    || coalesce(' in ' || v_class_name, '')
    || '. '
    || v_deadline_line
    || ' You pay for this spot only if you claim it.'
    || CASE
         WHEN nullif(btrim(p_payment_link_url), '') IS NOT NULL
           THEN ' Complete payment to claim it: ' || btrim(p_payment_link_url)
         WHEN coalesce(v_mail_in, false)
           THEN ''
         ELSE ' Open My Entries to accept the offer before it expires.'
       END;

  INSERT INTO public.show_messages (show_id, thread_id, sender_id, body)
  VALUES (v_show_id, v_thread_id, p_sender_auth_user_id, v_body);

  RETURN 'sent';
END;
$function$;


-- get_account_today_entries_at: 1 lookup(s) now read public.timezone_names; body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.get_account_today_entries_at(p_at timestamp with time zone)
 RETURNS TABLE(entry_id uuid, show_id uuid, show_name text, class_id uuid, trial_id uuid, class_name text, class_start_time text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (
    select id as person_id
    from public.people
    where auth_user_id = auth.uid()
      and deleted_at is null
    limit 1
  ),
  today_shows as (
    select s.id, s.name
    from public.shows s
    cross join lateral (
      -- Same primary-trial rule as submit_entries (MYK9-979): earliest live
      -- trial, zone validated against public.timezone_names, New York fallback.
      select coalesce(
        (
          select n.name
          from public.timezone_names n
          where n.name = (
            select t.timezone
            from public.trials t
            where t.show_id = s.id
              and t.deleted_at is null
            order by t.date nulls last, t.id
            limit 1
          )
        ),
        'America/New_York'
      ) as tz
    ) z
    where s.deleted_at is null
      -- Cheap prefilter: zones span UTC-12..UTC+14, so the show-local date is
      -- within one day of the UTC date.
      and s.start_date <= ((p_at at time zone 'UTC')::date + 1)
      and s.end_date >= ((p_at at time zone 'UTC')::date - 1)
      and (p_at at time zone z.tz)::date between s.start_date and s.end_date
  ),
  account_entry_ids as (
    select e.id
    from public.entries e
    join me on me.person_id = e.handler_id
    where e.deleted_at is null
      and e.entry_status not in ('withdrawn', 'scratched')

    union

    select e.id
    from public.entries e
    join public.dogs d on d.id = e.dog_id
    join me on me.person_id = d.owner_id
    where e.deleted_at is null
      and e.entry_status not in ('withdrawn', 'scratched')
      and d.deleted_at is null

    union

    select e.id
    from public.entries e
    join public.dogs d on d.id = e.dog_id
    join me on me.person_id = d.co_owner_id
    where e.deleted_at is null
      and e.entry_status not in ('withdrawn', 'scratched')
      and d.deleted_at is null
  )
  select
    e.id as entry_id,
    s.id as show_id,
    s.name as show_name,
    e.class_id,
    coalesce(c.trial_id, e.trial_id) as trial_id,
    coalesce(
      nullif(trim(concat_ws(' ', c.element, c.level, nullif(c.section, '-'))), ''),
      c.name
    ) as class_name,
    coalesce(c.start_time::text, t.planned_start_time) as class_start_time
  from account_entry_ids eligible
  join public.entries e on e.id = eligible.id
  left join public.trials t on t.id = e.trial_id
  left join public.classes c on c.id = e.class_id
  join today_shows s on s.id = coalesce(e.show_id, t.show_id)
  left join public.dogs d on d.id = e.dog_id
  where e.deleted_at is null
    and e.entry_status not in ('withdrawn', 'scratched')
    and (e.trial_id is null or t.deleted_at is null)
    and (e.class_id is null or c.deleted_at is null)
    and (e.dog_id is null or d.deleted_at is null);
$function$;


-- create_show_with_children: 1 lookup(s) now read public.timezone_names; body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.create_show_with_children(p_show jsonb, p_trials jsonb, p_classes jsonb, p_judge_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller_auth        uuid;
  v_club_id            uuid;
  v_show_id            uuid;
  v_trial              jsonb;
  v_class              jsonb;
  v_inserted_trial_ids uuid[] := ARRAY[]::uuid[];
  v_class_trial_id     uuid;
  v_class_judge_id     uuid;
  v_inserted_class_id  uuid;
  v_inserted_show_id   uuid;
  v_trial_id           uuid;
  v_inserted_trial_id  uuid;
  v_class_id           uuid;
  v_owner_club_id      uuid;
  v_owner_show_id      uuid;
  v_owner_trial_id     uuid;
  v_trial_timezone     text;
BEGIN
  v_caller_auth := auth.uid();
  IF v_caller_auth IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  v_club_id := (p_show->>'club_id')::uuid;
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'p_show must include a non-null club_id'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_site_admin()
    OR public.is_club_admin(v_club_id)
    OR public.is_trial_secretary(v_club_id)
  ) THEN
    RAISE EXCEPTION 'not authorized to create shows for club %', v_club_id
      USING ERRCODE = '42501';
  END IF;

  v_show_id := (p_show->>'id')::uuid;
  IF v_show_id IS NULL THEN
    RAISE EXCEPTION 'p_show must include a non-null id'
      USING ERRCODE = '22023';
  END IF;

  IF p_judge_ids IS NOT NULL AND array_length(p_judge_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(p_judge_ids) AS j(judge_uuid)
      WHERE NOT EXISTS (SELECT 1 FROM public.people WHERE id = j.judge_uuid)
    ) THEN
      RAISE EXCEPTION 'one or more p_judge_ids do not exist in public.people'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.shows (
    id, name, organization, start_date, end_date, location, status,
    club_id, entry_open_date, entry_close_date, pre_entry_fee,
    day_of_show_fee, accept_check_payments, accept_cash_payments,
    style, latitude, longitude, junior_handler_fee, online_entries_enabled, updated_at
  ) VALUES (
    v_show_id,
    p_show->>'name',
    p_show->>'organization',
    (p_show->>'start_date')::date,
    (p_show->>'end_date')::date,
    NULLIF(p_show->>'location', ''),
    COALESCE(NULLIF(p_show->>'status', ''), 'draft'),
    v_club_id,
    NULLIF(p_show->>'entry_open_date', '')::date,
    NULLIF(p_show->>'entry_close_date', '')::date,
    NULLIF(p_show->>'pre_entry_fee', '')::numeric,
    NULLIF(p_show->>'day_of_show_fee', '')::numeric,
    (p_show->>'accept_check_payments')::boolean,
    (p_show->>'accept_cash_payments')::boolean,
    COALESCE(NULLIF(p_show->>'style', ''), 'monogram'),
    NULLIF(p_show->>'latitude', '')::double precision,
    NULLIF(p_show->>'longitude', '')::double precision,
    NULLIF(p_show->>'junior_handler_fee', '')::numeric,
    COALESCE(NULLIF(p_show->>'online_entries_enabled', '')::boolean, false),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_inserted_show_id;

  -- A NULL return means the id already existed. The authorization above proved
  -- the caller may create shows for v_club_id — it proved nothing about a show
  -- that some other club already owns, so re-check the stored owner.
  -- FOR UPDATE: hold the row so the owner cannot change before the children land.
  IF v_inserted_show_id IS NULL THEN
    SELECT club_id INTO v_owner_club_id
    FROM public.shows
    WHERE id = v_show_id
    FOR UPDATE;

    IF v_owner_club_id IS DISTINCT FROM v_club_id THEN
      RAISE EXCEPTION 'show % belongs to another club', v_show_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  FOR v_trial IN SELECT value FROM jsonb_array_elements(COALESCE(p_trials, '[]'::jsonb))
  LOOP
    v_trial_id := (v_trial->>'id')::uuid;

    -- Only a value pg_catalog recognises as a real IANA zone ever reaches the
    -- column; anything else (missing key, empty string, typo) falls through
    -- to the column's own 'America/New_York' DEFAULT, exactly like
    -- getTrialTimezone() falls back client-side for the same bad input.
    SELECT n.name INTO v_trial_timezone
    FROM public.timezone_names n
    WHERE n.name = NULLIF(v_trial->>'timezone', '');

    INSERT INTO public.trials (
      id, show_id, name, date, trial_number, status, trial_type,
      planned_start_time, event_number, display_order, category, registry_id,
      timezone, updated_at
    ) VALUES (
      v_trial_id,
      v_show_id,
      v_trial->>'name',
      (v_trial->>'date')::date,
      NULLIF(v_trial->>'trial_number', ''),
      COALESCE(NULLIF(v_trial->>'status', ''), 'upcoming'),
      NULLIF(v_trial->>'trial_type', ''),
      NULLIF(v_trial->>'planned_start_time', ''),
      NULLIF(v_trial->>'event_number', ''),
      NULLIF(v_trial->>'display_order', '')::int,
      NULLIF(v_trial->>'category', ''),
      COALESCE(NULLIF(v_trial->>'registry_id', ''), 'AKC'),
      COALESCE(v_trial_timezone, 'America/New_York'),
      NOW()
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_inserted_trial_id;

    -- Same guard, one level down: a conflicting trial id that hangs off a
    -- different show would otherwise become a legal parent for p_classes.
    IF v_inserted_trial_id IS NULL THEN
      SELECT show_id INTO v_owner_show_id
      FROM public.trials
      WHERE id = v_trial_id
      FOR UPDATE;

      IF v_owner_show_id IS DISTINCT FROM v_show_id THEN
        RAISE EXCEPTION 'trial % belongs to another show', v_trial_id
          USING ERRCODE = '42501';
      END IF;
    END IF;

    v_inserted_trial_ids := array_append(v_inserted_trial_ids, v_trial_id);
  END LOOP;

  FOR v_class IN SELECT value FROM jsonb_array_elements(COALESCE(p_classes, '[]'::jsonb))
  LOOP
    v_class_trial_id := (v_class->>'trial_id')::uuid;
    v_class_id := (v_class->>'id')::uuid;

    IF NOT v_class_trial_id = ANY(v_inserted_trial_ids) THEN
      RAISE EXCEPTION 'class trial_id % is not part of this show creation request', v_class_trial_id
        USING ERRCODE = '22023';
    END IF;

    -- num_hides is listed explicitly so a NULL payload records "judge sets it"
    -- rather than silently taking the column's DEFAULT 1.
    INSERT INTO public.classes (
      id, trial_id, name, level, element, section, entry_fee,
      max_entries, status, start_time, timer_mode, hides_known,
      distraction_count, num_areas, num_hides, time_limit_seconds, updated_at
    ) VALUES (
      v_class_id,
      v_class_trial_id,
      v_class->>'name',
      NULLIF(v_class->>'level', ''),
      NULLIF(v_class->>'element', ''),
      NULLIF(v_class->>'section', ''),
      NULLIF(v_class->>'entry_fee', '')::numeric,
      NULLIF(v_class->>'max_entries', '')::int,
      COALESCE(NULLIF(v_class->>'status', ''), 'upcoming'),
      NULLIF(v_class->>'start_time', '')::time,
      NULLIF(v_class->>'timer_mode', ''),
      NULLIF(v_class->>'hides_known', '')::boolean,
      NULLIF(v_class->>'distraction_count', '')::int,
      NULLIF(v_class->>'num_areas', '')::int,
      NULLIF(v_class->>'num_hides', '')::int,
      NULLIF(v_class->>'time_limit_seconds', '')::int,
      NOW()
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_inserted_class_id;

    -- A conflicting class id under a different trial is another club's row.
    -- Under the SAME trial it is an ordinary idempotent re-run, which falls
    -- through to the judge-assignment guard below and stays a no-op.
    IF v_inserted_class_id IS NULL THEN
      SELECT trial_id INTO v_owner_trial_id
      FROM public.classes
      WHERE id = v_class_id
      FOR UPDATE;

      IF v_owner_trial_id IS DISTINCT FROM v_class_trial_id THEN
        RAISE EXCEPTION 'class % belongs to another trial', v_class_id
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Class-level judge assignment. Only when (a) the class was freshly inserted
    -- (v_inserted_class_id is NULL on an ON CONFLICT no-op, keeping re-runs of
    -- this atomic function idempotent) and (b) the wizard assigned a judge to
    -- this class. person_id is the real column; status 'confirmed' is what the
    -- dashboard treats as active (ACTIVE_ASSIGNMENT_STATUSES).
    v_class_judge_id := NULLIF(v_class->>'judge_id', '')::uuid;
    IF v_inserted_class_id IS NOT NULL AND v_class_judge_id IS NOT NULL THEN
      INSERT INTO public.judge_assignments (
        person_id, show_id, trial_id, class_id, status, confirmed_at,
        created_at, updated_at
      ) VALUES (
        v_class_judge_id, v_show_id, v_class_trial_id, v_inserted_class_id,
        'confirmed', NOW(), NOW(), NOW()
      );
    END IF;
  END LOOP;

  RETURN v_show_id;
END;
$function$;


-- submit_show_entries: 1 lookup(s) now read public.timezone_names; body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.submit_show_entries(p_show_id uuid, p_registration_id uuid, p_entries jsonb, p_submission_id uuid, p_payment_method text, p_payment jsonb DEFAULT NULL::jsonb)
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
  v_dog_owner_id       uuid;
  v_caller_person_id   uuid;
  v_exhibitor_profile_id uuid;
  v_client_cents       int;
  v_junior_override    boolean;
  v_priced             record;
  v_submission_source  text;
  v_entry_status       text;

  -- timestamptz, NOT date: `shows.start_date` is a timestamptz stored at
  -- midnight UTC, and assigning it into a `date` casts through the session
  -- TimeZone. The UTC calendar date is the value every other reader of this
  -- column uses, so take it explicitly below instead of inheriting a GUC.
  v_show_start    timestamptz;
  v_server_fee    numeric;
  v_server_cents  int;

  v_show_club_id  uuid;
  v_show_open     timestamptz;
  v_show_close    timestamptz;
  v_show_tz       text;
  v_is_official   boolean;
  v_is_day_of_show boolean;
  v_online_entries boolean;

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

  -- MYK9-677: the money received with this submission.
  v_created_cents   int := 0;
  v_pay_method      text;
  v_pay_received_on date;

  -- MYK9-1048: this entry's run position (NULL while its class has no order).
  v_run_order     int;

  -- MYK9-1010: the owner's address an AKC entry prints in the catalog.
  v_dog_label     text;
  v_has_owner     boolean;
  v_missing_parts text[];
  v_parts_text    text;
BEGIN
  SELECT s.start_date, s.club_id,
         s.entry_open_date, s.entry_close_date, s.online_entries_enabled,
         COALESCE(
           (SELECT t.timezone
              FROM public.trials t
             WHERE t.show_id = s.id
             ORDER BY t.date NULLS LAST, t.id
             LIMIT 1),
           'America/New_York'
         )
  INTO   v_show_start, v_show_club_id,
         v_show_open, v_show_close, v_online_entries, v_show_tz
  FROM   public.shows s
  WHERE  s.id = p_show_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'show % not found', p_show_id
      USING ERRCODE = '22023';
  END IF;

  -- MYK9-642 round 1. `trials.timezone` is plain text with no CHECK, so a bad
  -- value is storable, and `AT TIME ZONE <bad>` raises 22023 rather than
  -- degrading. The COALESCE above only covers NULL. Resolve the zone against
  -- public.timezone_names ONCE, here, so every expression below -- the entry-open
  -- and entry-close guards as well as the day-of rule -- is given a zone Postgres
  -- recognizes. Without it the two sides disagreed about what a malformed zone
  -- means: the client's `getTrialTimezone` (features/registries/helpers.ts)
  -- degrades and reports to Sentry, while this function aborted the whole
  -- submission at the desk.
  --
  -- The two are now closer but NOT identical, deliberately recorded rather than
  -- over-claimed: this match is case-sensitive and exact, while `AT TIME ZONE`
  -- and the client's `Intl.DateTimeFormat` both accept a differently-cased name
  -- (and `AT TIME ZONE` also accepts abbreviations like 'EDT'). So a stored
  -- 'america/chicago' would work before this line and falls back after it. No
  -- live row is affected -- `public.trials.timezone` holds only 'America/Chicago'
  -- (13) and 'America/New_York' (6), both exact -- and an exact IANA name is the
  -- only thing the app ever writes. Widen to `lower(n.name) = lower(v_show_tz)`
  -- if that ever stops being true.
  v_show_tz := COALESCE(
    (SELECT n.name FROM public.timezone_names n WHERE n.name = v_show_tz),
    'America/New_York'
  );

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

  -- MYK9-677 (Codex round 10). The check above ties the enrollment to this show
  -- only for an exhibitor; an official of show A could pass an enrollment of
  -- show B and have A's entries (and, with p_payment, money) written onto it.
  -- Every write below touches this enrollment, so it must be THIS show's, for
  -- everyone. Locked here, before any write, so it cannot move under us.
  IF p_registration_id IS NOT NULL THEN
    PERFORM 1 FROM public.enrollments en
     WHERE en.id = p_registration_id AND en.show_id = p_show_id
       FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'registration % is not an enrollment on show %', p_registration_id, p_show_id
        USING ERRCODE = '42501';
    END IF;
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

  -- MYK9-979: a show with online entries off takes no exhibitor (self-service)
  -- entries at all; exhibitors mail theirs in. Officials (site admin, show
  -- secretary, club admin) are exempt on the same v_is_official predicate as
  -- the window guards above, so mail-in and show-desk entry keep working.
  -- IS NOT TRUE: fail closed on anything but an explicit true.
  IF NOT v_is_official AND v_online_entries IS NOT TRUE THEN
    RAISE EXCEPTION 'online entries are not open for show %', p_show_id
      USING ERRCODE = '42501';
  END IF;

  IF p_payment_method IN ('waived', 'secretary_paid', 'group_payment') AND NOT v_is_official THEN
    RAISE EXCEPTION 'unauthorized payment method: % requires secretary or admin role', p_payment_method
      USING ERRCODE = '42501';
  END IF;

  -- MYK9-677: money already received, recorded in the payments ledger in THIS
  -- transaction, so entries and payment commit or fail together. The record
  -- predicate is the ledger's own (restated: SECURITY DEFINER drops RLS), and
  -- the method must be the one the entries are written with.
  IF p_payment IS NOT NULL THEN
    IF NOT private.can_record_show_payment(p_show_id) THEN
      RAISE EXCEPTION 'not authorized to record payments for show %', p_show_id
        USING ERRCODE = '42501';
    END IF;
    v_pay_method := p_payment->>'method';
    IF v_pay_method IS NULL OR v_pay_method NOT IN ('cash', 'check')
       OR v_pay_method IS DISTINCT FROM p_payment_method THEN
      RAISE EXCEPTION 'a received payment is cash or check, matching the entries (got %, entries %)',
        v_pay_method, p_payment_method USING ERRCODE = '22023';
    END IF;
    IF p_registration_id IS NULL THEN
      RAISE EXCEPTION 'a received payment needs an enrollment' USING ERRCODE = '22023';
    END IF;
    v_pay_received_on := NULLIF(p_payment->>'received_on', '')::date;
  END IF;

  -- MYK9-642. ONE rule, evaluated once per submission so every entry in the
  -- same call lands in the same registry bucket even if the clock crosses
  -- midnight mid-loop. See the header for the rulebook citations and for why
  -- this is the entry-close deadline rather than the fee's old start-date test.
  --
  -- Placed HERE, after the replay short-circuit, so a submission that was
  -- already recorded returns its cached result without re-deriving anything.
  -- It is deliberately NOT relied on for timezone safety: the entry-open and
  -- entry-close guards above are `NOT v_is_official`-gated, so for an official
  -- this would be the FIRST `AT TIME ZONE v_show_tz` in the function and moving
  -- it below them buys nothing. The zone is validated against public.timezone_names
  -- where it is read instead, which is what actually makes a bad value safe --
  -- for the exhibitor guards too, which never had that protection.
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
    -- MYK9-878: optional, default false, so older clients behave as before.
    -- Only a show secretary / site admin may set it (private.price_entry_fee
    -- raises 42501 for anyone else).
    v_junior_override := COALESCE((v_entry->>'junior_fee_override')::boolean, false);
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

    -- MYK9-824: a typed handler with no person match must never fall back to
    -- whoever is AT THE KEYBOARD. For a show official taking a mail-in or desk
    -- entry on someone else's behalf, that is staff, not a party to the entry
    -- -- defaulting to them silently reattributed the dog to the secretary
    -- (MYK9-819 dress rehearsal). Default to the dog's OWNER instead, which is
    -- also NULL-safe: `dogs.owner_id` is nullable, and a dog with no owner on
    -- file simply leaves `entries.handler_id` unset, which is what the
    -- acceptance criteria (and MYK9-665's decision to leave `handler_id` alone
    -- rather than invent a person) both call for.
    --
    -- The non-official branch is UNCHANGED: an exhibitor submitting their own
    -- entry with no explicit handler already has `v_caller_person_id` proven
    -- to equal the dog's owner by the ownership guard a few lines below, so
    -- this fallback was never the bug for that caller.
    IF v_handler_person_id IS NULL THEN
      IF v_is_official THEN
        SELECT d.owner_id INTO v_dog_owner_id FROM public.dogs d WHERE d.id = v_dog_id;
        v_handler_person_id := v_dog_owner_id;
      ELSE
        v_handler_person_id := v_caller_person_id;
      END IF;
    END IF;

    -- MYK9-841: staff keying an entry ON BEHALF of someone else is the
    -- reviewer, so the entry is accepted here instead of landing in her own
    -- review lane. Decided from v_is_official (the same caller-manages-the-
    -- show check every other staff-only branch above uses) plus dog
    -- OWNERSHIP -- not the resolved handler. A secretary can key HER OWN
    -- dog with an alternate handler as the handler_id (e.g. entering a dog
    -- she shows for someone else on paper); that is still her own entry,
    -- not one she is reviewing for someone else, so comparing
    -- v_handler_person_id to v_caller_person_id wrongly auto-accepted it.
    -- "Own" is dogs.owner_id = v_caller_person_id, the SAME rule the
    -- self-service authorization check below this loop uses (there via a
    -- people/auth.uid() join to the same owner_id column) -- deliberately
    -- NOT co_owner_id (Codex round 2, P1: an earlier revision of this
    -- classification counted co-owners too, so the two ownership rules in
    -- this function disagreed about what "own dog" means):
    --   - v_is_official = false                          -> exhibitor
    --     self-entry, unchanged ('submitted').
    --   - v_is_official = true, caller owns the dog       -> staff entering
    --     THEIR OWN dog, unchanged ('submitted') -- she is not reviewing
    --     herself, whoever the handler is.
    --   - v_is_official = true, caller does not own the
    --     dog                                             -> on-behalf-of,
    --     auto-accepted ('confirmed').
    -- Never derived from any client-supplied field.
    v_entry_status := CASE
      WHEN v_is_official AND NOT EXISTS (
        SELECT 1 FROM public.dogs d
        WHERE d.id = v_dog_id
          AND d.owner_id = v_caller_person_id
      )
        THEN 'confirmed'
      ELSE 'submitted'
    END;

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

    SELECT t.id, c.status, c.name, t.name
    INTO   v_trial_id, v_class_status, v_class_name, v_trial_name
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

    -- MYK9-1010 (header §1-§4): an AKC class needs the owner's full address.
    -- Resolved per trial, a blank registry being AKC, as the registration
    -- trigger and the client's getTrialRegistry resolve it.
    IF (
      SELECT coalesce(nullif(btrim(t.registry_id), ''), 'AKC')
      FROM public.trials t
      WHERE t.id = v_trial_id
    ) = 'AKC' THEN
      SELECT coalesce(nullif(btrim(d.call_name), ''), nullif(btrim(d.name), ''), 'This dog'),
             p.id IS NOT NULL,
             array_remove(ARRAY[
               CASE WHEN btrim(coalesce(p.street_address, '')) = '' THEN 'street address' END,
               CASE WHEN btrim(coalesce(p.city, '')) = '' THEN 'city' END,
               CASE WHEN btrim(coalesce(p.state, '')) = '' THEN 'state or province' END,
               CASE WHEN btrim(coalesce(p.zip_code, '')) = '' THEN 'ZIP or postal code' END
             ], NULL)
      INTO   v_dog_label, v_has_owner, v_missing_parts
      FROM   public.dogs d
      LEFT JOIN public.people p ON p.id = d.owner_id
      WHERE  d.id = v_dog_id;

      IF FOUND AND NOT v_has_owner THEN
        RAISE EXCEPTION '% has no owner on file. AKC prints the owner''s name and address in the marked catalog, so add the owner before entering an AKC trial.', v_dog_label
          USING ERRCODE = '23514', HINT = 'owner_address_required';
      END IF;

      IF FOUND AND cardinality(v_missing_parts) > 0 THEN
        -- "a", "a and b", "a, b and c" -- the client's formatPartList.
        v_parts_text := CASE
          WHEN cardinality(v_missing_parts) = 1 THEN v_missing_parts[1]
          ELSE array_to_string(v_missing_parts[1:cardinality(v_missing_parts) - 1], ', ')
               || ' and ' || v_missing_parts[cardinality(v_missing_parts)]
        END;
        RAISE EXCEPTION 'Add the owner''s % to enter % in an AKC trial. AKC prints the owner''s address in the marked catalog.', v_parts_text, v_dog_label
          USING ERRCODE = '23514', HINT = 'owner_address_required';
      END IF;
    END IF;

    -- MYK9-878: the fee comes from the ONE pricing function (the day-of /
    -- pre-entry / class fee chain that used to live here moved into it
    -- verbatim, with its comments). It also decides whether this entry is
    -- charged the show's junior handler fee; see the header.
    SELECT * INTO v_priced
      FROM private.price_entry_fee(
        p_show_id, v_class_id, v_is_day_of_show, v_junior_override
      );
    v_server_fee := v_priced.fee;

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

    -- MYK9-1048: an entry into a class that already has a run order joins the
    -- END of that order, as the offline late-entry writer does (#2815). A class
    -- with no order yet stays unset. Computed here, after the capacity decision,
    -- so a waitlisted or denied line consumes no position; and computed per
    -- line, so a second dog into the same class in this submission sees the
    -- first one's row (same transaction) and takes the next position.
    v_run_order := private.next_entry_run_order(v_class_id);

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
      is_day_of_show,
      junior_fee_override_by,
      run_order
    )
    VALUES (
      p_show_id,
      v_trial_id,
      v_class_id,
      v_dog_id,
      v_handler_name,
      v_handler_person_id,
      v_server_fee,
      v_entry_status,
      CASE
        WHEN p_payment_method IN ('secretary_paid', 'group_payment') THEN 'paid'
        WHEN p_payment_method IN ('waived') THEN 'waived'
        ELSE 'pending'
      END,
      p_payment_method,
      now(),
      p_registration_id,
      COALESCE(v_capacity.capacity_override, false),
      v_is_day_of_show,
      CASE WHEN v_junior_override AND v_priced.junior_fee_applied THEN v_caller_person_id END,
      v_run_order
    )
    RETURNING id INTO v_entry_id;
    v_created_cents := v_created_cents + v_server_cents;

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
      'junior_fee_applied', v_priced.junior_fee_applied,
      'capacity_override', COALESCE(v_capacity.capacity_override, false),
      'denial_reason', NULL
    ));
  END LOOP;

  -- MYK9-677: the created entries' server fees are the amount received. The
  -- enrollment total grows by them here (the client no longer writes it on
  -- this path), then the ledger core records the payment and moves paid_amount
  -- and payment_status once. Keyed on the submission id, so the replay branch
  -- above (which returns the stored result before reaching this) and a direct
  -- retry of the key can never record it twice.
  IF p_payment IS NOT NULL AND v_created_cents > 0 THEN
    UPDATE public.enrollments
       SET total_amount = COALESCE(total_amount, 0) + v_created_cents,
           payment_method = v_pay_method,
           updated_at = now()
     WHERE id = p_registration_id;

    PERFORM private.record_enrollment_payment_core(
      p_registration_id, 'payment', v_created_cents / 100.0, v_pay_method, v_pay_received_on,
      NULLIF(btrim(p_payment->>'reference'), ''), NULL, p_submission_id
    );
  END IF;

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

-- The five functions keep the EXECUTE grants they have live today
-- (CREATE OR REPLACE preserves them; restated so this migration, now the
-- latest definition of each, carries the decision).
REVOKE ALL ON FUNCTION public.waitlist_class_trial_has_passed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.waitlist_class_trial_has_passed(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.send_waitlist_offer_message_internal(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_waitlist_offer_message_internal(uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.get_account_today_entries_at(timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_today_entries_at(timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.submit_show_entries(uuid, uuid, jsonb, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_show_entries(uuid, uuid, jsonb, uuid, text, jsonb) TO authenticated, service_role;
