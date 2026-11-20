-- MYK9-2303: refunds the club settles itself, recorded on the entry.
--
-- Once a show's payout is `completed` the platform no longer holds the money, so
-- stripe-refund-entry refuses (payout_already_sent) and the club pays the exhibitor
-- directly (check, cash, other). Today that leaves no record anywhere: the Financial
-- Report still counts the money as retained and the refund-to-decide rule never
-- resolves. This migration adds the record.
--
--   * public.club_settled_refunds: an append-only ledger. A payment is a positive row;
--     a mistake is fixed by a reversing negative row (reverses_id, UNIQUE so a row is
--     reversed once), never an edit. Rows are never updated or deleted.
--   * entries.club_refunded_amount: the net of the entry's ledger rows, cached so every
--     reader that already loads entries (the replicated cache, reports, refund-to-decide)
--     gets it with no second read. Written only in the transaction that writes the
--     ledger row; a guard trigger refuses every other writer.
--   * record_club_settled_refund / reverse_club_settled_refund: the only writers.
--
-- Deliberately untouched: entries.refund_amount / refund_notes / refunded_at (Stripe
-- refunds, service role only), restrict_entry_refund_columns, show_payouts and the
-- payout math. The platform payout is a historical fact and never moves.
--
-- Refunds are never automatic: this records money a person already paid out of the
-- club's own account. It calls nothing at Stripe.
--
-- Plan: docs/plan-club-settled-refunds.md

-- ---------------------------------------------------------------------------
-- ledger
-- ---------------------------------------------------------------------------

CREATE TABLE public.club_settled_refunds (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id          uuid NOT NULL REFERENCES public.shows(id) ON DELETE RESTRICT,
  entry_id         uuid NOT NULL REFERENCES public.entries(id) ON DELETE RESTRICT,
  amount           numeric(10, 2) NOT NULL,
  reverses_id      uuid REFERENCES public.club_settled_refunds(id) ON DELETE RESTRICT,
  paid_on          date,
  method           text,
  reference        text,
  note             text,
  recorded_by      uuid,
  client_refund_id uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_settled_refunds_reverses_id_key UNIQUE (reverses_id),
  CONSTRAINT club_settled_refunds_client_refund_id_key UNIQUE (client_refund_id),
  CONSTRAINT club_settled_refunds_method_check
    CHECK (method IS NULL OR method IN ('check', 'cash', 'other')),
  CONSTRAINT club_settled_refunds_shape CHECK (
    (amount > 0 AND reverses_id IS NULL AND paid_on IS NOT NULL AND method IS NOT NULL)
    OR
    (amount < 0 AND reverses_id IS NOT NULL AND paid_on IS NULL AND method IS NULL)
  )
);

CREATE INDEX club_settled_refunds_entry_id_idx ON public.club_settled_refunds (entry_id);
CREATE INDEX club_settled_refunds_show_id_idx ON public.club_settled_refunds (show_id);

COMMENT ON TABLE public.club_settled_refunds IS
  'MYK9-2303: refunds a club paid an exhibitor directly after the show payout completed. Append-only: a payment is a positive row, a mistake is a negative reversing row (reverses_id). Written only by record_club_settled_refund() and reverse_club_settled_refund(). Never touches Stripe, entries.refund_amount or show_payouts.';
COMMENT ON COLUMN public.club_settled_refunds.amount IS
  'Dollars. Positive: money the club paid back. Negative: a reversal of reverses_id (exactly minus the original).';
COMMENT ON COLUMN public.club_settled_refunds.recorded_by IS
  'people.id of the caller (get_my_person_id()). Not auth.uid().';
COMMENT ON COLUMN public.club_settled_refunds.client_refund_id IS
  'Client-generated retry key: the same key again returns the row already written instead of writing a second one.';

-- Rows are never updated or deleted, not even by service_role.
CREATE OR REPLACE FUNCTION private.club_settled_refunds_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'club_settled_refunds is append-only; record a reversal instead'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION private.club_settled_refunds_append_only() FROM PUBLIC;

CREATE TRIGGER club_settled_refunds_append_only
  BEFORE UPDATE OR DELETE ON public.club_settled_refunds
  FOR EACH ROW EXECUTE FUNCTION private.club_settled_refunds_append_only();

-- Who may read: the same predicate as show_payouts_select (site admin, the show's
-- secretary, the show's club admin).
ALTER TABLE public.club_settled_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_settled_refunds FORCE ROW LEVEL SECURITY;

CREATE POLICY club_settled_refunds_select ON public.club_settled_refunds
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR EXISTS (
      SELECT 1 FROM public.shows s
      WHERE s.id = club_settled_refunds.show_id
        AND (public.is_club_admin(s.club_id) OR public.is_show_secretary(s.id))
    )
  );

-- Default privileges hand anon AND authenticated full CRUD (+TRUNCATE etc.) on a new
-- table (MYK9-93) and a GRANT never narrows, so revoke first, then grant exactly this.
REVOKE ALL ON public.club_settled_refunds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.club_settled_refunds TO authenticated;
GRANT ALL ON public.club_settled_refunds TO service_role;

-- ---------------------------------------------------------------------------
-- entries.club_refunded_amount + write guard
-- ---------------------------------------------------------------------------

