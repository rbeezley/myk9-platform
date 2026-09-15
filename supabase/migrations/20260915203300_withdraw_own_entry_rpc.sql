-- MYK9-535: exhibitor self-withdrawal of an own, unpaid entry.
--
-- FINDING (what denied the write): `public.entries` has exactly one UPDATE
-- policy, `entries_update` (role `authenticated`), whose USING *and* WITH CHECK
-- are both `(SELECT can_manage_show(entries.show_id))` — installed by
-- 20260604004045_restrict_entries_update_to_managers.sql. An exhibitor is not a
-- show manager, so their `UPDATE entries SET entry_status='withdrawn'` matches
-- zero rows; the replication MutationManager reports it as
-- "RLS policy blocked UPDATE on entries for row … (failureKind authorization)".
-- No trigger was involved.
--
-- CHOICE (a widened policy vs. a SECURITY DEFINER RPC): an RPC, matching how
-- MYK9-486 handled the exhibitor payment_method write (`submit_show_entries`)
-- and how the two existing exhibitor entry writes work
-- (`self_checkin_entry`, migration 118; `update_entry_handler`, migration
-- 20260606170000). A widened WITH CHECK cannot express "only this transition,
-- only while unpaid" without re-deriving OLD-vs-NEW state, and it would also
-- widen every other column on the row. The RPC restates every filter the policy
-- applies (definer functions drop RLS entirely), REVOKEs from PUBLIC/anon, and
-- GRANTs EXECUTE to `authenticated` only.
--
-- OWNER SCOPE deliberately EXCEEDS `entries_select`. The live SELECT policy
-- (20260730170000_hashable_entries_manager_policy.sql) admits manageable shows,
-- `handler_id`, and `dogs.owner_id` — it has NO co-owner arm. This function adds
-- `dogs.co_owner_id`, matching the two existing exhibitor entry-write RPCs
-- (`self_checkin_entry`, migration 118; `update_entry_handler`,
-- 20260606170000), both of which accept a co-owner. A co-owner who cannot yet
-- SELECT the row simply has no surface that reaches this call; the arm is here
-- so the three exhibitor write paths agree with each other.
--
-- Signature deliberately mirrors `ringside_update_entry(uuid, jsonb, integer)`
-- so the existing MutationManager RPC seam (packages/replication
-- mutation-execute.ts, case 'UPDATE') applies it with no client plumbing change
-- and the withdrawal stays offline-queued.

BEGIN;

