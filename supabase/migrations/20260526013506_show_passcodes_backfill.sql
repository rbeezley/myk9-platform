-- Phase 0 backfill — generate hashed passcodes for every existing show.
--
-- The base Phase 0 migration (20260525180000_show_passcodes) created the
-- table, the Vault pepper, and the SECURITY DEFINER RPCs but only
-- populated rows for NEW shows (via insert_show_passcodes called from the
-- show-creation wizard). Existing shows still rely on the legacy
-- UUID-derivation fallback in apps/myk9q/supabase/functions/
-- validate-passcode/index.ts.
--
-- This migration generates 4 random codes per pre-existing show via the
-- same _generate_unique_role_code helper that insert_show_passcodes uses,
-- making every show reachable via the new validate_passcode RPC.
--
-- OPERATIONAL NOTE — this migration alone kills the legacy `myK9Q1-…`
-- derived passcodes, not a separate follow-up. The validate-passcode
-- edge function's legacy fallback filters by `show_passcodes` membership
-- (`if (migratedShowIds.has(show.id)) continue;`) — once every show has
-- show_passcodes rows, the legacy scan iterates zero shows and any
-- previously-printed derived code stops authenticating. Secretaries of
-- pre-existing shows must call regenerate_show_passcodes(show_id) from
-- the admin UI to get fresh plaintexts. Per project memory both apps are
-- pre-launch with no real users, so this is acceptable friction.
--
-- IDEMPOTENCY — re-running this migration is a no-op:
--   * Any show with EXISTING show_passcodes rows is skipped entirely
--     (guard: `v_role_count > 0`, not `>= 4`). This is deliberately
--     conservative — a partial state (1-3 rows) is an anomaly that
--     should not be silently completed by the backfill, because the
--     plaintexts that would be generated have no channel to reach the
--     secretary. Operators must investigate partial-state shows
--     manually (regenerate_show_passcodes overwrites all 4 deterministically).
--   * The advisory lock prevents two concurrent runs from generating
--     duplicate work.
--
-- CONCURRENCY — `pg_advisory_xact_lock` serializes against any other
-- session also trying to grab this same lock key. The
-- `insert_show_passcodes` RPC does NOT take the same lock, so a
-- wizard-driven new-show insert during the backfill is not blocked
-- (the (show_id, role) UNIQUE constraint guarantees correctness either
-- way — a race would just mean both paths see "no rows" and one wins
-- the UNIQUE, the other no-ops via ON CONFLICT).
--
-- SOFT-DELETED SHOWS — excluded from the backfill (`where deleted_at is
-- null`). validate_passcode does not currently filter by deleted_at, so
-- generating passcodes for a soft-deleted show would provision live
-- access to a deleted resource. If a show is restored, the secretary
-- can call regenerate_show_passcodes to provision codes at that time.
--
-- The FK CASCADE on show_passcodes handles hard-deleted shows.

begin;

-- Defense in depth: explicit empty search_path. The DO block fully
-- qualifies every relation (`public.shows`, `public.show_passcodes`)
-- and every function (`public._generate_unique_role_code`), so this
-- is belt-and-suspenders against a hostile schema named `public`
-- earlier in the migration role's search_path.
set local search_path = '';

-- Bounded transaction time. At pre-launch (<100 shows × 4 roles ≈ 400
-- HMAC + Vault decrypts) the loop completes in seconds; the 5-minute
-- ceiling protects against Vault slowdowns or unexpected lock waits
-- pushing the migration into an indefinite hang.
set local statement_timeout = '5min';

do $$
declare
  v_show_id uuid;
  v_role text;
  v_role_count int;
  v_unique public._generate_unique_role_code%rowtype;
  v_processed_shows int := 0;
  v_skipped_shows int := 0;
begin
  -- Serialize against any other concurrent invocation of this same
  -- backfill. The lock key is an arbitrary hash of a sentinel string.
  perform pg_advisory_xact_lock(hashtext('show_passcodes_backfill_v1'));

  for v_show_id in
    select id from public.shows where deleted_at is null order by created_at asc, id asc
  loop
    -- Conservative idempotency guard: skip any show with ANY existing
    -- show_passcodes rows. Partial-state shows (1-3 rows) are an
    -- anomaly the operator must resolve via regenerate_show_passcodes,
    -- not something the backfill silently completes — because the
    -- generated plaintexts have no channel to reach the secretary.
    select count(*) into v_role_count
      from public.show_passcodes
     where show_id = v_show_id;

    if v_role_count > 0 then
      v_skipped_shows := v_skipped_shows + 1;
      continue;
    end if;

    -- Generate via the same helper insert_show_passcodes uses so the
    -- retry-on-collision semantics apply identically. Each role is
    -- generated independently; the helper guarantees no global hash
    -- collision against the UNIQUE(passcode_hash) constraint.
    --
    -- v_unique.plaintext is intentionally discarded — there is no
    -- channel to deliver it to the secretary from a SQL-only migration.
    -- The plaintext-recovery path is regenerate_show_passcodes from
    -- the admin UI.
    foreach v_role in array array['admin','judge','steward','exhibitor'] loop
      v_unique := public._generate_unique_role_code(v_role);
      insert into public.show_passcodes (show_id, role, passcode_hash)
      values (v_show_id, v_role, v_unique.hash)
      -- Race safety with concurrent insert_show_passcodes (wizard) calls.
      -- The advisory lock above serializes against other backfill runs
      -- but the wizard's RPC does not take this lock. Window is
      -- microseconds and unobservable at pre-launch scale, but the
      -- ON CONFLICT keeps the migration succeeding if it ever fires.
      on conflict (show_id, role) do nothing;
    end loop;

    v_processed_shows := v_processed_shows + 1;
  end loop;

  raise notice 'show_passcodes backfill: processed % shows, skipped % already-populated or partial',
    v_processed_shows, v_skipped_shows;
end
$$;

commit;
