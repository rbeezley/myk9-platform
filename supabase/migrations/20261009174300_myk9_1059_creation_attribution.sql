-- MYK9-1059: record who created a dog or person, and from which show.
--
-- WHY
--
--   An admin diagnostic needs to find a show's operator loose ends: dogs and
--   people a secretary added through a show's add-entry flow but never entered.
--   Today neither table records a creator, and nothing links a dog or person to
--   a show until an entry row exists, so a dog added and then abandoned is
--   indistinguishable from any other dog. Owner decision 2026-10-09: add both
--   columns to BOTH tables.
--
-- WHAT THIS CREATES
--
--   1. dogs.created_by / people.created_by uuid NULL: the AUTH uid of the
--      account that inserted the row (auth.uid(), not a people.id; the same
--      convention as classes.judge_signed_off_by and results_verified_by).
--      Deliberately NO foreign key to auth.users, as for clubs.created_by
--      (20261001174300): it is an attribution marker, and an FK would make every
--      dog and person insert depend on an auth.users row, which the behavioral
--      SQL tests and synthetic-claim server paths do not have.
--      No backfill: existing rows stay NULL.
--
--   2. dogs.created_from_show_id / people.created_from_show_id uuid NULL,
--      REFERENCES public.shows(id) ON DELETE SET NULL, with a partial index
--      WHERE created_from_show_id IS NOT NULL (the diagnostic reads by show; a
--      row created outside a show flow is NULL and never looked up). Written by
--      the client on INSERT from the add-entry flows only (that wiring is the
--      next PR; nothing sends it yet).
--
--   3. private.guard_creation_attribution(), fired BEFORE INSERT and BEFORE
--      UPDATE OF the two columns on both tables. The pattern is
--      public.guard_club_created_by_write (20261001174300, MYK9-909): the guard
--      acts on an "API session", meaning auth.uid() IS NOT NULL or the role
--      setting is authenticated/anon. That covers PostgREST requests AND the
--      SECURITY DEFINER RPCs they call (create_dog_with_registrations runs as
--      postgres, but auth.uid() still reads the caller's JWT). service_role,
--      cron and seed sessions have no auth.uid() and keep whatever they
--      supply, so a repair or backfill stays possible.
--
--        INSERT  created_by := auth.uid(), whatever the client sent.
--                created_from_show_id is kept only when the inserter can manage
--                that show (public.can_manage_show: platform admin, the show's
--                club admin, or a secretary of its club). Otherwise it is set to
--                NULL. The insert itself is never refused.
--        UPDATE  created_by is immutable (OLD is restored).
--                created_from_show_id is immutable too, except that NULL is let
--                through. ON DELETE SET NULL runs as an UPDATE in the same
--                session as the show delete, so restoring OLD there would leave
--                a reference to a deleted show (the FK re-check is skipped when
--                the key looks unchanged). Clearing it only ever removes a hint
--                from an admin diagnostic; it can never point a row at a show.
--
--   VALIDATION DECISION: drop the claim, never refuse the insert.
--     A forged created_from_show_id would only mislead the admin diagnostic,
--     so it is worth one cheap check per inserted row (can_manage_show is a
--     single EXISTS against shows and user_roles). Refusing would be wrong for
--     show-day reliability. Dogs and people are created through the offline
--     mutation queue and replayed later, and a replay can legitimately fail the
--     check: the secretary's role was ended in the meantime, or the show was
--     hard-deleted (then the FK would also fail). Refusing would park a
--     dog or exhibitor the secretary has already entered dogs against. Nulling
--     the claim keeps the row, and never records a show the inserter cannot
--     manage.
--     Silent restore on UPDATE, rather than RAISE as in
--     private.classes_block_direct_results_verified_write (MYK9-1045), for the
--     same reason: a replicated UPDATE that carries a stale copy of these
--     columns must not fail permanently in the queue.
--
-- GRANTS
--
--   Verified against the live database before writing this file (read-only,
--   2026-10-09). pg_class.relacl on both tables: authenticated=arwd,
--   service_role=arwdDxtm, plus supabase_auth_admin=r on people, and NO
--   table-level entry for anon. pg_attribute.attacl: anon holds column SELECT
--   only on dogs (id, name, call_name, breed, image_url) and people (id,
--   first_name, last_name, email).
--
--   anon: a new column is unreachable by construction (column allowlist, no
--   table-level grant). The column REVOKE below makes that explicit, so a future
--   blanket column GRANT has to argue with it. The allowlists are then restated
--   unchanged, because anonEntriesGrantContract treats any revoke on these
--   tables as clearing them (same shape as 20260918154700).
--
--   authenticated: holds TABLE-level arwd on both tables, so it can read and
--   write both new columns. A column REVOKE cannot narrow a table-level grant
--   (LESSON grant-never-narrows), and switching either table to a column
--   allowlist would 403 every select('*') on them (the dogs replica syncs with
--   one). Server stamping therefore lives in the trigger, not in the ACL. Read
--   exposure: created_by is an opaque auth uid on rows RLS already shows the
--   caller, the same class as deleted_by. The diagnostic itself reads with
--   service_role. The table grant is restated unchanged below because a
--   migration that grants on an existing table must decide both API roles
--   (migrationGrantDecisionContract).
--
--   The trigger function lives in schema private, is SECURITY INVOKER (it
--   only reads JWT claims and calls can_manage_show, which authenticated may
--   EXECUTE), and is executable by no API role.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1 + 2. Columns, foreign keys and indexes
-- ---------------------------------------------------------------------------
ALTER TABLE public.dogs
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_from_show_id uuid
    CONSTRAINT dogs_created_from_show_id_fkey
    REFERENCES public.shows(id) ON DELETE SET NULL;

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_from_show_id uuid
    CONSTRAINT people_created_from_show_id_fkey
    REFERENCES public.shows(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.dogs.created_by IS
  'MYK9-1059: auth uid of the account that inserted the dog. Forced to auth.uid() on every API-session INSERT and immutable on UPDATE (private.guard_creation_attribution). NULL for rows that predate the column and for service_role/seed inserts.';
COMMENT ON COLUMN public.dogs.created_from_show_id IS
  'MYK9-1059: the show whose add-entry flow created the dog. Set by the client on INSERT only, kept only when the inserter can manage that show (otherwise NULL), immutable afterwards except for being cleared. Read by the admin loose-ends diagnostic.';
COMMENT ON COLUMN public.people.created_by IS
  'MYK9-1059: auth uid of the account that inserted the person. Forced to auth.uid() on every API-session INSERT and immutable on UPDATE (private.guard_creation_attribution). NULL for rows that predate the column, for service_role/seed inserts and for sign-up rows made by handle_new_user.';
COMMENT ON COLUMN public.people.created_from_show_id IS
  'MYK9-1059: the show whose add-entry flow created the person. Set by the client on INSERT only, kept only when the inserter can manage that show (otherwise NULL), immutable afterwards except for being cleared. Read by the admin loose-ends diagnostic.';

CREATE INDEX IF NOT EXISTS dogs_created_from_show_id_idx
  ON public.dogs (created_from_show_id)
  WHERE created_from_show_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS people_created_from_show_id_idx
  ON public.people (created_from_show_id)
  WHERE created_from_show_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Server-stamped, immutable attribution
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.guard_creation_attribution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- service_role, cron and seed sessions: no auth.uid(), keep what they supply.
  IF auth.uid() IS NULL
     AND coalesce(current_setting('role', true), 'none') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    -- Drop, never refuse: a queued insert replayed after the role ended must
    -- still land (see the migration header).
    IF NEW.created_from_show_id IS NOT NULL
       AND coalesce(public.can_manage_show(NEW.created_from_show_id), false) IS NOT TRUE THEN
      NEW.created_from_show_id := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: both immutable. Clearing created_from_show_id is let through so
  -- ON DELETE SET NULL can do its job.
  NEW.created_by := OLD.created_by;
  IF NEW.created_from_show_id IS NOT NULL THEN
    NEW.created_from_show_id := OLD.created_from_show_id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.guard_creation_attribution() IS
  'MYK9-1059: dogs/people created_by and created_from_show_id are server-controlled for API sessions (auth.uid() set, or role authenticated/anon). INSERT forces created_by := auth.uid() and nulls a created_from_show_id the inserter cannot manage (can_manage_show). UPDATE restores both, except that created_from_show_id may be cleared (ON DELETE SET NULL). Other sessions keep the supplied values.';

REVOKE ALL ON FUNCTION private.guard_creation_attribution() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_00_creation_attribution_insert ON public.dogs;
CREATE TRIGGER trg_00_creation_attribution_insert
  BEFORE INSERT ON public.dogs
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_creation_attribution();

DROP TRIGGER IF EXISTS trg_00_creation_attribution_update ON public.dogs;
CREATE TRIGGER trg_00_creation_attribution_update
  BEFORE UPDATE OF created_by, created_from_show_id ON public.dogs
  FOR EACH ROW
  WHEN (OLD.created_by IS DISTINCT FROM NEW.created_by
        OR OLD.created_from_show_id IS DISTINCT FROM NEW.created_from_show_id)
  EXECUTE FUNCTION private.guard_creation_attribution();

DROP TRIGGER IF EXISTS trg_00_creation_attribution_insert ON public.people;
CREATE TRIGGER trg_00_creation_attribution_insert
  BEFORE INSERT ON public.people
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_creation_attribution();

DROP TRIGGER IF EXISTS trg_00_creation_attribution_update ON public.people;
CREATE TRIGGER trg_00_creation_attribution_update
  BEFORE UPDATE OF created_by, created_from_show_id ON public.people
  FOR EACH ROW
  WHEN (OLD.created_by IS DISTINCT FROM NEW.created_by
        OR OLD.created_from_show_id IS DISTINCT FROM NEW.created_from_show_id)
  EXECUTE FUNCTION private.guard_creation_attribution();

-- ---------------------------------------------------------------------------
-- 4. Grants. Revoke first, then restate: the final state is what is granted.
-- ---------------------------------------------------------------------------

-- anon: never the new columns. A no-op today (anon has no table-level grant
-- and no column grant on them); written down so a later blanket column grant
-- has to argue with it.
REVOKE ALL (created_by, created_from_show_id) ON public.dogs FROM anon;
REVOKE ALL (created_by, created_from_show_id) ON public.people FROM anon;

-- anon's embed allowlists, restated unchanged (sources: 20260725170000,
-- 20260725180000, 20260730220000, 20260918154700). Nothing is added here.
GRANT SELECT (id, name, call_name, breed, image_url) ON public.dogs TO anon;
GRANT SELECT (id, first_name, last_name, email) ON public.people TO anon;

-- authenticated: the table-level grants it already holds, restated unchanged.
-- RLS scopes the rows; the trigger above owns the two new columns.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dogs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
