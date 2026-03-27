# Security Audit — 2026-03-25

**Mode:** Full Audit
**Checklist version:** references/checklist.md @ 84e65614

## Summary

| Severity  | Count  |
| --------- | ------ |
| CRITICAL  | 3      |
| HIGH      | 9      |
| MEDIUM    | 10     |
| LOW       | 10     |
| **Total** | **32** |

Auto-fixable: 26 of 32 findings

---

## Findings

### [CRITICAL] SA-001: `entries` table open to anonymous users (SELECT/INSERT/UPDATE/DELETE)

**Category:** RLS Policy Integrity
**Location:** `supabase/migrations/078_verify_entries_insert_rls.sql:32-35`
**Evidence:**

```sql
CREATE POLICY "entries_select" ON entries FOR SELECT TO public USING (true);
CREATE POLICY "entries_insert" ON entries FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "entries_update" ON entries FOR UPDATE TO public USING (true);
CREATE POLICY "entries_delete" ON entries FOR DELETE TO public USING (true);
```

**Risk:** Any unauthenticated user can read, create, modify, and delete all entries — scoring data, payment status, handler names. An attacker could manipulate competition results or exfiltrate competitor data.
**Fix:** Replace `TO public` with `TO authenticated` at minimum. Ideally restore role-based policies: owners manage their entries, secretaries manage show entries, admins have full access.
**Auto-fixable:** Yes

---

### [CRITICAL] SA-002: `user_roles` INSERT/UPDATE/DELETE open to all authenticated users

**Category:** RLS Policy Integrity / RBAC & Privilege Escalation
**Location:** `supabase/migrations/069_fix_user_roles_rls_insert.sql:12-22`
**Evidence:**

```sql
CREATE POLICY "user_roles_insert" ON user_roles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "user_roles_update" ON user_roles FOR UPDATE TO authenticated USING (true);
CREATE POLICY "user_roles_delete" ON user_roles FOR DELETE TO authenticated USING (true);
```

**Risk:** Any authenticated user can grant themselves `site_admin`, escalating to full platform access. This undermines the entire RBAC system.
**Fix:** Restrict INSERT/UPDATE/DELETE to `(SELECT is_platform_admin())`. The `handle_new_user()` trigger uses SECURITY DEFINER and bypasses RLS, so auto-assignment still works.
**Auto-fixable:** Yes

---

### [CRITICAL] SA-003: `roles`, `permissions`, `role_permissions` tables open to all authenticated users

**Category:** RLS Policy Integrity
**Location:** `supabase/migrations/006_rls_policies.sql:274-280`
**Evidence:**

```sql
CREATE POLICY "roles_all" ON roles FOR ALL TO authenticated USING (true);
CREATE POLICY "permissions_all" ON permissions FOR ALL TO authenticated USING (true);
CREATE POLICY "role_permissions_all" ON role_permissions FOR ALL TO authenticated USING (true);
```

**Risk:** Any user can create/modify/delete roles, permissions, and their mappings. Combined with SA-002, an attacker can rewrite the entire RBAC schema.
**Fix:** Replace with `USING ((SELECT is_platform_admin()))` on all three tables.
**Auto-fixable:** Yes

---

### [HIGH] SA-004: `is_platform_admin()` does not check `is_active` on user_roles

**Category:** RBAC & Privilege Escalation
**Location:** `supabase/migrations/047_fix_platform_admin_role_name.sql:4-19`
**Evidence:**

```sql
SELECT EXISTS (
  SELECT 1 FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.people p ON p.id = ur.user_id
  WHERE p.auth_user_id = auth.uid()
    AND r.name IN ('platform_admin', 'site_admin')
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    -- Missing: AND ur.is_active = true
);
```

**Risk:** Deactivated admins retain full platform access through every RLS policy that calls `is_platform_admin()`.
**Fix:** Add `AND ur.is_active = true` to the WHERE clause.
**Auto-fixable:** Yes

---

### [HIGH] SA-005: `is_club_admin()` does not check `is_active`

