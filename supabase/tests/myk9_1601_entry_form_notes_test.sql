-- MYK9-1601: entry_form_notes are private to show officials.
--
-- Asserts:
--   1. The enrollment's exhibitor (its handler), signed in, gets ZERO rows by select,
--      by embed (LATERAL from enrollments, the shape of PostgREST's
--      `enrollments?select=*,entry_form_notes(*)`), and cannot insert or update one.
--   2. No function other than the guard trigger reads the table, so no RPC can serve
--      a note to an exhibitor (checked against pg_proc, not source text of the app).
--   3. anon gets 42501 (no grant at all).
--   4. A secretary of a DIFFERENT club gets zero rows and cannot insert on this show.
--   5. The show's secretary sees the notes, can add one (show_id derived from the
--      enrollment even if the client lies), edits her own, soft-deletes her own, and
--      cannot edit or delete a colleague's note.
--   6. A site admin sees every note and may edit or soft-delete any.
--   9. Soft delete is final; deleting an author's people row nulls created_by and succeeds.
--   8. A club-scoped steward reads the notes; a missing enrollment refuses with 42501
--      like a foreign one; an author demoted from official cannot edit.
--   7. relacl carries no anon grant, and no column-level ACL widens access.
--
-- Run with psql -X -v ON_ERROR_STOP=1 against a migrated database; fixtures roll back.

begin;

insert into public.roles (id, name, description, is_system)
values
  ('00000000-0000-0000-0000-000000160101', 'secretary', 'MYK9-1601 fixture', true),
  ('00000000-0000-0000-0000-000000160102', 'site_admin', 'MYK9-1601 fixture', true),
  ('00000000-0000-0000-0000-000000160103', 'exhibitor', 'MYK9-1601 fixture', true),
  ('00000000-0000-0000-0000-000000160104', 'steward', 'MYK9-1601 fixture', true)
on conflict (name) do nothing;

insert into public.clubs (id, name)
values
  ('00000000-0000-0000-0000-000000160001', 'MYK9-1601 Club A'),
  ('00000000-0000-0000-0000-000000160002', 'MYK9-1601 Club B');

insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
                          accept_check_payments, accept_cash_payments)
values
  ('00000000-0000-0000-0000-000000160011', 'MYK9-1601 Show A', 'AKC',
   current_date + 10, current_date + 11, '00000000-0000-0000-0000-000000160001',
   'published', true, true),
  ('00000000-0000-0000-0000-000000160012', 'MYK9-1601 Show B', 'AKC',
   current_date + 10, current_date + 11, '00000000-0000-0000-0000-000000160002',
   'published', true, true);

insert into public.people (id, first_name, last_name, auth_user_id)
values
  ('00000000-0000-0000-0000-000000160051', 'Club A', 'Secretary', '00000000-0000-0000-0000-000000160151'),
  ('00000000-0000-0000-0000-000000160052', 'Site', 'Admin', '00000000-0000-0000-0000-000000160152'),
  ('00000000-0000-0000-0000-000000160053', 'Club B', 'Secretary', '00000000-0000-0000-0000-000000160153'),
  ('00000000-0000-0000-0000-000000160054', 'The', 'Exhibitor', '00000000-0000-0000-0000-000000160154'),
  ('00000000-0000-0000-0000-000000160055', 'Club A', 'Colleague', '00000000-0000-0000-0000-000000160155'),
  ('00000000-0000-0000-0000-000000160056', 'Club A', 'Steward', '00000000-0000-0000-0000-000000160156');

insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000160051', id, '00000000-0000-0000-0000-000000160001',
  true, '00000000-0000-0000-0000-000000160151' from public.roles where name = 'secretary';
insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000160055', id, '00000000-0000-0000-0000-000000160001',
  true, '00000000-0000-0000-0000-000000160155' from public.roles where name = 'secretary';
insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000160053', id, '00000000-0000-0000-0000-000000160002',
  true, '00000000-0000-0000-0000-000000160153' from public.roles where name = 'secretary';
insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000160056', id, '00000000-0000-0000-0000-000000160001',
  true, '00000000-0000-0000-0000-000000160156' from public.roles where name = 'steward';
insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000160052', id, true, '00000000-0000-0000-0000-000000160152'
from public.roles where name = 'site_admin';
insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000160054', id, true, '00000000-0000-0000-0000-000000160154'
from public.roles where name = 'exhibitor';

insert into public.enrollments (id, show_id, handler_id)
values
  ('00000000-0000-0000-0000-000000160061', '00000000-0000-0000-0000-000000160011',
   '00000000-0000-0000-0000-000000160054'),
  ('00000000-0000-0000-0000-000000160062', '00000000-0000-0000-0000-000000160012',
   '00000000-0000-0000-0000-000000160054');

-- Fixture notes, written as the table owner. Note 1: the Club A secretary's; note 2:
-- her colleague's; note 3: on Show B.
insert into public.entry_form_notes (id, enrollment_id, show_id, body, created_by)
values
  ('00000000-0000-0000-0000-000000160071', '00000000-0000-0000-0000-000000160061',
   '00000000-0000-0000-0000-000000160011', 'paid check 1123', '00000000-0000-0000-0000-000000160051'),
  ('00000000-0000-0000-0000-000000160072', '00000000-0000-0000-0000-000000160061',
   '00000000-0000-0000-0000-000000160011', 'colleague note', '00000000-0000-0000-0000-000000160055'),
  ('00000000-0000-0000-0000-000000160073', '00000000-0000-0000-0000-000000160062',
   '00000000-0000-0000-0000-000000160012', 'show B note', '00000000-0000-0000-0000-000000160053');

-- Positive control: the owner sees all three, so the zero-row assertions are not vacuous.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.entry_form_notes
   WHERE id IN ('00000000-0000-0000-0000-000000160071','00000000-0000-0000-0000-000000160072',
                '00000000-0000-0000-0000-000000160073');
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL fixture did not land: % notes', n; END IF;
  RAISE NOTICE 'PASS fixture control: 3 notes exist';
END;
$$;

