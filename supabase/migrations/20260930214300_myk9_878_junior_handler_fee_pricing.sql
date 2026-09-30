-- =============================================================================
-- MYK9-878 (junior handler fee, slice B): price staff and desk entries at the
-- show's junior handler fee. Plan: docs/plan-junior-handler-fee-v2.md. The
-- setting itself (shows.junior_handler_fee) shipped in slice A and changed no
-- price; this is the first migration that reads it.
--
-- DECISIONS (Richard, 2026-09-29/30; MYK9-875 comment):
--   * Junior status is decided by AGE ONLY (private.entry_handler_is_junior, the
--     MYK9-664 derivation: AKC under 18 on the trial date, UKC under 18 on
--     Jan 1 of the trial year, ASCA / unknown / no date of birth => NULL).
--   * A junior fee is derived ONLY when the entry's handler is the dog's
--     owner_id or co_owner_id. The "enrolled handler" and "existing entry"
--     arms of MYK9-875 are dropped: enrollments.handler_id is always the
--     registrant, and either arm let a show manager manufacture the
--     relationship by writing one row and then probing with a second (the
--     two-entry bootstrap).
--   * A show secretary or site admin may EXPLICITLY charge the junior fee for
--     any entry (a junior handling a parent's dog). That is a fee choice the
--     secretary makes; it never reads a date of birth, so it cannot be used as
--     the MYK9-664 age oracle. Who applied it is stored on the entry.
--   * NULL or 0 junior_handler_fee = no junior tier (slice A's convention,
--     mirroring day_of_show_fee). Unknown status => the normal fee. The junior
--     result is LEAST(junior fee, normal fee): never above the regular fee.
--   * The fee is fixed at entry creation and stored on the entry, and a direct
--     client UPDATE cannot change it (server-enforced below). Nothing
--     downstream re-derives it. No refund is issued by anything here.
--
-- ONE PRICING FUNCTION: private.price_entry_fee. EXECUTE is revoked from PUBLIC,
-- anon and authenticated (the MYK9-664 oracle rule: a price that varies with a
-- handler's age must not be callable with a chosen handler and trial date), and
-- the function is SECURITY INVOKER so even a mistaken grant would fail on
-- people_private. Its only callers are SECURITY DEFINER code owned by the
-- migration role: submit_show_entries and the entries trigger below.
--
-- TWO ENTRY POINTS, ONE FUNCTION:
--   1. submit_show_entries (cash / check / waived / secretary_paid, online
--      staff and exhibitor wizard). New optional per-entry input
--      `junior_fee_override` (boolean, default false) - older clients that do
--      not send it behave exactly as before. The fee is stored on the entry,
--      the outcome carries fee_cents and junior_fee_applied, and cash / check
--      totals already follow the server fee (v_created_cents).
--   2. The offline late-entry path: the replication queue writes entries with a
--      direct PostgREST insert (submitOfflineLateEntry -> createEntry), so the
--      RPC never sees it. trg_entries_junior_fee reprices that insert.
--
-- HOW THE TRIGGER TELLS A DIRECT CLIENT INSERT FROM EVERYTHING ELSE. Only a
-- direct client insert is repriced. The discriminator is the database role the
-- INSERT statement runs under, read as `current_user` in an INVOKER trigger
-- (trg_entries_00_direct_write_gate, which runs first because triggers fire in
-- name order):
--   * PostgREST does SET LOCAL ROLE authenticated for a client request, so a
--     direct insert sees current_user = 'authenticated' -> repriced.
--   * submit_show_entries and every other SECURITY DEFINER writer (move-up,
--     capacity, the online-paid gate) run as the function owner, so the same
--     INSERT sees current_user = the owner -> NOT repriced.
--   * The card checkout / webhook / import edge functions use the service_role
--     key, so current_user = 'service_role' -> NOT repriced.
-- `request.jwt.claims` / `current_setting('role')` cannot discriminate: a
-- SECURITY DEFINER RPC called by an authenticated user still reports
-- 'authenticated'. A transaction-local flag set by submit_show_entries was
-- rejected for the reverse reason: it only proves "the RPC ran", so any writer
-- that forgets the flag gets silently repriced. Keying on the positive
-- identification of a client insert fails safe for every other writer.
-- The gate writes a transaction-local setting on every entries INSERT and on
-- every UPDATE that names junior_fee_override_by (overwriting any earlier value), and the fee trigger reads it; a client
-- cannot forge it because the gate runs before the fee trigger on every row.
-- FROZEN AFTER CREATION: on a direct client UPDATE the same trigger keeps
-- OLD.entry_fee and OLD.junior_fee_override_by (trg_entries_00_direct_write_gate
-- also fires on UPDATE OF entry_fee), so a queued full-row upload cannot restore a
-- regular fee over the server-priced junior fee. RPC / definer / service_role
-- updates are not direct client writes and may still change the fee.
-- The fee trigger never RAISES for an ordinary insert, never RAISES on a write
-- it does not price, and only ever LOWERS a client-sent fee to the junior fee
-- (it does not normalise other fees, so waived / overridden / desk-adjusted
-- amounts keep working; a waived entry at fee 0 stays at 0).
--
-- THE OVERRIDE ON THE OFFLINE PATH. The replica has no column for a request, so
-- a non-NULL entries.junior_fee_override_by on a direct insert IS the request
-- (any value; the client sends its own user id). The trigger verifies the caller
-- is the show secretary or a site admin (private.price_entry_fee raises 42501
-- otherwise, so a non-secretary cannot even attempt it), then OVERWRITES the
-- column with the caller's people.id. A direct UPDATE cannot change it.
--
-- entries.junior_fee_override_by: people.id of the secretary / admin who applied
-- the override, NULL otherwise. No FK on purpose: it is an audit stamp that must
-- survive a person delete, and a FK ON DELETE SET NULL would fire an entries
-- UPDATE (and its triggers) from the person-delete path for no benefit. No
-- column SELECT grant to any API role, like entries.handler_is_junior: entries
-- keeps column-level SELECT for authenticated and an empty allowlist for anon,
-- and a new column receives neither. INSERT/UPDATE stay table-level for
-- authenticated, which is why the trigger owns the value.
--
-- LEGACY ROWS: entries.entry_fee already holds the frozen fee; existing rows are
-- untouched and there is no backfill (a NULL fee is priced by nothing here).
--
-- submit_show_entries is rebuilt from 20260926231700_myk9_841_staff_on_behalf_
-- entries_auto_accepted.sql, the LATEST migration defining it (`grep -l 'CREATE
-- OR REPLACE FUNCTION public.submit_show_entries' supabase/migrations/ | sort |
-- tail -1`). Edits versus that file: the junior_fee_override input, the pricing
-- block now calling private.price_entry_fee (the fee chain moved there verbatim:
-- day-of fee when > 0, else pre-entry fee, else class fee, else 0), the stored
-- junior_fee_override_by, junior_fee_applied on the created outcome, and the
-- removal of the three locals the moved fee chain made unused. Nothing else.
--
-- Behavioral coverage: supabase/tests/myk9_878_junior_handler_fee_pricing_test.sql
-- (behavioral SQL tests run only in CI - no container runtime locally).
-- =============================================================================

BEGIN;

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS junior_fee_override_by uuid;

COMMENT ON COLUMN public.entries.junior_fee_override_by IS
  'MYK9-878: people.id of the show secretary / site admin who explicitly charged the junior handler fee on this entry, NULL when none did. Written only by submit_show_entries and trg_entries_junior_fee; a client value on a direct insert is only a request and is overwritten. No FK (audit stamp) and no column SELECT grant to any API role.';

-- ---------------------------------------------------------------------------
-- The ONE pricing function.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.price_entry_fee(
  p_show_id         uuid,
  p_class_id        uuid,
  p_dog_id          uuid,
  p_handler_id      uuid,
  p_is_day_of_show  boolean,
  p_junior_override boolean,
  OUT fee                numeric,
  OUT junior_fee_applied boolean
)
RETURNS record
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_junior_fee numeric;
  v_pre_fee    numeric;
  v_dos_fee    numeric;
  v_class_fee  numeric;
  v_trial_id   uuid;
  v_normal     numeric;
BEGIN
  SELECT s.junior_handler_fee, s.pre_entry_fee, s.day_of_show_fee
    INTO v_junior_fee, v_pre_fee, v_dos_fee
    FROM public.shows s
   WHERE s.id = p_show_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'show % not found', p_show_id USING ERRCODE = '22023';
  END IF;

  -- The override is a secretary's choice; anyone else asking for it is refused
  -- BEFORE anything is priced, whether or not this show has a junior fee, so a
  -- probe cannot learn the show's tier from the answer.
  IF p_junior_override AND NOT public.is_show_secretary(p_show_id) THEN
    RAISE EXCEPTION 'only the show secretary or a site admin can charge the junior handler fee'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.entry_fee, c.trial_id
    INTO v_class_fee, v_trial_id
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
   WHERE c.id = p_class_id
     AND t.show_id = p_show_id;

  -- A blank Day-of-Show Fee persists as 0.00, not NULL: zero means "no day-of
  -- tier", not "free". Moved verbatim from submit_show_entries (MYK9-642 /
  -- 20260829030000); the server is authoritative, so it must agree with
  -- getShowEntryFee on the client.
  v_normal := COALESCE(
    CASE
      WHEN p_is_day_of_show AND v_dos_fee IS NOT NULL AND v_dos_fee > 0 THEN v_dos_fee
      ELSE v_pre_fee
    END,
    v_class_fee,
    0
  );

  fee := v_normal;
  junior_fee_applied := false;

  -- NULL or 0 = no junior tier.
  IF v_junior_fee IS NULL OR v_junior_fee <= 0 THEN
    RETURN;
  END IF;

  -- LEAST: a junior tier configured ABOVE the regular fee never produces a fee
  -- above what the client can quote (and the RPC's client-fee check would refuse).
  IF p_junior_override THEN
    -- Never reads a date of birth.
    fee := LEAST(v_junior_fee, v_normal);
    junior_fee_applied := true;
  ELSIF p_handler_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.dogs d
           WHERE d.id = p_dog_id
             AND p_handler_id IN (d.owner_id, d.co_owner_id)
        )
        AND COALESCE(
          private.entry_handler_is_junior(p_handler_id, p_class_id, v_trial_id),
          false
        )
  THEN
    fee := LEAST(v_junior_fee, v_normal);
    junior_fee_applied := true;
  END IF;
END;
$$;

COMMENT ON FUNCTION private.price_entry_fee(uuid, uuid, uuid, uuid, boolean, boolean) IS
  'MYK9-878: the ONE place an entry is priced. Returns the stored fee and whether it is the junior handler fee. Junior only for the dog owner / co-owner who is a junior at the trial (MYK9-664 derivation), or on an explicit secretary / site-admin override that never reads a date of birth. No API role may execute it (oracle rule); callers are SECURITY DEFINER.';

REVOKE ALL ON FUNCTION private.price_entry_fee(uuid, uuid, uuid, uuid, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.price_entry_fee(uuid, uuid, uuid, uuid, boolean, boolean) FROM anon;
REVOKE ALL ON FUNCTION private.price_entry_fee(uuid, uuid, uuid, uuid, boolean, boolean) FROM authenticated;
REVOKE ALL ON FUNCTION private.price_entry_fee(uuid, uuid, uuid, uuid, boolean, boolean) FROM service_role;

-- ---------------------------------------------------------------------------
-- The offline / direct-insert path. Two triggers; see the header.
-- ---------------------------------------------------------------------------
-- Gate: SECURITY INVOKER on purpose, so current_user is the role running the
-- statement. Runs first ("00" sorts before every other trg_entries_* name).
CREATE OR REPLACE FUNCTION private.entries_direct_write_gate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_catalog.set_config(
    'myk9.entries_direct_write',
    CASE WHEN current_user = 'authenticated' THEN 'on' ELSE 'off' END,
    true
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.entries_apply_junior_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_override boolean;
  v_priced   record;
BEGIN
  IF current_setting('myk9.entries_direct_write', true) IS DISTINCT FROM 'on' THEN
    RETURN NEW;
  END IF;

  -- The fee is fixed at creation, then frozen (plan: "the fee is fixed at entry
  -- creation"). A direct client UPDATE keeps the stored fee and the audit stamp,
  -- so a queued full-row upload from a device that still holds the regular fee
  -- (the INSERT ack returns only the id, so it is never reconciled) cannot write
  -- it back over the server-priced one. No client path edits entry_fee on an
  -- UPDATE (grep of the app: none); RPC / definer writers (refunds, move-up,
  -- withdraw) and service_role are not direct client writes and are unaffected.
  IF TG_OP = 'UPDATE' THEN
    NEW.junior_fee_override_by := OLD.junior_fee_override_by;
    NEW.entry_fee := OLD.entry_fee;
    RETURN NEW;
  END IF;

  v_override := NEW.junior_fee_override_by IS NOT NULL;
  NEW.junior_fee_override_by := NULL;

  IF NEW.show_id IS NULL OR NEW.class_id IS NULL THEN
    IF v_override THEN
      RAISE EXCEPTION 'a junior fee override needs a show and a class' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_priced
    FROM private.price_entry_fee(
      NEW.show_id, NEW.class_id, NEW.dog_id, NEW.handler_id,
      COALESCE(NEW.is_day_of_show, false), v_override
    );

  -- Only ever LOWERS the client's fee: a waived entry (fee 0) and any fee the
  -- desk already set below the junior fee stay as they are.
  IF v_priced.junior_fee_applied
     AND (NEW.entry_fee IS NULL OR v_priced.fee < NEW.entry_fee)
  THEN
    NEW.entry_fee := v_priced.fee;
  END IF;

  IF v_override AND v_priced.junior_fee_applied AND NEW.entry_fee = v_priced.fee THEN
    NEW.junior_fee_override_by := (
      SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid() LIMIT 1
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_entries_00_direct_write_gate ON public.entries;
CREATE TRIGGER trg_entries_00_direct_write_gate
  BEFORE INSERT OR UPDATE OF junior_fee_override_by, entry_fee ON public.entries
  FOR EACH ROW EXECUTE FUNCTION private.entries_direct_write_gate();

DROP TRIGGER IF EXISTS trg_entries_junior_fee ON public.entries;
CREATE TRIGGER trg_entries_junior_fee
  BEFORE INSERT OR UPDATE OF junior_fee_override_by, entry_fee ON public.entries
  FOR EACH ROW EXECUTE FUNCTION private.entries_apply_junior_fee();

REVOKE ALL ON FUNCTION private.entries_direct_write_gate() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.entries_apply_junior_fee() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- submit_show_entries
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_show_entries(p_show_id uuid, p_registration_id uuid, p_entries jsonb, p_submission_id uuid, p_payment_method text, p_payment jsonb DEFAULT NULL)
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
BEGIN
  SELECT s.start_date, s.club_id,
         s.entry_open_date, s.entry_close_date,
         COALESCE(
           (SELECT t.timezone
              FROM public.trials t
             WHERE t.show_id = s.id
             ORDER BY t.date NULLS LAST, t.id
             LIMIT 1),
           'America/New_York'
         )
  INTO   v_show_start, v_show_club_id,
         v_show_open, v_show_close, v_show_tz
  FROM   public.shows s
  WHERE  s.id = p_show_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'show % not found', p_show_id
      USING ERRCODE = '22023';
  END IF;

  -- MYK9-642 round 1. `trials.timezone` is plain text with no CHECK, so a bad
  -- value is storable, and `AT TIME ZONE <bad>` raises 22023 rather than
  -- degrading. The COALESCE above only covers NULL. Resolve the zone against
  -- pg_timezone_names ONCE, here, so every expression below -- the entry-open
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
    (SELECT n.name FROM pg_catalog.pg_timezone_names n WHERE n.name = v_show_tz),
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
  -- it below them buys nothing. The zone is validated against pg_timezone_names
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

    -- MYK9-878: the fee comes from the ONE pricing function (the day-of /
    -- pre-entry / class fee chain that used to live here moved into it
    -- verbatim, with its comments). It also decides whether this entry is
    -- charged the show's junior handler fee; see the header.
    SELECT * INTO v_priced
      FROM private.price_entry_fee(
        p_show_id, v_class_id, v_dog_id, v_handler_person_id,
        v_is_day_of_show, v_junior_override
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
      junior_fee_override_by
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
      CASE WHEN v_junior_override AND v_priced.junior_fee_applied THEN v_caller_person_id END
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

-- Explicit role decisions, restating the LIVE grants rather than inventing them
-- (matches 20260926214700_myk9_824_submit_entries_handler_defaults_to_owner.sql,
-- which last set them for this signature). CREATE OR REPLACE preserves
-- privileges, so these are a no-op against the current database and exist so
-- the grant decision is recorded with the definition.
REVOKE ALL ON FUNCTION public.submit_show_entries(uuid, uuid, jsonb, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_show_entries(uuid, uuid, jsonb, uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_show_entries(uuid, uuid, jsonb, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_show_entries(uuid, uuid, jsonb, uuid, text, jsonb) TO service_role;

-- Fail the push rather than ship a callable pricing oracle or a readable stamp.
DO $$
BEGIN
  IF has_function_privilege('anon', 'private.price_entry_fee(uuid, uuid, uuid, uuid, boolean, boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.price_entry_fee(uuid, uuid, uuid, uuid, boolean, boolean)', 'EXECUTE')
     OR has_function_privilege('service_role', 'private.price_entry_fee(uuid, uuid, uuid, uuid, boolean, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'an API role can execute private.price_entry_fee; it must not';
  END IF;
  IF has_column_privilege('anon', 'public.entries', 'junior_fee_override_by', 'SELECT')
     OR has_column_privilege('authenticated', 'public.entries', 'junior_fee_override_by', 'SELECT') THEN
    RAISE EXCEPTION 'entries.junior_fee_override_by is readable by an API role; it must not be';
  END IF;
END $$;

COMMIT;
