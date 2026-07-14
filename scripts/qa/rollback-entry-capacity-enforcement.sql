\set ON_ERROR_STOP on

-- Execute with psql from any directory. \ir resolves these paths relative to
-- this script, making rollback reproducible without copying function bodies.
BEGIN;

\ir ../../supabase/migrations/20260628202146_create_online_paid_entry_capacity_gate.sql
\ir ../../supabase/migrations/20260711190000_guard_submit_show_entries_entry_open.sql

REVOKE ALL ON FUNCTION public.evaluate_entry_capacity(
  uuid, uuid, uuid, uuid, text, boolean
) FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION public.evaluate_entry_capacity(uuid, uuid, uuid, uuid, text, boolean);

COMMIT;