**Category:** RBAC & Privilege Escalation
**Location:** `supabase/migrations/016_fix_permissive_rls_policies.sql` (original definition, never updated)
**Evidence:** Same pattern as SA-004 — missing `AND ur.is_active = true`.
**Risk:** Deactivated club admins retain club management privileges (create shows, manage trials, members, branding).
**Fix:** Add `AND ur.is_active = true` to the WHERE clause.
**Auto-fixable:** Yes

---

### [HIGH] SA-006: `has_role()` function does not check `is_active`

**Category:** RBAC & Privilege Escalation
**Location:** `supabase/migrations/015_rls_performance_fixes.sql:47-63`
**Evidence:** Same pattern — missing `AND ur.is_active = true`.
**Risk:** Used in RLS for judge_qualifications, entry_carts, exhibitor_profiles, waitlist_entries. Deactivated roles still pass.
**Fix:** Add `AND ur.is_active = true`.
**Auto-fixable:** Yes

---

### [HIGH] SA-007: `assign_armband()` SECURITY DEFINER function has no auth check

**Category:** RBAC & Privilege Escalation
**Location:** `supabase/migrations/076_armband_auto_assignment.sql:15-64`
**Evidence:** Function is `SECURITY DEFINER` but performs no authorization check — no `is_platform_admin()`, no `can_manage_show()`.
**Risk:** Any caller can assign armbands to any dog at any show, bypassing RLS.
**Fix:** Add permission check at function start. Set `search_path = ''`. Grant EXECUTE only to `authenticated`.
**Auto-fixable:** Yes

---

### [HIGH] SA-008: `email_log` INSERT open to all roles including anon

**Category:** RLS Policy Integrity
**Location:** `supabase/migrations/062_email_log_insert_policy.sql:5-7`
**Evidence:**

```sql
CREATE POLICY email_log_insert_service ON email_log FOR INSERT WITH CHECK (true);
```

No `TO` clause — applies to `anon` and `authenticated`.
**Risk:** Unauthenticated users can insert fake email log entries, polluting audit trails.
**Fix:** Add `TO service_role` to restrict to edge function context.
**Auto-fixable:** Yes

---

### [HIGH] SA-009: `send-push-notification` has no JWT auth and uses CORS `*` — FIXED

**Category:** Edge Function Auth
**Location:** `supabase/functions/send-push-notification/index.ts:12-23`
**Evidence:** No JWT verification. Accepts any `user_id` from body. CORS allows all origins.
**Risk:** Any caller who knows the function URL can send push notifications to any user — notification spam, phishing.
**Fix:** Add JWT verification or service role key check. Restrict CORS to known origins.
**Auto-fixable:** No (requires design decision on auth model)
**Resolution (2026-03-27):** Added service role key verification (this function is internal-only, called by push-trigger-_ edge functions). Replaced CORS `_` with origin allowlist matching other edge functions.

---

### [HIGH] SA-010: `stripe-checkout` does not validate `success_url`/`cancel_url` origin (open redirect)

**Category:** Payment Security
**Location:** `apps/myk9show/supabase/functions/stripe-checkout/index.ts:108-138`
**Evidence:** `success_url` and `cancel_url` from client body passed directly to Stripe without origin validation.
**Risk:** Post-payment redirect to phishing site, leaking checkout session ID.
**Fix:** Validate URLs start with an allowed origin from `ALLOWED_ORIGINS`.
**Auto-fixable:** Yes

---

### [HIGH] SA-011: `stripe-customer-portal` does not validate `returnUrl` origin (open redirect)

**Category:** Payment Security
**Location:** `apps/myk9show/supabase/functions/stripe-customer-portal/index.ts:84-116`
**Evidence:** Same pattern as SA-010 — `returnUrl` from client passed to Stripe without validation.
**Risk:** Post-portal redirect to phishing site.
**Fix:** Validate `returnUrl` starts with an allowed origin.
**Auto-fixable:** Yes

---

### [HIGH] SA-012: `promo_codes` UPDATE allows any authenticated user to modify codes

