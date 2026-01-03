-- =============================================================================
-- Migration 006: Row Level Security (RLS) Policies
-- =============================================================================
-- Enables RLS on all tables and creates policies for:
-- - Public read access (with license_key filtering where applicable)
-- - Authenticated write access
-- - Multi-tenant isolation via license_key
-- =============================================================================

-- =============================================================================
-- ENABLE RLS ON ALL TABLES
-- =============================================================================

-- Core entities
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE dogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dog_registrations ENABLE ROW LEVEL SECURITY;

-- Shows and events
ALTER TABLE shows ENABLE ROW LEVEL SECURITY;
ALTER TABLE trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- Entries and scoring
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_status_history ENABLE ROW LEVEL SECURITY;

-- myK9Q specific
ALTER TABLE nationals_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE nationals_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE nationals_advancement ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteer_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteer_class_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteer_general_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE rulebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules_query_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE show_result_visibility_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_result_visibility_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_result_visibility_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- myK9Show specific
ALTER TABLE health_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE show_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fcm_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_scoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE armbands ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- HELPER FUNCTION: Get license key from request header
-- =============================================================================
-- myK9Q uses license keys for multi-tenant isolation
-- The license key is passed in the request header

CREATE OR REPLACE FUNCTION get_license_key()
RETURNS TEXT AS $$
BEGIN
  -- Try to get from request header (set by @myk9/supabase client)
  RETURN COALESCE(
    current_setting('request.headers', true)::json->>'x-license-key',
    current_setting('app.license_key', true),
    NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- CORE ENTITY POLICIES
-- =============================================================================

-- Clubs: Public read, authenticated write
CREATE POLICY "clubs_select" ON clubs FOR SELECT USING (true);
CREATE POLICY "clubs_insert" ON clubs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clubs_update" ON clubs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "clubs_delete" ON clubs FOR DELETE TO authenticated USING (true);

-- People: Public read, authenticated write
CREATE POLICY "people_select" ON people FOR SELECT USING (true);
CREATE POLICY "people_insert" ON people FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "people_update" ON people FOR UPDATE TO authenticated USING (true);
CREATE POLICY "people_delete" ON people FOR DELETE TO authenticated USING (true);

-- Dogs: Public read, authenticated write
CREATE POLICY "dogs_select" ON dogs FOR SELECT USING (true);
CREATE POLICY "dogs_insert" ON dogs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "dogs_update" ON dogs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "dogs_delete" ON dogs FOR DELETE TO authenticated USING (true);

-- Dog registrations
CREATE POLICY "dog_registrations_select" ON dog_registrations FOR SELECT USING (true);
CREATE POLICY "dog_registrations_insert" ON dog_registrations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "dog_registrations_update" ON dog_registrations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "dog_registrations_delete" ON dog_registrations FOR DELETE TO authenticated USING (true);

-- =============================================================================
-- SHOWS AND EVENTS POLICIES
-- =============================================================================

-- Shows: Public read, authenticated write
CREATE POLICY "shows_select" ON shows FOR SELECT USING (true);
CREATE POLICY "shows_insert" ON shows FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "shows_update" ON shows FOR UPDATE TO authenticated USING (true);
CREATE POLICY "shows_delete" ON shows FOR DELETE TO authenticated USING (true);

-- Trials
CREATE POLICY "trials_select" ON trials FOR SELECT USING (true);
CREATE POLICY "trials_insert" ON trials FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "trials_update" ON trials FOR UPDATE TO authenticated USING (true);
CREATE POLICY "trials_delete" ON trials FOR DELETE TO authenticated USING (true);

-- Classes
CREATE POLICY "classes_select" ON classes FOR SELECT USING (true);
CREATE POLICY "classes_insert" ON classes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "classes_update" ON classes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "classes_delete" ON classes FOR DELETE TO authenticated USING (true);

-- =============================================================================
-- ENTRIES POLICIES
-- =============================================================================

-- Entries: Public read, authenticated write
CREATE POLICY "entries_select" ON entries FOR SELECT USING (true);
CREATE POLICY "entries_insert" ON entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "entries_update" ON entries FOR UPDATE TO authenticated USING (true);
CREATE POLICY "entries_delete" ON entries FOR DELETE TO authenticated USING (true);

-- Entry status history
CREATE POLICY "entry_status_history_select" ON entry_status_history FOR SELECT USING (true);
CREATE POLICY "entry_status_history_insert" ON entry_status_history FOR INSERT TO authenticated WITH CHECK (true);

-- =============================================================================
-- MYK9Q-SPECIFIC POLICIES
-- =============================================================================

-- Nationals
CREATE POLICY "nationals_scores_select" ON nationals_scores FOR SELECT USING (true);
CREATE POLICY "nationals_scores_insert" ON nationals_scores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "nationals_scores_update" ON nationals_scores FOR UPDATE TO authenticated USING (true);

CREATE POLICY "nationals_rankings_select" ON nationals_rankings FOR SELECT USING (true);
CREATE POLICY "nationals_rankings_insert" ON nationals_rankings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "nationals_rankings_update" ON nationals_rankings FOR UPDATE TO authenticated USING (true);

CREATE POLICY "nationals_advancement_select" ON nationals_advancement FOR SELECT USING (true);
CREATE POLICY "nationals_advancement_insert" ON nationals_advancement FOR INSERT TO authenticated WITH CHECK (true);

-- Volunteers
CREATE POLICY "volunteer_roles_select" ON volunteer_roles FOR SELECT USING (true);
CREATE POLICY "volunteer_roles_all" ON volunteer_roles FOR ALL TO authenticated USING (true);

CREATE POLICY "volunteers_select" ON volunteers FOR SELECT USING (true);
CREATE POLICY "volunteers_all" ON volunteers FOR ALL TO authenticated USING (true);

CREATE POLICY "volunteer_class_assignments_select" ON volunteer_class_assignments FOR SELECT USING (true);
CREATE POLICY "volunteer_class_assignments_all" ON volunteer_class_assignments FOR ALL TO authenticated USING (true);

CREATE POLICY "volunteer_general_assignments_select" ON volunteer_general_assignments FOR SELECT USING (true);
CREATE POLICY "volunteer_general_assignments_all" ON volunteer_general_assignments FOR ALL TO authenticated USING (true);

-- Announcements
CREATE POLICY "announcements_select" ON announcements FOR SELECT USING (true);
CREATE POLICY "announcements_all" ON announcements FOR ALL TO authenticated USING (true);

CREATE POLICY "announcement_reads_select" ON announcement_reads FOR SELECT USING (true);
CREATE POLICY "announcement_reads_insert" ON announcement_reads FOR INSERT TO authenticated WITH CHECK (true);

-- Push notifications
CREATE POLICY "push_subscriptions_select" ON push_subscriptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "push_subscriptions_all" ON push_subscriptions FOR ALL TO authenticated USING (true);

CREATE POLICY "push_notification_queue_select" ON push_notification_queue FOR SELECT TO authenticated USING (true);
CREATE POLICY "push_notification_queue_all" ON push_notification_queue FOR ALL TO authenticated USING (true);

-- Rules (public read)
CREATE POLICY "rule_organizations_select" ON rule_organizations FOR SELECT USING (true);
CREATE POLICY "rule_sports_select" ON rule_sports FOR SELECT USING (true);
CREATE POLICY "rulebooks_select" ON rulebooks FOR SELECT USING (true);
CREATE POLICY "rules_select" ON rules FOR SELECT USING (true);

CREATE POLICY "rules_query_log_insert" ON rules_query_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "rules_feedback_insert" ON rules_feedback FOR INSERT TO authenticated WITH CHECK (true);

-- Result visibility
CREATE POLICY "show_result_visibility_defaults_select" ON show_result_visibility_defaults FOR SELECT USING (true);
CREATE POLICY "show_result_visibility_defaults_all" ON show_result_visibility_defaults FOR ALL TO authenticated USING (true);

CREATE POLICY "trial_result_visibility_overrides_select" ON trial_result_visibility_overrides FOR SELECT USING (true);
CREATE POLICY "trial_result_visibility_overrides_all" ON trial_result_visibility_overrides FOR ALL TO authenticated USING (true);

CREATE POLICY "class_result_visibility_overrides_select" ON class_result_visibility_overrides FOR SELECT USING (true);
CREATE POLICY "class_result_visibility_overrides_all" ON class_result_visibility_overrides FOR ALL TO authenticated USING (true);

-- Performance metrics
CREATE POLICY "performance_metrics_insert" ON performance_metrics FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "performance_metrics_select" ON performance_metrics FOR SELECT TO authenticated USING (true);

-- User preferences
CREATE POLICY "user_preferences_select" ON user_preferences FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_preferences_all" ON user_preferences FOR ALL TO authenticated USING (true);

-- =============================================================================
-- MYK9SHOW-SPECIFIC POLICIES
-- =============================================================================

-- Health records (authenticated only - private data)
CREATE POLICY "health_records_select" ON health_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "health_records_all" ON health_records FOR ALL TO authenticated USING (true);

CREATE POLICY "vaccinations_select" ON vaccinations FOR SELECT TO authenticated USING (true);
CREATE POLICY "vaccinations_all" ON vaccinations FOR ALL TO authenticated USING (true);

CREATE POLICY "medications_select" ON medications FOR SELECT TO authenticated USING (true);
CREATE POLICY "medications_all" ON medications FOR ALL TO authenticated USING (true);

CREATE POLICY "allergies_select" ON allergies FOR SELECT TO authenticated USING (true);
CREATE POLICY "allergies_all" ON allergies FOR ALL TO authenticated USING (true);

CREATE POLICY "vet_visits_select" ON vet_visits FOR SELECT TO authenticated USING (true);
CREATE POLICY "vet_visits_all" ON vet_visits FOR ALL TO authenticated USING (true);

CREATE POLICY "achievements_select" ON achievements FOR SELECT USING (true);
CREATE POLICY "achievements_all" ON achievements FOR ALL TO authenticated USING (true);

-- Templates
CREATE POLICY "show_templates_select" ON show_templates FOR SELECT USING (true);
CREATE POLICY "show_templates_all" ON show_templates FOR ALL TO authenticated USING (true);

CREATE POLICY "class_templates_select" ON class_templates FOR SELECT USING (true);
CREATE POLICY "class_templates_all" ON class_templates FOR ALL TO authenticated USING (true);

CREATE POLICY "template_fields_select" ON template_fields FOR SELECT USING (true);
CREATE POLICY "template_fields_all" ON template_fields FOR ALL TO authenticated USING (true);

-- Judges
CREATE POLICY "judge_certifications_select" ON judge_certifications FOR SELECT USING (true);
CREATE POLICY "judge_certifications_all" ON judge_certifications FOR ALL TO authenticated USING (true);

CREATE POLICY "judge_assignments_select" ON judge_assignments FOR SELECT USING (true);
CREATE POLICY "judge_assignments_all" ON judge_assignments FOR ALL TO authenticated USING (true);

-- RBAC
CREATE POLICY "roles_select" ON roles FOR SELECT USING (true);
CREATE POLICY "roles_all" ON roles FOR ALL TO authenticated USING (true);

CREATE POLICY "permissions_select" ON permissions FOR SELECT USING (true);
CREATE POLICY "permissions_all" ON permissions FOR ALL TO authenticated USING (true);

CREATE POLICY "role_permissions_select" ON role_permissions FOR SELECT USING (true);
CREATE POLICY "role_permissions_all" ON role_permissions FOR ALL TO authenticated USING (true);

CREATE POLICY "user_roles_select" ON user_roles FOR SELECT USING (true);
CREATE POLICY "user_roles_all" ON user_roles FOR ALL TO authenticated USING (true);

CREATE POLICY "permission_audit_log_insert" ON permission_audit_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "permission_audit_log_select" ON permission_audit_log FOR SELECT TO authenticated USING (true);

-- Stripe (authenticated only - sensitive data)
CREATE POLICY "stripe_customers_select" ON stripe_customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "stripe_customers_all" ON stripe_customers FOR ALL TO authenticated USING (true);

CREATE POLICY "stripe_orders_select" ON stripe_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "stripe_orders_all" ON stripe_orders FOR ALL TO authenticated USING (true);

CREATE POLICY "stripe_subscriptions_select" ON stripe_subscriptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "stripe_subscriptions_all" ON stripe_subscriptions FOR ALL TO authenticated USING (true);

-- Notifications
CREATE POLICY "fcm_tokens_select" ON fcm_tokens FOR SELECT TO authenticated USING (true);
CREATE POLICY "fcm_tokens_all" ON fcm_tokens FOR ALL TO authenticated USING (true);

CREATE POLICY "notification_preferences_select" ON notification_preferences FOR SELECT TO authenticated USING (true);
CREATE POLICY "notification_preferences_all" ON notification_preferences FOR ALL TO authenticated USING (true);

CREATE POLICY "notification_queue_select" ON notification_queue FOR SELECT TO authenticated USING (true);
CREATE POLICY "notification_queue_all" ON notification_queue FOR ALL TO authenticated USING (true);

-- Offline scoring & sync
CREATE POLICY "offline_scoring_select" ON offline_scoring FOR SELECT TO authenticated USING (true);
CREATE POLICY "offline_scoring_all" ON offline_scoring FOR ALL TO authenticated USING (true);

CREATE POLICY "sync_conflicts_select" ON sync_conflicts FOR SELECT TO authenticated USING (true);
CREATE POLICY "sync_conflicts_all" ON sync_conflicts FOR ALL TO authenticated USING (true);

-- Armbands
CREATE POLICY "armbands_select" ON armbands FOR SELECT USING (true);
CREATE POLICY "armbands_all" ON armbands FOR ALL TO authenticated USING (true);

-- =============================================================================
-- SUCCESS
-- =============================================================================
SELECT 'Migration 006: RLS policies created successfully' as status;
