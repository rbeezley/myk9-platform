-- MYK9-2515: get_admin_user_list only reads (a caller check and one SELECT) but
-- was created without a volatility keyword, so it is VOLATILE. The read-only
-- walk guard allows an RPC only when it is STABLE or IMMUTABLE, so it refused
-- the function and /admin/users showed "Failed to load users".
--
-- ALTER, not CREATE OR REPLACE: only provolatile changes. The body, the
-- `SET search_path = public, auth` setting and proacl stay exactly as they are
-- (the B2 legacy list in supabase/tests/schema_security_invariants_test.sql
-- still expects this function to keep its search_path).

BEGIN;

-- 1. Re-read the live body and stop if it has gained a write or dynamic SQL.
--    Word-boundary anchored, so updated_at / deleted_at / deleted_by do not trip it.
DO $$
DECLARE
  v_def text := pg_catalog.pg_get_functiondef('public.get_admin_user_list(boolean)'::regprocedure);
  v_marker text;
BEGIN
  v_marker := substring(
    v_def from '(?i)\m(insert|update|delete|truncate|merge|execute|perform|nextval|setval|set_config|pg_notify)\M'
  );
  IF v_marker IS NOT NULL THEN
    RAISE EXCEPTION
      'MYK9-2515: get_admin_user_list body contains "%"; it is no longer provably read-only, so it is not declared STABLE. Read the body before changing this migration.',
      v_marker;
  END IF;
END;
$$;

-- 2. Remember the ACL, so step 4 can prove ALTER left it alone.
DO $$
BEGIN
  PERFORM pg_catalog.set_config(
    'myk9.proacl_before_2515',
    coalesce((SELECT proacl::text FROM pg_catalog.pg_proc WHERE oid = 'public.get_admin_user_list(boolean)'::regprocedure), '<null>'),
    true
  );
END;
$$;

-- 3. The change.
ALTER FUNCTION public.get_admin_user_list(boolean) STABLE;

-- 4. Prove it: STABLE, and grants unchanged.
DO $$
DECLARE
  v_vol "char";
  v_acl text;
BEGIN
  SELECT provolatile, coalesce(proacl::text, '<null>')
    INTO v_vol, v_acl
  FROM pg_catalog.pg_proc
  WHERE oid = 'public.get_admin_user_list(boolean)'::regprocedure;

  IF v_vol <> 's' THEN
    RAISE EXCEPTION 'MYK9-2515: get_admin_user_list provolatile is %, expected s', v_vol;
  END IF;
  IF v_acl IS DISTINCT FROM pg_catalog.current_setting('myk9.proacl_before_2515') THEN
    RAISE EXCEPTION 'MYK9-2515: get_admin_user_list proacl changed from % to %',
      pg_catalog.current_setting('myk9.proacl_before_2515'), v_acl;
  END IF;
END;
$$;

COMMIT;