ALTER TABLE public.entries
  ADD COLUMN club_refunded_amount numeric(10, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.entries.club_refunded_amount IS
  'MYK9-2303: net dollars the club paid this entry''s exhibitor directly after the payout (sum of club_settled_refunds rows). Written only by the club settled refund RPCs or service role. Separate from refund_amount, which is the Stripe refund.';

-- Model: restrict_entry_refund_columns (20260609220000). The entries_update RLS policy
-- gives managers full-row UPDATE through PostgREST, which would let the cached total
-- drift from its ledger. Only the RPCs (which set the transaction-local flag around
-- their one UPDATE, as set_club_authorization does) and service role may change it.
CREATE OR REPLACE FUNCTION private.restrict_entry_club_refunded_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT current_setting('role', true)) = 'service_role'
     OR (SELECT current_setting('myk9.club_settled_refund_write', true)) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.club_refunded_amount <> 0 THEN
      RAISE EXCEPTION 'club_refunded_amount is written only by the club settled refund functions';
    END IF;
  ELSIF NEW.club_refunded_amount IS DISTINCT FROM OLD.club_refunded_amount THEN
    RAISE EXCEPTION 'club_refunded_amount is written only by the club settled refund functions';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.restrict_entry_club_refunded_amount() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_restrict_entry_club_refunded_amount_update ON public.entries;
CREATE TRIGGER trg_restrict_entry_club_refunded_amount_update
  BEFORE UPDATE OF club_refunded_amount ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION private.restrict_entry_club_refunded_amount();

DROP TRIGGER IF EXISTS trg_restrict_entry_club_refunded_amount_insert ON public.entries;
CREATE TRIGGER trg_restrict_entry_club_refunded_amount_insert
  BEFORE INSERT ON public.entries
  FOR EACH ROW
  WHEN (NEW.club_refunded_amount <> 0)
  EXECUTE FUNCTION private.restrict_entry_club_refunded_amount();

-- ---------------------------------------------------------------------------
-- authorization: the same three checks stripe-refund-entry makes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.can_settle_club_refund(p_show_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT public.is_site_admin())
      OR (SELECT public.is_show_secretary(p_show_id))
      OR EXISTS (
        SELECT 1 FROM public.shows s
        WHERE s.id = p_show_id
          AND s.club_id IS NOT NULL
          AND (SELECT public.is_club_admin(s.club_id))
      );
$$;

