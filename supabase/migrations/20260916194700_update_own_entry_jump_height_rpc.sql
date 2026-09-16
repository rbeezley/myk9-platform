-- MYK9-561: exhibitor jump-height save on their OWN entry.
--
-- FINDING (what denied the write): `public.entries` has exactly one UPDATE
-- policy, `entries_update` (role `authenticated`), whose USING *and* WITH CHECK
-- are both `(SELECT can_manage_show(entries.show_id))` -- installed by
-- 20260604004045_restrict_entries_update_to_managers.sql. The Edit Entry
-- dialog's Save Changes handler issues a direct
-- `UPDATE entries SET jump_height = ...` through `updateEntryDetails`
-- (apps/myk9show/src/services/database/entries/writes.ts). For an exhibitor that
-- matches zero rows, `.single()` turns the empty result into PGRST116, and the
-- dialog reports "Failed to update jump height". Same denial MYK9-535 found for
-- self-withdrawal; no trigger is involved.
--
-- CHOICE (a widened policy vs. a SECURITY DEFINER RPC): an RPC, matching the
-- three exhibitor entry writes that already exist -- `self_checkin_entry`
-- (migration 118), `update_entry_handler` (20260606170000, reached from the very
-- same Save Changes handler) and `withdraw_own_entry` (20260915203300). A
-- widened WITH CHECK cannot express "only this column, only while the entry is
-- still editable" without re-deriving OLD-vs-NEW state, and it would widen every
-- other column on the row -- including the money columns the protect-payment
-- triggers exist to defend.
--
-- COLUMN ALLOW-LIST BY SIGNATURE. The function takes `p_jump_height text` rather
-- than a `p_fields jsonb`, so the allow-list is the signature itself and cannot
-- be widened by a caller. This is deliberately NARROWER than
-- `withdraw_own_entry(uuid, jsonb, integer)`, whose jsonb argument needs a
-- runtime guard to keep it from becoming a general-purpose entries writer.
--
-- OWNER SCOPE deliberately EXCEEDS `entries_select`, exactly as
-- `withdraw_own_entry` does. The live SELECT policy
-- (20260730170000_hashable_entries_manager_policy.sql) admits manageable shows,
-- `handler_id`, and `dogs.owner_id` -- it has NO co-owner arm. This function adds
-- `dogs.co_owner_id` so all four exhibitor entry-write RPCs agree with each
-- other. A co-owner who cannot yet SELECT the row simply has no surface that
-- reaches this call.
--
-- WHAT THE OWNER TIER MAY DO, and why it differs from withdrawal (MYK9-561
-- product decision): a jump height may be corrected on a PAID entry. Changing a
-- height moves no money -- unlike a withdrawal, which leaves a fee owed or owing
-- -- so the `payment_status` guard `withdraw_own_entry` applies is deliberately
-- ABSENT here. Every OTHER owner-tier guard is the same predicate, in the same
-- order, reading the same constants: the row is not soft-deleted, the show is
-- not soft-deleted, the entry_status is one an owner may still edit from, the
-- entry is not scored, and the dog is not yet at the show. Entry close is added
-- on top, with the same boundary semantics as
-- `guard_submit_show_entries_entry_close` (20260708130000).
--
-- Signature otherwise mirrors `withdraw_own_entry`, including the
-- 40001-with-version-in-DETAIL conflict contract. The client calls it DIRECTLY
-- and awaits it: this write is ONLINE-ONLY and is not queued through the
-- MutationManager. An exhibitor edits a jump height pre-show (this function
-- refuses a checked-in entry), so it is not a show-day offline flow, and an
-- optimistic local write would display a height the server refused.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_own_entry_jump_height(
  p_entry_id uuid,
  p_jump_height text,
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
  v_deleted_at timestamptz;
  v_check_in_status text;
  v_is_in_ring boolean;
  v_is_scored boolean;
  v_current_version integer;
  v_is_manager boolean;
  v_is_owner boolean;
  v_show_found boolean;
  v_show_deleted_at timestamptz;
  v_show_close timestamptz;
  v_show_tz text;
  v_jump_height text;
  v_new_version integer;
  -- Statuses an entry may still be EDITED from by its own exhibitor. Identical
  -- to `v_withdrawable_statuses` in 20260915203300 and to
  -- OWNER_WITHDRAWABLE_ENTRY_STATUSES in
  -- apps/myk9show/src/services/database/entries/withdrawEligibility.ts: one
  -- "own entry, still editable" predicate, three copies that must agree.
  -- `paid` is an ENTRY_STATUS in the pending bucket, not a money fact. Both
  -- spellings of each secretary-decision request status are listed because
  -- entries_entry_status_check admits both and the live column holds the
  -- hyphenated form.
  v_editable_statuses constant text[] := ARRAY[
    'no-status', 'draft', 'submitted', 'paid', 'confirmed',
    'pending-payment', 'promotion-expired',
    'scratch-requested', 'scratch_requested',
    'move-up-requested', 'move_up_requested'
  ];
  -- The only check_in_status values that mean the dog is NOT yet at the show.
  -- Listing the permitted pair (rather than the day-of values to block) means a
  -- value added to `entries_check_in_status_check` later fails CLOSED rather
  -- than opening a new self-edit window.
  v_pre_show_check_in constant text[] := ARRAY['no-status', 'pulled'];
BEGIN
  -- 1. Validate the one value this function writes. `entries.jump_height` is a
  -- free TEXT column with no CHECK constraint, and the heights a show offers are
  -- per-show data (`shows.jump_heights`), so this deliberately does NOT enforce
  -- an enum: a rule invented over a free-text column is exactly how the
  -- `label-rule-vs-real-columns` lesson rewrote live data. What it DOES enforce
  -- is that the column is never blanked or stuffed: NULL and whitespace are
  -- rejected, and the value is trimmed and length-capped.
  v_jump_height := btrim(coalesce(p_jump_height, ''));
  IF v_jump_height = '' THEN
    RAISE EXCEPTION 'update_own_entry_jump_height requires a jump height'
      USING errcode = '22023';
  END IF;
  IF length(v_jump_height) > 32 THEN
    RAISE EXCEPTION 'Jump height is too long' USING errcode = '22023';
  END IF;

  SELECT e.show_id, e.dog_id, e.handler_id, e.entry_status, e.deleted_at,
         e.check_in_status, coalesce(e.is_in_ring, false),
         coalesce(e.is_scored, false), e.version
    INTO v_show_id, v_dog_id, v_handler_id, v_entry_status, v_deleted_at,
         v_check_in_status, v_is_in_ring, v_is_scored, v_current_version
    FROM public.entries e
   WHERE e.id = p_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry % not found', p_entry_id USING errcode = 'P0002';
  END IF;

  -- 2. Resolve the caller. NULL for an anon / ringside-passcode session, which
  -- can never own an entry -- the EXECUTE grant already excludes anon.
  SELECT p.id
    INTO v_caller_person_id
    FROM public.people p
   WHERE p.auth_user_id = (SELECT auth.uid())
   LIMIT 1;

  -- 3. Restate the `entries_update` policy verbatim for the manager tier, so the
  -- secretary use of EntryEditDialog (EntryManagementPage) behaves exactly as it
  -- does today -- including late corrections after entry close.
  v_is_manager := coalesce(public.can_manage_show(v_show_id), false);

  -- 4. Owner tier: the same scope `entries_select` grants an exhibitor over
  -- their own row (listed handler, dog owner), plus the co-owner arm the other
  -- exhibitor write RPCs carry.
  v_is_owner := v_caller_person_id IS NOT NULL AND (
    v_handler_id = v_caller_person_id
    OR EXISTS (
      SELECT 1 FROM public.dogs d
       WHERE d.id = v_dog_id
         AND (d.owner_id = v_caller_person_id OR d.co_owner_id = v_caller_person_id)
    )
  );

  IF NOT (v_is_manager OR v_is_owner) THEN
    RAISE EXCEPTION 'Not authorized to update entry %', p_entry_id
      USING errcode = '42501';
  END IF;

  -- 5. Owner-only limits. A manager is bound only by the policy restated in
  -- step 3 (they already own the day-of correction tooling for these cases).
  IF NOT v_is_manager THEN
    IF v_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Entry % has been removed', p_entry_id USING errcode = '42501';
    END IF;

    -- The show itself. A definer function drops RLS entirely, so the soft-delete
    -- filter every read path applies has to be explicit here.
    SELECT true, s.deleted_at, s.entry_close_date,
           COALESCE(
             (SELECT t.timezone
                FROM public.trials t
               WHERE t.show_id = s.id
               ORDER BY t.date NULLS LAST, t.id
               LIMIT 1),
             'America/New_York'
           )
      INTO v_show_found, v_show_deleted_at, v_show_close, v_show_tz
      FROM public.shows s
     WHERE s.id = v_show_id;

    IF NOT coalesce(v_show_found, false) OR v_show_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Entry % has been removed', p_entry_id USING errcode = '42501';
    END IF;

    IF NOT (v_entry_status = ANY (v_editable_statuses)) THEN
      RAISE EXCEPTION 'Entry % can no longer be edited from status %',
        p_entry_id, v_entry_status
        USING errcode = '42501';
    END IF;

    IF v_is_scored THEN
      RAISE EXCEPTION 'Entry % has been scored and can no longer be edited', p_entry_id
        USING errcode = '42501';
    END IF;

    -- `self_checkin_entry` writes ONLY check_in_status and leaves entry_status
    -- 'confirmed', so without this an exhibitor standing at the gate passes
    -- every guard above and changes their own jump height mid-show.
    IF v_is_in_ring
       OR (v_check_in_status IS NOT NULL
           AND NOT (v_check_in_status = ANY (v_pre_show_check_in))) THEN
      RAISE EXCEPTION 'Entry % is checked in at the show; ask the secretary to change it',
        p_entry_id USING errcode = '42501';
    END IF;

    -- Entry close, with the SAME boundary semantics as
    -- guard_submit_show_entries_entry_close (20260708130000) and the client
    -- `canModifyEntry` gate: `entry_close_date` is a timestamptz holding
    -- midnight UTC of the intended close DAY, and "closed" means the current
    -- calendar date in the show's primary-trial timezone is PAST that day. A
    -- NULL close date never closes.
    IF v_show_close IS NOT NULL
       AND (now() AT TIME ZONE v_show_tz)::date > (v_show_close AT TIME ZONE 'UTC')::date THEN
      RAISE EXCEPTION 'Entries have closed for this show; ask the secretary to change entry %',
        p_entry_id USING errcode = '42501';
    END IF;
  END IF;

  -- 6. Optimistic concurrency, same contract as withdraw_own_entry and
  -- ringside_update_entry: the authoritative current version rides in DETAIL so
  -- the client can advance its token instead of regenerating the same
  -- conflicting write forever. NULL means "no precondition" -- never 0, which is
  -- a real version (MYK9-583).
  IF p_expected_version IS NOT NULL AND v_current_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Version conflict updating entry % (expected %)',
      p_entry_id, p_expected_version
      USING errcode = '40001', detail = v_current_version::text;
  END IF;

  -- 7. Apply. Exactly one column plus updated_at; `version` is bumped by
  -- trg entries_version_increment (BEFORE UPDATE), so the RETURNING value is
  -- already the new token.
  UPDATE public.entries e
     SET jump_height = v_jump_height,
         updated_at = now()
   WHERE e.id = p_entry_id
     AND (p_expected_version IS NULL OR e.version = p_expected_version)
  RETURNING e.version INTO v_new_version;

  IF v_new_version IS NULL THEN
    SELECT e.version INTO v_current_version FROM public.entries e WHERE e.id = p_entry_id;
    IF FOUND THEN
      RAISE EXCEPTION 'Version conflict updating entry % (expected %)',
        p_entry_id, p_expected_version
        USING errcode = '40001', detail = v_current_version::text;
    END IF;
    RAISE EXCEPTION 'Entry % not found', p_entry_id USING errcode = 'P0002';
  END IF;

  RETURN v_new_version;
END;
$$;

COMMENT ON FUNCTION public.update_own_entry_jump_height(uuid, text, integer) IS
  'MYK9-561: owner-scoped jump-height correction on an own entry before entry '
  'close. Restates entries_update for managers and (exceeding) entries_select '
  'scope for owners; definer, so every filter is explicit. The column allow-list '
  'is the signature: this function writes jump_height and nothing else. Called '
  'directly by the client and awaited: online-only, not queued through the '
  'replication MutationManager.';

REVOKE ALL ON FUNCTION public.update_own_entry_jump_height(uuid, text, integer) FROM public;
REVOKE ALL ON FUNCTION public.update_own_entry_jump_height(uuid, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_own_entry_jump_height(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_entry_jump_height(uuid, text, integer) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