-- 7. ACL shape (owner context).
DO $$
DECLARE acl text; col_acl integer;
BEGIN
  SELECT coalesce(string_agg(a::text, ' '), '') INTO acl
  FROM pg_class c, unnest(c.relacl) AS a
  WHERE c.oid = 'public.entry_form_notes'::regclass;
  IF acl ~ '(^| )=' OR acl ~ 'anon=' THEN
    RAISE EXCEPTION 'FAIL relacl carries a PUBLIC/anon grant: %', acl;
  END IF;
  SELECT count(*) INTO col_acl FROM pg_attribute
   WHERE attrelid = 'public.entry_form_notes'::regclass AND attacl IS NOT NULL;
  IF col_acl <> 0 THEN RAISE EXCEPTION 'FAIL % column-level ACLs present', col_acl; END IF;
  IF NOT (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.entry_form_notes'::regclass) THEN
    RAISE EXCEPTION 'FAIL RLS is not forced';
  END IF;
  IF has_table_privilege('authenticated', 'public.entry_form_notes', 'DELETE')
     OR has_table_privilege('authenticated', 'public.entry_form_notes', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.entry_form_notes', 'REFERENCES')
     OR has_table_privilege('authenticated', 'public.entry_form_notes', 'TRIGGER') THEN
    RAISE EXCEPTION 'FAIL authenticated holds DELETE/TRUNCATE/REFERENCES/TRIGGER';
  END IF;
  IF NOT (has_table_privilege('authenticated', 'public.entry_form_notes', 'SELECT')
          AND has_table_privilege('authenticated', 'public.entry_form_notes', 'INSERT')
          AND has_table_privilege('authenticated', 'public.entry_form_notes', 'UPDATE')) THEN
    RAISE EXCEPTION 'FAIL authenticated lost SELECT/INSERT/UPDATE';
  END IF;
  RAISE NOTICE 'PASS no anon grant, no column grants, RLS forced, authenticated narrowed';
END;
$$;

-- 2. No function (RPC) reads the table except a DECLARED, reviewed list. A new function
--    that names the table fails here until someone adds it below with the reason it
--    cannot hand note text to an exhibitor.
--      entry_form_notes_guard: the table's own BEFORE trigger; returns only the new row.
--      hard_delete_show: site-admin-only; names entry_form_notes_show_id_fkey in its FK
--        manifest and counts rows to refuse the delete; never returns note text.
DO $$
DECLARE offenders text;
BEGIN
  SELECT string_agg(n.nspname || '.' || p.proname, ', ') INTO offenders
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND p.prosrc ILIKE '%entry_form_notes%'
    AND (n.nspname, p.proname) NOT IN (
      ('public', 'entry_form_notes_guard'),
      ('public', 'hard_delete_show')
    );
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL unreviewed function(s) reference entry_form_notes: %', offenders;
  END IF;
  RAISE NOTICE 'PASS only reviewed functions reference entry_form_notes';
END;
$$;

-- 1. The exhibitor.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000160154', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000160154","role":"authenticated","app_metadata":{}}', true);

DO $$
DECLARE direct integer; embedded integer; own_enrollments integer; wrote boolean := false;
BEGIN
  SELECT count(*) INTO direct FROM public.entry_form_notes;
  SELECT count(*) INTO own_enrollments FROM public.enrollments
   WHERE id IN ('00000000-0000-0000-0000-000000160061','00000000-0000-0000-0000-000000160062');
  -- Positive control: the exhibitor DOES read their own enrollments.
  IF own_enrollments <> 2 THEN
    RAISE EXCEPTION 'FAIL control: exhibitor reads % of their 2 enrollments', own_enrollments;
  END IF;
  SELECT count(*) INTO embedded FROM public.enrollments e
    CROSS JOIN LATERAL (SELECT n.id FROM public.entry_form_notes n WHERE n.enrollment_id = e.id) x;
  IF direct <> 0 THEN RAISE EXCEPTION 'FAIL exhibitor selects % notes', direct; END IF;
  IF embedded <> 0 THEN RAISE EXCEPTION 'FAIL exhibitor embeds % notes', embedded; END IF;
  BEGIN
    INSERT INTO public.entry_form_notes (enrollment_id, body)
    VALUES ('00000000-0000-0000-0000-000000160061', 'exhibitor injected');
    wrote := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF wrote THEN RAISE EXCEPTION 'FAIL exhibitor inserted a note'; END IF;
  UPDATE public.entry_form_notes SET body = 'tampered';
  GET DIAGNOSTICS direct = ROW_COUNT;
  IF direct <> 0 THEN RAISE EXCEPTION 'FAIL exhibitor updated % notes', direct; END IF;
  RAISE NOTICE 'PASS exhibitor: zero rows by select and embed, no write';
END;
$$;
RESET ROLE;

-- 3. anon.
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.entry_form_notes;
    RAISE EXCEPTION 'FAIL anon select did not raise';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE 'PASS anon gets 42501';
END;
$$;
RESET ROLE;

-- 4. A different club's secretary.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000160153', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000160153","role":"authenticated","app_metadata":{}}', true);
DO $$
DECLARE other_show integer; own_show integer; wrote boolean := false;
BEGIN
  SELECT count(*) INTO other_show FROM public.entry_form_notes
   WHERE show_id = '00000000-0000-0000-0000-000000160011';
  SELECT count(*) INTO own_show FROM public.entry_form_notes
   WHERE show_id = '00000000-0000-0000-0000-000000160012';
  IF own_show <> 1 THEN RAISE EXCEPTION 'FAIL control: Club B secretary sees % of own 1', own_show; END IF;
  IF other_show <> 0 THEN RAISE EXCEPTION 'FAIL Club B secretary reads % Show A notes', other_show; END IF;
  BEGIN
    INSERT INTO public.entry_form_notes (enrollment_id, body, created_by)
    VALUES ('00000000-0000-0000-0000-000000160061', 'cross-show',
            '00000000-0000-0000-0000-000000160053');
    wrote := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF wrote THEN RAISE EXCEPTION 'FAIL Club B secretary inserted on Show A'; END IF;
  RAISE NOTICE 'PASS other show''s secretary: zero rows, cannot insert';
END;
$$;
RESET ROLE;

-- 5. The show's secretary.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000160151', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000160151","role":"authenticated","app_metadata":{}}', true);
DO $$
DECLARE seen integer; n integer; derived uuid; new_id uuid;
BEGIN
  SELECT count(*) INTO seen FROM public.entry_form_notes
   WHERE enrollment_id = '00000000-0000-0000-0000-000000160061';
  IF seen <> 2 THEN RAISE EXCEPTION 'FAIL secretary sees % of 2 notes', seen; END IF;

  -- show_id is derived from the enrollment even when the client names another show.
  INSERT INTO public.entry_form_notes (enrollment_id, show_id, body)
  VALUES ('00000000-0000-0000-0000-000000160061', '00000000-0000-0000-0000-000000160012', 'late order asked')
  RETURNING id, show_id INTO new_id, derived;
  IF derived <> '00000000-0000-0000-0000-000000160011' THEN
    RAISE EXCEPTION 'FAIL show_id not derived from the enrollment: %', derived;
  END IF;

  UPDATE public.entry_form_notes SET body = 'paid check 1123, cleared'
   WHERE id = '00000000-0000-0000-0000-000000160071';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL author could not edit own note'; END IF;

  UPDATE public.entry_form_notes SET body = 'overwritten'
   WHERE id = '00000000-0000-0000-0000-000000160072';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL secretary edited a colleague''s note'; END IF;

  UPDATE public.entry_form_notes SET deleted_at = now()
   WHERE id = '00000000-0000-0000-0000-000000160072';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL secretary deleted a colleague''s note'; END IF;

  BEGIN
    UPDATE public.entry_form_notes SET enrollment_id = '00000000-0000-0000-0000-000000160062'
     WHERE id = new_id;
    RAISE EXCEPTION 'FAIL enrollment_id moved';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  UPDATE public.entry_form_notes SET deleted_at = now() WHERE id = new_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL author could not soft-delete own note'; END IF;
  RAISE NOTICE 'PASS show secretary: add, edit own, soft-delete own, not a colleague''s';
END;
$$;
RESET ROLE;

-- Steward (club-scoped, via official_show_ids) reads the notes: pins "officials".
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000160156', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000160156","role":"authenticated","app_metadata":{}}', true);
DO $$
DECLARE seen integer;
BEGIN
  SELECT count(*) INTO seen FROM public.entry_form_notes
   WHERE id IN ('00000000-0000-0000-0000-000000160071','00000000-0000-0000-0000-000000160072');
  IF seen <> 2 THEN RAISE EXCEPTION 'FAIL steward sees % of 2 Show A fixture notes', seen; END IF;
  RAISE NOTICE 'PASS club-scoped steward reads the show''s notes';
