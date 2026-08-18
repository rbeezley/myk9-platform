-- REVOKE client grants on public.ringside_containment_audit_id_seq.
--
-- The identity column on ringside_containment_audit creates this sequence
-- implicitly, and the table was created out of band (see
-- 20260731190000_ringside_containment_state.sql), so nothing ever gave the
-- sequence an explicit ACL. This project carries ALTER DEFAULT PRIVILEGES in
-- schema public that hand new objects to anon/authenticated, and on the live
-- project it did exactly that — verified 2026-08-01:
--
--   select relacl from pg_class where oid = 'public.ringside_containment_audit_id_seq'::regclass;
--   -- postgres=rwU/postgres | authenticated=rwU/postgres | service_role=rwU/postgres
--
-- `authenticated=rwU` means any signed-in account can nextval()/setval() the
-- breaker's audit sequence. They hold no INSERT on the table, so they cannot
-- forge an audit row, but they can advance or rewind the id counter that the
-- trip/rearm history is ordered by — on the audit trail of a safety control.
--
-- This is the third time the same trap has bitten (dog_favorites, MYK9-93,
-- now here). Omitting a GRANT does NOT keep clients out; only a REVOKE does.
-- It needs its own migration rather than an edit to 20260731190000, because
-- that version is already recorded in schema_migrations and will never re-run.
--
-- Owner-only is correct: rows are inserted by ringside_containment_sample() and
-- ringside_containment_rearm(), both SECURITY DEFINER, so they write as the
-- table owner and need no sequence grant. service_role reads the table but
-- never inserts, so it needs nothing here either.

begin;

revoke all on sequence public.ringside_containment_audit_id_seq from public;
revoke all on sequence public.ringside_containment_audit_id_seq from anon;
revoke all on sequence public.ringside_containment_audit_id_seq from authenticated;
revoke all on sequence public.ringside_containment_audit_id_seq from service_role;

commit;
