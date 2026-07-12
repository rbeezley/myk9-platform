-- Advisor disposition sweep (plan docs/improve-audit-2026-07-11/009) — mechanical/low-risk half.
-- Covers Verdict 4 (pin 16 mutable search_paths), Verdict 5 (drop 2 bucket listing policies),
-- Verdict 1 (document the 2 accepted SECURITY DEFINER views) and Verdict 6 (document the 3
-- accepted policy-less deny-all tables). The high-risk anon-EXECUTE revoke is a separate migration.
-- Verified live 2026-07-12: all 3 policy-less tables already carry FORCE RLS (SA-021 done in
-- 20260711170000), so no FORCE-RLS statements are needed here.

-- ---------------------------------------------------------------------------
-- Verdict 4 — pin mutable search_path on 16 functions.
-- Group 1: functions with no unqualified schema-local references -> search_path = ''.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public._result_timing_visible(p_timing text, p_state text) SET search_path = '';
ALTER FUNCTION public._result_visibility_preset(p_preset text, p_field text) SET search_path = '';
ALTER FUNCTION public.set_updated_at() SET search_path = '';
ALTER FUNCTION public.touch_show_lifecycle_email_updated_at() SET search_path = '';
ALTER FUNCTION public.update_club_members_updated_at() SET search_path = '';
ALTER FUNCTION public.update_training_updated_at() SET search_path = '';
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
ALTER FUNCTION public.update_user_guide_search_vector() SET search_path = '';
ALTER FUNCTION public.restrict_message_update_columns() SET search_path = '';
-- Already schema-qualify their table references, so '' is safe:
ALTER FUNCTION public.clear_prior_premium_default() SET search_path = '';         -- public.club_premium_templates
ALTER FUNCTION public.custom_access_token_hook(event jsonb) SET search_path = ''; -- public.people (auth hook)

-- Group 2: functions with unqualified references to public objects -> pin to public, pg_temp.
-- Behavior-preserving (no body rewrite); public precedes pg_temp so the temp-schema shadowing
-- vector the advisor warns about is closed.
ALTER FUNCTION public.generate_confirmation_number() SET search_path = public, pg_temp;        -- nextval('registration_confirmation_seq')
ALTER FUNCTION public.restrict_payment_status_update() SET search_path = public, pg_temp;       -- is_platform_admin(), has_role()
ALTER FUNCTION public.restrict_subscription_column_updates() SET search_path = public, pg_temp; -- has_role()
ALTER FUNCTION public.update_thread_last_message_at() SET search_path = public, pg_temp;        -- show_message_threads
ALTER FUNCTION public.auto_assign_armband_on_accept() SET search_path = public, pg_temp;        -- shows, armbands, entries

-- ---------------------------------------------------------------------------
-- Verdict 5 — drop the two public-bucket listing policies. Public buckets serve objects by URL
-- without a SELECT policy; these policies only enable directory listing (enumerating every club
-- logo / every published share card, the latter leaking premium URLs pre-share). Verified 2026-07-12:
-- no client code calls .list() on either bucket.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read access for images" ON storage.objects;
DROP POLICY IF EXISTS "Public read premium published" ON storage.objects;

-- ---------------------------------------------------------------------------
-- Verdict 1 — the 2 SECURITY DEFINER views are accepted by design. Record the disposition in the
-- schema so the next advisor reader finds it. These ERRORs remain in advisor output permanently.
-- ---------------------------------------------------------------------------
COMMENT ON VIEW public.view_public_entry_results IS
  'SECURITY DEFINER by design — advisor security_definer_view ERROR ACCEPTED 2026-07-12 (plan improve-audit-2026-07-11/009). Deliberately bypasses base-table RLS to substitute stricter, column-level, claim-aware gating (payment/PII nulled, scores gated on release; #779 per-field design). Converting to security_invoker would break the public results read path. Do not change.';
COMMENT ON VIEW public.view_authenticated_entry_results IS
  'SECURITY DEFINER by design — advisor security_definer_view ERROR ACCEPTED 2026-07-12 (plan improve-audit-2026-07-11/009). Ringside staff read path (mig 20260621190000): bypasses base-table RLS to substitute stricter column-level, claim-aware gating (is_assigned_judge / release). Converting to security_invoker would break ringside reads. Do not change.';

-- ---------------------------------------------------------------------------
-- Verdict 6 — the 3 RLS-enabled/policy-less tables are deny-all-to-API by design. Document it.
-- All three already carry FORCE RLS (verified live 2026-07-12).
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.login_attempts IS
  'RLS enabled with no policies = deny-all to anon/authenticated by design — advisor rls_enabled_no_policy INFO ACCEPTED 2026-07-12 (plan improve-audit-2026-07-11/009). Written/read exclusively via SECURITY DEFINER functions (record_login_attempt / check_login_rate_limit) and service-role paths. FORCE RLS on.';
COMMENT ON TABLE public.show_money_locks IS
  'RLS enabled with no policies = deny-all to anon/authenticated by design — advisor rls_enabled_no_policy INFO ACCEPTED 2026-07-12 (plan improve-audit-2026-07-11/009). Refund/payout critical-section advisory locks, touched only by SECURITY DEFINER money-path functions. FORCE RLS on.';
COMMENT ON TABLE public.show_passcodes IS
  'RLS enabled with no policies = deny-all to anon/authenticated by design — advisor rls_enabled_no_policy INFO ACCEPTED 2026-07-12 (plan improve-audit-2026-07-11/009). Ringside passcode hashes, written/read only via SECURITY DEFINER functions and service-role edge functions. FORCE RLS on.';