**Category:** RLS Policy Integrity
**Location:** `supabase/migrations/045_promo_codes_financial.sql:66-67`
**Evidence:** `FOR UPDATE USING (auth.uid() IS NOT NULL)` — any authenticated user can modify any promo code.
**Risk:** Attacker can change discount to 100%, reset usage counts, extend expiration.
**Fix:** Restrict to `created_by = auth.uid() OR (SELECT is_trial_secretary()) OR (SELECT is_platform_admin())`.
**Auto-fixable:** Yes

---

### [MEDIUM] SA-013: `hasPermission()` scope fallthrough returns `true`

**Category:** Client Auth Patterns
**Location:** `apps/myk9show/src/context/AuthContext.tsx:295-332`
**Evidence:** When `scope` is provided but user has no scoped roles, falls through to `return true`.
**Risk:** Users with global permissions bypass scope restrictions.
**Fix:** Always perform scope check when `scope` is provided. Return `false` if no matching scoped role.
**Auto-fixable:** Yes

---

### [MEDIUM] SA-014: `send-registration-email` admin check uses JWT claims

**Category:** Edge Function Auth
**Location:** `supabase/functions/send-registration-email/index.ts:226`
**Evidence:** `const isAdmin = user.app_metadata?.role === 'admin';`
**Risk:** Stale JWT claims — revoked admin retains access until token expires.
**Fix:** Query `user_roles` table instead (same as owner/secretary checks in the same function).
**Auto-fixable:** Yes

---

### [MEDIUM] SA-015: `resend-webhook` skips signature verification when secret not set

**Category:** Edge Function Auth
**Location:** `supabase/functions/resend-webhook/index.ts:77-81`
**Evidence:** Falls through to process events without signature verification when `RESEND_WEBHOOK_SECRET` not configured.
**Risk:** Fabricated webhook events can update `email_log` status.
**Fix:** Return 503 when webhook secret is not configured.
**Auto-fixable:** Yes

---

### [MEDIUM] SA-016: Missing `FORCE ROW LEVEL SECURITY` on 20+ tables

**Category:** RLS Policy Integrity
**Location:** Migrations 025, 029, 041-046, 051, 053-057, 060-061
**Evidence:** Tables have `ENABLE ROW LEVEL SECURITY` but not `FORCE ROW LEVEL SECURITY`: training_journal_entries, training_milestones, manual_results, pedigree_ancestors, ofa_screenings, genetic_screenings, promo_codes, trial_checklist_state, activity_log, user_milestones, club_members, club_officers, registrations, onboarding_requests, push_subscriptions, show_announcements, show_announcement_reads, show_visibility_settings, trial_visibility_overrides, class_visibility_overrides, email_log, frontend_logs, sport_templates, sport_class_rules, sport_titles.
**Risk:** Table owner role bypasses RLS. SECURITY DEFINER functions or edge functions running as table owner see all rows.
**Fix:** New migration adding `ALTER TABLE <table> FORCE ROW LEVEL SECURITY` for each.
**Auto-fixable:** Yes

---

### [MEDIUM] SA-017: `trial_checklist_state` mutations open to all authenticated

**Category:** RLS Policy Integrity
**Location:** `supabase/migrations/046_pipeline_dashboard.sql:80-90`
**Evidence:** INSERT/UPDATE/DELETE use `auth.uid() IS NOT NULL` — any exhibitor can modify.
**Risk:** Exhibitors can manipulate trial readiness checklist.
**Fix:** Restrict to `can_manage_show()` or `is_trial_secretary()`.
**Auto-fixable:** Yes

---

### [MEDIUM] SA-018: `activity_log` INSERT allows spoofing actor_id

**Category:** RLS Policy Integrity
**Location:** `supabase/migrations/046_pipeline_dashboard.sql:98-100`
**Evidence:** INSERT uses `auth.uid() IS NOT NULL` — no validation that `actor_id` matches the caller.
**Risk:** Users can insert fake activity log entries attributed to other users.
**Fix:** Validate `actor_id` matches `get_my_person_id()`.
**Auto-fixable:** Yes

---

### [MEDIUM] SA-019: SuspenseWrapper renders raw `error.message` in production

