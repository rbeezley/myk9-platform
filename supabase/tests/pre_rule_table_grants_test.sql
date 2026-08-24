-- MYK9-93: the codified table-grant contract (20260730220000).
--
-- This test is the reason the codification migration cannot silently rot. It
-- runs against a migrations-only database, which is precisely the environment
-- the drift used to break: before 20260730220000, 90 public tables reached a
-- rebuilt database with NO authenticated grant at all, so every client read
-- failed 42501 before RLS was ever consulted, while production worked fine on
-- pre-migration-era grants that existed in no migration file.
--
-- The service_role column records the hosted database contract, including the
-- broad Supabase table defaults. A migrations-only rebuild does not recreate
-- those defaults, so section A deliberately enforces only anon/authenticated;
-- the deployed `applied_acl_grants` health check enforces service_role. See the
-- CLAUDE.md lesson "a GRANT can never narrow a broader GRANT": narrower GRANT
-- text is not evidence that a previously broader applied ACL was narrowed.
--
-- Sections:
--   A. every table grants exactly the intended CRUD to anon/authenticated in a
--      migrations-only rebuild; service_role remains a deployed contract value
--   B. neither API role holds TRUNCATE, REFERENCES, TRIGGER or MAINTAIN
--   C. the column allowlists survived, with the withheld columns still withheld
--   D. behavioural: authenticated can actually reach the codified tables
--   E. behavioural: authenticated cannot truncate its way past RLS

BEGIN;

-- ===========================================================================
-- A. Client-role table-level CRUD matches the codified intent, exactly.
-- ===========================================================================
DO $$
DECLARE
  v_row record;
  v_mismatches text := '';
  v_count integer := 0;
