-- MYK9-1071: offline edits for dog registrations and people.
--
-- Plan: docs/plan-myk9-1071-offline-registrations-people.md. This is PR 1 of two:
-- the schema only. The client still writes both tables directly until PR 2 moves
-- their edits onto the replication mutation queue.
--
-- 1. An optimistic-concurrency token on both tables, copied exactly from the dogs
--    precedent (20260608200000_replication_version_column.sql, the only migration
--    that defines increment_replication_version or a *_version_increment trigger):
--    `version integer NOT NULL DEFAULT 1`, bumped by a BEFORE UPDATE trigger. The
--    DEFAULT fills every existing row with 1 as the column is added, so no separate
--    backfill statement is needed (asserted below). A queued full-row UPDATE then
--    carries `WHERE version = <token>` the way dog edits do.
--
--    Trigger order: PostgreSQL fires BEFORE ROW triggers alphabetically. The bump
--    only sets NEW.version from OLD.version and reads nothing another trigger writes,
--    so its position among the existing guards (people_authz_guard_identity_columns,
--    people_enforce_sign_in_email, people_protect_status_trigger,
--    prevent_person_soft_delete_with_dogs, trg_00_block_direct_soft_delete,
--    trg_00_creation_attribution_update, update_people_updated_at; and on
--    dog_registrations sync_dog_registration_deleted_marker,
--    update_dog_registrations_updated_at) changes no outcome. Any of those guards that
--    raises aborts the row, the bump included. A client-supplied `version` is always
--    overwritten, so the column cannot be forged.
--
-- 2. public.update_person_details_versioned: the queued person save. People rows are
--    saved through update_person_details (MYK9-664, 20260924231700, its only and
--    therefore latest definition). That function is the one person-save path: it
--    holds the editors' column whitelist and writes people_private in the same
--    transaction. The wrapper CALLS it and restates none of its body. It adds:
--      * the row lock and the version precondition. A mismatch raises 40001 with
--        the current version in DETAIL, the ringside_update_entry /
--        withdraw_or_pull_own_entry contract that @myk9/replication already maps
--        to an OCC rebase;
--      * a refusal of `email` (owner decision D2): an email change needs the
--        sign-in identity checks, which only work online;
--      * NULL from the inner function becomes a permanent 42501 rather than a silent
--        no-op, so the queue dead-letters it instead of reporting success;
--      * the new version as its return value, which keeps the client's token fresh.
--    Authorization is checked BEFORE the version, restating the inner function's
--    predicate, so an unauthorized caller cannot learn a person's version from the
--    40001 DETAIL. The inner function checks it again on the real write.
--
-- Grants: table-level privileges are restated unchanged (authenticated
-- SELECT/INSERT/UPDATE/DELETE on both tables, verified live 2026-10-09). anon gets
-- nothing new. The new column carries no column ACL, and anon has no table-level
-- privilege on either table. people keeps its existing anon column grants (id,
-- first_name, last_name, email), which a table-level REVOKE ALL FROM anon would
-- silently drop, so on people that column grant is restated instead.

-- ---------------------------------------------------------------------------
-- 1. Version columns and triggers (dogs precedent, 20260608200000).
-- ---------------------------------------------------------------------------
ALTER TABLE public.dog_registrations ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.people            ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.dog_registrations.version IS
  'MYK9-1071: optimistic-concurrency token for offline replication. Starts at 1, '
  'bumped by dog_registrations_version_increment on every UPDATE.';
COMMENT ON COLUMN public.people.version IS
  'MYK9-1071: optimistic-concurrency token for offline replication. Starts at 1, '
  'bumped by people_version_increment on every UPDATE.';

CREATE OR REPLACE TRIGGER dog_registrations_version_increment
  BEFORE UPDATE ON public.dog_registrations
  FOR EACH ROW EXECUTE FUNCTION public.increment_replication_version();

CREATE OR REPLACE TRIGGER people_version_increment
  BEFORE UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.increment_replication_version();

-- The DEFAULT backfilled every existing row; prove it rather than assume it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.dog_registrations WHERE version IS DISTINCT FROM 1)
     OR EXISTS (SELECT 1 FROM public.people WHERE version IS DISTINCT FROM 1) THEN
    RAISE EXCEPTION 'MYK9-1071: version backfill did not set every existing row to 1';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Grants, restated unchanged (see header).
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dog_registrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO authenticated;
-- dog_registrations has no anon privilege at table or column level; keep it so.
REVOKE ALL ON public.dog_registrations FROM anon;
-- people: anon's decision is its existing column-level SELECT, restated unchanged
-- (verified live 2026-10-09: id, first_name, last_name, email, and nothing at table
-- level). Restating it is a no-op. A table-level REVOKE from anon is deliberately
-- not used here: REVOKE ALL (or REVOKE SELECT) would drop those column grants, and
-- /shows/:id embeds them (anonEntriesGrantContract).
GRANT SELECT (id, first_name, last_name, email) ON public.people TO anon;

-- ---------------------------------------------------------------------------
-- 3. The versioned person save.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.update_person_details_versioned(
  p_person_id uuid,
  p_expected_version integer,
  p_people jsonb DEFAULT '{}'::jsonb,
  p_private jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_people jsonb := coalesce(p_people, '{}'::jsonb);
  v_current integer;
  v_row jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- D2: email edits stay online-only. Checked before anything else, so a queued
  -- email change can never reach the identity guards from an offline device.
  IF jsonb_typeof(v_people) = 'object' AND v_people ? 'email' THEN
    RAISE EXCEPTION 'An email address can only be changed while online.'
      USING ERRCODE = '22023';
  END IF;

  -- Same existence and authorization predicate as update_person_details, checked
  -- before the version is read so a refusal reveals nothing about the row.
  IF NOT EXISTS (
    SELECT 1 FROM public.people p WHERE p.id = p_person_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM public.people p
      WHERE p.id = p_person_id AND p.auth_user_id = v_uid
    )
    OR public.can_manage_show_person(p_person_id)
    OR public.is_site_admin()
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  -- Lock the row so the version cannot move between the check and the write.
  SELECT p.version INTO v_current
  FROM public.people p
  WHERE p.id = p_person_id AND p.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = '42501';
  END IF;

  IF p_expected_version IS NOT NULL AND v_current IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Version conflict updating person % (expected %)',
      p_person_id, p_expected_version
      USING ERRCODE = '40001', DETAIL = v_current::text;
  END IF;

  v_row := public.update_person_details(p_person_id, v_people, p_private, false);

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'Person % was not updated', p_person_id USING ERRCODE = '42501';
  END IF;

  RETURN (v_row ->> 'version')::integer;
END;
$$;

COMMENT ON FUNCTION public.update_person_details_versioned(uuid, integer, jsonb, jsonb) IS
  'MYK9-1071: the queued (offline) person save. Wraps update_person_details with a row '
  'lock and a version precondition (40001, current version in DETAIL), refuses email '
  '(online-only), turns a NULL result into 42501, and returns the new version.';

REVOKE ALL ON FUNCTION public.update_person_details_versioned(uuid, integer, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_person_details_versioned(uuid, integer, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_person_details_versioned(uuid, integer, jsonb, jsonb) TO authenticated;