**Category:** Data Exposure
**Location:** `apps/myk9show/src/routes/utils/SuspenseWrapper.tsx:92`
**Evidence:** `{this.state.error.message || 'An error occurred...'}` — unconditional, unlike ErrorBoundary which gates behind `DEV`.
**Risk:** Supabase errors containing table names, constraint names, PostgREST codes visible to users.
**Fix:** Gate behind `import.meta.env.DEV`.
**Auto-fixable:** Yes

---

### [MEDIUM] SA-020: Supabase error messages displayed in toast notifications

**Category:** Data Exposure
**Location:** Multiple files (DeleteShowDialog, DayOfEntryDialog, ScratchDialog, MoveUpDialog, ClassSelectionStep, others)
**Evidence:** `toast.error(error.message)` and `toast.error(\`Failed: ${error.message}\`)`patterns across 5+ files.
**Risk:** Database schema information leaked via error toasts.
**Fix:** Create a`getUserFriendlyError()` utility that maps Supabase error codes to safe messages.
**Auto-fixable:** Yes

---

### [MEDIUM] SA-021: PostgREST `.or()` filter injection via unsanitized search terms

**Category:** Input Validation
**Location:** showQueries.ts, clubQueries.ts, dogQueries.ts, healthStatisticsQueries.ts, entry-query-search.ts, trialQueries.ts, userQueries.ts, promoCodeQueries.ts (12+ call sites)
**Evidence:** `.or(\`name.ilike.%${searchTerm}%,...\`)`— user input interpolated into PostgREST filter syntax.
**Risk:** PostgREST filter injection can manipulate query logic to return unintended data. Not SQL injection (parameterized at DB level) but can alter filter conditions.
**Fix:** Create`sanitizePostgRESTFilter()` utility to escape special characters.
**Auto-fixable:** Yes

---

### [MEDIUM] SA-022: `show_announcements` INSERT/UPDATE/DELETE use broken inline auth check

**Category:** RLS Policy Integrity
**Location:** `supabase/migrations/057_announcements.sql:55-80`
**Evidence:** Inline `EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() ...)` — but `user_roles.user_id` references `people.id`, not `auth.users.id`. This admin check never matches.
**Risk:** Admin UPDATE/DELETE on announcements is silently broken. Also doesn't check `is_active` or `expires_at`.
**Fix:** Replace with `(SELECT is_platform_admin())`.
**Auto-fixable:** Yes

---

### [LOW] SA-023: `cron-waitlist-expiration` skips auth when `CRON_SECRET` not set

**Category:** Edge Function Auth
**Location:** `apps/myk9show/supabase/functions/cron-waitlist-expiration/index.ts:89`
**Evidence:** Only rejects when secret IS set but doesn't match. Missing secret = open access.
**Fix:** Fail closed: `if (!cronSecret || providedSecret !== cronSecret)`.
**Auto-fixable:** Yes

---

### [LOW] SA-024: `stripe-checkout` subscription mode accepts client `price_id` without allowlist

**Category:** Payment Security
**Location:** `apps/myk9show/supabase/functions/stripe-checkout/index.ts:354-411`
**Evidence:** No validation of `price_id` against known prices (unlike `stripe-upgrade-subscription` which validates).
**Risk:** Could subscribe at different price points if other prices exist in Stripe account.
**Fix:** Add `VALID_PRICE_IDS` allowlist.
**Auto-fixable:** Yes

---

### [LOW] SA-025: Staging Vercel URL missing from CORS allowlists

**Category:** Edge Function Auth
**Location:** Multiple `apps/myk9show/supabase/functions/*/index.ts`
**Evidence:** `myk9-platform-myk9show.vercel.app` not in `ALLOWED_ORIGINS` for stripe-checkout, stripe-customer-portal, stripe-upgrade-subscription, send-email, receive-logs, cron-waitlist-expiration.
**Risk:** Staging cannot call these functions (functional issue). Could mask security problems during testing.
**Fix:** Add staging URL to all ALLOWED_ORIGINS or extract shared CORS config.
**Auto-fixable:** Yes

---

### [LOW] SA-026: Admin test pages accessible to all authenticated users