BEGIN
  FOR v_row IN
    WITH expected(tbl, authenticated, anon, service_role) AS (VALUES
    ('achievements','SELECT,INSERT,UPDATE,DELETE','SELECT','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('activity_log','SELECT,INSERT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('allergies','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('analytics_events','SELECT,INSERT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('announcement_reads','SELECT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('announcements','SELECT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('armbands','SELECT,INSERT,UPDATE,DELETE','SELECT','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('calendar_feed_tokens','SELECT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('chatbot_feedback','INSERT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('chatbot_query_log','','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('class_visibility_overrides','SELECT,INSERT,UPDATE','SELECT','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    -- No table-level SELECT for authenticated: 20260731160000 replaced it with a
    -- 54-column allowlist withholding num_hides (MYK9-127). Writes are untouched,
    -- so a secretary can still SET the hide count, just not read it back.
    ('classes','INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('club_access_requests','SELECT,UPDATE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('club_members','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('club_officers','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('club_premium_templates','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('club_stripe_accounts','SELECT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('clubs','SELECT,INSERT,UPDATE,DELETE','SELECT','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('dog_favorites','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('dog_registrations','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('dogs','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('email_log','SELECT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('enrollments','SELECT,INSERT,UPDATE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('entries','INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('entry_cart_items','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('entry_carts','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('entry_payment_links','SELECT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('entry_status_history','SELECT','','SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('entry_submissions','SELECT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('exhibitor_profiles','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('fcm_tokens','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('frontend_logs','','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('genetic_screenings','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('health_records','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    -- MYK9-146: fee/notes are column-restricted; writes remain table-level.
    ('judge_assignments','INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('judge_availability','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('judge_certifications','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('judge_qualifications','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('login_attempts','','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('manual_results','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('medications','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('nationals_advancement','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('nationals_rankings','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('nationals_scores','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    -- MYK9-191: authenticated mutations use caller-derived RPCs; consent evidence is service-only.
    ('notification_preferences','SELECT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('notification_queue','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('notifications','SELECT,INSERT,UPDATE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('ofa_screenings','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('offline_scoring','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('onboarding_requests','SELECT,INSERT,UPDATE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('operator_alerts','SELECT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('organization_agreements','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('paperwork_prints','SELECT,INSERT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('pedigree_ancestors','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('people','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('performance_metrics','SELECT,INSERT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('permission_audit_log','SELECT,INSERT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('permissions','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('platform_settings','SELECT,UPDATE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('platform_waitlist','SELECT,INSERT','INSERT','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('premium_generation_attempts','','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('premium_generations','SELECT,INSERT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('promo_codes','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('push_notification_queue','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('push_subscriptions','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('result_submissions','SELECT,INSERT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    -- MYK9-115 breaker state and its audit trail. No client grants by design:
    -- these are read inside SECURITY DEFINER functions, and a client that could
    -- write ringside_containment could switch off the conflict-storm breaker.
    ('ringside_containment','','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('ringside_containment_audit','','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('ringside_sessions','','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('role_permissions','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('role_requests','SELECT,UPDATE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('roles','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('rule_organizations','SELECT','SELECT','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('rule_sports','SELECT','SELECT','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('rulebooks','SELECT','SELECT','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('rules','SELECT','SELECT','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('rules_feedback','INSERT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('rules_query_log','INSERT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('secretary_tasks','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('show_announcement_reads','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('show_announcements','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('show_eve_nudge_log','','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('show_incidents','SELECT,INSERT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('show_lifecycle_email_attempts','SELECT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('show_lifecycle_email_jobs','SELECT,UPDATE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('show_lifecycle_email_steps','SELECT,UPDATE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('show_message_threads','SELECT,INSERT,UPDATE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('show_messages','SELECT,INSERT,UPDATE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('show_money_locks','','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('show_passcodes','','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('show_payouts','SELECT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('show_templates','SELECT,INSERT,UPDATE,DELETE','SELECT','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('show_visibility_settings','SELECT,INSERT,UPDATE','SELECT','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('shows','SELECT,INSERT,UPDATE,DELETE','SELECT','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('sms_opt_in_attempts','','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('sms_proximity_sends','','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('sport_class_rules','SELECT,INSERT,UPDATE,DELETE','SELECT','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('sport_templates','SELECT,INSERT,UPDATE,DELETE','SELECT','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('sport_titles','SELECT,INSERT,UPDATE,DELETE','SELECT','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('stripe_customers','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('stripe_order_refunds','','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('stripe_orders','SELECT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('stripe_subscriptions','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('subscription_entitlement_grants','SELECT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('support_ticket_messages','SELECT,INSERT,UPDATE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('support_tickets','SELECT,INSERT,UPDATE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('sync_conflicts','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('system_health_snapshots','SELECT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('training_goals','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('training_journal_entries','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('training_milestones','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('trial_checklist_state','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('trial_judge_supplies','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('trial_packet_generation_claims','','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('trial_packet_print_reminders','','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('trial_packet_snapshots','SELECT','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('trial_visibility_overrides','SELECT,INSERT,UPDATE','SELECT','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('trials','SELECT,INSERT,UPDATE,DELETE','SELECT','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('user_guide','SELECT','SELECT','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('user_milestones','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('user_preferences','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('user_roles','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('vaccinations','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('vet_visits','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('volunteer_class_assignments','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('volunteer_general_assignments','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('volunteer_roles','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('volunteers','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('waitlist_entries','SELECT,INSERT,UPDATE,DELETE','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
    ('waitlist_notification_events','','','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    ),
    -- service_role is intentionally excluded here. Hosted Supabase defaults
    -- grant it arwdDxtm on new tables, while this migrations-only environment
    -- does not replay those defaults. The full health probe enforces that
    -- column against pg_class on the applied database.
    roles(role_name) AS (VALUES ('anon'), ('authenticated')),
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
               ELSE e.authenticated
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
  RAISE NOTICE 'PASS every contracted table grants exactly the codified CRUD to anon and authenticated';
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
      'show_visibility_settings','shows','sms_opt_in_attempts','sms_proximity_sends','sport_class_rules','sport_templates',
      'sport_titles',
      'stripe_customers','stripe_order_refunds','stripe_orders','stripe_subscriptions',
      'subscription_entitlement_grants','support_ticket_messages','support_tickets',
      'sync_conflicts','system_health_snapshots','training_goals','training_journal_entries',
      'training_milestones','trial_checklist_state','trial_judge_supplies',
      'trial_packet_generation_claims','trial_packet_print_reminders',
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
      -- MYK9-229: the public /fees page reads exactly these three columns
      -- signed out. Not 6 — updated_by and updated_at stay withheld.
      ('platform_settings','anon',3),
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
-- (MYK9-116); entries hides scoring, money and refund columns from anon;
-- platform_settings exposes only the three fee columns (MYK9-229).
DO $$
DECLARE v_leaked text;
BEGIN
  SELECT string_agg(format('%s.%s', t.tbl, t.col), ', ') INTO v_leaked
  FROM (VALUES
    ('classes','num_hides'), ('classes','has_blank'), ('classes','hides_known'),
    ('entries','payment_status'), ('entries','entry_fee'),
    ('entries','stripe_payment_intent_id'), ('entries','refund_amount'),
    ('entries','handler_id'),
    ('platform_settings','updated_by'), ('platform_settings','updated_at'),
    ('platform_settings','id')
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
