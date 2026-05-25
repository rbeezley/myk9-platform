-- Phase 0 backfill — give every existing show a fresh set of hashed passcodes.
--
-- The previous migration (20260525180000_show_passcodes) created the table
-- and the SECURITY DEFINER RPCs but did not populate any rows. Existing
-- shows must still be reachable via the new validate_passcode RPC, so this
-- migration generates 4 random codes per show server-side and stores their
-- hashes.
--
-- IMPORTANT OPERATIONAL NOTE: this is a SQL-only migration. It has no
-- channel to return plaintexts to the secretary of each pre-existing show,
-- so it stores ONLY hashes. The previous license-key-derived passcodes
-- (e.g. exhibitor codes printed on Heritage event pages) STOP WORKING
-- immediately when this migration runs. Secretaries of pre-existing shows
-- must explicitly call regenerate_show_passcodes(show_id) from the admin
-- UI to get a fresh set of plaintexts they can distribute. This is
-- documented in the Phase 0 PR description.
--
-- Soft-deleted shows are included in the backfill because they may be
-- restored later; cascading delete on the FK handles them at hard-delete
-- time.
--
-- The backfill is idempotent: shows that already have a complete 4-row
-- passcode set (e.g. from a newer create_show_with_children call that ran
-- between the prior migration and this one) are skipped via the
-- UNIQUE(show_id, role) constraint and the WHERE NOT EXISTS guard.

begin;

do $$
declare
  v_show_id uuid;
  v_role text;
  v_role_count int;
begin
  for v_show_id in
    select id from public.shows
  loop
    -- Skip shows already fully populated. The WHERE NOT EXISTS keeps the
    -- backfill idempotent if the migration is replayed.
    select count(*) into v_role_count
      from public.show_passcodes
     where show_id = v_show_id;

    if v_role_count >= 4 then
      continue;
    end if;

    foreach v_role in array array['admin','judge','steward','exhibitor'] loop
      insert into public.show_passcodes (show_id, role, passcode_hash)
      values (
        v_show_id,
        v_role,
        public._hash_passcode(public._random_role_code(v_role))
      )
      on conflict (show_id, role) do nothing;
    end loop;
  end loop;
end
$$;

commit;