CREATE OR REPLACE FUNCTION public.withdraw_own_entry(
  p_entry_id uuid,
  p_fields jsonb,
  p_expected_version integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_person_id uuid;
  v_show_id uuid;
  v_dog_id uuid;
  v_handler_id uuid;
  v_entry_status text;
  v_payment_status text;
  v_deleted_at timestamptz;
  v_check_in_status text;
  v_is_in_ring boolean;
  v_is_scored boolean;
  v_current_version integer;
  v_is_manager boolean;
  v_is_owner boolean;
  v_updated_id uuid;
  v_new_version integer;
  -- Statuses an entry may still be withdrawn FROM by its own exhibitor. Day-of
  -- and terminal states are excluded: those go through the pull / scratch flow.
  -- `paid` is an ENTRY_STATUS, not a money fact — it sits in the pending bucket
  -- alongside `promotion-expired`, and an entry can hold it while
  -- `payment_status` is still 'pending' (the pay-by-check case this issue was
  -- reported on). It is therefore reachable for owners, not dead.
  -- Both spellings of each request status are listed because
  -- entries_entry_status_check admits both and the live column holds the
  -- hyphenated form: an unpaid exhibitor waiting on a secretary decision must
  -- still be able to withdraw.
  v_withdrawable_statuses constant text[] := ARRAY[
    'no-status', 'draft', 'submitted', 'paid', 'confirmed',
    'pending-payment', 'promotion-expired',
    'scratch-requested', 'scratch_requested',
    'move-up-requested', 'move_up_requested'
  ];
  -- The only check_in_status values that mean the dog is NOT yet at the show.
  -- Listing the permitted pair (rather than the day-of values to block) means a
  -- value added to `entries_check_in_status_check` later fails CLOSED rather
  -- than opening a new self-withdrawal window.
  v_pre_show_check_in constant text[] := ARRAY['no-status', 'pulled'];
BEGIN
  -- 1. The only transition this function performs. `entry_status` must be
  -- PRESENT and exactly 'withdrawn': this is not a general-purpose entries
  -- writer, and an omitted key must not withdraw by default. Every other key in
  -- p_fields (including `withdrawal_reason`) is ignored — the function writes
  -- exactly one column.
  IF (p_fields ->> 'entry_status') IS DISTINCT FROM 'withdrawn' THEN
    RAISE EXCEPTION 'withdraw_own_entry only writes entry_status = withdrawn'
      USING errcode = '22023';
  END IF;

  SELECT e.show_id, e.dog_id, e.handler_id, e.entry_status, e.payment_status,
         e.deleted_at, e.check_in_status, coalesce(e.is_in_ring, false),
         coalesce(e.is_scored, false), e.version
    INTO v_show_id, v_dog_id, v_handler_id, v_entry_status, v_payment_status,
         v_deleted_at, v_check_in_status, v_is_in_ring,
         v_is_scored, v_current_version
    FROM public.entries e
   WHERE e.id = p_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry % not found', p_entry_id USING errcode = 'P0002';
  END IF;

  -- 2. Resolve the caller. NULL for an anon / ringside-passcode session, which
  -- can never own an entry — the EXECUTE grant already excludes anon.
  SELECT p.id
    INTO v_caller_person_id
    FROM public.people p
   WHERE p.auth_user_id = (SELECT auth.uid())
   LIMIT 1;

  -- 3. Restate the `entries_update` policy verbatim for the manager tier, so
  -- the secretary use of EntryEditDialog behaves exactly as it does today.
  v_is_manager := coalesce(public.can_manage_show(v_show_id), false);

  -- 4. Owner tier: the same scope `entries_select` grants an exhibitor over
  -- their own row (listed handler, dog owner, dog co-owner).
  v_is_owner := v_caller_person_id IS NOT NULL AND (
    v_handler_id = v_caller_person_id
    OR EXISTS (
      SELECT 1 FROM public.dogs d
       WHERE d.id = v_dog_id
         AND (d.owner_id = v_caller_person_id OR d.co_owner_id = v_caller_person_id)
    )
  );

  IF NOT (v_is_manager OR v_is_owner) THEN
    RAISE EXCEPTION 'Not authorized to withdraw entry %', p_entry_id
      USING errcode = '42501';
  END IF;

  -- 5. Owner-only limits. A manager is bound only by the policy restated in
  -- step 3 (they already have refund and lifecycle tooling for these cases).
  IF NOT v_is_manager THEN
    IF v_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Entry % has been removed', p_entry_id USING errcode = '42501';
    END IF;

    IF v_payment_status IS DISTINCT FROM 'pending' AND v_payment_status IS DISTINCT FROM 'waived' THEN
      RAISE EXCEPTION 'Entry % is paid; request a refund instead of withdrawing', p_entry_id
        USING errcode = '42501';
    END IF;

    IF NOT (v_entry_status = ANY (v_withdrawable_statuses)) THEN
      RAISE EXCEPTION 'Entry % cannot be withdrawn from status %', p_entry_id, v_entry_status
        USING errcode = '42501';
    END IF;

    IF v_is_scored THEN
      RAISE EXCEPTION 'Entry % has been scored and cannot be withdrawn', p_entry_id
        USING errcode = '42501';
    END IF;

    -- `self_checkin_entry` writes ONLY check_in_status and leaves
    -- entry_status='confirmed', so without this an exhibitor standing at the
    -- gate passes every guard above and self-withdraws mid-show.
    IF v_is_in_ring
       OR (v_check_in_status IS NOT NULL
           AND NOT (v_check_in_status = ANY (v_pre_show_check_in))) THEN
      RAISE EXCEPTION 'Entry % is checked in at the show and cannot be withdrawn', p_entry_id
        USING errcode = '42501';
    END IF;
  END IF;

  -- 6. Optimistic concurrency, same contract as ringside_update_entry: the
  -- authoritative current version rides in DETAIL so the client can advance its
  -- token instead of regenerating the same conflicting write forever.
  IF p_expected_version IS NOT NULL AND v_current_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Version conflict withdrawing entry % (expected %)',
      p_entry_id, p_expected_version
      USING errcode = '40001', detail = v_current_version::text;
  END IF;

  -- 7. Apply. Exactly one column plus updated_at; `withdrawn_at` is stamped by
  -- trg stamp_entry_withdrawn_at, and the status-history trigger records the
  -- transition.
  UPDATE public.entries e
     SET entry_status = 'withdrawn',
         updated_at = now()
   WHERE e.id = p_entry_id
     AND (p_expected_version IS NULL OR e.version = p_expected_version)
  RETURNING e.id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    SELECT e.version INTO v_current_version FROM public.entries e WHERE e.id = p_entry_id;
    IF FOUND THEN
      RAISE EXCEPTION 'Version conflict withdrawing entry % (expected %)',
        p_entry_id, p_expected_version
        USING errcode = '40001', detail = v_current_version::text;
    END IF;
    RAISE EXCEPTION 'Entry % not found', p_entry_id USING errcode = 'P0002';
  END IF;

  SELECT e.version INTO v_new_version FROM public.entries e WHERE e.id = p_entry_id;
  RETURN v_new_version;
END;
$$;

COMMENT ON FUNCTION public.withdraw_own_entry(uuid, jsonb, integer) IS
  'MYK9-535: owner-scoped withdrawal of an unpaid entry. Restates entries_update '
  'for managers and entries_select scope for owners; definer, so every filter is '
  'explicit. Called through the replication MutationManager RPC seam.';

REVOKE ALL ON FUNCTION public.withdraw_own_entry(uuid, jsonb, integer) FROM public;
REVOKE ALL ON FUNCTION public.withdraw_own_entry(uuid, jsonb, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.withdraw_own_entry(uuid, jsonb, integer) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
