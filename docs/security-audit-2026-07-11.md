# Security Audit — 2026-07-11

**Mode:** Full Audit
**Checklist version:** references/checklist.md @ 84e656142
**Scan model note:** category scans ran as three parallel Opus subagents (migrations, edge functions, app source); findings verified and compiled by the main session.

## Summary

| Severity  | Count |
| --------- | ----- |
| CRITICAL  | 0     |
| HIGH      | 0     |
| MEDIUM    | 1     |
| LOW       | 6     |
| **Total** | **7** |

Auto-fixable: 4 of 7 findings

## Findings

### [MEDIUM] SA-021: `FORCE ROW LEVEL SECURITY` missing on 5 tables created after the SA-016/017 sweeps

**Category:** RLS Policy Integrity
**Location:**
- `secretary_tasks` — `supabase/migrations/133_secretary_tasks.sql:40`
- `club_premium_templates` — `supabase/migrations/188_premium_bridge_tables.sql:41`
- `premium_generations` — `supabase/migrations/188_premium_bridge_tables.sql:119`
- `unified_ringside_overrides` — `supabase/migrations/20260529120000_unified_ringside_flag.sql:52`
- `login_attempts` — `supabase/migrations/20260710140000_create_passcode_login_rate_limit.sql:36`

**Evidence:** Each has `ENABLE ROW LEVEL SECURITY` but no `FORCE ROW LEVEL SECURITY` in any migration. Earlier tables were force-enabled by static lists in `021_force_rls_all_tables.sql` and `086_security_sa016_force_rls.sql`; these five postdate migration 086 and were never added. (`login_attempts` was created 2026-07-10 — the list has grown by one since yesterday's audit.)
**Risk:** Without FORCE, the table-owner role (`postgres`) bypasses RLS. Normal PostgREST traffic runs as `authenticated`/`anon` (still RLS-bound), so direct exploitability is low, but it breaks the project's SA-016 invariant and leaves owner-role code paths unrestricted. `login_attempts` is lowest impact (only `service_role` granted, which bypasses RLS regardless).
**Fix:** New migration with `ALTER TABLE public.<name> FORCE ROW LEVEL SECURITY;` for each of the five tables.
**Auto-fixable:** Yes

---

### [LOW] SA-023: `resend-webhook` uses an inline HMAC verifier instead of the shared timing-safe helper

**Category:** Edge Function Auth
**Location:** `supabase/functions/resend-webhook/index.ts:28-56` (`matchesAnySignature`)
**Evidence:** Custom Svix HMAC verify path; the shared `_shared/standardWebhookSignature.ts` already exists with `timingSafeEqual`.
**Risk:** Verification is functionally correct (HMAC + 5-min timestamp skew + fails closed 503 when secret unset) but the comparison is not confirmed constant-time and the duplicated logic can diverge over time.
**Fix:** Route resend-webhook through the shared `verifyStandardWebhookSignature` helper.
**Auto-fixable:** Yes

---

### [LOW] SA-024: `validate-passcode` rate limiter fails OPEN on RPC error

**Category:** Edge Function Auth
**Location:** `supabase/functions/validate-passcode/index.ts:130-133`
**Evidence:** `if (rateLimitError) { console.error(...); // Continue without rate limiting if function fails (fail open for availability) }`
**Risk:** If `check_login_rate_limit` errors (or is broken by a future migration), passcode brute-forcing is unthrottled. Deliberate availability trade-off per the inline comment; passcode entropy is the remaining defense.
**Fix:** Fail closed (429/503) on rate-limit RPC error, or alert on the error path so silent failure can't persist.
**Auto-fixable:** No (availability-vs-security design decision)

---

### [LOW] SA-025: `generate-premium` has no per-user rate limit on the Claude call

**Category:** Edge Function Auth
**Location:** `supabase/functions/generate-premium/index.ts:164-183`
**Evidence:** Step 9 calls `generateNarratives(showSummary, anthropicKey)` with no per-user/per-show throttle.
**Risk:** An authenticated user with access can spam expensive Anthropic API calls (cost abuse, not data exposure).
**Fix:** Add a per-user rate limit (reuse `check_login_rate_limit`-style RPC) or cache generations per show.
**Auto-fixable:** No (needs a keying/limit design decision)

---

### [LOW] SA-028: Push webhook secret compared with non-constant-time `!==`

**Category:** Edge Function Auth
**Location:** `supabase/functions/_shared/pushWebhookAuth.ts:12-13`
**Evidence:** `if (!authHeader || authHeader !== \`Bearer ${webhookSecret}\`)`
**Risk:** Theoretical timing side-channel on the shared secret. Callers are DB triggers (pg_net) on a trusted network, so practical exploitability is very low. Sibling helper `standardWebhookSignature.ts` already uses `timingSafeEqual`.
**Fix:** Use constant-time comparison, matching the sibling helper.
**Auto-fixable:** Yes

---

### [LOW] SA-029: Push webhook secret falls back to `SUPABASE_SERVICE_ROLE_KEY`

**Category:** Edge Function Auth
**Location:** `supabase/functions/_shared/pushWebhookAuth.ts:7` (mirrored in each `push-trigger-*/index.ts`)
**Evidence:** `getEnv('PUSH_WEBHOOK_SECRET') ?? getEnv('SUPABASE_SERVICE_ROLE_KEY')`
**Risk:** If `PUSH_WEBHOOK_SECRET` is unset, the service-role key doubles as a bearer secret sent by DB triggers, widening its exposure surface. Fail-closed (503) if neither is set; documented as a JWT-signing-key migration bridge.
**Fix:** Require the dedicated secret in production and drop the fallback once seeded everywhere.
**Auto-fixable:** No (deploy/config dependency)

---

### [LOW] SA-030: `getCurrentUserId()` reads dev-mock localStorage key without a DEV guard

**Category:** Client Auth Patterns
**Location:** `apps/myk9show/src/utils/authHelpers.ts:26`
**Evidence:** `const storedUser = localStorage.getItem('dev-current-mock-user'); if (storedUser) { return storedUser; }` — no `import.meta.env.DEV` gate, unlike the guarded readers in `AuthContext.tsx:214` and `:480`.
**Risk:** In production, setting `localStorage['dev-current-mock-user']` makes this helper return an attacker-chosen id for client store attribution. Client-side only — RLS keys off the real JWT, so server data access is unaffected.
**Fix:** Wrap the localStorage branch in `if (import.meta.env.DEV)`.
**Auto-fixable:** Yes

## Remediation Progress — 2026-07-12

- **SA-021:** repository migration, invariant, database push, and live zero-row FORCE-RLS verifier
  are complete; the original five-table count was corrected to four extant tables because
  `unified_ringside_overrides` had already been dropped.
- **SA-023 / SA-028 / SA-030:** repository remediation merged in PR #1285 with red-first focused
  tests, full typecheck, lint, and independent-review evidence. These rows are not recorded as
  deployed until the applicable hosted/Edge revisions are live.
- **SA-024:** repository remediation is code-complete with a Deno-free fail-closed gate, 11 focused
  tests, full typecheck, and lint evidence. It remains open until review/merge, deployment of
  `validate-passcode`, and controlled healthy/429/503 runtime evidence.
- **SA-025 / SA-029:** remain open in the active remediation change.

## Categories Checked

| Category                    | Files Examined                     | Findings | Skipped |
| --------------------------- | ---------------------------------- | -------- | ------- |
| RLS Policy Integrity        | 361 migrations                     | 1        | —       |
| Edge Function Auth          | 31 functions + shared helpers      | 5        | —       |
| RBAC & Privilege Escalation | 361 migrations + rbac services     | 0        | —       |
| Client Auth Patterns        | routes, AuthContext, helpers       | 1        | —       |
| Data Exposure               | error/toast/logging call sites     | 0        | —       |
| Payment Security            | 11 Stripe functions + frontend     | 0        | —       |
| Input Validation            | sanitization, uploads, forms, params | 0      | —       |

Verified-clean highlights: RBAC mutation policies gated on `is_platform_admin()`; all RLS helpers check `is_active` + `expires_at`; Stripe webhook signature verification, server-authoritative pricing, portal ownership scoping, and open-redirect guards all present; `send-email`/`send-results` recipients derived server-side; both `dangerouslySetInnerHTML` sites DOMPurify-sanitized; storage paths ownership-validated; no hardcoded secrets (the `sk_live_` grep hit is a Sentry-scrubbing test fixture).

## Previous Audit Comparison (vs 2026-07-10)

**Resolved (5):**
- SA-018 / SA-019 — `send-email` recipients now derived server-side (`recipientResolution.ts`); all other types 403.
- SA-020 — `send-results` cc/reply-to now derived from the show's `secretary_email`; authz added.
- SA-022 / SA-027 — `20260710080000_security_audit_remediation_lifecycle_hardening.sql` adds authz/REVOKE and pins `search_path = ''`.
- SA-026 — raw Postgres error in `OperatorAlertsSection` toast fixed (CI-caught follow-up).

**Unchanged (3):** SA-021 (FORCE RLS — now 5 tables, `login_attempts` added since yesterday), SA-023, SA-024, SA-025.

**New (3):** SA-028, SA-029, SA-030.
