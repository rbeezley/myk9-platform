-- MYK9-2353: schema-wide database security invariants contract.
--
-- Runs against a clean migrations-only database (`supabase db reset --no-seed`)
-- as part of CI `SQL tests`. Complements `pre_rule_table_grants_test.sql`
-- (which pins table/column/sequence CRUD grants) by pinning the remaining
-- schema-wide security invariants so regressions fail CI before merge:
--
-- Sections:
--   A. Every non-extension base/partitioned table in `public` has both
--      ENABLE ROW LEVEL SECURITY and FORCE ROW LEVEL SECURITY.
--   B. Every non-extension SECURITY DEFINER function in `public` and `private`
--      pins `search_path`, and no new function omits `''` / trailing `pg_temp`.
--   C. No SECURITY DEFINER function in `public` grants EXECUTE to PUBLIC, and
--      anon EXECUTE is limited strictly to the explicit allowlist of RLS
--      helpers and public read RPCs.
--   D. Every non-extension view in `public` sets `security_invoker = true`,
--      except the three explicitly allowlisted masked-results views, and no
--      materialized view exists in `public` (they bypass RLS).
--   E. Schema `private` grants no USAGE privilege to `anon` or `authenticated`.
--   F. Critical INSERT/UPDATE write-guard triggers on entries, clubs and
--      classes (and the other guarded tables) stay attached and enabled, and
--      withheld columns on `classes` / `judge_assignments` cannot be added
--      without an explicit, reasoned registration.
--
-- Allowlists in B2 and C are pinned by full function signature and are
-- ratchets: an entry whose function no longer exists, or no longer violates,
-- fails the test so the list shrinks as functions are fixed. Never add entries
-- to B2.

BEGIN;

-- ===========================================================================
-- A. Every non-extension public table enables AND forces RLS.
-- ===========================================================================
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(
           format('%s (rls=%s, force=%s)', c.relname, c.relrowsecurity, c.relforcerowsecurity),
           ', ' ORDER BY c.relname
         )
    INTO v_bad
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_depend d
      WHERE d.classid = 'pg_catalog.pg_class'::regclass
        AND d.objid = c.oid
        AND d.deptype = 'e'
    )
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL public table(s) missing ENABLE or FORCE ROW LEVEL SECURITY: %', v_bad;
  END IF;
  RAISE NOTICE 'PASS every non-extension public table enables and forces RLS';
END;
$$;

-- ===========================================================================
-- B1. Every SECURITY DEFINER function in public/private pins search_path.
-- ===========================================================================
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(
           format('%s.%s(%s)', n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)),
           E'\n  ' ORDER BY n.nspname, p.proname, p.oid
         )
    INTO v_bad
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'private')
    AND p.prosecdef
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_depend d
      WHERE d.classid = 'pg_catalog.pg_proc'::regclass
        AND d.objid = p.oid
        AND d.deptype = 'e'
    )
    AND (
      p.proconfig IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM unnest(p.proconfig) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
    );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL SECURITY DEFINER function(s) omit SET search_path:%', E'\n  ' || v_bad;
  END IF;
  RAISE NOTICE 'PASS every SECURITY DEFINER function in public and private pins search_path';
END;
$$;

-- ===========================================================================
-- B2. Every SECURITY DEFINER function uses search_path = '' or ends in pg_temp
--     (so pg_temp is never implicitly searched ahead of public/pg_catalog).
--
--     The 14 legacy functions below predate this contract (MYK9-2341 tracks
--     cleanup; request_new_club was fixed there and left the list). Each is
--     pinned by full signature and must still exist and still violate: remove
--     an entry as soon as its function is updated; never add new entries.
-- ===========================================================================
DO $$
DECLARE
  v_bad text;
  v_stale text;
