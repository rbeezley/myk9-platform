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
--      except the three explicitly allowlisted masked-results views.
--   E. Schema `private` grants no USAGE privilege to `anon` or `authenticated`.
--   F. Critical server-owned column write-guard triggers remain attached and
--      enabled, and withheld columns on `classes` / `judge_assignments` stay
--      strictly accounted for.

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
--     The 15 legacy functions below predate this contract (MYK9-2341 tracks
--     cleanup starting with request_new_club). Remove names from this ratchet
--     as each is updated; never add new entries.
-- ===========================================================================
DO $$
DECLARE
  v_bad text;
BEGIN
  WITH secdef AS (
    SELECT
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
      nspname,
      proname,
      args,
      raw_sp,
      lower(btrim(replace(replace(coalesce(raw_sp, ''), '"', ''), '''', ''))) AS clean_sp,
      lower(btrim(replace(replace(
        (string_to_array(coalesce(raw_sp, ''), ','))[
          coalesce(array_length(string_to_array(coalesce(raw_sp, ''), ','), 1), 1)
        ],
        '"', ''), '''', ''))) AS last_schema
    FROM secdef
  )
  SELECT string_agg(
           format('%s.%s(%s) [search_path=%s]', nspname, proname, args, raw_sp),
           E'\n  ' ORDER BY nspname, proname, args
         )
    INTO v_bad
  FROM evaluated
  WHERE clean_sp <> ''
    AND last_schema <> 'pg_temp'
    AND NOT (
      nspname = 'public'
      AND proname = ANY(ARRAY[
        'assert_active_waitlist_offer_payment_link',
        'can_accept_online_entry_payment',
        'check_class_availability',
        'check_login_rate_limit',
        'create_support_ticket',
        'get_admin_user_list',
        'get_my_onboarding_requests',
        'promote_waitlist_entry_internal',
        'record_entry_status_history',
        'record_login_attempt',
        'registry_identity_taken',
        'request_new_club',
        'resolve_class_result_visibility',
        'ringside_complete_stale_class',
        'soft_delete_dog'
      ])
    );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL new SECURITY DEFINER function(s) omit empty search_path or trailing pg_temp:%',
      E'\n  ' || v_bad;
  END IF;
  RAISE NOTICE 'PASS no new SECURITY DEFINER function omits empty search_path or trailing pg_temp';
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
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_depend d
      WHERE d.classid = 'pg_catalog.pg_proc'::regclass
        AND d.objid = p.oid
        AND d.deptype = 'e'
    )
    AND pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE');

  IF v_public_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL SECURITY DEFINER function(s) in public grant EXECUTE to PUBLIC:%',
      E'\n  ' || v_public_bad;
  END IF;

  SELECT string_agg(
           format('public.%s(%s)', p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)),
           E'\n  ' ORDER BY p.proname, p.oid
         )
    INTO v_anon_bad
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_depend d
      WHERE d.classid = 'pg_catalog.pg_proc'::regclass
        AND d.objid = p.oid
        AND d.deptype = 'e'
    )
    AND pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    AND NOT (
      p.proname = ANY(ARRAY[
        -- RLS predicate & result-visibility helpers:
        'club_has_public_show',
        'get_my_person_id',
        'has_role',
        'is_club_admin',
        'is_club_member',
        'is_platform_admin',
        'is_show_official',
        'is_show_secretary',
        'is_site_admin',
        'is_trial_secretary',
        'resolve_class_result_visibility',
        -- Intentional anon-callable public show / TV read RPCs:
        'get_show_class_hide_counts',
        'get_show_club_officers',
        'get_show_committee',
        'get_show_judges',
        'get_show_officials',
        'get_shows_class_hide_counts',
        'get_shows_judges',
        'tv_board_entries',
        'tv_class_entry_counts'
      ])
    );

  IF v_anon_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL unlisted SECURITY DEFINER function(s) grant EXECUTE to anon (REVOKE FROM PUBLIC, anon or justify and allowlist):%',
      E'\n  ' || v_anon_bad;
  END IF;
  RAISE NOTICE 'PASS SECURITY DEFINER PUBLIC/anon EXECUTE discipline holds';
END;
$$;

-- ===========================================================================
-- D. Every non-extension public view sets security_invoker = true, except the
--    three intentional masked-results views over column-restricted `entries`.
-- ===========================================================================
DO $$
DECLARE
  v_bad text;
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
  RAISE NOTICE 'PASS every non-allowlisted public view enforces security_invoker = true';
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

-- ===========================================================================
-- F. Critical server-owned column write-guard triggers remain attached and
--    enabled, and withheld columns on `classes` / `judge_assignments` stay
--    explicitly accounted for (remember: PostgreSQL column-level REVOKE does
--    NOT narrow table-level UPDATE/INSERT grants; MYK9-2088, MYK9-2341).
-- ===========================================================================
DO $$
DECLARE
  v_missing text;
  v_unaccounted text;
BEGIN
  WITH expected_triggers(tbl, trg) AS (VALUES
    ('entries', 'trg_entries_00_direct_write_gate'),
    ('entries', 'trg_entries_capacity_override'),
    ('entries', 'trg_entries_handler_is_junior'),
    ('entries', 'trg_entries_junior_fee'),
    ('entries', 'trg_entries_derive_card_paid'),
    ('entries', 'trg_entries_confirmation_claim_guard'),
    ('clubs', 'trg_guard_club_authorization_write'),
    ('clubs', 'trg_guard_club_created_by_write'),
    ('clubs', 'trg_guard_club_is_demo_write'),
    ('people', 'people_authz_guard_identity_columns'),
    ('platform_settings', 'trg_guard_platform_settings_write'),
    ('user_roles', 'trg_user_roles_require_recent_reauth'),
    ('roles', 'trg_roles_require_recent_reauth'),
    ('role_permissions', 'trg_role_permissions_require_recent_reauth')
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
      AND t.tgenabled <> 'D'
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL critical write-guard trigger(s) missing or disabled: %', v_missing;
  END IF;

  -- On authenticated-UPDATE-able tables that use a column-level SELECT
  -- allowlist, adding a new withheld column without adding a BEFORE write-guard
  -- trigger leaves the column client-writable. Require explicit registration.
  WITH accounted(tbl, col) AS (VALUES
    ('classes', 'num_hides'),
    ('classes', 'results_verified_fingerprint'),
    ('judge_assignments', 'fee'),
    ('judge_assignments', 'notes')
  )
  SELECT string_agg(format('public.%s.%s', c.relname, a.attname), ', ' ORDER BY c.relname, a.attname)
    INTO v_unaccounted
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('classes', 'judge_assignments')
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND NOT pg_catalog.has_column_privilege('authenticated', c.oid, a.attname, 'SELECT')
    AND NOT EXISTS (
      SELECT 1 FROM accounted acc
      WHERE acc.tbl = c.relname AND acc.col = a.attname
    );

  IF v_unaccounted IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL new withheld column(s) on authenticated-writable table(s): %. Add a BEFORE INSERT/UPDATE write-guard trigger if server-owned, then register here.',
      v_unaccounted;
  END IF;

  RAISE NOTICE 'PASS critical write-guard triggers enabled and withheld columns accounted for';
END;
$$;

ROLLBACK;
