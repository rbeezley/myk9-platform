-- MYK9-1634: the database owns an entry form's total and its payment status.
-- Plan: docs/plan-enrollment-total-owned-by-db.md (supersedes the closed PR #3509).
--
-- THE BUG. enrollments.total_amount (cents) is what a form owes: the footer "$X due", the
-- MYK9-1600 checklist and "Paid in full" (record_enrollment_payment with amount NULL charges
-- total - net received) all read it. Three places decided it, each with its own rules:
--   * submit_show_entries grew it only when the submission carried a received payment;
--   * otherwise the client grew it, and set payment_status / paid_amount from it, in a SECOND
--     write after the RPC returned, so a closed tab left entries the total never counted;
--   * Stripe checkout overwrote it with the charge.
-- Nothing ever subtracted: soft_delete_entry and the soft_delete_dog cascade left a deleted
-- entry's fee in "$X due" and in "Paid in full".
--
-- ONE DEFINITION. A form's total is the sum of entry_fee over its entries that are not
-- deleted and not waived (entries.payment_status = 'waived'; owner decision 2026-11-01:
-- waived never counts, and the entry keeps its normal fee for the record). Triggers keep it
-- so; nothing else can set it:
--   * AFTER on entries: an insert, a delete, or a change of entry_fee, deletion, form or
--     waived-ness recomputes the total of every form the row was or is on;
--   * BEFORE on enrollments: any INSERT, or an UPDATE naming total_amount or
--     payment_reference, has total_amount replaced by the derived figure, so a stale client's
--     write is harmless.
--
-- STRIPE FORMS keep the Stripe charge (confirm_successful_checkout_enrollments writes it,
-- processing fees included). Recognised on the server only, by EITHER marker:
--   * a captured stripe_orders row (any status but pending/failed/canceled/cancelled/expired,
--     so a later 'refunded' still counts) linked by enrollment_id or covering one of the
--     form's entries via entry_ids: permanent, and nothing a desk payment or an exhibitor
--     can write;
--   * payment_reference 'pi_...', present from the checkout INSERT itself, before the order
--     row is linked. A desk payment may later overwrite it with a check number
--     (record_enrollment_payment_core), which is why the order marker must also hold.
-- payment_method is NOT a marker: it defaults to 'online' on every row.
--
-- STATUS, in one direction. When a form's total GROWS (an add-on, a restore, a re-price up,
-- an entry moved in) and the net received no longer covers it, a settled form ('paid',
-- 'paid_by_cash', 'paid_by_check', 'waived') becomes 'pending'. Growth only, so an unrelated
-- entry edit never flips a 'partial_refund' form; a shrinking total never promotes a status
-- ("Paid in full" at $0 settles it, and a form holding more than it owes is a person's
-- call: no refund is ever automatic). restrict_payment_status_update accepts exactly that
-- derived change from an unprivileged caller, because an exhibitor's own add-on runs this
-- trigger inside the exhibitor's request. The guard cannot tell that from the exhibitor's
-- own PATCH, so an exhibitor may also reopen their own settled form while it truly owes
-- more than it holds: the state it should be in, with no money moved.
--
-- SUBMISSION STATUS moves into submit_show_entries, atomic with the entry insert, replacing
-- the client's second write: a received payment goes through the ledger as before;
-- secretary_paid / group_payment record the money on the form; a waived submission makes a
-- form that owes and holds nothing 'waived' (a waived add-on elsewhere is money-neutral);
-- any other method is recorded while the form is pending.
--
-- CONCURRENCY. Changing an entry locks its row and then its form's row, while
-- record_enrollment_payment locks the form and then its entries. A delete and a payment on
-- the same form at the same instant can deadlock; Postgres aborts one with 40P01, a
-- retryable error that writes nothing. So can two concurrent multi-row statements whose
-- rows reach the same two forms in opposite order (a soft_delete_dog cascade). Accepted:
-- rare, and nothing is written wrong. Two changes to entries of one form serialise on the
-- form lock (NO KEY UPDATE, so concurrent inserts queue rather than deadlock on their
-- foreign-key locks), and the second sums both. A bulk statement rewrites each form's total
-- once per entry it touches, which is fine at tens of entries per form.
--
-- MONEY. The backfill changes total_amount only. Nothing here creates or queues a refund or
-- changes paid_amount, except submit_show_entries recording a secretary_paid / group_payment
-- submission, which the client used to record.