**Category:** Client Auth Patterns
**Location:** `apps/myk9show/src/routes/adminRoutes.tsx:418-442`
**Evidence:** `/admin/permission-test` and `/admin/rbac-test` wrapped with `<ProtectedRoute>` but no `requiredRole`.
**Risk:** Exhibitors can access permission/RBAC test pages, potentially exposing internal RBAC state.
**Fix:** Add `requiredRole={UserRole.SITE_ADMIN}` or gate behind `import.meta.env.DEV`.
**Auto-fixable:** Yes

---

### [LOW] SA-027: Suspended user enforcement has 5-minute race window

**Category:** Client Auth Patterns
**Location:** `apps/myk9show/src/context/AuthContext.tsx:151-182`
**Evidence:** Profile fetch uses `staleTime: 5 * 60 * 1000`. Suspension check depends on async query.
**Risk:** Suspended user has up to 5 minutes of functional access before client-side enforcement triggers.
**Fix:** Reduce staleTime for profile query or add realtime subscription on status field.
**Auto-fixable:** No (architectural decision)

---

### [LOW] SA-028: Permission cache not refreshed after role assign/revoke

**Category:** Client Auth Patterns
**Location:** `apps/myk9show/src/context/AuthContext.tsx:408-436`
**Evidence:** `assignRole` and `revokeRole` don't call `refreshPermissions()`.
**Risk:** React state stale for up to 5 minutes after role changes.
**Fix:** Call `refreshPermissions()` after role operations.
**Auto-fixable:** Yes

---

### [LOW] SA-029: `receive-logs` edge function has no authentication

**Category:** Edge Function Auth
**Location:** `apps/myk9show/supabase/functions/receive-logs/index.ts:51-67`
**Evidence:** No auth check — accepts any POST to insert into `frontend_logs`.
**Risk:** Log flooding / fake log injection. Lower priority since it's a logging endpoint.
**Fix:** Require anon key in Authorization header or add rate limiting.
**Auto-fixable:** No

---

### [LOW] SA-030: `createDatabaseError` preserves Supabase `details` and `hint` fields

**Category:** Data Exposure
**Location:** `apps/myk9show/src/services/database/supabaseClient.ts:107-127`
**Evidence:** Raw `err.details` and `err.hint` carried in error objects.
**Risk:** If surfaced to UI, leaks SQL fragments and constraint names.
**Fix:** Strip `details` and `hint` in production builds.
**Auto-fixable:** Yes

---

### [LOW] SA-031: URL route params used without UUID validation

**Category:** Input Validation
**Location:** 28 files using `useParams` (ScoresheetPage, ScoringEntryListPage, TrialPipelineDetail, etc.)
**Evidence:** `useParams` values passed directly to `.eq()` without UUID format check.
**Risk:** Invalid UUIDs cause Supabase errors that leak type info via SA-020 toast pattern.
**Fix:** Add UUID validation utility, validate before queries.
**Auto-fixable:** Yes

---

### [LOW] SA-032: `dangerouslySetInnerHTML` properly sanitized (no issue)

**Category:** Input Validation
**Location:** `apps/myk9show/src/utils/sanitization.tsx:87`
**Evidence:** Only used via `SafeHTML` component with DOMPurify, strict allow-lists, `FORBID_TAGS`/`FORBID_ATTR`.
**Risk:** None — well defended. Included for completeness.
**Auto-fixable:** N/A

---

## Categories Checked

| Category                    | Files Examined                | Findings | Skipped |
| --------------------------- | ----------------------------- | -------- | ------- |
| RLS Policy Integrity        | 78 migrations                 | 10       | —       |
| Edge Function Auth          | 19 functions                  | 6        | —       |
| RBAC & Privilege Escalation | 78 migrations + RBAC services | 5        | —       |
| Client Auth Patterns        | ~10 core files                | 4        | —       |
| Data Exposure               | ~40+ files                    | 3        | —       |
| Payment Security            | 6 Stripe files                | 3        | —       |
| Input Validation            | ~50+ files                    | 2        | —       |

Note: Some findings span multiple categories (SA-002 covers both RLS and RBAC). Totals count unique findings.

## Previous Audit Comparison

First audit — no comparison available.
