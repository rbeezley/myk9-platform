-- MYK9-93: the codified table-grant contract (20260730220000).
--
-- This test is the reason the codification migration cannot silently rot. It
-- runs against a migrations-only database, which is precisely the environment
-- the drift used to break: before 20260730220000, 90 public tables reached a
-- rebuilt database with NO authenticated grant at all, so every client read
-- failed 42501 before RLS was ever consulted, while production worked fine on
-- pre-migration-era grants that existed in no migration file.
--
-- Sections:
--   A. every table grants exactly the intended CRUD to anon, authenticated and
--      service_role -- no more, no less
--   B. neither API role holds TRUNCATE, REFERENCES, TRIGGER or MAINTAIN
--   C. the column allowlists survived, with the withheld columns still withheld
--   D. behavioural: authenticated can actually reach the codified tables
--   E. behavioural: authenticated cannot truncate its way past RLS

BEGIN;

-- ===========================================================================
-- A. Table-level CRUD matches the codified intent, exactly.
-- ===========================================================================
DO $$
DECLARE
  v_row record;
  v_mismatches text := '';
  v_count integer := 0;
BEGIN
  FOR v_row IN
    WITH expected(tbl, authenticated, anon, service_role) AS (VALUES
    ('achievements','SELECT,INSERT,UPDATE,DELETE','SELECT','SELECT,INSERT,UPDATE,DELETE'),
    ('activity_log','SELECT,INSERT','','SELECT,INSERT,UPDATE,DELETE'),
    ('allergies','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('analytics_events','SELECT,INSERT','','SELECT,INSERT,UPDATE,DELETE'),
    ('announcement_reads','SELECT','','SELECT,INSERT,UPDATE,DELETE'),
    ('announcements','SELECT','','SELECT,INSERT,UPDATE,DELETE'),
    ('armbands','SELECT,INSERT,UPDATE,DELETE','SELECT','SELECT,INSERT,UPDATE,DELETE'),
    ('calendar_feed_tokens','SELECT','','SELECT,INSERT,UPDATE,DELETE'),
    ('chatbot_feedback','INSERT','','SELECT,INSERT,UPDATE,DELETE'),
    ('chatbot_query_log','','','SELECT,INSERT,UPDATE,DELETE'),
    ('class_visibility_overrides','SELECT,INSERT,UPDATE','SELECT','SELECT,INSERT,UPDATE,DELETE'),
    -- No table-level SELECT for authenticated: 20260731160000 replaced it with a
    -- 54-column allowlist withholding num_hides (MYK9-127). Writes are untouched,
    -- so a secretary can still SET the hide count, just not read it back.
    ('classes','INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('club_access_requests','SELECT,UPDATE','','SELECT,INSERT,UPDATE,DELETE'),
    ('club_members','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('club_officers','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('club_premium_templates','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('club_stripe_accounts','SELECT','','SELECT,INSERT,UPDATE,DELETE'),
    ('clubs','SELECT,INSERT,UPDATE,DELETE','SELECT','SELECT,INSERT,UPDATE,DELETE'),
    ('dog_favorites','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('dog_registrations','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('dogs','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('email_log','SELECT','','SELECT,INSERT,UPDATE,DELETE'),
    ('enrollments','SELECT,INSERT,UPDATE','','SELECT,INSERT,UPDATE,DELETE'),
    ('entries','INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('entry_cart_items','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('entry_carts','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('entry_payment_links','SELECT','','SELECT,INSERT,UPDATE,DELETE'),
    ('entry_status_history','SELECT','','SELECT,UPDATE,DELETE'),
    ('entry_submissions','SELECT','','SELECT,INSERT,UPDATE,DELETE'),
    ('exhibitor_profiles','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('fcm_tokens','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('frontend_logs','','','SELECT,INSERT,UPDATE,DELETE'),
    ('genetic_screenings','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('health_records','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    -- MYK9-146: fee/notes are column-restricted; writes remain table-level.
    ('judge_assignments','INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('judge_availability','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('judge_certifications','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('judge_qualifications','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('login_attempts','','','SELECT,INSERT,UPDATE,DELETE'),
    ('manual_results','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('medications','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('nationals_advancement','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('nationals_rankings','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('nationals_scores','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    -- MYK9-191: authenticated mutations use caller-derived RPCs; consent evidence is service-only.
    ('notification_preferences','SELECT','','SELECT,INSERT,UPDATE,DELETE'),
    ('notification_queue','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('notifications','SELECT,INSERT,UPDATE','','SELECT,INSERT,UPDATE,DELETE'),
    ('ofa_screenings','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('offline_scoring','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('onboarding_requests','SELECT,INSERT,UPDATE','','SELECT,INSERT,UPDATE,DELETE'),
    ('operator_alerts','SELECT','','SELECT,INSERT,UPDATE,DELETE'),
    ('organization_agreements','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('paperwork_prints','SELECT,INSERT','','SELECT,INSERT,UPDATE,DELETE'),
    ('pedigree_ancestors','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('people','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('performance_metrics','SELECT,INSERT','','SELECT,INSERT,UPDATE,DELETE'),
    ('permission_audit_log','SELECT,INSERT','','SELECT,INSERT,UPDATE,DELETE'),
    ('permissions','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('platform_settings','SELECT,UPDATE','','SELECT,INSERT,UPDATE,DELETE'),
    ('platform_waitlist','SELECT,INSERT','INSERT','SELECT,INSERT,UPDATE,DELETE'),
    ('premium_generation_attempts','','','SELECT,INSERT,UPDATE,DELETE'),
    ('premium_generations','SELECT,INSERT','','SELECT,INSERT,UPDATE,DELETE'),
    ('promo_codes','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('push_notification_queue','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('push_subscriptions','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('result_submissions','SELECT,INSERT','','SELECT,INSERT,UPDATE,DELETE'),
    -- MYK9-115 breaker state and its audit trail. No client grants by design:
    -- these are read inside SECURITY DEFINER functions, and a client that could
    -- write ringside_containment could switch off the conflict-storm breaker.
    ('ringside_containment','','','SELECT'),
    ('ringside_containment_audit','','','SELECT'),
    ('ringside_sessions','','','SELECT,INSERT,UPDATE,DELETE'),
    ('role_permissions','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('role_requests','SELECT,UPDATE','','SELECT,INSERT,UPDATE,DELETE'),
    ('roles','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('rule_organizations','SELECT','SELECT','SELECT,INSERT,UPDATE,DELETE'),
    ('rule_sports','SELECT','SELECT','SELECT,INSERT,UPDATE,DELETE'),
    ('rulebooks','SELECT','SELECT','SELECT,INSERT,UPDATE,DELETE'),
    ('rules','SELECT','SELECT','SELECT,INSERT,UPDATE,DELETE'),
    ('rules_feedback','INSERT','','SELECT,INSERT,UPDATE,DELETE'),
    ('rules_query_log','INSERT','','SELECT,INSERT,UPDATE,DELETE'),
    ('secretary_tasks','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('show_announcement_reads','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('show_announcements','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('show_eve_nudge_log','','','SELECT,INSERT,UPDATE,DELETE'),
    ('show_incidents','SELECT,INSERT','','SELECT,INSERT,UPDATE,DELETE'),
    ('show_lifecycle_email_attempts','SELECT','','SELECT,INSERT,UPDATE,DELETE'),
    ('show_lifecycle_email_jobs','SELECT,UPDATE','','SELECT,INSERT,UPDATE,DELETE'),
    ('show_lifecycle_email_steps','SELECT,UPDATE','','SELECT,INSERT,UPDATE,DELETE'),
    ('show_message_threads','SELECT,INSERT,UPDATE','','SELECT,INSERT,UPDATE,DELETE'),
    ('show_messages','SELECT,INSERT,UPDATE','','SELECT,INSERT,UPDATE,DELETE'),
    ('show_money_locks','','','SELECT,INSERT,UPDATE,DELETE'),
    ('show_passcodes','','','SELECT,INSERT,UPDATE,DELETE'),
    ('show_payouts','SELECT','','SELECT,INSERT,UPDATE,DELETE'),
    ('show_templates','SELECT,INSERT,UPDATE,DELETE','SELECT','SELECT,INSERT,UPDATE,DELETE'),
    ('show_visibility_settings','SELECT,INSERT,UPDATE','SELECT','SELECT,INSERT,UPDATE,DELETE'),
    ('shows','SELECT,INSERT,UPDATE,DELETE','SELECT','SELECT,INSERT,UPDATE,DELETE'),
    ('sms_opt_in_attempts','','','SELECT,INSERT,DELETE'),
    ('sport_class_rules','SELECT,INSERT,UPDATE,DELETE','SELECT','SELECT,INSERT,UPDATE,DELETE'),
    ('sport_templates','SELECT,INSERT,UPDATE,DELETE','SELECT','SELECT,INSERT,UPDATE,DELETE'),
    ('sport_titles','SELECT,INSERT,UPDATE,DELETE','SELECT','SELECT,INSERT,UPDATE,DELETE'),
    ('stripe_customers','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('stripe_order_refunds','','','SELECT,INSERT,UPDATE,DELETE'),
    ('stripe_orders','SELECT','','SELECT,INSERT,UPDATE,DELETE'),
    ('stripe_subscriptions','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('subscription_entitlement_grants','SELECT','','SELECT,INSERT,UPDATE,DELETE'),
    ('support_ticket_messages','SELECT,INSERT,UPDATE','','SELECT,INSERT,UPDATE,DELETE'),
    ('support_tickets','SELECT,INSERT,UPDATE','','SELECT,INSERT,UPDATE,DELETE'),
    ('sync_conflicts','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('system_health_snapshots','SELECT','','SELECT,INSERT,UPDATE,DELETE'),
    ('training_goals','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('training_journal_entries','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('training_milestones','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('trial_checklist_state','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('trial_judge_supplies','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('trial_packet_generation_claims','','','SELECT,INSERT,UPDATE,DELETE'),
    ('trial_packet_snapshots','SELECT','','SELECT,INSERT,UPDATE,DELETE'),
    ('trial_visibility_overrides','SELECT,INSERT,UPDATE','SELECT','SELECT,INSERT,UPDATE,DELETE'),
    ('trials','SELECT,INSERT,UPDATE,DELETE','SELECT','SELECT,INSERT,UPDATE,DELETE'),
    ('user_guide','SELECT','SELECT','SELECT,INSERT,UPDATE,DELETE'),
    ('user_milestones','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('user_preferences','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('user_roles','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('vaccinations','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('vet_visits','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('volunteer_class_assignments','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('volunteer_general_assignments','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('volunteer_roles','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('volunteers','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('waitlist_entries','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE'),
    ('waitlist_notification_events','','','SELECT,INSERT,UPDATE,DELETE')
    ),
    roles(role_name) AS (VALUES ('anon'), ('authenticated'), ('service_role')),
    actual AS (
      SELECT e.tbl,
             r.role_name,
             array_to_string(
               ARRAY(
                 SELECT p
                 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS p
                 WHERE has_table_privilege(r.role_name, format('public.%I', e.tbl), p)
               ), ','
             ) AS got,
             CASE r.role_name
               WHEN 'anon' THEN e.anon
               WHEN 'authenticated' THEN e.authenticated
               ELSE e.service_role
             END AS want
      FROM expected e CROSS JOIN roles r
    )
    SELECT tbl, role_name, got, want FROM actual WHERE got IS DISTINCT FROM want
    ORDER BY tbl, role_name
  LOOP
    v_count := v_count + 1;
    v_mismatches := v_mismatches || format(
      E'\n  %s / %s: got [%s] want [%s]',
      v_row.tbl, v_row.role_name, v_row.got, v_row.want);
  END LOOP;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'FAIL % table grant(s) drifted from the codified intent:%', v_count, v_mismatches;
  END IF;
  RAISE NOTICE 'PASS all 127 tables grant exactly the codified CRUD to anon, authenticated and service_role';
END;
$$;

-- Guard the guard: if a migration adds a public table and forgets this list,
-- section A silently stops covering it. Fail instead.
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname NOT IN (
      'achievements','activity_log','allergies','analytics_events','announcement_reads',
      'announcements','armbands','calendar_feed_tokens','chatbot_feedback','chatbot_query_log',
      'class_visibility_overrides','classes','club_access_requests','club_members',
      'club_officers','club_premium_templates','club_stripe_accounts','clubs','dog_favorites',
      'dog_registrations','dogs','email_log','enrollments','entries','entry_cart_items',
      'entry_carts','entry_payment_links','entry_status_history','entry_submissions',
      'exhibitor_profiles','fcm_tokens','frontend_logs','genetic_screenings','health_records',
      'judge_assignments','judge_availability','judge_certifications','judge_qualifications',
      'login_attempts','manual_results','medications','nationals_advancement',
      'nationals_rankings','nationals_scores','notification_preferences','notification_queue',
      'notifications','ofa_screenings','offline_scoring','onboarding_requests','operator_alerts',
      'organization_agreements','paperwork_prints','pedigree_ancestors','people',
      'performance_metrics','permission_audit_log','permissions','platform_settings',
      'platform_waitlist','premium_generation_attempts','premium_generations','promo_codes',
      'push_notification_queue','push_subscriptions','result_submissions',
      'ringside_containment','ringside_containment_audit','ringside_sessions',
      'role_permissions','role_requests','roles','rule_organizations','rule_sports','rulebooks',
      'rules','rules_feedback','rules_query_log','secretary_tasks','show_announcement_reads',
      'show_announcements','show_eve_nudge_log','show_incidents','show_lifecycle_email_attempts',
      'show_lifecycle_email_jobs','show_lifecycle_email_steps','show_message_threads',
      'show_messages','show_money_locks','show_passcodes','show_payouts','show_templates',
      'show_visibility_settings','shows','sms_opt_in_attempts','sport_class_rules','sport_templates','sport_titles',
      'stripe_customers','stripe_order_refunds','stripe_orders','stripe_subscriptions',
      'subscription_entitlement_grants','support_ticket_messages','support_tickets',
      'sync_conflicts','system_health_snapshots','training_goals','training_journal_entries',
      'training_milestones','trial_checklist_state','trial_judge_supplies',
      'trial_packet_generation_claims',
      'trial_packet_snapshots','trial_visibility_overrides','trials','user_guide','user_milestones','user_preferences',
      'user_roles','vaccinations','vet_visits','volunteer_class_assignments',
      'volunteer_general_assignments','volunteer_roles','volunteers','waitlist_entries',
      'waitlist_notification_events'
    );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL public table(s) absent from the grant contract: %. Add them to this test and give them an explicit grant decision.',
      v_missing;
  END IF;
  RAISE NOTICE 'PASS the grant contract covers every public table';
END;
$$;

-- ===========================================================================
-- B. Neither API role holds a privilege PostgREST cannot even issue.
--    TRUNCATE matters most: RLS does not constrain it, so FORCE RLS is no
--    defence and one statement would take an entire table.
-- ===========================================================================
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(format('%s/%s/%s', c.relname, r.role_name, p), ', ')
    INTO v_bad
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role_name)
  CROSS JOIN unnest(ARRAY['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) AS p
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND has_table_privilege(r.role_name, c.oid, p);

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL API role holds a non-CRUD privilege: %', v_bad;
  END IF;
  RAISE NOTICE 'PASS neither anon nor authenticated holds TRUNCATE, REFERENCES, TRIGGER or MAINTAIN on any public table';
END;
$$;

-- ===========================================================================
-- C. The column allowlists survived the migration's REVOKEs.
--    This is the MYK9-93 trap: revoking a privilege at table level takes it at
--    column level too, pg_class.relacl does not show it, and a `select=*` probe
--    returns 200 either way. Count the column grants directly.
-- ===========================================================================
DO $$
DECLARE
  v_row record;
  v_bad text := '';
BEGIN
  FOR v_row IN
    WITH expected(tbl, role_name, n) AS (VALUES
      ('classes','anon',52),
      ('classes','authenticated',54),
      ('entries','anon',15),
      ('entries','authenticated',54),
      ('judge_assignments','anon',10),
      ('judge_assignments','authenticated',12),
      ('dogs','anon',5),
      ('people','anon',4),
      ('dog_registrations','authenticated',1),
      ('dog_registrations','service_role',1),
      ('paperwork_prints','authenticated',3)
    ),
    actual AS (
      SELECT e.tbl, e.role_name, e.n AS want, (
        SELECT count(*)
        FROM pg_attribute a
        WHERE a.attrelid = format('public.%I', e.tbl)::regclass
          AND a.attnum > 0
          AND NOT a.attisdropped
          AND a.attacl IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM aclexplode(a.attacl) x
            WHERE x.grantee = e.role_name::regrole
          )
      ) AS got
      FROM expected e
    )
    SELECT * FROM actual WHERE got <> want
  LOOP
    v_bad := v_bad || format(E'\n  %s.%s: %s column grant(s), expected %s',
      v_row.tbl, v_row.role_name, v_row.got, v_row.want);
  END LOOP;

  IF v_bad <> '' THEN
    RAISE EXCEPTION 'FAIL column allowlist damaged -- a REVOKE took column grants with it:%', v_bad;
  END IF;
  RAISE NOTICE 'PASS all column allowlists intact';
END;
$$;

-- The withheld columns must stay withheld. classes hides the scent-work counts
-- (MYK9-116); entries hides scoring, money and refund columns from anon.
DO $$
DECLARE v_leaked text;
BEGIN
  SELECT string_agg(format('%s.%s', t.tbl, t.col), ', ') INTO v_leaked
  FROM (VALUES
    ('classes','num_hides'), ('classes','has_blank'), ('classes','hides_known'),
    ('entries','payment_status'), ('entries','entry_fee'),
    ('entries','stripe_payment_intent_id'), ('entries','refund_amount'),
    ('entries','handler_id')
  ) AS t(tbl, col)
  WHERE EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = format('public.%I', t.tbl)::regclass
        AND a.attname = t.col
        AND NOT a.attisdropped
    )
    AND has_column_privilege('anon', format('public.%I', t.tbl)::regclass, t.col, 'SELECT');

  IF v_leaked IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL anon can read withheld column(s): %', v_leaked;
  END IF;
  RAISE NOTICE 'PASS anon still cannot read the withheld scent-work, scoring and payment columns';
END;
$$;

-- classes.num_hides is withheld from `authenticated` too (20260731160000,
-- MYK9-127): anonymous sign-in resolves to the authenticated role, so gating anon
-- alone left the leak one signup away. Officials read it through
-- get_show_class_hide_counts(show_id), never off the class row.
--
-- hides_known and has_blank are deliberately NOT asserted here: sport_class_rules
-- is anon-readable and publishes the rulebook per element+level, so those two are
-- derivable from public data and withholding them would protect nothing.
DO $$
BEGIN
  IF has_column_privilege('authenticated', 'public.classes'::regclass, 'num_hides', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL authenticated can read classes.num_hides -- competitors see judge-set hide counts';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.classes'::regclass, 'hides_known', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL authenticated lost classes.hides_known -- the at-show Hides row breaks';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.classes'::regclass, 'id', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL authenticated lost classes.id -- a REVOKE took the column allowlist with it';
  END IF;

  IF has_column_privilege('authenticated', 'public.judge_assignments'::regclass, 'fee', 'SELECT')
     OR has_column_privilege('authenticated', 'public.judge_assignments'::regclass, 'notes', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL authenticated can read judge assignment fee/notes outside the manager RPC';
  END IF;

  RAISE NOTICE 'PASS authenticated cannot read the judge-set hide count but keeps the rest of the class';
END;
$$;

-- ===========================================================================
-- D. Behavioural: the failure this migration exists to prevent.
--    Before codification these statements raised 42501 on a rebuilt database.
--    Empty results are fine and expected -- RLS still applies. What must NOT
--    happen is insufficient_privilege.
-- ===========================================================================
DO $$
DECLARE
  v_tbl text;
  v_n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  FOREACH v_tbl IN ARRAY ARRAY[
    'people','dogs','shows','trials','classes','clubs','user_roles','roles',
    'permissions','role_permissions','exhibitor_profiles','dog_registrations'
  ] LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', v_tbl) INTO v_n;
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      RAISE EXCEPTION
        'FAIL authenticated cannot read public.% (42501) -- the pre-rule grant drift is back', v_tbl;
    END;
  END LOOP;
  RESET ROLE;
  RAISE NOTICE 'PASS authenticated reaches every core table without a privilege error';
END;
$$;

-- entries is the asymmetric one: writes are granted, table-wide SELECT is not.
-- The two allowlists withhold DIFFERENT things and must not be confused:
-- anon is denied the payment and refund columns (20260616120000), while
-- authenticated keeps those and is denied the scoring columns
-- (20260620001929). Probe a column each role genuinely lacks -- authenticated
-- can read entries.payment_status, so asserting otherwise would be testing a
-- rule that does not exist.
DO $$
DECLARE v_n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE 'SELECT count(total_score) FROM public.entries' INTO v_n;
    RESET ROLE;
    RAISE EXCEPTION 'FAIL authenticated read entries.total_score -- the column allowlist is gone';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS authenticated is still refused the withheld entries scoring columns';
  END;
END;
$$;

-- And table-wide SELECT must stay revoked, or the allowlist is moot.
DO $$
DECLARE v_n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE 'SELECT count(*) FROM (SELECT * FROM public.entries) s' INTO v_n;
    RESET ROLE;
    RAISE EXCEPTION 'FAIL authenticated ran SELECT * on entries -- table-wide SELECT came back';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS authenticated is still refused table-wide SELECT on entries';
  END;
END;
$$;

-- ===========================================================================
-- E. Behavioural: TRUNCATE is refused. RLS would not have stopped it.
-- ===========================================================================
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE 'TRUNCATE TABLE public.entries';
    RESET ROLE;
    RAISE EXCEPTION 'FAIL authenticated truncated public.entries -- RLS does not gate TRUNCATE';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS authenticated cannot TRUNCATE public.entries';
  END;
END;
$$;

-- ===========================================================================
-- F. Sequences. Same drift class as the tables: no migration ever granted a
--    sequence privilege, so before 20260730220000 a rebuild left all three
--    owner-only. The enrollments one is load-bearing -- see the behavioural
--    probe below, which is the assertion that actually matters here.
-- ===========================================================================
DO $$
DECLARE
  v_row record;
  v_bad text := '';
BEGIN
  FOR v_row IN
    WITH expected(seq, role_name, privs) AS (VALUES
      ('registration_confirmation_seq','anon',''),
      ('registration_confirmation_seq','authenticated','SELECT,USAGE'),
      ('registration_confirmation_seq','service_role','SELECT,UPDATE,USAGE'),
      ('frontend_logs_id_seq','anon',''),
      ('frontend_logs_id_seq','authenticated',''),
      ('frontend_logs_id_seq','service_role','SELECT,UPDATE,USAGE'),
      ('ringside_conflict_seq','anon',''),
      ('ringside_conflict_seq','authenticated',''),
      ('ringside_conflict_seq','service_role','SELECT,UPDATE,USAGE'),
      -- Owner-only. The identity sequence behind ringside_containment_audit is
      -- advanced by SECURITY DEFINER functions writing as the table owner, so
      -- no client role — and not service_role either — needs a privilege here.
      ('ringside_containment_audit_id_seq','anon',''),
      ('ringside_containment_audit_id_seq','authenticated',''),
      ('ringside_containment_audit_id_seq','service_role','')
    ),
    actual AS (
      SELECT e.seq, e.role_name, e.privs AS want,
             array_to_string(
               ARRAY(
                 SELECT p
                 FROM unnest(ARRAY['SELECT','UPDATE','USAGE']) AS p
                 WHERE has_sequence_privilege(e.role_name, format('public.%I', e.seq), p)
               ), ','
             ) AS got
      FROM expected e
    )
    SELECT * FROM actual WHERE got IS DISTINCT FROM want
  LOOP
    v_bad := v_bad || format(E'\n  %s / %s: got [%s] want [%s]',
      v_row.seq, v_row.role_name, v_row.got, v_row.want);
  END LOOP;

  IF v_bad <> '' THEN
    RAISE EXCEPTION 'FAIL sequence grant(s) drifted from the codified intent:%', v_bad;
  END IF;
  RAISE NOTICE 'PASS every public sequence grants exactly the codified privileges';
END;
$$;

-- Coverage guard for sequences, mirroring the table one.
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'S'
    AND c.relname NOT IN (
      'registration_confirmation_seq','frontend_logs_id_seq','ringside_conflict_seq',
      'ringside_containment_audit_id_seq'
    );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL public sequence(s) absent from the grant contract: %. New sequences inherit anon/authenticated USAGE from ALTER DEFAULT PRIVILEGES on the live project -- give them an explicit decision.',
      v_missing;
  END IF;
  RAISE NOTICE 'PASS the grant contract covers every public sequence';
END;
$$;

-- The assertion this section exists for. public.enrollments has a BEFORE INSERT
-- trigger calling nextval('registration_confirmation_seq') from a plpgsql
-- function with NO security definer, so it runs as the invoker. If authenticated
-- loses USAGE, every enrollment insert fails on a rebuilt database even though
-- the table grant is present -- the failure just moves from table to sequence.
DO $$
DECLARE v_next bigint;
BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    v_next := nextval('public.registration_confirmation_seq');
    RESET ROLE;
    RAISE NOTICE 'PASS authenticated can advance registration_confirmation_seq (enrollment inserts survive a rebuild)';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE EXCEPTION
      'FAIL authenticated cannot nextval registration_confirmation_seq -- enrollment INSERT will fail on a migrations-only rebuild';
  END;
END;
$$;

-- ...but must not be able to rewind it, which would mint duplicate
-- confirmation numbers. setval requires UPDATE, which is deliberately withheld.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM setval('public.registration_confirmation_seq', 1, false);
    RESET ROLE;
    RAISE EXCEPTION
      'FAIL authenticated can setval registration_confirmation_seq -- confirmation numbers can be replayed';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS authenticated cannot setval registration_confirmation_seq';
  END;
END;
$$;

ROLLBACK;
