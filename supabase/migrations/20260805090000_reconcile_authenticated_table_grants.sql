-- MYK9-174 / MYK9-129 — reconcile legacy authenticated table grants.
--
-- The codified grant contract (20260730220000) records the intended API
-- surface, but the linked staging project retained older excess CRUD grants
-- on 39 tables. Revoke only privileges that are outside that contract.
--
-- Do not use REVOKE ALL here: entries, classes, dogs and people carry
-- column-level SELECT allowlists, and a blanket table revoke would remove
-- those protections. This migration is safe to replay.

begin;

-- SELECT, INSERT only.
revoke update, delete on table
  public.activity_log,
  public.analytics_events,
  public.performance_metrics,
  public.permission_audit_log,
  public.premium_generations,
  public.result_submissions,
  public.show_incidents
from authenticated;

-- SELECT, UPDATE only.
revoke insert, delete on table
  public.club_access_requests,
  public.platform_settings,
  public.role_requests,
  public.show_lifecycle_email_jobs,
  public.show_lifecycle_email_steps
from authenticated;

-- SELECT only.
revoke insert, update, delete on table
  public.club_stripe_accounts,
  public.email_log,
  public.entry_payment_links,
  public.entry_submissions,
  public.operator_alerts,
  public.rule_organizations,
  public.rule_sports,
  public.rulebooks,
  public.rules,
  public.show_lifecycle_email_attempts,
  public.show_payouts,
  public.system_health_snapshots,
  public.user_guide
from authenticated;

-- INSERT only.
revoke select, update, delete on table
  public.chatbot_feedback,
  public.rules_feedback,
  public.rules_query_log
from authenticated;

-- SELECT, INSERT, UPDATE only.
revoke delete on table
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
from authenticated;

commit;

notify pgrst, 'reload schema';