BEGIN
  WITH legacy(sig) AS (VALUES
    ('public.assert_active_waitlist_offer_payment_link()'),
    ('public.can_accept_online_entry_payment(uuid,boolean)'),
    ('public.check_class_availability(uuid)'),
    ('public.check_login_rate_limit(text)'),
    ('public.create_support_ticket(uuid,text,jsonb,uuid,boolean,text)'),
    ('public.get_admin_user_list(boolean)'),
    ('public.get_my_onboarding_requests()'),
    ('public.promote_waitlist_entry_internal(uuid,integer)'),
    ('public.record_entry_status_history()'),
    ('public.record_login_attempt(text,boolean,text,uuid,text)'),
    ('public.registry_identity_taken(text,text)'),
    ('public.resolve_class_result_visibility(uuid)'),
    ('public.ringside_complete_stale_class(uuid,uuid[])'),
    ('public.soft_delete_dog(uuid)')
  ),
  legacy_oid AS (
    SELECT sig, pg_catalog.to_regprocedure(sig)::oid AS fn_oid FROM legacy
  ),
  secdef AS (
    SELECT
      p.oid AS fn_oid,
      n.nspname,
      p.proname,
      pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
      (
        SELECT substr(cfg, length('search_path=') + 1)
        FROM unnest(p.proconfig) AS cfg
        WHERE cfg LIKE 'search_path=%'
        LIMIT 1
      ) AS raw_sp
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_depend d
        WHERE d.classid = 'pg_catalog.pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
      )
  ),
  evaluated AS (
    SELECT
      fn_oid,
      nspname,
      proname,
      args,
      raw_sp,
      lower(btrim(replace(replace(coalesce(raw_sp, ''), '"', ''), '''', ''))) AS clean_sp,
      -- Identifier semantics: only pg_temp or "pg_temp" name the temp schema;
      -- "PG_TEMP" is a different (nonexistent) schema, so no lower() here.
      btrim(
        (string_to_array(coalesce(raw_sp, ''), ','))[
          coalesce(array_length(string_to_array(coalesce(raw_sp, ''), ','), 1), 1)
        ]) AS last_schema
    FROM secdef
  ),
  violating AS (
    SELECT *
    FROM evaluated
    WHERE clean_sp <> ''
      AND last_schema NOT IN ('pg_temp', '"pg_temp"')
  )
  SELECT
    (
      SELECT string_agg(
               format('%s.%s(%s) [search_path=%s]', v.nspname, v.proname, v.args, v.raw_sp),
               E'\n  ' ORDER BY v.nspname, v.proname, v.args
             )
      FROM violating v
      WHERE v.fn_oid NOT IN (SELECT fn_oid FROM legacy_oid WHERE fn_oid IS NOT NULL)
    ),
    (
      SELECT string_agg(l.sig, E'\n  ' ORDER BY l.sig)
      FROM legacy_oid l
      WHERE l.fn_oid IS NULL
         OR l.fn_oid NOT IN (SELECT fn_oid FROM violating)
    )
  INTO v_bad, v_stale;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL new SECURITY DEFINER function(s) omit empty search_path or trailing pg_temp:%',
      E'\n  ' || v_bad;
  END IF;
  IF v_stale IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL legacy search_path allowlist entry no longer exists or no longer violates (remove it from the B2 list):%',
      E'\n  ' || v_stale;
  END IF;
  RAISE NOTICE 'PASS no new SECURITY DEFINER function omits empty search_path or trailing pg_temp';
END;
$$;

-- ===========================================================================
-- B3. get_admin_user_list is STABLE (MYK9-2515): the read-only walk guard
--     allows an RPC only when it is STABLE or IMMUTABLE. Grants stay closed:
--     no PUBLIC or anon EXECUTE, authenticated keeps it.
--     The write marker used by 20261128041700_myk9_2515_admin_user_list_stable
--     is exercised on fixtures so it is known to bite and not to trip on
--     updated_at / deleted_at / deleted_by.
-- ===========================================================================
DO $$
DECLARE
  v_fn regprocedure := 'public.get_admin_user_list(boolean)'::regprocedure;
  v_marker constant text :=
    '\m(insert|update|delete|truncate|merge|execute|perform|nextval|setval|set_config|pg_notify)\M';
BEGIN
  IF (SELECT provolatile FROM pg_catalog.pg_proc WHERE oid = v_fn) <> 's' THEN
    RAISE EXCEPTION 'FAIL public.get_admin_user_list(boolean) is not STABLE (provolatile <> s)';
  END IF;
  IF pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE')
     OR pg_catalog.has_function_privilege('public', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL public.get_admin_user_list(boolean) grants EXECUTE to anon or PUBLIC';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL public.get_admin_user_list(boolean) no longer grants EXECUTE to authenticated';
  END IF;

  IF pg_catalog.pg_get_functiondef(v_fn) ~* v_marker THEN
    RAISE EXCEPTION 'FAIL public.get_admin_user_list(boolean) body matches a write or dynamic-SQL marker';
  END IF;
  IF NOT ('INSERT INTO people (id) VALUES (1);' ~* v_marker
          AND 'update people set x = 1' ~* v_marker
          AND 'DELETE FROM people' ~* v_marker
          AND 'EXECUTE format(''x'')' ~* v_marker
          AND 'PERFORM set_config(''a'', ''b'', true)' ~* v_marker
          AND 'SELECT nextval(''s'')' ~* v_marker) THEN
    RAISE EXCEPTION 'FAIL write marker does not match a fixture body containing a write';
  END IF;
  IF 'SELECT p.updated_at, p.deleted_at, p.deleted_by FROM people p' ~* v_marker THEN
    RAISE EXCEPTION 'FAIL write marker trips on updated_at / deleted_at / deleted_by';
  END IF;
  RAISE NOTICE 'PASS get_admin_user_list is STABLE with grants closed and the write marker bites';
END;
$$;

-- ===========================================================================
-- C. SECURITY DEFINER EXECUTE hygiene in public:
--    1. Zero SECURITY DEFINER functions grant EXECUTE to PUBLIC.
--    2. Only the explicit allowlist of RLS predicate helpers and public read
--       RPCs grants EXECUTE to anon.
-- ===========================================================================
DO $$
DECLARE
  v_public_bad text;
  v_anon_bad text;
  v_anon_stale text;
BEGIN
  SELECT string_agg(
           format('public.%s(%s)', p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)),
           E'\n  ' ORDER BY p.proname, p.oid
         )
    INTO v_public_bad
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    -- Extension members are included: the invariant has no extension exception.
    AND pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE');

  IF v_public_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL SECURITY DEFINER function(s) in public grant EXECUTE to PUBLIC:%',
      E'\n  ' || v_public_bad;
  END IF;

  WITH anon_allowed(sig) AS (VALUES
    -- RLS predicate & result-visibility helpers:
    ('public.club_has_public_show(uuid)'),
    ('public.get_my_person_id()'),
    ('public.has_role(text,uuid)'),
    ('public.is_club_admin(uuid)'),
    ('public.is_club_member(uuid)'),
    ('public.is_platform_admin()'),
    ('public.is_show_official(uuid)'),
    ('public.is_show_secretary()'),
    ('public.is_show_secretary(uuid)'),
    ('public.is_site_admin()'),
    ('public.is_trial_secretary(uuid)'),
    ('public.resolve_class_result_visibility(uuid)'),
    -- Intentional anon-callable public show / TV read RPCs:
    ('public.get_show_class_hide_counts(uuid)'),
    ('public.get_show_club_officers(uuid)'),
    ('public.get_show_committee(uuid)'),
    ('public.get_show_judges(uuid)'),
    ('public.get_show_officials(uuid)'),
    ('public.shows_card_entries_paused(uuid[])'),
    ('public.tv_board_entries(uuid,uuid[])'),
    ('public.tv_class_entry_counts(uuid,uuid[])')
  ),
  allowed_oid AS (
    SELECT sig, pg_catalog.to_regprocedure(sig)::oid AS fn_oid FROM anon_allowed
  ),
  anon_secdef AS (
    SELECT p.oid AS fn_oid, p.proname, p.pronargs
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
  )
  SELECT
    (
      SELECT string_agg(
               format('public.%s(%s)', s.proname, pg_catalog.pg_get_function_identity_arguments(s.fn_oid)),
               E'\n  ' ORDER BY s.proname, s.fn_oid
             )
      FROM anon_secdef s
      WHERE s.fn_oid NOT IN (SELECT fn_oid FROM allowed_oid WHERE fn_oid IS NOT NULL)
    ),
    (
      SELECT string_agg(a.sig, E'\n  ' ORDER BY a.sig)
      FROM allowed_oid a
      WHERE a.fn_oid IS NULL
         OR a.fn_oid NOT IN (SELECT fn_oid FROM anon_secdef)
    )
  INTO v_anon_bad, v_anon_stale;

  IF v_anon_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL unlisted SECURITY DEFINER function(s) grant EXECUTE to anon (REVOKE FROM PUBLIC, anon or justify and allowlist):%',
      E'\n  ' || v_anon_bad;
  END IF;
  IF v_anon_stale IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL anon allowlist entry no longer exists or is no longer an anon-executable SECURITY DEFINER function (remove it from the C list):%',
      E'\n  ' || v_anon_stale;
  END IF;
  RAISE NOTICE 'PASS SECURITY DEFINER PUBLIC/anon EXECUTE discipline holds';
END;
$$;

-- ===========================================================================
-- D. Every non-extension public view sets security_invoker = true, except the
--    three intentional masked-results views over column-restricted `entries`,
--    and no materialized view exists in public (they run as owner and bypass RLS).
-- ===========================================================================
DO $$
DECLARE
  v_bad text;
  v_matview text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO v_bad
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'v'
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_depend d
      WHERE d.classid = 'pg_catalog.pg_class'::regclass
        AND d.objid = c.oid
        AND d.deptype = 'e'
    )
    AND NOT COALESCE(
      'security_invoker=true' = ANY(c.reloptions)
      OR 'security_invoker=on' = ANY(c.reloptions),
      false
    )
    AND c.relname NOT IN (
      'view_public_entry_results',
      'view_authenticated_entry_results',
      'view_authenticated_entry_results_replication'
    );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL public view(s) omit security_invoker = true (runs as view owner and bypasses caller RLS): %',
      v_bad;
  END IF;

  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO v_matview
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'm';  -- extension-owned ones too: no extension exception

  IF v_matview IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL materialized view(s) in public bypass RLS (use a security_invoker view or a SECURITY DEFINER RPC): %',
      v_matview;
  END IF;
  RAISE NOTICE 'PASS every non-allowlisted public view enforces security_invoker = true and no materialized view exists';
END;
$$;

-- ===========================================================================
-- E. Schema `private` remains inaccessible to API roles.
-- ===========================================================================
DO $$
BEGIN
  IF pg_catalog.has_schema_privilege('anon', 'private', 'USAGE')
     OR pg_catalog.has_schema_privilege('authenticated', 'private', 'USAGE') THEN
    RAISE EXCEPTION 'FAIL anon or authenticated holds USAGE privilege on schema private';
  END IF;
  RAISE NOTICE 'PASS schema private denies USAGE to anon and authenticated';
END;
$$;

-- pg_get_triggerdef() schema-qualifies function names that are not on the
-- search_path, so pin it: section F compares trigger definitions as text.
SET LOCAL search_path = pg_catalog, public;

-- ===========================================================================
-- F. Critical server-owned column write-guard triggers remain attached and
--    enabled, and withheld columns on `classes` / `judge_assignments` stay
--    explicitly registered with a reason (remember: PostgreSQL column-level
--    REVOKE does NOT narrow table-level UPDATE/INSERT grants; MYK9-2088,
--    MYK9-2341).
--
--    F2 is a review ratchet, not a guard claim. A column authenticated cannot
--    SELECT is withheld for one of two reasons, and the registry records which:
--      read-secret  : hidden from readers for secrecy (e.g. classes.num_hides,
--                     judge_assignments.fee); authorised writers may still
--                     write it, so no guard trigger is implied.
--      server-owned : only the server may write it; the registration must name
--                     the BEFORE UPDATE guard trigger that enforces it, and
--                     that trigger is asserted to exist and be enabled.
-- ===========================================================================
DO $$
DECLARE
  v_missing text;
  v_unregistered text;
  v_unguarded text;
BEGIN
  -- Each guard is pinned by its whole definition (timing, events, UPDATE OF
  -- columns, row level, WHEN clause and function), as pg_get_triggerdef()
  -- prints it. Any change to a guard's shape must update this list in the same
  -- migration review (owner decision 2026-11-23, MYK9-2353).
  WITH expected_triggers(tbl, trg, def) AS (VALUES
    ('classes', 'trg_00_block_direct_results_verified_insert',
     $d$CREATE TRIGGER trg_00_block_direct_results_verified_insert BEFORE INSERT ON public.classes FOR EACH ROW WHEN (((new.results_verified_at IS NOT NULL) OR (new.results_verified_by IS NOT NULL) OR (new.results_verified_fingerprint IS NOT NULL))) EXECUTE FUNCTION private.classes_block_direct_results_verified_write()$d$),
    ('classes', 'trg_00_block_direct_results_verified_write',
     $d$CREATE TRIGGER trg_00_block_direct_results_verified_write BEFORE UPDATE OF results_verified_at, results_verified_by, results_verified_fingerprint ON public.classes FOR EACH ROW WHEN (((old.results_verified_at IS DISTINCT FROM new.results_verified_at) OR (old.results_verified_by IS DISTINCT FROM new.results_verified_by) OR (old.results_verified_fingerprint IS DISTINCT FROM new.results_verified_fingerprint))) EXECUTE FUNCTION private.classes_block_direct_results_verified_write()$d$),
    ('clubs', 'trg_clubs_first_show_published_guard',
     $d$CREATE TRIGGER trg_clubs_first_show_published_guard BEFORE INSERT OR UPDATE ON public.clubs FOR EACH ROW EXECUTE FUNCTION private.clubs_first_show_published_guard()$d$),
    ('clubs', 'trg_guard_club_authorization_write',
     $d$CREATE TRIGGER trg_guard_club_authorization_write BEFORE INSERT OR UPDATE ON public.clubs FOR EACH ROW EXECUTE FUNCTION guard_club_authorization_write()$d$),
    ('clubs', 'trg_guard_club_created_by_write',
     $d$CREATE TRIGGER trg_guard_club_created_by_write BEFORE INSERT OR UPDATE ON public.clubs FOR EACH ROW EXECUTE FUNCTION guard_club_created_by_write()$d$),
    ('clubs', 'trg_guard_club_is_demo_write',
     $d$CREATE TRIGGER trg_guard_club_is_demo_write BEFORE INSERT OR UPDATE ON public.clubs FOR EACH ROW EXECUTE FUNCTION guard_club_is_demo_write()$d$),
    ('entries', 'trg_entries_00_direct_write_gate',
     $d$CREATE TRIGGER trg_entries_00_direct_write_gate BEFORE INSERT OR UPDATE OF junior_fee_override_by, entry_fee, junior_fee_declared, capacity_override ON public.entries FOR EACH ROW EXECUTE FUNCTION private.entries_direct_write_gate()$d$),
    ('entries', 'trg_entries_capacity_override',
     $d$CREATE TRIGGER trg_entries_capacity_override BEFORE INSERT OR UPDATE OF capacity_override ON public.entries FOR EACH ROW EXECUTE FUNCTION private.entries_server_capacity_override()$d$),
    ('entries', 'trg_entries_confirmation_claim_guard',
     $d$CREATE TRIGGER trg_entries_confirmation_claim_guard BEFORE INSERT OR UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION private.entries_confirmation_claim_guard()$d$),
    ('entries', 'trg_entries_derive_card_paid',
     $d$CREATE TRIGGER trg_entries_derive_card_paid BEFORE INSERT OR UPDATE OF card_paid, refund_amount ON public.entries FOR EACH ROW EXECUTE FUNCTION private.entries_derive_card_paid()$d$),
    ('entries', 'trg_entries_handler_is_junior',
     $d$CREATE TRIGGER trg_entries_handler_is_junior BEFORE INSERT OR UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION private.entries_record_handler_is_junior()$d$),
    ('entries', 'trg_entries_junior_fee',
     $d$CREATE TRIGGER trg_entries_junior_fee BEFORE INSERT OR UPDATE OF junior_fee_override_by, entry_fee, junior_fee_declared ON public.entries FOR EACH ROW EXECUTE FUNCTION private.entries_apply_junior_fee()$d$),
    ('entries', 'trg_entries_protect_payment_fields',
     $d$CREATE TRIGGER trg_entries_protect_payment_fields BEFORE UPDATE OF entry_fee, payment_method, stripe_payment_intent_id ON public.entries FOR EACH ROW WHEN (((new.entry_fee IS DISTINCT FROM old.entry_fee) OR (new.payment_method IS DISTINCT FROM old.payment_method) OR (new.stripe_payment_intent_id IS DISTINCT FROM old.stripe_payment_intent_id))) EXECUTE FUNCTION entries_protect_payment_fields()$d$),
    ('entries', 'trg_entries_protect_payment_fields_insert',
     $d$CREATE TRIGGER trg_entries_protect_payment_fields_insert BEFORE INSERT ON public.entries FOR EACH ROW EXECUTE FUNCTION entries_protect_payment_fields_insert()$d$),
    ('entries', 'trg_entries_protect_payment_status',
     $d$CREATE TRIGGER trg_entries_protect_payment_status BEFORE UPDATE OF payment_status ON public.entries FOR EACH ROW WHEN ((new.payment_status IS DISTINCT FROM old.payment_status)) EXECUTE FUNCTION entries_protect_payment_status()$d$),
    ('entries', 'trg_entries_receipt_email_server_only',
     $d$CREATE TRIGGER trg_entries_receipt_email_server_only BEFORE INSERT OR UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION private.entries_receipt_email_server_only()$d$),
    ('entries', 'trg_entries_reminder_email_guard',
     $d$CREATE TRIGGER trg_entries_reminder_email_guard BEFORE INSERT OR UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION private.entries_reminder_email_guard()$d$),
    ('people', 'people_authz_guard_identity_columns',
     $d$CREATE TRIGGER people_authz_guard_identity_columns BEFORE UPDATE OF auth_user_id, email ON public.people FOR EACH ROW EXECUTE FUNCTION people_guard_identity_columns()$d$),
    ('platform_settings', 'trg_guard_platform_settings_write',
     $d$CREATE TRIGGER trg_guard_platform_settings_write BEFORE DELETE OR UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION guard_platform_settings_write()$d$),
    ('role_permissions', 'trg_role_permissions_require_recent_reauth',
     $d$CREATE TRIGGER trg_role_permissions_require_recent_reauth AFTER INSERT OR DELETE OR UPDATE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION require_recent_reauth_for_client_write()$d$),
    ('roles', 'trg_roles_require_recent_reauth',
     $d$CREATE TRIGGER trg_roles_require_recent_reauth AFTER INSERT OR DELETE OR UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION require_recent_reauth_for_client_write()$d$),
    ('user_roles', 'trg_user_roles_require_recent_reauth',
     $d$CREATE TRIGGER trg_user_roles_require_recent_reauth AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION require_recent_reauth_for_client_write()$d$)
  )
  SELECT string_agg(format('public.%s.%s', e.tbl, e.trg), ', ' ORDER BY e.tbl, e.trg)
    INTO v_missing
  FROM expected_triggers e
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = e.tbl
      AND t.tgname = e.trg
      AND NOT t.tgisinternal
      -- 'O' fires on origin/local, 'A' always; 'R' (replica only) and 'D' do not
      -- fire for ordinary API writes.
      AND t.tgenabled IN ('O', 'A')
      AND pg_catalog.pg_get_triggerdef(t.oid) = e.def
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL critical write-guard trigger(s) missing, disabled, or changed from the pinned definition (update the list only after review): %', v_missing;
  END IF;

  -- Withheld columns on authenticated-writable, column-allowlisted tables.
  -- Adding one fails here until a reviewer registers it with its reason.
  -- Rows: (table, column, reason, guard trigger; required when server-owned).
  CREATE TEMP TABLE _withheld_registry (
    tbl text NOT NULL,
    col text NOT NULL,
    reason text NOT NULL CHECK (reason IN ('read-secret', 'server-owned')),
    guard_trigger text,
    CHECK ((reason = 'server-owned') = (guard_trigger IS NOT NULL))
  ) ON COMMIT DROP;
  INSERT INTO _withheld_registry(tbl, col, reason, guard_trigger) VALUES
    ('classes', 'num_hides', 'read-secret', NULL),
    ('classes', 'results_verified_fingerprint', 'server-owned', 'trg_00_block_direct_results_verified_write'),
    ('judge_assignments', 'fee', 'read-secret', NULL),
    ('judge_assignments', 'notes', 'read-secret', NULL);

  SELECT string_agg(format('public.%s.%s', c.relname, a.attname), ', ' ORDER BY c.relname, a.attname)
    INTO v_unregistered
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('classes', 'judge_assignments')
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND NOT pg_catalog.has_column_privilege('authenticated', c.oid, a.attname, 'SELECT')
    AND NOT EXISTS (
      SELECT 1 FROM _withheld_registry r
      WHERE r.tbl = c.relname AND r.col = a.attname
    );

  IF v_unregistered IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL unregistered withheld column(s) on column-allowlisted table(s): %. Review who may write each, then register it here with its reason (read-secret or server-owned; server-owned also names its guard trigger).',
      v_unregistered;
  END IF;

  -- Every server-owned registration must be enforced by an enabled BEFORE
  -- UPDATE row trigger on its table.
  SELECT string_agg(format('public.%s.%s (trigger %s)', r.tbl, r.col, r.guard_trigger), ', ' ORDER BY r.tbl, r.col)
    INTO v_unguarded
  FROM _withheld_registry r
  WHERE r.reason = 'server-owned'
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = r.tbl
        AND t.tgname = r.guard_trigger
        AND NOT t.tgisinternal
        AND t.tgenabled IN ('O', 'A')
        AND (t.tgtype & 1) <> 0   -- row level
        AND (t.tgtype & 2) <> 0   -- BEFORE
        AND (t.tgtype & 16) <> 0  -- UPDATE
        -- An UPDATE OF list must still name the column (empty = every column).
        AND (
          pg_catalog.cardinality(t.tgattr::int2[]) = 0
          OR (
            SELECT a.attnum FROM pg_catalog.pg_attribute a
            WHERE a.attrelid = c.oid AND a.attname = r.col
          ) = ANY (t.tgattr::int2[])
        )
    );

  IF v_unguarded IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL server-owned withheld column(s) lack an enabled BEFORE UPDATE row guard trigger: %',
      v_unguarded;
  END IF;

  RAISE NOTICE 'PASS critical write-guard triggers enabled and withheld columns registered with reasons';
END;
$$;

ROLLBACK;