END;
$$;
RESET ROLE;

-- Inserting on a missing enrollment gives the same 42501 as someone else's (no oracle).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000160151', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000160151","role":"authenticated","app_metadata":{}}', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.entry_form_notes (enrollment_id, body)
    VALUES ('00000000-0000-0000-0000-0000001609ff', 'ghost');
    RAISE EXCEPTION 'FAIL insert on a missing enrollment succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE 'PASS missing enrollment refuses with 42501';
END;
$$;
RESET ROLE;

-- Deliberate: an author who is no longer an official cannot edit their own note.
update public.user_roles set is_active = false
 where auth_user_id = '00000000-0000-0000-0000-000000160151';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000160151', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000160151","role":"authenticated","app_metadata":{}}', true);
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.entry_form_notes SET body = 'still mine?'
   WHERE id = '00000000-0000-0000-0000-000000160071';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL demoted author edited a note'; END IF;
  RAISE NOTICE 'PASS demoted author cannot edit';
END;
$$;
RESET ROLE;

-- 6. Site admin.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000160152', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000160152","role":"authenticated","app_metadata":{}}', true);
DO $$
DECLARE seen integer; n integer;
BEGIN
  SELECT count(*) INTO seen FROM public.entry_form_notes
   WHERE enrollment_id IN ('00000000-0000-0000-0000-000000160061',
                           '00000000-0000-0000-0000-000000160062');
  IF seen <> 4 THEN RAISE EXCEPTION 'FAIL site admin sees % of the 4 fixture-enrollment notes', seen; END IF;
  UPDATE public.entry_form_notes SET deleted_at = now()
   WHERE id = '00000000-0000-0000-0000-000000160072';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL site admin could not soft-delete a colleague''s note'; END IF;
  RAISE NOTICE 'PASS site admin: sees all, may delete any';
