-- MYK9-93 wider audit: codify the pre-migration-era table grants, and drop the
-- privileges the audit proved nobody needs.
--
-- WHY THIS EXISTS
-- ---------------
-- The linked project (sojmvhhwsjxmfistvzbe) predates the rule that every table
-- carries explicit GRANTs. Its core tables were granted by hand, or inherited
-- ALTER DEFAULT PRIVILEGES, before grants were tracked in migrations at all. A
-- migrations-faithful rebuild therefore does not reproduce production.
--
-- Audited 2026-07-30 by applying all 435 migrations to a scratch PostgreSQL
-- cluster with no seeded default privileges, then diffing pg_class.relacl and
-- pg_attribute.attacl against the live project:
--
--   * 121 tables on both sides. No schema drift; the drift is purely ACL.
--   * 90 tables get NO authenticated grant at all from migrations, while
--     production grants arwdDxtm. On a rebuilt database every client read of
--     those tables fails 42501 before RLS is ever consulted.
--   * 112 tables get no service_role grant from migrations.
--   * The same drift exists one level down, on SEQUENCES: no migration has
--     ever granted a sequence privilege, so all three public sequences reach a
--     rebuild owner-only. Section 7 covers them. This is not cosmetic --
--     granting authenticated INSERT on enrollments (section 3) makes an
--     invoker-run trigger's nextval() reachable, and a rebuilt database fails
--     the insert on the sequence instead of the table.
--   * The drift runs both ways, though only once: on ringside_sessions a
--     rebuild is WIDER than production, because 20260530210555 re-grants a
--     SELECT that the live project does not have. Section 5 revokes it.
--   * anon is already fully codified (20260725160000 / 20260725170000 /
--     20260725180000 / 20260730140000): table and column ACLs matched exactly
--     on both sides. That includes people.email, which 20260730180000 flagged
--     as possibly uncodified and deferred to this audit. It is codified, by
--     20260725180000. No anon change is needed and none is made.
--   * Column-level ACLs matched exactly on both sides for all six tables that
--     carry them: classes(52), entries(54 authenticated + 14 anon), dogs(5),
--     people(4), dog_registrations(1), paperwork_prints(3).
--
-- Two existing workarounds exist for this drift and are superseded as the
-- source of truth, though both are left in place here:
--   * supabase/seed-isolated-e2e-platform-grants.sql, a 29-table hand-kept ACL
--     mirror for the isolated Playwright target.
--   * fixture GRANTs inside supabase/tests/*.sql that "reproduce the client
--     table privileges needed to reach the RLS policies on a clean database".
-- Retiring them is follow-up work, not this migration's scope.
--
-- HOW THE INTENDED GRANT SET WAS CHOSEN
-- -------------------------------------
-- Per table and role, the grant is the intersection of
--   (a) the commands reachable through that table's surviving RLS policies,
--       read from the LIVE pg_policies catalog rather than from migration text,
--       counting both TO authenticated and untyped TO public policies, and
--   (b) the CRUD privileges the live project holds today.
-- (a) never adds a privilege production lacks; (b) never adds one no policy
-- could use. Deliberate past revokes survive the intersection automatically,
-- because the live side already reflects them: entries keeps no table-level
-- SELECT for authenticated (20260620001929), stripe_orders stays read-only
-- (20260717122000), entry_status_history takes no INSERT from any role
-- (20260716120000).
--
-- THIS MIGRATION NEVER USES `REVOKE ALL` ON A COLUMN-ALLOWLIST TABLE.
-- Revoking a privilege at table level also drops it at column level, which
-- pg_class.relacl does not show and a `select=*` probe cannot detect. That is
-- the trap that briefly exposed entries.total_score, payment_status and
-- stripe_payment_intent_id on staging (MYK9-93, repaired by 20260725170000).
-- classes, dogs, people and entries therefore receive a restated column GRANT
-- as their anon disposition, never a REVOKE.

-- ===========================================================================
-- 1. Strip the privileges no API role can reach, BEFORE granting anything.
--
--    Order matters here, and not only for readability. A blanket
--    `REVOKE ... ON ALL TABLES IN SCHEMA public FROM anon` is the statement
--    that destroys column grants, so anonEntriesGrantContract replays every
--    migration and treats ANY such statement as clearing every column
--    allowlist -- it cannot tell from the text that revoking TRUNCATE leaves
--    SELECT columns alone. Running the sweep first and re-granting afterwards
--    satisfies both the simulator and, more importantly, anyone reading this
--    file: the final state is exactly what section 4 grants.
-- ===========================================================================

-- TRUNCATE, REFERENCES, TRIGGER and MAINTAIN are unreachable through PostgREST,
-- which issues only SELECT/INSERT/UPDATE/DELETE. Production nonetheless grants
-- all four to authenticated on 109 tables, inherited from the same pre-rule
-- era. TRUNCATE is the one that matters: row-level security does not constrain
-- it, so FORCE RLS is no defence and a truncate would take an entire table
-- regardless of policy. No column-level grant of any of these privileges exists
-- on either role (verified against pg_attribute.attacl), so this cannot disturb
-- the column allowlists -- and section 5 re-states them regardless.
--
-- MAINTAIN is PostgreSQL 17+. It is named unguarded rather than wrapped in a
-- version check because both targets are 17 or later: supabase/config.toml pins
-- `major_version = 17` for the local CLI database, and the live project already
-- shows the privilege (the `m` in authenticated's arwdDxtm). A DO block would
-- also be actively harmful here -- anonEntriesGrantContract hoists EXECUTE
-- payloads to the end of the file when it replays migrations, so a guarded
-- revoke would appear to run after the column grants below and read as wiping
-- them.
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

-- ===========================================================================
-- 2. authenticated + service_role — full CRUD.
--    Owner-scoped or show-scoped records the client both creates and removes.
-- ===========================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.achievements,
  public.allergies,
  public.armbands,
  public.classes,
  public.club_members,
  public.club_officers,
  public.club_premium_templates,
  public.clubs,
  public.dog_favorites,
  public.dog_registrations,
  public.dogs,
  public.entry_cart_items,
  public.entry_carts,
  public.exhibitor_profiles,
  public.fcm_tokens,
  public.genetic_screenings,
  public.health_records,
  public.judge_assignments,
  public.judge_availability,
  public.judge_certifications,
  public.judge_qualifications,
  public.manual_results,
  public.medications,
  public.nationals_advancement,
  public.nationals_rankings,
  public.nationals_scores,
  public.notification_preferences,
  public.notification_queue,
  public.ofa_screenings,
  public.offline_scoring,
  public.organization_agreements,
  public.pedigree_ancestors,
  public.people,
  public.permissions,
  public.promo_codes,
  public.push_notification_queue,
  public.push_subscriptions,
  public.role_permissions,
  public.roles,
  public.secretary_tasks,
  public.show_announcement_reads,
  public.show_announcements,
  public.show_templates,
  public.shows,
  public.sport_class_rules,
  public.sport_templates,
  public.sport_titles,
  public.stripe_customers,
  public.stripe_subscriptions,
  public.sync_conflicts,
  public.training_goals,
  public.training_journal_entries,
  public.training_milestones,
  public.trial_checklist_state,
  public.trial_judge_supplies,
  public.trials,
  public.user_milestones,
  public.user_preferences,
  public.user_roles,
  public.vaccinations,
  public.vet_visits,
  public.volunteer_class_assignments,
  public.volunteer_general_assignments,
  public.volunteer_roles,
  public.volunteers,
  public.waitlist_entries
TO authenticated, service_role;

-- ===========================================================================
-- 3. authenticated — narrower sets.
-- ===========================================================================

-- Read-only: reference data, or rows written only by triggers, webhooks,
-- SECURITY DEFINER RPCs, or service_role workers.
GRANT SELECT ON TABLE
  public.announcement_reads,
  public.announcements,
  public.club_stripe_accounts,
  public.email_log,
  public.entry_payment_links,
  public.entry_status_history,
  public.entry_submissions,
  public.operator_alerts,
  public.rule_organizations,
  public.rule_sports,
  public.rulebooks,
  public.rules,
  public.show_lifecycle_email_attempts,
  public.show_payouts,
  public.stripe_orders,
  public.subscription_entitlement_grants,
  public.system_health_snapshots,
  public.user_guide
TO authenticated;

-- Create and amend, never delete.
GRANT SELECT, INSERT, UPDATE ON TABLE
  public.class_visibility_overrides,
  public.enrollments,
  public.notifications,
  public.onboarding_requests,
  public.show_message_threads,
  public.show_messages,
  public.show_visibility_settings,
  public.support_ticket_messages,
  public.support_tickets,
  public.trial_visibility_overrides
TO authenticated;

-- Append-only logs and submissions the client can read back.
GRANT SELECT, INSERT ON TABLE
  public.activity_log,
  public.analytics_events,
  public.paperwork_prints,
  public.performance_metrics,
  public.permission_audit_log,
  public.platform_waitlist,
  public.premium_generations,
  public.result_submissions,
  public.show_incidents
TO authenticated;

-- Read and amend an existing row; creation goes through an RPC or a worker.
GRANT SELECT, UPDATE ON TABLE
  public.club_access_requests,
  public.platform_settings,
  public.role_requests,
  public.show_lifecycle_email_jobs,
  public.show_lifecycle_email_steps
TO authenticated;

-- Write-only: the client submits, a worker or admin surface reads.
GRANT INSERT ON TABLE
  public.chatbot_feedback,
  public.rules_feedback,
  public.rules_query_log
TO authenticated;

-- entries is deliberately asymmetric. Table-level SELECT stays revoked for
-- authenticated (20260620001929) and for anon (20260616120000, restored as
-- columns by 20260725170000); both roles read through column allowlists so
-- scoring, payment and refund columns never reach a client. Granting SELECT
-- here would silently undo that. Writes are unaffected and gated by RLS.
GRANT INSERT, UPDATE, DELETE ON TABLE public.entries TO authenticated;

-- paperwork_prints UPDATE stays column-scoped to the void columns
-- (20260720100000). The table-level SELECT, INSERT granted above plus that
-- existing column grant are the complete authenticated surface.

-- ===========================================================================
-- 4. service_role — the remaining tables.
--    service_role bypasses RLS by design; edge functions, Stripe webhooks and
--    cron workers depend on it. Enumerated rather than granted schema-wide so
--    views are not swept in and the set stays auditable.
-- ===========================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.activity_log,
  public.analytics_events,
  public.announcement_reads,
  public.announcements,
  public.chatbot_feedback,
  public.chatbot_query_log,
  public.class_visibility_overrides,
  public.club_access_requests,
  public.club_stripe_accounts,
  public.email_log,
  public.enrollments,
  public.entries,
  public.entry_payment_links,
  public.entry_submissions,
  public.frontend_logs,
  public.login_attempts,
  public.notifications,
  public.onboarding_requests,
  public.operator_alerts,
  public.paperwork_prints,
  public.performance_metrics,
  public.permission_audit_log,
  public.platform_settings,
  public.platform_waitlist,
  public.premium_generation_attempts,
  public.premium_generations,
  public.result_submissions,
  public.ringside_sessions,
  public.role_requests,
  public.rule_organizations,
  public.rule_sports,
  public.rulebooks,
  public.rules,
  public.rules_feedback,
  public.rules_query_log,
  public.show_incidents,
  public.show_lifecycle_email_attempts,
  public.show_lifecycle_email_jobs,
  public.show_lifecycle_email_steps,
  public.show_message_threads,
  public.show_messages,
  public.show_money_locks,
  public.show_passcodes,
  public.show_payouts,
  public.show_visibility_settings,
  public.stripe_order_refunds,
  public.stripe_orders,
  public.subscription_entitlement_grants,
  public.support_ticket_messages,
  public.support_tickets,
  public.system_health_snapshots,
  public.trial_visibility_overrides,
  public.user_guide,
  public.waitlist_notification_events
TO service_role;

-- entry_status_history is append-only through its capture trigger. INSERT was
-- revoked from every role including service_role (20260716120000); grant the
-- rest and leave INSERT out rather than granting then revoking it.
GRANT SELECT, UPDATE, DELETE ON TABLE public.entry_status_history TO service_role;

-- ===========================================================================
-- 5. anon — explicit per-table disposition, unchanged from production.
--    Required by the grant-decision contract: every standalone table grant
--    needs an anon decision recorded in the same migration.
-- ===========================================================================

-- Public reference and show-discovery data. Re-affirms 20260725160000.
GRANT SELECT ON TABLE
  public.achievements,
  public.armbands,
  public.class_visibility_overrides,
  public.clubs,
  public.judge_assignments,
  public.rule_organizations,
  public.rule_sports,
  public.rulebooks,
  public.rules,
  public.show_templates,
  public.show_visibility_settings,
  public.shows,
  public.sport_class_rules,
  public.sport_templates,
  public.sport_titles,
  public.trial_visibility_overrides,
  public.trials,
  public.user_guide
TO anon;

-- The public signup box is write-only for anon (197_create_platform_waitlist).
GRANT INSERT ON TABLE public.platform_waitlist TO anon;

-- The four column-allowlist tables. These restate the existing allowlists
-- verbatim; a GRANT is used deliberately, because any REVOKE naming these
-- tables would take the column grants with it. Adding a column here widens
-- anonymous exposure, which is why anonEntriesGrantContract and
-- publicResultsReleaseGateRlsContract assert the forbidden columns stay out.

-- classes: everything except the scent-work hide counts withheld by MYK9-116
-- (num_hides, has_blank, hides_known). See 20260730140000.
GRANT SELECT (
  id, trial_id, name, description, level, element, section, competition_type,
  entry_fee, max_entries, allow_waitlist, max_dogs_per_handler,
  breed_restrictions, jump_heights, age_min, age_max, height_min, height_max,
  handler_age_min, handler_age_max, start_time, estimated_duration,
  actual_start_time, actual_end_time, status, time_limit_seconds, num_areas,
  max_faults, qualifying_threshold, is_scoring_finalized, results_released_at,
  dogs_ahead_notification_count, total_entries_count, checked_in_count,
  scored_count, created_at, updated_at, deleted_at, deleted_by, class_number,
  timer_mode, distraction_count, is_results_reviewed, judge_name,
  time_limit_area2_seconds, time_limit_area3_seconds, display_order,
  results_released_by, version, status_source, reopened_after_closeout_at,
  revised_expected_start
) ON public.classes TO anon;

-- entries: the ringside-visible columns only. Results, money and refund
-- columns are absent by design and reach anon solely through
-- view_public_entry_results. See 20260616120000 and 20260725170000.
GRANT SELECT (
  id, dog_id, class_id, show_id, trial_id, entry_status, handler, armband,
  run_order, jump_height, is_scored, is_in_ring, check_in_status, created_at
) ON public.entries TO anon;

-- dogs and people exist as anon grants purely so PostgREST can resolve the
-- embeds on public show pages. PostgREST requires table-level SELECT on every
-- embedded relation, so removing these turns a null embed into a hard 42501
-- that fails the whole request. See 20260725170000 and 20260725180000.
GRANT SELECT (id, name, call_name, breed, image_url) ON public.dogs TO anon;
GRANT SELECT (id, first_name, last_name, email) ON public.people TO anon;

-- Every other table: anon has no access and must never regrow one. Safe as a
-- blanket REVOKE because none of these carries an anon column grant (verified
-- against pg_attribute.attacl on 2026-07-30); the four that do are handled
-- above with GRANTs instead.
REVOKE ALL ON TABLE
  public.activity_log,
  public.allergies,
  public.analytics_events,
  public.announcement_reads,
  public.announcements,
  public.chatbot_feedback,
  public.chatbot_query_log,
  public.club_access_requests,
  public.club_members,
  public.club_officers,
  public.club_premium_templates,
  public.club_stripe_accounts,
  public.dog_favorites,
  public.dog_registrations,
  public.email_log,
  public.enrollments,
  public.entry_cart_items,
  public.entry_carts,
  public.entry_payment_links,
  public.entry_status_history,
  public.entry_submissions,
  public.exhibitor_profiles,
  public.fcm_tokens,
  public.frontend_logs,
  public.genetic_screenings,
  public.health_records,
  public.judge_availability,
  public.judge_certifications,
  public.judge_qualifications,
  public.login_attempts,
  public.manual_results,
  public.medications,
  public.nationals_advancement,
  public.nationals_rankings,
  public.nationals_scores,
  public.notification_preferences,
  public.notification_queue,
  public.notifications,
  public.ofa_screenings,
  public.offline_scoring,
  public.onboarding_requests,
  public.operator_alerts,
  public.organization_agreements,
  public.paperwork_prints,
  public.pedigree_ancestors,
  public.performance_metrics,
  public.permission_audit_log,
  public.permissions,
  public.platform_settings,
  public.premium_generation_attempts,
  public.premium_generations,
  public.promo_codes,
  public.push_notification_queue,
  public.push_subscriptions,
  public.result_submissions,
  public.ringside_sessions,
  public.role_permissions,
  public.role_requests,
  public.roles,
  public.rules_feedback,
  public.rules_query_log,
  public.secretary_tasks,
  public.show_announcement_reads,
  public.show_announcements,
  public.show_incidents,
  public.show_lifecycle_email_attempts,
  public.show_lifecycle_email_jobs,
  public.show_lifecycle_email_steps,
  public.show_message_threads,
  public.show_messages,
  public.show_money_locks,
  public.show_passcodes,
  public.show_payouts,
  public.stripe_customers,
  public.stripe_order_refunds,
  public.stripe_orders,
  public.stripe_subscriptions,
  public.subscription_entitlement_grants,
  public.support_ticket_messages,
  public.support_tickets,
  public.sync_conflicts,
  public.system_health_snapshots,
  public.training_goals,
  public.training_journal_entries,
  public.training_milestones,
  public.trial_checklist_state,
  public.trial_judge_supplies,
  public.user_milestones,
  public.user_preferences,
  public.user_roles,
  public.vaccinations,
  public.vet_visits,
  public.volunteer_class_assignments,
  public.volunteer_general_assignments,
  public.volunteer_roles,
  public.volunteers,
  public.waitlist_entries,
  public.waitlist_notification_events
FROM anon;

-- ===========================================================================
-- 6. Per-table narrowing the audit proved safe.
--    These, plus the sweep in section 1, are the only statements here that
--    change the live project; everything else is a no-op on production and the
--    repair on a rebuild.
-- ===========================================================================

-- Two tables grant authenticated full CRUD in production that no RLS policy can
-- ever use, so every such statement already fails closed under FORCE RLS. Make
-- the denial explicit at the grant layer rather than resting on the absence of
-- a policy. Both are worker-owned: chatbot_query_log is written by the AskQ
-- logger, frontend_logs has service_role-only policies (025_frontend_logs.sql).
-- Neither carries a column grant, so REVOKE ALL is safe here.
REVOKE ALL ON TABLE public.chatbot_query_log FROM authenticated;
REVOKE ALL ON TABLE public.frontend_logs FROM authenticated;

-- Entitlement rows are written only by admin_grant_entitlement and
-- admin_revoke_entitlement (SECURITY DEFINER) and by the Stripe webhook running
-- as service_role. 20260724120000 nonetheless granted authenticated full CRUD,
-- and the table's single RLS policy covers SELECT only, so the write grants are
-- unreachable. A GRANT cannot narrow an existing broader grant, so this needs
-- its own REVOKE; without it a rebuilt database keeps the write privileges.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.subscription_entitlement_grants
  FROM authenticated;

-- ringside_sessions is the one table where the drift runs the other way: the
-- live project holds NO authenticated grant, but 20260530210555 revokes all and
-- then re-grants SELECT, so a rebuild is WIDER than production. Sessions are
-- claimed through upsert_ringside_session(), which authorizes internally; the
-- surviving SELECT policy is dead surface with no grant behind it in
-- production. Codify production's tighter state.
REVOKE SELECT ON TABLE public.ringside_sessions FROM authenticated;

-- The other six tables with no API path do already hold no authenticated grant
-- on either side, kept that way by their own migrations and recorded in the
-- grant-decision keep-list: login_attempts (20260710140000),
-- premium_generation_attempts (20260712120000), show_money_locks
-- (20260706184621), show_passcodes (20260525180000), stripe_order_refunds
-- (20260717122000), waitlist_notification_events (20260713010000). Verified
-- individually rather than assumed -- ringside_sessions was in this list until
-- the rebuild diff caught it.

-- ===========================================================================
-- 7. Sequences — the same drift, one level down.
--
--    NO migration in the corpus has ever GRANTed a sequence privilege; every
--    sequence statement is a REVOKE. The live project holds its sequence
--    grants entirely from `ALTER DEFAULT PRIVILEGES`, which auto-grants
--    USAGE/SELECT on every new sequence to anon and authenticated. So a
--    migrations-only rebuild leaves all three public sequences owner-only.
--
--    That is load-bearing, not cosmetic, and section 3 above is what exposes
--    it: granting authenticated INSERT on public.enrollments makes an
--    otherwise-unreachable sequence dependency reachable. enrollments carries a
--    BEFORE INSERT trigger, set_confirmation_number, running
--    generate_confirmation_number() (054_registrations_table.sql:31) -- plpgsql
--    with NO SECURITY DEFINER, so it executes as the invoker and calls
--    nextval('registration_confirmation_seq'). Without USAGE the insert fails
--    on a rebuild even though the table grant is present; the failure just
--    moves from the table to the sequence.
-- ===========================================================================

-- The one sequence a client role legitimately advances, via that trigger.
-- UPDATE is withheld: it permits setval(), which would let a caller rewind the
-- confirmation counter and mint duplicate confirmation numbers. Nothing needs
-- it, and RLS does not gate sequence operations any more than it gates TRUNCATE.
GRANT USAGE, SELECT ON SEQUENCE public.registration_confirmation_seq
  TO authenticated, service_role;
GRANT UPDATE ON SEQUENCE public.registration_confirmation_seq TO service_role;
REVOKE UPDATE ON SEQUENCE public.registration_confirmation_seq FROM authenticated;

-- frontend_logs.id is GENERATED ALWAYS AS IDENTITY (025_frontend_logs.sql:6).
-- An identity column's sequence is owned by the column and needs no privilege
-- of its own, and section 6 revoked authenticated from the table outright, so
-- authenticated has no business here at all. service_role keeps the live set.
REVOKE ALL ON SEQUENCE public.frontend_logs_id_seq FROM anon, authenticated;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.frontend_logs_id_seq TO service_role;

-- ringside_conflict_seq is advanced only inside SECURITY DEFINER functions,
-- which run as the owner, and read back through system_health_probe. Client
-- roles were revoked deliberately (20260711160000) and stay revoked; this
-- re-asserts that and codifies the service_role grant the live project holds.
REVOKE ALL ON SEQUENCE public.ringside_conflict_seq FROM anon, authenticated;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.ringside_conflict_seq TO service_role;

-- Anon decision for sequences: none, on any of them. Re-affirms
-- 20260725160000, which revoked both the default privilege and the existing
-- grants. Safe as a blanket revoke -- sequences have no column-level ACLs.
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

COMMENT ON SCHEMA public IS
  'myK9Show application schema. Table grants for anon, authenticated and '
  'service_role are codified in migrations as of 20260730190000 (MYK9-93), so '
  'a migrations-only rebuild reproduces the live ACLs. Verify any change '
  'against pg_class.relacl AND pg_attribute.attacl; never REVOKE ALL on '
  'classes, dogs, people or entries, which carry column allowlists.';
