# Security Audit Checklist

Reference data for the security-audit skill. Each category lists what to check, where to look, and what constitutes a finding.

---

## 1. RLS Policy Integrity

**Scan:** `supabase/migrations/*.sql` — look for `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`

**Checks:**

- [ ] Every table has both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`
- [ ] Policies use helper functions (`is_platform_admin()`, `can_manage_show()`, `is_club_admin()`, `is_trial_secretary()`, `get_my_person_id()`) — not inline `auth.uid()` comparisons
- [ ] No `WITH CHECK (true)` on tables that store sensitive or privileged data without a `-- RATIONALE:` comment
- [ ] SELECT policies include `deleted_at IS NULL` for soft-deletable tables (people, dogs, shows)
- [ ] Storage policies validate path ownership via `(storage.foldername(name))[2] = (SELECT auth.uid())::text`
- [ ] Mutation policies (INSERT/UPDATE/DELETE) restrict to appropriate roles — not open to all authenticated users on privileged tables (user*roles, roles, permissions, role_permissions, stripe*\*)

**Finding example:** Table `user_roles` has `FOR INSERT TO authenticated WITH CHECK (true)` — any user can grant themselves any role.

---

## 2. Edge Function Auth

**Scan:** `supabase/functions/*/index.ts` — read each function's auth handling

**Checks:**

- [ ] JWT verified via `supabase.auth.getUser(token)` before any data operations
- [ ] Unauthenticated endpoints are ONLY webhook receivers (resend-webhook, stripe-webhook) or database-triggered functions (push-trigger-\*)
- [ ] Role/permission checks query `user_roles` table — not `user.app_metadata` JWT claims
- [ ] `SUPABASE_SERVICE_ROLE_KEY` used only inside edge functions, never returned to client or logged
- [ ] CORS `Access-Control-Allow-Origin` set to specific origins — not `*` unless the function is internal-only (called by other functions, not frontend)
- [ ] Webhook endpoints verify signatures: Svix HMAC for Resend, `stripe.webhooks.constructEvent()` for Stripe

**Finding example:** `send-registration-email` checks `user.app_metadata?.role === 'admin'` instead of querying `user_roles` table.

---

## 3. RBAC & Privilege Escalation

**Scan:** `supabase/migrations/*.sql` (RLS policies on user_roles, roles, permissions tables) + `apps/myk9show/src/services/rbac/` + `apps/myk9show/src/context/AuthContext.tsx`

**Checks:**

- [ ] `user_roles` INSERT/UPDATE/DELETE restricted via RLS to site_admin (not open to all authenticated)
- [ ] `roles`, `permissions`, `role_permissions` tables INSERT/UPDATE/DELETE restricted to site_admin
- [ ] Scoped permission checks (`hasPermission` with `scope`) validate `club_id`/`show_id` — no fallthrough to `return true` when scope doesn't match
- [ ] `SECURITY DEFINER` functions (`is_platform_admin()`, `can_manage_show()`, etc.) check `auth.uid()` internally
- [ ] No client-side-only authorization (every protected action also enforced by RLS or edge function auth)
- [ ] `expires_at` and `is_active` respected in all role/permission queries (RLS helpers, RPC functions, frontend hooks)
- [ ] `SecurityValidator` escalation prevention aligns with RLS policies (can't bypass via direct Supabase calls)

**Finding example:** `hasPermission()` returns `true` as default when scoped permission doesn't match any user role.

---

## 4. Client Auth Patterns

**Scan:** `apps/myk9show/src/context/AuthContext.tsx`, `apps/myk9show/src/routes/*.tsx`, `apps/myk9show/src/components/common/ProtectedRoute*`

**Checks:**

- [ ] All role-gated routes wrapped with `<ProtectedRoute>` specifying `requiredRole` or `requiredPermission`
- [ ] No sensitive data fetched before `loading` state resolves (race condition with auth init)
- [ ] Permission cache invalidation triggered when roles are assigned/revoked (not just on 5-min TTL)
- [ ] Suspended user enforcement at both levels: token hook (`custom_access_token_hook`) and AuthContext (`userProfile.status` check)
- [ ] No hardcoded credentials, API keys, or secrets in `.ts`/`.tsx` files (grep for patterns: `sk_`, `key_`, `secret`, `password`, `Bearer`)
- [ ] Dev-only features guarded by `import.meta.env.DEV` — not a string comparison or localStorage flag that could be set in production

**Finding example:** Route `/admin/users` missing `<ProtectedRoute>` wrapper.

---

## 5. Data Exposure

**Scan:** `apps/myk9show/src/` — grep for Supabase query patterns, error handling, logging

**Checks:**

- [ ] Queries for health records, payment data, contact info include user-scoping (`.eq('owner_id', userId)` or equivalent RLS)
- [ ] Error boundaries and catch blocks don't expose: table names, column names, SQL fragments, stack traces — in UI or console
- [ ] Logging services (LoggingService, console.\*) don't log: passwords, tokens, card numbers, PII fields
- [ ] RLS SELECT policies don't leak extra columns via permissive reads (check for `SELECT *` patterns vs. explicit column lists in security-sensitive tables)
- [ ] Soft-deleted rows (people, dogs, shows) filtered by `deleted_at IS NULL` in application queries and RLS

**Finding example:** Error toast shows `Error: relation "user_roles" does not exist` — leaks table name.

---

## 6. Payment Security (Stripe)

**Scan:** `supabase/functions/stripe-*/*.ts`, `apps/myk9show/src/services/stripe.ts`

**Checks:**

- [ ] All Stripe API calls go through edge functions — frontend never imports `stripe` or uses `STRIPE_SECRET_KEY`
- [ ] `stripe-webhook/index.ts` verifies signature via `stripe.webhooks.constructEvent(body, sig, endpointSecret)`
- [ ] Price/amount comes from server-side lookup (Stripe price ID or database), not from client request body
- [ ] `stripe-customer-portal` scopes session to the authenticated user's `stripe_customer_id`
- [ ] No `VITE_STRIPE_SECRET_KEY` or `VITE_` prefixed Stripe secrets (only `VITE_STRIPE_PUBLISHABLE_KEY` is acceptable)
- [ ] Checkout session `success_url` and `cancel_url` use same-origin URLs (no open redirect)

**Finding example:** Checkout edge function reads `price` from request body instead of looking up server-side.

---

## 7. Input Validation

**Scan:** `apps/myk9show/src/` — grep for `dangerouslySetInnerHTML`, URL param usage, file upload handling, form submission

**Checks:**

- [ ] No `dangerouslySetInnerHTML` with user-supplied content (only with sanitized or trusted HTML)
- [ ] URL/route parameters (`useParams`, `useSearchParams`) validated before use in Supabase queries or RPCs
- [ ] File uploads (storage bucket writes) validate: file type, file size, file name (no path traversal `../`)
- [ ] Form inputs validated via Zod schemas (in `onValidate`) before database writes
- [ ] No string concatenation to build SQL or RPC arguments — all queries use Supabase client's parameterized methods

**Finding example:** `useParams().showId` passed directly to `.eq('id', showId)` without UUID format validation.