CREATE OR REPLACE FUNCTION private.enrollment_owed_cents(p_enrollment_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(round(sum(e.entry_fee) * 100), 0)::integer
    FROM public.entries e
   WHERE e.registration_id = p_enrollment_id
     AND e.deleted_at IS NULL
     AND e.payment_status IS DISTINCT FROM 'waived';
$$;

COMMENT ON FUNCTION private.enrollment_owed_cents(uuid) IS
  'MYK9-1634: what an entry form owes (cents): the sum of entry_fee over its entries that are not deleted and not waived.';

CREATE OR REPLACE FUNCTION private.enrollment_total_is_stripe(
  p_enrollment_id uuid,
  p_payment_reference text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(p_payment_reference LIKE 'pi\_%', false)
      OR EXISTS (
           SELECT 1
             FROM public.stripe_orders o
            WHERE o.status NOT IN ('pending', 'failed', 'canceled', 'cancelled', 'expired')
              AND (o.enrollment_id = p_enrollment_id
                   OR o.entry_ids && ARRAY(SELECT e.id FROM public.entries e
                                            WHERE e.registration_id = p_enrollment_id)));
$$;

COMMENT ON FUNCTION private.enrollment_total_is_stripe(uuid, text) IS
  'MYK9-1634: a form paid by online checkout (a captured Stripe order covers it, or its payment_reference is the Stripe intent) keeps the Stripe charge as its total.';

-- BEFORE INSERT / UPDATE on enrollments: no writer can set a mail-in form's total.
CREATE OR REPLACE FUNCTION private.enrollments_derive_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.enrollment_total_is_stripe(NEW.id, NEW.payment_reference) THEN
    NEW.total_amount := private.enrollment_owed_cents(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Named to sort before trg_restrict_payment_status, so the guard sees the derived total.
CREATE TRIGGER trg_enrollments_derive_total
  BEFORE INSERT OR UPDATE OF total_amount, payment_reference ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION private.enrollments_derive_total();

-- AFTER on entries: keep each touched mail-in form's total equal to what it owes, and
-- reopen a settled form the change left owing.
CREATE OR REPLACE FUNCTION private.entries_refresh_enrollment_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_old integer;
  v_new integer;
  v_status text;
  v_reference text;
  v_net_cents numeric;
BEGIN
  FOR v_id IN
    SELECT DISTINCT x
      FROM unnest(CASE TG_OP
                    WHEN 'INSERT' THEN ARRAY[NEW.registration_id]
                    WHEN 'DELETE' THEN ARRAY[OLD.registration_id]
                    ELSE ARRAY[OLD.registration_id, NEW.registration_id]
                  END) AS x
     WHERE x IS NOT NULL
     ORDER BY x
  LOOP
    -- Lock the form BEFORE summing (ids in order, so a move between two forms cannot
    -- deadlock with itself). NO KEY UPDATE, not UPDATE: an entry INSERT already holds KEY
    -- SHARE on its form from the foreign-key check, which FOR UPDATE would wait on, so two
    -- concurrent inserts onto one form would deadlock; NO KEY UPDATE queues them instead. Under READ COMMITTED the sum below then sees every entry
    -- change committed before the lock was granted.
    SELECT en.total_amount, en.payment_status, en.payment_reference,
           (COALESCE(en.paid_amount, 0) - COALESCE(en.refund_amount, 0)) * 100
      INTO v_old, v_status, v_reference, v_net_cents
      FROM public.enrollments en
     WHERE en.id = v_id
       FOR NO KEY UPDATE;

    -- A form deleted with its entries, or a Stripe form, is left alone.
    IF NOT FOUND OR private.enrollment_total_is_stripe(v_id, v_reference) THEN
      CONTINUE;
    END IF;

    v_new := private.enrollment_owed_cents(v_id);
    IF v_new IS DISTINCT FROM v_old THEN
      UPDATE public.enrollments en
         SET total_amount = v_new,
             payment_status = CASE
               WHEN v_new > COALESCE(v_old, 0)
                AND v_net_cents < v_new
                AND v_status IN ('paid', 'paid_by_cash', 'paid_by_check', 'waived')
               THEN 'pending'
               ELSE en.payment_status
             END
       WHERE en.id = v_id;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_entries_refresh_enrollment_total
  AFTER INSERT OR DELETE ON public.entries
  FOR EACH ROW EXECUTE FUNCTION private.entries_refresh_enrollment_total();

-- Every UPDATE, not UPDATE OF <columns>: that list matches only the columns the statement
-- names, and Comp / Undo Comp write `comped` while trg_entries_comp_payment_status (BEFORE)
-- moves payment_status to or from 'waived'. The WHEN clause reads NEW after the BEFORE
-- triggers, so it sees that change; the ledger's entries cascade (pending -> paid) and
-- every other edit that changes neither fee, deletion, form nor waived-ness skip it.
CREATE TRIGGER trg_entries_refresh_enrollment_total_on_update
  AFTER UPDATE ON public.entries
  FOR EACH ROW
  WHEN (NEW.entry_fee IS DISTINCT FROM OLD.entry_fee
        OR (NEW.deleted_at IS NULL) <> (OLD.deleted_at IS NULL)
        OR NEW.registration_id IS DISTINCT FROM OLD.registration_id
        OR (NEW.payment_status IS DISTINCT FROM 'waived')
           <> (OLD.payment_status IS DISTINCT FROM 'waived'))
  EXECUTE FUNCTION private.entries_refresh_enrollment_total();

-- The status guard, from its live definition, plus the one change the database derives.
CREATE OR REPLACE FUNCTION public.restrict_payment_status_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Allow service_role (edge functions, Stripe webhooks) to bypass
    IF (SELECT current_setting('role', true)) = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- Allow platform_admin and site_admin to bypass
    IF (SELECT is_platform_admin()) THEN
        RETURN NEW;
    END IF;

    -- Allow secretaries to bypass
    IF (SELECT has_role('secretary'::text)) THEN
        RETURN NEW;
    END IF;

    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
        -- MYK9-1634: an exhibitor's own add-on onto a settled form reopens it in
        -- private.entries_refresh_enrollment_total(), inside the exhibitor's request.
        -- That one change is allowed: settled -> 'pending' on a mail-in form whose total
        -- (already derived by trg_enrollments_derive_total) exceeds the net received.
        -- It is the state the database derives for that form, and moves no money.
        IF NEW.payment_status = 'pending'
           AND OLD.payment_status IN ('paid', 'paid_by_cash', 'paid_by_check', 'waived')
           AND NOT private.enrollment_total_is_stripe(NEW.id, NEW.payment_reference)
           AND COALESCE(NEW.total_amount, 0)
               > (COALESCE(NEW.paid_amount, 0) - COALESCE(NEW.refund_amount, 0)) * 100 THEN
            RETURN NEW;
        END IF;

        -- Block any other attempt to change payment_status by unprivileged users
        RAISE EXCEPTION 'payment_status can only be modified by the service role, a platform admin, or a secretary';
    END IF;

    RETURN NEW;
END;
$function$;

-- submit_show_entries, from its latest definition (20261028024100); the only change is the
-- block after the entry loop (MYK9-1634).
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

  -- MYK9-1634: the form's total is the database's. trg_entries_refresh_enrollment_total
  -- recomputed it as each entry above was inserted (waived entries never count) and
  -- reopened a settled form the add-on left owing. What is left is the submission's own
  -- status, decided here in the same transaction instead of a second client write.
  IF p_registration_id IS NOT NULL AND cardinality(v_entry_pairs) > 0 THEN
    IF p_payment IS NOT NULL THEN
      -- MYK9-677: the created entries' server fees are the amount received. The ledger
      -- core records the payment and moves paid_amount and payment_status once. Keyed on
      -- the submission id, so the replay branch above (which returns the stored result
      -- before reaching this) and a direct retry of the key can never record it twice.
      IF v_created_cents > 0 THEN
        UPDATE public.enrollments
           SET payment_method = v_pay_method,
               updated_at = now()
         WHERE id = p_registration_id;

        PERFORM private.record_enrollment_payment_core(
          p_registration_id, 'payment', v_created_cents / 100.0, v_pay_method, v_pay_received_on,
          NULLIF(btrim(p_payment->>'reference'), ''), NULL, p_submission_id
        );
      END IF;
    ELSIF p_payment_method IN ('secretary_paid', 'group_payment') THEN
      -- Paid outside the desk ledger (the entries above went in as 'paid'): the form
      -- records the money, and is paid once the net received covers what it owes.
      UPDATE public.enrollments en
         SET paid_amount = COALESCE(en.paid_amount, 0) + v_created_cents / 100.0,
             payment_status = CASE
               WHEN (COALESCE(en.paid_amount, 0) + v_created_cents / 100.0
                     - COALESCE(en.refund_amount, 0)) * 100 >= COALESCE(en.total_amount, 0)
               THEN 'paid'
               ELSE 'pending'
             END,
             payment_method = p_payment_method,
             updated_at = now()
       WHERE en.id = p_registration_id;
    ELSIF p_payment_method = 'waived' THEN
      -- A form that owes nothing and holds nothing is waived. A waived add-on onto a form
      -- with money or fees is money-neutral: nothing about the form changes.
      UPDATE public.enrollments en
         SET payment_status = 'waived',
             payment_method = 'waived',
             updated_at = now()
       WHERE en.id = p_registration_id
         AND en.payment_status = 'pending'
         AND COALESCE(en.total_amount, 0) = 0
         AND COALESCE(en.paid_amount, 0) - COALESCE(en.refund_amount, 0) = 0;
    ELSE
      -- How the exhibitor will pay, recorded while the form still owes. A settled form's
      -- method says how its money arrived and is not relabelled.
      UPDATE public.enrollments en
         SET payment_method = p_payment_method,
             updated_at = now()
       WHERE en.id = p_registration_id
         AND en.payment_status = 'pending'
         AND en.payment_method IS DISTINCT FROM p_payment_method;
    END IF;
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


-- Grants as live today (CREATE OR REPLACE preserves them; restated so this migration, now
-- the latest definition, carries the decision).
REVOKE ALL ON FUNCTION public.submit_show_entries(uuid, uuid, jsonb, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_show_entries(uuid, uuid, jsonb, uuid, text, jsonb) TO authenticated, service_role;

-- The status guard is a trigger function; its live ACL is postgres + service_role only.
REVOKE ALL ON FUNCTION public.restrict_payment_status_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restrict_payment_status_update() TO service_role;

REVOKE ALL ON FUNCTION private.enrollment_owed_cents(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.enrollment_total_is_stripe(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.enrollments_derive_total() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.entries_refresh_enrollment_total() FROM PUBLIC, anon, authenticated;

-- The order marker's entry_ids overlap test, served by an index rather than a scan.
CREATE INDEX IF NOT EXISTS idx_stripe_orders_entry_ids_gin
  ON public.stripe_orders USING gin (entry_ids);

-- Backfill: every mail-in form whose stored total differs from what it owes. total_amount
-- only (trg_enrollments_derive_total computes the value): no status, no paid amount, no
-- refund. Forms left holding more than they owe are for a person (MYK9-1634 comments).
UPDATE public.enrollments en
   SET total_amount = private.enrollment_owed_cents(en.id)
 WHERE NOT private.enrollment_total_is_stripe(en.id, en.payment_reference)
   AND en.total_amount IS DISTINCT FROM private.enrollment_owed_cents(en.id);