REVOKE ALL ON FUNCTION private.can_settle_club_refund(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- record_club_settled_refund
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_club_settled_refund(
  p_entry_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_method text,
  p_reference text,
  p_note text,
  p_client_refund_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry   public.entries%ROWTYPE;
  v_row     public.club_settled_refunds%ROWTYPE;
  v_balance numeric;
  v_total   numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'P0001';
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('check', 'cash', 'other') THEN
    RAISE EXCEPTION 'invalid_method' USING ERRCODE = 'P0001';
  END IF;

  -- Lock the entry first: two concurrent records (or a record and a retry) serialize
  -- here, so the cap and the retry check below read settled state.
  SELECT * INTO v_entry FROM public.entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR v_entry.show_id IS NULL THEN
    RAISE EXCEPTION 'entry_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- SECURITY DEFINER drops RLS, so the predicate is restated here. Checked before the
  -- retry lookup so a stranger holding a key learns nothing about the row.
  IF NOT private.can_settle_club_refund(v_entry.show_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';
  END IF;

  -- Retry: the same key for this entry returns the row already written; another
  -- entry's key, or a reversal's key, is a conflict.
  IF p_client_refund_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.club_settled_refunds
     WHERE client_refund_id = p_client_refund_id;
    IF FOUND THEN
      IF v_row.entry_id <> p_entry_id OR v_row.reverses_id IS NOT NULL THEN
        RAISE EXCEPTION 'retry_key_conflict' USING ERRCODE = 'P0001';
      END IF;
      RETURN to_jsonb(v_row) || jsonb_build_object('club_refunded_amount', v_entry.club_refunded_amount);
    END IF;
  END IF;

  IF v_entry.payment_method IS DISTINCT FROM 'online' OR v_entry.stripe_payment_intent_id IS NULL THEN
    RAISE EXCEPTION 'not_card_paid' USING ERRCODE = 'P0001';
  END IF;

  -- Only a completed payout means the club holds the money. Absent, pending,
  -- processing and failed are all refused.
  IF NOT EXISTS (
    SELECT 1 FROM public.show_payouts sp
     WHERE sp.show_id = v_entry.show_id AND sp.status = 'completed'
  ) THEN
    RAISE EXCEPTION 'payout_not_completed' USING ERRCODE = 'P0001';
  END IF;

  -- Stripe refunds from either path are already in refund_amount.
  v_balance := (COALESCE(v_entry.entry_fee, 0) - COALESCE(v_entry.discount_amount, 0))
               - COALESCE(v_entry.refund_amount, 0)
               - v_entry.club_refunded_amount;
  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'amount_exceeds_balance' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.club_settled_refunds (
    show_id, entry_id, amount, paid_on, method, reference, note, recorded_by, client_refund_id
  )
  VALUES (
    v_entry.show_id, v_entry.id, p_amount, COALESCE(p_paid_on, CURRENT_DATE), p_method,
    NULLIF(btrim(p_reference), ''), NULLIF(btrim(p_note), ''),
    public.get_my_person_id(), p_client_refund_id
  )
  RETURNING * INTO v_row;

  -- The one sanctioned path through restrict_entry_club_refunded_amount(): open the
  -- flag only for this UPDATE, then close it (transaction-local either way).
  PERFORM set_config('myk9.club_settled_refund_write', 'on', true);
  UPDATE public.entries
     SET club_refunded_amount = club_refunded_amount + p_amount
   WHERE id = v_entry.id
  RETURNING club_refunded_amount INTO v_total;
  PERFORM set_config('myk9.club_settled_refund_write', '', true);

  RETURN to_jsonb(v_row) || jsonb_build_object('club_refunded_amount', v_total);
END;
$$;

COMMENT ON FUNCTION public.record_club_settled_refund(uuid, numeric, date, text, text, text, uuid) IS
  'MYK9-2303: records money the club paid an exhibitor directly after the show payout completed. Caller must be the show''s secretary, its club admin or a site admin. The entry must be card-paid, the show''s payout completed, and the amount within (entry_fee - discount_amount) - refund_amount - club_refunded_amount. Retry-safe on p_client_refund_id. Returns the ledger row plus the entry''s new club_refunded_amount. Refusals are P0001 with a stable code as the message.';

REVOKE ALL ON FUNCTION public.record_club_settled_refund(uuid, numeric, date, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_club_settled_refund(uuid, numeric, date, text, text, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- reverse_club_settled_refund
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reverse_club_settled_refund(
  p_refund_id uuid,
  p_note text,
  p_client_refund_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orig  public.club_settled_refunds%ROWTYPE;
  v_entry public.entries%ROWTYPE;
  v_row   public.club_settled_refunds%ROWTYPE;
  v_total numeric;
BEGIN
  SELECT * INTO v_orig FROM public.club_settled_refunds WHERE id = p_refund_id;
  -- A missing row and a reversal row look the same: neither can be reversed.
  IF NOT FOUND OR v_orig.reverses_id IS NOT NULL THEN
    RAISE EXCEPTION 'not_reversible' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_entry FROM public.entries WHERE id = v_orig.entry_id FOR UPDATE;
  IF NOT FOUND OR v_entry.show_id IS NULL THEN
    RAISE EXCEPTION 'entry_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF NOT private.can_settle_club_refund(v_entry.show_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';
  END IF;

  IF p_client_refund_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.club_settled_refunds
     WHERE client_refund_id = p_client_refund_id;
    IF FOUND THEN
      IF v_row.reverses_id IS DISTINCT FROM p_refund_id THEN
        RAISE EXCEPTION 'retry_key_conflict' USING ERRCODE = 'P0001';
      END IF;
      RETURN to_jsonb(v_row) || jsonb_build_object('club_refunded_amount', v_entry.club_refunded_amount);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.club_settled_refunds WHERE reverses_id = p_refund_id) THEN
    RAISE EXCEPTION 'already_reversed' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.show_payouts sp
     WHERE sp.show_id = v_entry.show_id AND sp.status = 'completed'
  ) THEN
    RAISE EXCEPTION 'payout_not_completed' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.club_settled_refunds (
    show_id, entry_id, amount, reverses_id, note, recorded_by, client_refund_id
  )
  VALUES (
    v_orig.show_id, v_orig.entry_id, -v_orig.amount, v_orig.id,
    NULLIF(btrim(p_note), ''), public.get_my_person_id(), p_client_refund_id
  )
  RETURNING * INTO v_row;

  PERFORM set_config('myk9.club_settled_refund_write', 'on', true);
  UPDATE public.entries
     SET club_refunded_amount = club_refunded_amount + v_row.amount
   WHERE id = v_entry.id
  RETURNING club_refunded_amount INTO v_total;
  PERFORM set_config('myk9.club_settled_refund_write', '', true);

  RETURN to_jsonb(v_row) || jsonb_build_object('club_refunded_amount', v_total);
END;
$$;

COMMENT ON FUNCTION public.reverse_club_settled_refund(uuid, text, uuid) IS
  'MYK9-2303: fixes a mistaken club settled refund by inserting a negative row that reverses it (never an edit) and lowering entries.club_refunded_amount, which restores the entry''s available balance. The original must be a payment not already reversed. Same caller rules and retry key as record_club_settled_refund().';

REVOKE ALL ON FUNCTION public.reverse_club_settled_refund(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_club_settled_refund(uuid, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- The two entry read views carry club_refunded_amount, so the replicated cache (and
-- the Financial Report, close-out and refund-to-decide readers that use it) sees
-- the figure. Copied verbatim from 20261116041700_myk9_2068_element_and_area5_time.sql
-- (the latest definition of both) with the column appended LAST; security_invoker =
-- false carried inline (CREATE OR REPLACE VIEW resets reloptions); ACLs are preserved
-- by CREATE OR REPLACE. The inner view comment is restated with one added sentence.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.view_authenticated_entry_results
  WITH (security_invoker = false)
AS
WITH caller_context AS MATERIALIZED (
  -- MYK9-1757: explicit columns (the view lint bans SELECT * in a new view migration); these are
  -- the 13 columns the function returns (20260830240000, its latest definition).
  SELECT
    c.auth_user_id,
    c.person_id,
    c.is_site_admin,
    c.has_manager_role,
    c.managed_club_ids,
    c.managed_show_ids,
    c.assigned_class_ids,
    c.steward_show_ids,
    c.steward_club_ids,
    c.claim_kind,
    c.claim_show_id,
    c.claim_role,
    c.claim_generation_current
  FROM private.entry_results_caller_context() AS c
),
-- MYK9-1369: the shows where the caller has a live, non-withdrawn entry as
-- handler, dog owner or dog co-owner. Depends on caller_context only, and
-- MATERIALIZED guarantees one evaluation per query. Three UNION ALL arms, one
-- per role, so each is an index lookup on the caller's own rows
-- (entries_active_handler_id_idx; dogs_owner_id_idx / dogs_co_owner_id_idx ->
-- entries_active_dog_id_idx) rather than an OR across the join, which would
-- scan every live entry on the platform. The union is the same set the old
-- `handler OR own_dog.owner OR own_dog.co_owner` over entries LEFT JOIN dogs
-- admitted: an entry with no dog row can match only through its handler arm.
exhibitor_shows AS MATERIALIZED (
  SELECT COALESCE(
    (
      SELECT array_agg(DISTINCT own.show_id)
      FROM (
        SELECT own_e.show_id
        FROM public.entries own_e
        WHERE own_e.handler_id = ctx0.person_id
          AND own_e.deleted_at IS NULL
          AND own_e.entry_status NOT IN ('withdrawn', 'scratched')
        UNION ALL
        SELECT own_e.show_id
        FROM public.dogs own_dog
        JOIN public.entries own_e ON own_e.dog_id = own_dog.id
        WHERE own_dog.owner_id = ctx0.person_id
          AND own_e.deleted_at IS NULL
          AND own_e.entry_status NOT IN ('withdrawn', 'scratched')
        UNION ALL
        SELECT own_e.show_id
        FROM public.dogs own_dog
        JOIN public.entries own_e ON own_e.dog_id = own_dog.id
        WHERE own_dog.co_owner_id = ctx0.person_id
          AND own_e.deleted_at IS NULL
          AND own_e.entry_status NOT IN ('withdrawn', 'scratched')
      ) own
    ),
    ARRAY[]::uuid[]
  ) AS show_ids
  FROM caller_context ctx0
)
SELECT
  e.id,
  e.dog_id,
  e.class_id,
  e.show_id,
  e.trial_id,
  e.handler_id,
  e.entry_status,
  CASE WHEN access.can_view_admin THEN e.payment_status END AS payment_status,
  e.handler,
  (CASE WHEN access.can_view_admin THEN e.entry_fee END)::numeric(10,2) AS entry_fee,
  e.submitted_at,
  CASE WHEN access.can_view_admin THEN e.special_requests END AS special_requests,
  e.armband,
  e.run_order,
  e.jump_height,
  e.preferred_judge,
  e.move_up_requested,
  e.is_scored,
  e.is_in_ring,
  CASE WHEN access.can_view_scores OR vis.qualification_visible THEN e.result_status END AS result_status,
  e.ring_entry_time,
  e.ring_exit_time,
  e.scoring_started_at,
  e.scoring_completed_at,
  CASE WHEN access.can_view_scores OR vis.time_visible THEN e.search_time_seconds END AS search_time_seconds,
  CASE WHEN access.can_view_scores THEN e.area1_time_seconds END AS area1_time_seconds,
  CASE WHEN access.can_view_scores THEN e.area2_time_seconds END AS area2_time_seconds,
  CASE WHEN access.can_view_scores THEN e.area3_time_seconds END AS area3_time_seconds,
  CASE WHEN access.can_view_scores THEN e.area4_time_seconds END AS area4_time_seconds,
  CASE WHEN access.can_view_scores THEN e.total_correct_finds END AS total_correct_finds,
  CASE WHEN access.can_view_scores THEN e.total_incorrect_finds END AS total_incorrect_finds,
  CASE WHEN access.can_view_scores OR vis.faults_visible THEN e.total_faults END AS total_faults,
  CASE WHEN access.can_view_scores THEN e.no_finish_count END AS no_finish_count,
  CASE WHEN access.can_view_scores THEN e.area1_correct END AS area1_correct,
  CASE WHEN access.can_view_scores THEN e.area1_incorrect END AS area1_incorrect,
  CASE WHEN access.can_view_scores THEN e.area1_faults END AS area1_faults,
  CASE WHEN access.can_view_scores THEN e.area2_correct END AS area2_correct,
  CASE WHEN access.can_view_scores THEN e.area2_incorrect END AS area2_incorrect,
  CASE WHEN access.can_view_scores THEN e.area2_faults END AS area2_faults,
  CASE WHEN access.can_view_scores THEN e.area3_correct END AS area3_correct,
  CASE WHEN access.can_view_scores THEN e.area3_incorrect END AS area3_incorrect,
  CASE WHEN access.can_view_scores THEN e.area3_faults END AS area3_faults,
  CASE WHEN access.can_view_scores OR vis.time_visible THEN e.total_score END AS total_score,
  CASE WHEN access.can_view_scores THEN e.points_earned END AS points_earned,
  CASE WHEN access.can_view_scores THEN e.points_possible END AS points_possible,
  CASE WHEN access.can_view_scores THEN e.bonus_points END AS bonus_points,
  CASE WHEN access.can_view_scores THEN e.penalty_points END AS penalty_points,
  CASE WHEN access.can_view_scores THEN e.time_over_limit END AS time_over_limit,
  CASE WHEN access.can_view_scores THEN e.time_limit_exceeded_seconds END AS time_limit_exceeded_seconds,
  CASE WHEN access.can_view_scores OR vis.placement_visible THEN e.final_placement END AS final_placement,
  CASE WHEN access.can_view_scores THEN e.judge_notes END AS judge_notes,
  CASE WHEN access.can_view_scores THEN e.judge_signature END AS judge_signature,
  CASE WHEN access.can_view_scores THEN e.judge_signature_timestamp END AS judge_signature_timestamp,
  CASE WHEN access.can_view_scores THEN e.disqualification_reason END AS disqualification_reason,
  CASE WHEN access.can_view_scores THEN e.has_video_review END AS has_video_review,
  CASE WHEN access.can_view_scores THEN e.video_review_notes END AS video_review_notes,
  e.license_key,
  e.local_id,
  e.sync_version,
  e.last_synced_at,
  e.created_at,
  GREATEST(
    e.updated_at,
    c.updated_at,
    sh.updated_at,
    show_vis.updated_at,
    trial_vis.updated_at,
    class_vis.updated_at,
    -- MYK9-969: every input to the privacy mask moves the row (see the
    -- header's input table): tied people's profiles and people rows, the
    -- dog's ownership, and the one-time epoch of this migration.
    consent.profiles_updated_at,
    d.updated_at,
    (SELECT max(epoch.updated_at) FROM private.results_privacy_epoch epoch),
    -- MYK9-1476: the caller's own role set is an input to the mask too
    -- (can_view_scores, steward, club-manager arms read user_roles). A grant,
    -- revoke, deactivation, hard delete or expiry moves every row THIS caller
    -- reads and no other caller's; see private.entry_results_caller_access_epoch().
    (SELECT private.entry_results_caller_access_epoch()),
    -- MYK9-1162: changing the trial's registry flips awaiting_registration_number
    -- for every entry in it, so the trial moves the row for the replication
    -- cursor (updated_at, id). Registration changes do not appear here: a
    -- DELETE cannot be seen by a max(updated_at), so
    -- trg_dog_registrations_touch_entries bumps the dog's entries instead.
    held_trial.updated_at
  ) AS updated_at,
  e.deleted_at,
  CASE WHEN access.can_view_admin THEN e.deleted_by END AS deleted_by,
  e.check_in_status,
  CASE WHEN access.can_view_admin THEN e.payment_method END AS payment_method,
  e.entry_source,
  e.is_day_of_show,
  e.registration_id,
  CASE WHEN access.can_view_admin THEN e.withdrawal_reason END AS withdrawal_reason,
  (CASE WHEN access.can_view_admin THEN e.refund_amount END)::numeric(10,2) AS refund_amount,
  CASE WHEN access.can_view_admin THEN e.refund_notes END AS refund_notes,
  CASE WHEN access.can_view_admin THEN e.refunded_at END AS refunded_at,
  CASE WHEN access.can_view_admin THEN e.stripe_payment_intent_id END AS stripe_payment_intent_id,
  CASE WHEN access.can_view_admin THEN e.comped END AS comped,
  CASE WHEN access.can_view_admin THEN e.comped_reason END AS comped_reason,
  (CASE WHEN access.can_view_admin THEN e.discount_amount END)::numeric(10,2) AS discount_amount,
  CASE WHEN access.can_view_admin THEN e.confirmation_email_sent_at END AS confirmation_email_sent_at,
  CASE WHEN access.can_view_admin THEN e.confirmation_email_message_id END AS confirmation_email_message_id,
  CASE WHEN access.can_view_admin THEN e.confirmation_email_status END AS confirmation_email_status,
  e.version,
  CASE
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'qualified'  THEN 'Q'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'nq'         THEN 'NQ'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'absent'     THEN 'ABS'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'excused'    THEN 'EX'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'disqualified' THEN 'DQ'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'withdrawn'  THEN 'WD'
    ELSE NULL
  END AS result_text,
  d.name AS dog_name,
  d.call_name AS dog_call_name,
  d.breed AS dog_breed,
  d.image_url AS dog_image_url,
  c.name AS class_name,
  c.level AS class_level,
  c.element AS class_element,
  c.results_released_at AS class_results_released_at,
  sh.name AS show_name,
  sh.start_date AS show_start_date,
  sh.organization AS show_organization,
  access.is_own_entry AS is_own_entry,
  -- Secretary payment bookkeeping. Masked by `can_view_admin` exactly like the
  -- other payment columns above; appended at the END of the select list because
  -- CREATE OR REPLACE VIEW may only add columns there.
  CASE WHEN access.can_view_admin THEN e.payment_reference END AS payment_reference,
  CASE WHEN access.can_view_admin THEN e.payment_received_on END AS payment_received_on,
  CASE WHEN access.can_view_admin THEN e.payment_notes END AS payment_notes,
  -- MYK9-632: the ENUMERATED withdrawal reason, beside the free-text
  -- `withdrawal_reason` above and masked by the same `can_view_admin` (a show
  -- manager, or the entry's own exhibitor). Appended at the END of the select
  -- list because CREATE OR REPLACE VIEW may only add columns there.
  CASE WHEN access.can_view_admin THEN e.withdrawal_reason_code END AS withdrawal_reason_code,
  -- MYK9-639: the supersession link. Structural, not financial, so it is NOT
  -- masked by can_view_admin -- it is the same kind of fact as e.class_id, and
  -- anyone this view already admits to the row may know which entry this one
  -- replaced. Appended at the END of the select list because CREATE OR REPLACE
  -- VIEW may only add columns there.
  e.moved_from_entry_id,
  -- MYK9-659: the ORDER's human reference. `enrollments.confirmation_number`
  -- is NOT NULL and defaulted from generate_confirmation_number(), and
  -- submit_show_entries always writes entries.registration_id, so every
  -- order the app creates has one. It reached the client only through the
  -- PostgREST `registration:registration_id(...)` embed, which the offline
  -- replica path cannot make -- so the same order printed `Confirmation #:
  -- MK9-000146` online and a raw enrollment UUID offline.
  --
  -- NOT the sibling of `payment_reference` above. That is an `entries` column,
  -- also reachable under `entries` RLS; this is a CROSS-TABLE column from
  -- `public.enrollments`, reached by an owner-run LEFT JOIN that evaluates no
  -- `enrollments` policy, so `access.can_view_admin` is its ONLY guard -- and
  -- a different predicate from `enrollments_select`, which matches the
  -- enrollment's own handler_id. Deliberate: the order reference belongs to
  -- whoever the ENTRY belongs to, so the entry's handler or the dog's owner
  -- sees the reference of the order their entry is on, even when another
  -- person placed it. Both client read paths apply that one rule.
  --
  -- Appended at the END of the select list because CREATE OR REPLACE VIEW may
  -- only add columns there.
  CASE WHEN access.can_view_admin THEN en.confirmation_number END AS registration_confirmation_number,
  -- MYK9-969: TRUE when this row's results are private and the caller is
  -- neither show staff nor a person tied to the entry, so every result column
  -- above arrived NULL for that reason (not because results are unreleased).
  -- Appended at the END: CREATE OR REPLACE VIEW may only add columns there.
  privacy.masked AS results_private,
  -- MYK9-1162: TRUE when this live entry's dog has no registration number for
  -- the trial's registry (a held entry). Computed here, server-side, by the one
  -- predicate public.entry_awaiting_registration_number() so a ringside device
  -- that cannot read dog_registrations (RLS, passcode sessions) still knows.
  -- Not masked: it names no registration data. Appended at the END because
  -- CREATE OR REPLACE VIEW may only add columns there.
  public.entry_awaiting_registration_number(e.dog_id, e.class_id, e.entry_status, e.deleted_at) AS awaiting_registration_number,
  -- MYK9-1473: the tie marker and the secretary's recorded order, masked
  -- EXACTLY like final_placement (the ranking they explain): visible to the
  -- people who can see scores, and to everyone else only when the placement is
  -- visible to them. Appended at the END because CREATE OR REPLACE VIEW may
  -- only add columns there.
  CASE WHEN access.can_view_scores OR vis.placement_visible THEN e.placement_tie END AS placement_tie,
  CASE WHEN access.can_view_scores OR vis.placement_visible THEN e.placement_tiebreak END AS placement_tiebreak,
  -- MYK9-1637: masked like payment_status and refund_amount. Appended at the END
  -- because CREATE OR REPLACE VIEW may only add columns there.
  CASE WHEN access.can_view_admin THEN e.card_paid END AS card_paid,
  -- MYK9-1757: WHO flagged a pull ('exhibitor' | 'staff'), stamped by the server and NOT masked
  -- (like check_in_status it names no money or result). Appended at the END because CREATE OR
  -- REPLACE VIEW may only add columns there.
  e.check_in_pulled_by,
  -- MYK9-2068: Nationals' Area 5 time and UKC's element time, gated exactly like
  -- area4_time_seconds above. Appended at the END because CREATE OR REPLACE VIEW
  -- may only add columns there.
  CASE WHEN access.can_view_scores THEN e.area5_time_seconds END AS area5_time_seconds,
  CASE WHEN access.can_view_scores THEN e.element_time_seconds END AS element_time_seconds,
  -- MYK9-2303: what the club paid back directly after the payout, masked like
  -- refund_amount. Appended at the END because CREATE OR REPLACE VIEW may only add
  -- columns there.
  (CASE WHEN access.can_view_admin THEN e.club_refunded_amount END)::numeric(10,2) AS club_refunded_amount
FROM public.entries e
LEFT JOIN public.enrollments en ON en.id = e.registration_id
LEFT JOIN public.dogs d ON d.id = e.dog_id
LEFT JOIN public.classes c ON c.id = e.class_id
LEFT JOIN public.trials held_trial ON held_trial.id = c.trial_id
LEFT JOIN public.shows sh ON sh.id = e.show_id
LEFT JOIN public.show_visibility_settings show_vis ON show_vis.show_id = e.show_id
LEFT JOIN public.trial_visibility_overrides trial_vis ON trial_vis.trial_id = c.trial_id
LEFT JOIN public.class_visibility_overrides class_vis ON class_vis.class_id = e.class_id
CROSS JOIN caller_context ctx
CROSS JOIN exhibitor_shows
LEFT JOIN private.class_result_visibility cvr ON cvr.class_id = e.class_id
-- MYK9-126: `vis` keeps its four column names, so every downstream reference
-- above is byte-identical to 20260902130000. The COALESCE reproduces the
-- function's fail-closed RETURN for an unknown or trial-less class, which a
-- LEFT JOIN would otherwise surface as NULL.
CROSS JOIN LATERAL (
  SELECT
    COALESCE(cvr.placement_visible, false)     AS placement_visible,
    COALESCE(cvr.qualification_visible, false) AS qualification_visible,
    COALESCE(cvr.time_visible, false)          AS time_visible,
    COALESCE(cvr.faults_visible, false)        AS faults_visible
) AS cascade_vis
CROSS JOIN LATERAL (
  SELECT
    (
      sh.id IS NOT NULL
      AND (
        -- MYK9-329: a club-less show is site-admin only. The former arm that
        -- admitted any holder of a manager role when the show had no club handed every
        -- club admin and secretary on the platform can_manage (and therefore
        -- can_view_admin: payment_status, entry_fee, judge_notes, ...) on any
        -- show with no club. MYK9-258 (20260828230000) removed that semantics
        -- from can_manage_show / manageable_show_ids / get_entries_for_export;
        -- this view was re-emitted with the old arm and left behind. Parity
        -- with can_manage_show() is restored here.
        ctx.is_site_admin
        OR sh.club_id = ANY(ctx.managed_club_ids)
        OR e.show_id = ANY(ctx.managed_show_ids)
      )
    ) AS can_manage,
    e.class_id = ANY(ctx.assigned_class_ids) AS is_assigned_judge,
    (
      e.show_id = ANY(ctx.steward_show_ids)
      OR sh.club_id = ANY(ctx.steward_club_ids)
    ) AS is_show_steward,
    (
      ctx.person_id = e.handler_id
      OR EXISTS (
        SELECT 1
        FROM public.dogs owned_dog
        WHERE owned_dog.id = e.dog_id
          AND owned_dog.owner_id = ctx.person_id
      )
    ) AS is_own_entry,
    COALESCE(e.show_id = ANY(exhibitor_shows.show_ids), false) AS is_show_exhibitor,
    (
      ctx.claim_kind = 'ringside_passcode'
      AND ctx.claim_show_id = e.show_id::text
      AND ctx.claim_generation_current
    ) AS claim_show_match,
    ctx.claim_role
) AS flags
CROSS JOIN LATERAL (
  SELECT
    flags.can_manage,
    flags.is_assigned_judge,
    flags.is_show_steward,
    flags.is_own_entry,
    flags.is_show_exhibitor,
    (flags.claim_show_match AND flags.claim_role IN ('judge', 'steward', 'admin')) AS is_ringside_claim,
    (
      flags.can_manage
      OR flags.is_assigned_judge
      OR (flags.claim_show_match AND flags.claim_role IN ('judge', 'admin'))
    ) AS can_view_scores,
    (flags.can_manage OR flags.is_own_entry) AS can_view_admin
) AS access
-- MYK9-969: results privacy. An entry's results are PUBLIC only when the show
-- is not private AND every person tied to the entry (the dog's owner and
-- co-owner, the entry's handler) has opted in on their own account. Most
-- private wins; an entry with no tied person, or a tied person with no
-- account, stays private (nobody opted in).
--
-- The opt-in is read through the person's OWN account: people.auth_user_id ->
-- exhibitor_profiles.auth_user_id (unique on both sides). It is never read via
-- exhibitor_profiles.person_id, which the row's own user may rewrite under the
-- self-only UPDATE policy -- keying on it would let anyone opt a stranger in.
CROSS JOIN LATERAL (
  SELECT
    bool_and(COALESCE(tep.results_public, false)) AS all_opted_in,
    -- people.updated_at too: relinking an account changes WHICH profile
    -- counts, and a deleted profile touches its person (trigger above).
    max(GREATEST(tep.updated_at, tp.updated_at)) AS profiles_updated_at
  FROM unnest(ARRAY[d.owner_id, d.co_owner_id, e.handler_id]) AS tied(person_id)
  LEFT JOIN public.people tp ON tp.id = tied.person_id
  LEFT JOIN public.exhibitor_profiles tep ON tep.auth_user_id = tp.auth_user_id
  WHERE tied.person_id IS NOT NULL
) AS consent
CROSS JOIN LATERAL (
  SELECT
    (
      (COALESCE(show_vis.results_private, false) OR consent.all_opted_in IS NOT TRUE)
      -- COALESCE: the claim arms are NULL (not false) for a caller with no
      -- ringside claim, and a NULL here would leave results_private NULL.
      AND NOT COALESCE(
        -- Show staff see every result: manager, the class's judge, a steward,
        -- and a current ringside judge/steward/admin passcode session.
        access.can_view_scores
        OR access.is_show_steward
        OR access.is_ringside_claim
        -- The people tied to the entry see their own results.
        OR access.is_own_entry
        OR (ctx.person_id IS NOT NULL AND ctx.person_id = d.co_owner_id),
        false
      )
    ) AS masked
) AS privacy
-- The cascade-visible flags, with privacy applied on top. Every result column
-- above reads `vis`, so masking here leaves their expressions byte-identical.
-- can_view_scores already short-circuits those columns for staff.
CROSS JOIN LATERAL (
  SELECT
    cascade_vis.placement_visible     AND NOT privacy.masked AS placement_visible,
    cascade_vis.qualification_visible AND NOT privacy.masked AS qualification_visible,
    cascade_vis.time_visible          AND NOT privacy.masked AS time_visible,
    cascade_vis.faults_visible        AND NOT privacy.masked AS faults_visible
) AS vis
WHERE (e.deleted_at IS NULL OR access.is_own_entry)
  AND (
    access.can_manage
    OR access.is_assigned_judge
    OR access.is_show_steward
    OR access.is_own_entry
    OR access.is_show_exhibitor
    OR access.is_ringside_claim
  );


COMMENT ON VIEW public.view_authenticated_entry_results IS
  'Authenticated entry results. Scored columns stay gated by can_view_scores and '
  'payment columns by can_view_admin, which now also masks the enumerated '
  'withdrawal_reason_code beside the free-text withdrawal_reason (MYK9-632). A '
  'club-less show is manageable by site admins only (MYK9-258 / MYK9-329). Class '
  'result visibility resolves once per class via private.class_result_visibility '
  '(MYK9-126). moved_from_entry_id (MYK9-639) is unmasked: it is structural provenance, like class_id. registration_confirmation_number (MYK9-659) is appended after it and is NOT a sibling of payment_reference: it is a cross-table column from public.enrollments, reached by an owner-run LEFT JOIN that evaluates no enrollments policy, so can_view_admin is its ONLY guard -- a different predicate from enrollments_select, which matches the enrollment''s own handler_id. That is deliberate: the order reference belongs to whoever the ENTRY belongs to, so the entry''s handler or the dog''s owner sees the reference of the order their entry is on, even when another person placed it, and both client read paths apply that one rule. MYK9-969 results privacy: an entry''s results are public only when the show is not private (show_visibility_settings.results_private) and every tied person (dog owner, co-owner, handler) has exhibitor_profiles.results_public; otherwise every result column is NULL for a caller who is neither show staff nor a tied person, and results_private says so. Staff paths (can_view_scores, stewards, ringside staff claims) are unaffected. The view remains security_invoker = false. awaiting_registration_number (MYK9-1162) is appended last: TRUE for a live entry whose dog has no registration number for the trial''s registry, from public.entry_awaiting_registration_number(), and unmasked because it carries no registration data. is_show_exhibitor (MYK9-1369) is computed once per query from a materialized set of the caller''s exhibitor show ids, not once per entry; the access rule is unchanged. placement_tie and placement_tiebreak (MYK9-1473) are appended after it and masked exactly like final_placement (can_view_scores OR placement_visible), so the replica holds the coin-flip state wherever it holds the placement. The caller''s own role set (MYK9-1476) is an input to updated_at via private.entry_results_caller_access_epoch(), so a grant, revoke, deactivation, hard delete or expiry moves every row this caller reads. card_paid (MYK9-1637) is appended after it and masked by can_view_admin like the other payment columns: TRUE when a succeeded Stripe order paid for the entry and Stripe has not refunded it. check_in_pulled_by (MYK9-1757) is appended last and unmasked like check_in_status: who flagged a pull, stamped by the server. area5_time_seconds and element_time_seconds (MYK9-2068) are appended last and masked like area4_time_seconds (can_view_scores). club_refunded_amount (MYK9-2303) is appended last and masked by can_view_admin like refund_amount: the net a club paid an exhibitor back directly after the payout, written only beside its club_settled_refunds row.';

CREATE OR REPLACE VIEW public.view_authenticated_entry_results_replication
  WITH (security_invoker = false)
AS
SELECT
  entries.id,
  entries.dog_id,
  entries.class_id,
  entries.show_id,
  entries.trial_id,
  entries.handler_id,
  entries.entry_status,
  entries.payment_status,
  entries.handler,
  entries.entry_fee,
  entries.submitted_at,
  entries.special_requests,
  entries.armband,
  entries.run_order,
  entries.jump_height,
  entries.preferred_judge,
  entries.move_up_requested,
  entries.is_scored,
  entries.is_in_ring,
  entries.result_status,
  entries.ring_entry_time,
  entries.ring_exit_time,
  entries.scoring_started_at,
  entries.scoring_completed_at,
  entries.search_time_seconds,
  entries.area1_time_seconds,
  entries.area2_time_seconds,
  entries.area3_time_seconds,
  entries.area4_time_seconds,
  entries.total_correct_finds,
  entries.total_incorrect_finds,
  entries.total_faults,
  entries.no_finish_count,
  entries.area1_correct,
  entries.area1_incorrect,
  entries.area1_faults,
  entries.area2_correct,
  entries.area2_incorrect,
  entries.area2_faults,
  entries.area3_correct,
  entries.area3_incorrect,
  entries.area3_faults,
  entries.total_score,
  entries.points_earned,
  entries.points_possible,
  entries.bonus_points,
  entries.penalty_points,
  entries.time_over_limit,
  entries.time_limit_exceeded_seconds,
  entries.final_placement,
  entries.judge_notes,
  entries.judge_signature,
  entries.judge_signature_timestamp,
  entries.disqualification_reason,
  entries.has_video_review,
  entries.video_review_notes,
  entries.license_key,
  entries.local_id,
  entries.sync_version,
  entries.last_synced_at,
  entries.created_at,
  entries.updated_at,
  entries.deleted_at,
  entries.deleted_by,
  entries.check_in_status,
  entries.payment_method,
  entries.entry_source,
  entries.is_day_of_show,
  entries.registration_id,
  entries.withdrawal_reason,
  entries.refund_amount,
  entries.refund_notes,
  entries.refunded_at,
  entries.stripe_payment_intent_id,
  entries.comped,
  entries.comped_reason,
  entries.discount_amount,
  entries.confirmation_email_sent_at,
  entries.confirmation_email_message_id,
  entries.confirmation_email_status,
  entries.version,
  entries.result_text,
  entries.dog_name,
  entries.dog_call_name,
  entries.dog_breed,
  entries.dog_image_url,
  entries.class_name,
  entries.class_level,
  entries.class_element,
  entries.class_results_released_at,
  entries.show_name,
  entries.show_start_date,
  entries.show_organization,
  entries.is_own_entry,
  entries.payment_reference,
  entries.payment_received_on,
  entries.payment_notes,
  shows.deleted_at AS show_deleted_at,
  shows.name AS source_show_name,
  shows.start_date AS source_show_start_date,
  shows.end_date AS source_show_end_date,
  -- Appended last: CREATE OR REPLACE VIEW may only add columns at the end, and
  -- the four `shows` columns above already hold ordinals 99-102.
  entries.withdrawal_reason_code,
  -- MYK9-639, appended last for the same CREATE OR REPLACE reason.
  entries.moved_from_entry_id,
  -- MYK9-659, appended last for the same CREATE OR REPLACE reason. Already
  -- masked by the inner view; the wrapper only carries it.
  entries.registration_confirmation_number,
  -- MYK9-969, appended last for the same CREATE OR REPLACE reason. Computed by
  -- the inner view; the wrapper only carries it.
  entries.results_private,
  -- MYK9-1162, appended last for the same CREATE OR REPLACE reason. Computed by
  -- the inner view; the wrapper only carries it.
  entries.awaiting_registration_number,
  -- MYK9-1473, appended last for the same CREATE OR REPLACE reason. Already
  -- masked like final_placement by the inner view; the wrapper only carries it.
  entries.placement_tie,
  entries.placement_tiebreak,
  entries.card_paid,
  -- MYK9-1757, appended last for the same CREATE OR REPLACE reason. Stamped by the server
  -- and carried by the inner view; the wrapper only carries it.
  entries.check_in_pulled_by,
  -- MYK9-2068, appended last for the same CREATE OR REPLACE reason. Masked by the
  -- inner view like area4_time_seconds; the wrapper only carries them.
  entries.area5_time_seconds,
  entries.element_time_seconds,
  -- MYK9-2303, appended last for the same CREATE OR REPLACE reason. Masked by the
  -- inner view like refund_amount; the wrapper only carries it.
  entries.club_refunded_amount
FROM public.view_authenticated_entry_results AS entries
LEFT JOIN public.shows AS shows ON shows.id = entries.show_id;
