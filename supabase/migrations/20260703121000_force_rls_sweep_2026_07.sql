-- SA-017: force RLS on live tables that already had RLS enabled.

BEGIN;

ALTER TABLE public.analytics_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_feedback FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_query_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_guide FORCE ROW LEVEL SECURITY;
ALTER TABLE public.club_access_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.entry_payment_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.entry_submissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organization_agreements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.platform_waitlist FORCE ROW LEVEL SECURITY;
ALTER TABLE public.result_submissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.role_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.show_incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.show_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.show_message_threads FORCE ROW LEVEL SECURITY;
ALTER TABLE public.training_goals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trial_judge_supplies FORCE ROW LEVEL SECURITY;

COMMIT;
