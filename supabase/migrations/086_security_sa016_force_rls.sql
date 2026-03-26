-- =============================================================================
-- Migration 086: SA-016 — Add FORCE ROW LEVEL SECURITY to 25 tables
--
-- MEDIUM: These tables have ENABLE ROW LEVEL SECURITY but not FORCE.
-- Without FORCE, the table owner role bypasses RLS entirely. This means
-- SECURITY DEFINER functions and edge functions running as the table owner
-- can see all rows, defeating the purpose of RLS policies.
--
-- FORCE ROW LEVEL SECURITY ensures RLS applies even to the table owner,
-- unless they explicitly use a BYPASSRLS role.
-- =============================================================================

ALTER TABLE training_journal_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE training_milestones FORCE ROW LEVEL SECURITY;
ALTER TABLE manual_results FORCE ROW LEVEL SECURITY;
ALTER TABLE pedigree_ancestors FORCE ROW LEVEL SECURITY;
ALTER TABLE ofa_screenings FORCE ROW LEVEL SECURITY;
ALTER TABLE genetic_screenings FORCE ROW LEVEL SECURITY;
ALTER TABLE promo_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE trial_checklist_state FORCE ROW LEVEL SECURITY;
ALTER TABLE activity_log FORCE ROW LEVEL SECURITY;
ALTER TABLE user_milestones FORCE ROW LEVEL SECURITY;
ALTER TABLE club_members FORCE ROW LEVEL SECURITY;
ALTER TABLE club_officers FORCE ROW LEVEL SECURITY;
ALTER TABLE registrations FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE show_announcements FORCE ROW LEVEL SECURITY;
ALTER TABLE show_announcement_reads FORCE ROW LEVEL SECURITY;
ALTER TABLE show_visibility_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE trial_visibility_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE class_visibility_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE email_log FORCE ROW LEVEL SECURITY;
ALTER TABLE frontend_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE sport_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE sport_class_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE sport_titles FORCE ROW LEVEL SECURITY;