END;
$$;
RESET ROLE;

-- hard_delete_show's reviewed FK manifest knows entry_form_notes (20261031163800): an
-- unused show still deletes (no drift refusal), and a show holding notes is refused with
-- MK615 and keeps its note. Without the manifest row, BOTH would raise MK615 for drift.
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000000160013', 'MYK9-1601 Unused Show', 'AKC',
        current_date + 10, current_date + 11, '00000000-0000-0000-0000-000000160001', 'draft');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000160152', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000160152","role":"authenticated","app_metadata":{}}', true);
DO $$
DECLARE msg text; state text;
BEGIN
  PERFORM public.hard_delete_show('00000000-0000-0000-0000-000000160013');
  IF EXISTS (SELECT 1 FROM public.shows WHERE id = '00000000-0000-0000-0000-000000160013') THEN
    RAISE EXCEPTION 'FAIL unused show was not deleted';
  END IF;
  BEGIN
    PERFORM public.hard_delete_show('00000000-0000-0000-0000-000000160011');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT, state = RETURNED_SQLSTATE;
  END;
  IF state IS DISTINCT FROM 'MK615' THEN
    RAISE EXCEPTION 'FAIL show with notes: expected MK615, got %: %', state, msg;
  END IF;
  IF msg ILIKE '%changed since hard_delete_show%' OR msg ILIKE '%entry_form_notes_show_id_fkey%' THEN
    RAISE EXCEPTION 'FAIL manifest drift on entry_form_notes: %', msg;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.entry_form_notes
                 WHERE id = '00000000-0000-0000-0000-000000160071') THEN
    RAISE EXCEPTION 'FAIL a refused delete lost a note';
  END IF;
  RAISE NOTICE 'PASS hard_delete_show manifest classifies entry_form_notes';
END;
$$;
RESET ROLE;

-- Deletion is final (owner context; the guard trigger still fires). Note ...72 was
-- soft-deleted above by the site admin.
DO $$
BEGIN
  BEGIN
    UPDATE public.entry_form_notes SET deleted_at = NULL
     WHERE id = '00000000-0000-0000-0000-000000160072';
    RAISE EXCEPTION 'FAIL a deleted note was restored';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    UPDATE public.entry_form_notes SET body = 'edited after delete'
     WHERE id = '00000000-0000-0000-0000-000000160072';
    RAISE EXCEPTION 'FAIL a deleted note was edited';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE 'PASS soft delete is final';
END;
$$;

-- Deleting an author's people row (FK ON DELETE SET NULL) must not be blocked by the
-- guard, including for an already soft-deleted note. This author owns no dogs, so the
-- MK001 owns-dogs trigger does not apply.
insert into public.people (id, first_name, last_name)
values ('00000000-0000-0000-0000-000000160057', 'Departing', 'Author');
insert into public.entry_form_notes (id, enrollment_id, body, created_by, deleted_at)
values
  ('00000000-0000-0000-0000-000000160074', '00000000-0000-0000-0000-000000160061',
   'live note', '00000000-0000-0000-0000-000000160057', null),
  ('00000000-0000-0000-0000-000000160075', '00000000-0000-0000-0000-000000160061',
   'deleted note', '00000000-0000-0000-0000-000000160057', now());
DO $$
DECLARE nulls integer;
BEGIN
  DELETE FROM public.people WHERE id = '00000000-0000-0000-0000-000000160057';
  SELECT count(*) INTO nulls FROM public.entry_form_notes
   WHERE id IN ('00000000-0000-0000-0000-000000160074','00000000-0000-0000-0000-000000160075')
     AND created_by IS NULL;
  IF nulls <> 2 THEN RAISE EXCEPTION 'FAIL author delete left % of 2 notes with NULL created_by', nulls; END IF;
  RAISE NOTICE 'PASS deleting an author nulls created_by without being blocked';
END;
$$;

rollback;
