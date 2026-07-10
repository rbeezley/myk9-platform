# Security Audit — 2026-07-10

**Mode:** Full Audit
**Checklist version:** `references/checklist.md` @ `84e656142`
**Audited branch:** `claude/full-scope-security-audit-fd2072` (worktree `bold-sinoussi-7b5692`)
**Method:** Three parallel read-only auditor subagents — (A) all 355 `supabase/migrations/*.sql` (final-state reconstruction), (B) all 33 edge functions (`supabase/functions/` + `apps/myk9show/supabase/functions/`) + shared helpers, (C) `apps/myk9show/src/` client. Every finding verified against actual final-state code. No code changed during the audit. This audit is delta-aware against the prior full audit (`security-audit-2026-07-03.md`, pinned `28a72d23f`, ~324 migrations) — 31 new migrations and the new anon-passcode/multi-registry/withdrawal/payout surfaces prioritized.

## Summary

| Severity  | Count  |
| --------- | ------ |
| CRITICAL  | 0      |
| HIGH      | 0      |
| MEDIUM    | 5      |
| LOW       | 6      |
| **Total** | **11** |

Auto-fixable: 6 of 11 findings.

**Headline:** No exploitable-now (CRITICAL/HIGH) vulnerability found. The cross-tenant **AskQ scope fail-open** reported this week is **fixed and regression-tested** (`_shared/askq/showScope.ts` now fails closed to an impossible UUID; defense-in-depth caller-access check in the edge fn). **14 of 16** prior audit findings are remediated by dedicated migrations/edge-fn fixes shipped 2026-07-03→08. Residual risk is concentrated in one theme: **caller-target authorization gaps in branded-email origination** (SA-004 was only partially closed — three MEDIUM recipient-spoofing paths remain across `send-email` and `send-results`). Everything else is defense-in-depth: one FORCE-RLS sweep regression on 5 post-sweep tables, and assorted LOW hardening nits. The core privilege-escalation surface (role tables, RBAC helpers, SECURITY DEFINER REVOKEs), the entire Stripe + payout-cron surface, the anon passcode/claim tier, and route gating are all verified correct.

---

## Findings

### [MEDIUM] SA-018: `send-email` `support_notification` sends a brand-domain email to an arbitrary recipient with attacker-controlled body

**Category:** Edge Function Auth / abuse (SA-004 residual)
**Location:** `supabase/functions/send-email/authz.ts:160`, `supabase/functions/send-email/index.ts:164,167`
**Evidence:** Support-notification authz passes if the caller merely owns the ticket — `if (ticket.owner_id === args.user?.id) return;`. The recipient and cc are then taken raw from the request body: `to: data.to, ...(data.cc?.length ? { cc: data.cc } : {})`. `SupportNotificationData` fields `to`, `preview`, and `actionUrl` (rendered into an `href`) are all caller-supplied.
**Risk:** Any authenticated user creates a support ticket (making themselves `owner_id`), then calls `send-email` with `type:'support_notification'`, their own `ticketId`, `to:<victim>`, and an attacker-chosen `preview`/`actionUrl`. Result: a DKIM-signed `notifications@myk9show.com` "Support update" email to any victim, with attacker body text and a phishing link. Brand-reputation phishing from the platform's own domain.
**Fix:** Resolve the recipient server-side from the ticket owner's person/email; ignore `data.to`/`data.cc` for support notifications.
**Auto-fixable:** No (recipient-derivation is a design decision — which person the notification is _for_).

---

### [MEDIUM] SA-019: `send-email` `entry_decision` recipient is caller-supplied, not derived from the registration

**Category:** Edge Function Auth / abuse (SA-004 residual)
**Location:** `supabase/functions/send-email/index.ts:164` (`to: data.to`); authz `supabase/functions/send-email/authz.ts:97-136`
**Evidence:** Authz confirms the caller is a show official for the registration's show, but the email is delivered to `data.to` from the request body — never checked against the registration's exhibitor email.
**Risk:** A show official can send a branded "Entry Decisions" email (with free-text `message` and `amountDue`) to any arbitrary address. Lower blast radius than SA-018 (restricted to show officials), but still a caller-target authz gap that lets a low-tier official phish from the brand domain.
**Fix:** Derive the recipient from the registration's exhibitor/person email; ignore `data.to`.
**Auto-fixable:** No (recipient-derivation design decision).

---

### [MEDIUM] SA-020: `send-results` has no role check and forwards a caller-supplied CC / reply-to + XML attachment

**Category:** Edge Function Auth / abuse
**Location:** `supabase/functions/send-results/index.ts:26-27,61-62`
**Evidence:** `handle({ auth: 'jwt', ... }, async ({ body }) => {` — `user` is never destructured; there is zero role/show authorization. The primary `to` is locked to `SUBMISSION_EMAILS` (good), but `cc: [secretaryEmail]` and `reply_to: secretaryEmail` are caller-supplied and unvalidated, alongside a caller-supplied XML `attachments` payload.
**Risk:** Any authenticated user can (a) spam the AKC results inbox (`results@akc.org`) with arbitrary XML attachments, and (b) deliver a `results@myk9show.com`-branded email with attachment to any arbitrary address via the CC field. No secretary/show-official gating at all.
**Fix:** Require a show-official role for the show the results belong to (mirror `send-targeted-message`'s `user_roles` check); derive `secretaryEmail` from the show record, not the request body.
**Auto-fixable:** No (needs the correct show-scoped role predicate).

---

### [MEDIUM] SA-021: `FORCE ROW LEVEL SECURITY` missing on 5 tables created after the SA-017 sweep

**Category:** RLS Policy Integrity (defense-in-depth; SA-017 regression)
**Location:** `support_tickets`, `support_ticket_messages` (`supabase/migrations/20260705013523_support_tickets.sql:45-46`); `show_lifecycle_email_steps`, `show_lifecycle_email_jobs`, `show_lifecycle_email_attempts` (`supabase/migrations/20260708120000_show_lifecycle_emails.sql:215-217`)
**Evidence:** All five have `ENABLE ROW LEVEL SECURITY` + correct scoped policies + explicit GRANTs, but only `ENABLE`, not `FORCE`. Both migrations postdate the SA-017 sweep (`20260703121000`), so they reintroduce the exact class that sweep closed.
**Risk:** The table-owner role bypasses non-FORCE RLS — matters for owner-context queries, `pg_dump` under the owner role, and defense-in-depth against future SECURITY DEFINER logic that reads these tables expecting RLS to apply. Not exploitable via the normal anon/authenticated client.
**Fix:** New migration appending `ALTER TABLE public.<t> FORCE ROW LEVEL SECURITY;` for each of the five, mirroring `20260703121000`.
**Auto-fixable:** Yes (mechanical, established pattern).

---

### [MEDIUM] SA-009 (carried over — STILL PRESENT): No permission invalidation for a target user's live session on role change

**Category:** Client Auth Patterns (privilege staleness)
**Location:** `apps/myk9show/src/context/AuthContext.tsx` (`assignRole`/`revokeRole` → `refreshPermissions()`); no `user_roles` realtime subscription anywhere (`grep postgres_changes|.channel(|user_roles` = 0 hits)
**Evidence:** `assignRole`/`revokeRole` refresh only the **acting admin's own** session, not the target user's. There is no realtime subscription to `user_roles`. A user who is demoted/suspended mid-session keeps stale client permissions (and the privileged UI) until reload/token refresh.
**Risk:** Client-only staleness. Server RLS still gates every read/write (verified: RPCs/helpers check `expires_at`/roles server-side), so this is not a data-exposure bypass — reads that RLS still permits (e.g. global-synced replication tables) remain visible until reload. Unchanged severity from the prior audit.
**Fix:** Subscribe to `user_roles` `postgres_changes` for the current `auth_user_id`; force `refreshPermissions()` on change and hard sign-out on suspension. Alternatively piggyback a role reload on the existing 60s `userProfile` suspension poll.
**Auto-fixable:** Yes (mechanical: add a `refetchInterval`-driven RBAC reload).

---

### [LOW] SA-022: `ensure_show_lifecycle_email_steps(uuid)` is SECURITY DEFINER with no authz and no REVOKE

**Category:** RBAC & Privilege Escalation (unauthorized write primitive)
**Location:** `supabase/migrations/20260708120000_show_lifecycle_emails.sql:168-182`
**Evidence:** The function is `SECURITY DEFINER` but performs no `is_site_admin()`/`can_manage_show_lifecycle_email()` check and is never `REVOKE`d, so Postgres's default `PUBLIC` EXECUTE grant stands. Any caller including `anon` can invoke `ensure_show_lifecycle_email_steps('<any-show-uuid>')` and insert up to 5 default step-config rows for an arbitrary show. (The sibling trigger fn `ensure_show_lifecycle_email_steps_for_new_show()` is likewise un-REVOKE'd but not directly callable — `NEW` is undefined outside trigger context.)
**Risk:** Unauthorized write, but blast radius is minimal — rows are `ON CONFLICT DO NOTHING`, only default-enabled step config, no data disclosure. LOW.
**Fix:** `REVOKE ALL ON FUNCTION public.ensure_show_lifecycle_email_steps(uuid) FROM PUBLIC;` (leave the trigger the sole caller), and optionally add an internal `can_manage_show_lifecycle_email(p_show_id)` guard.
**Auto-fixable:** Yes (mechanical REVOKE, matches `20260628010000` pattern).

---

### [LOW] SA-023: `resend-webhook` uses non-constant-time signature comparison

**Category:** Edge Function Auth
**Location:** `supabase/functions/resend-webhook/index.ts:69` — `if (!signatures.includes(expectedSig))`
**Evidence:** The Svix signature check compares with `Array.includes` rather than a constant-time compare.
**Risk:** Theoretical timing side-channel to forge a Svix signature; impractical over network jitter and bounded by the 5-min replay window. LOW.
**Fix:** Use a constant-time compare (or the official `svix` verify library).
**Auto-fixable:** Yes (swap comparison helper).

---

### [LOW] SA-024: `validate-passcode` rate limiter fails OPEN on RPC error

**Category:** Edge Function Auth (passcode brute-force throttle)
**Location:** `supabase/functions/validate-passcode/index.ts:130-133`
**Evidence:** On `rateLimitError` the function logs "Continue without rate limiting (fail open for availability)" and proceeds. Passcodes are still HMAC-validated, so auth itself is intact.
**Risk:** If `check_login_rate_limit` errors, the brute-force throttle is skipped for that window. A cracked passcode only grants one show's ringside read/score, never financial/PII. Documented availability tradeoff.
**Fix:** Return 429 on limiter error to match the fail-closed posture used elsewhere, or accept the tradeoff explicitly with a `-- RATIONALE:`-style comment.
**Auto-fixable:** No (fail-open-vs-availability is a design decision).

---

### [LOW] SA-025: `generate-premium` has no per-user rate limit on the Claude call

**Category:** Edge Function Auth / cost abuse
**Location:** `supabase/functions/generate-premium/index.ts:16-28`
**Evidence:** Unlike `ask-myk9show` (daily quota, fail-closed), `generate-premium` has no per-user cost ceiling on the model call. Abuse surface is limited to trusted roles (secretary/club-admin/site-admin via RLS) and an 8s/1024-token cap.
**Risk:** A compromised or malicious privileged account could run up model cost. Bounded by role-gating + token cap. LOW.
**Fix:** Add a per-user daily quota mirroring `ask-myk9show`.
**Auto-fixable:** No (quota policy is a design decision).

---

### [LOW] SA-026: Raw Postgres error message rendered in admin `OperatorAlertsSection` toast

**Category:** Data Exposure (SA-010 residual)
**Location:** `apps/myk9show/src/pages/admin/OperatorAlertsSection.tsx:45`
**Evidence:** Toasts `err.message` directly. All 7 originally-flagged SA-010 call sites now route through `friendlyDbError`; this admin-operator-only surface was missed by that sweep.
**Risk:** Schema/table-name disclosure, but only to site-admin operators. No tenant-data leak. LOW/informational.
**Fix:** Route through `friendlyDbError(err, '<generic copy>')` like the other call sites.
**Auto-fixable:** Yes (mechanical wrapper).

---

### [LOW] SA-027: Lifecycle-email helper functions diverge from the hardened `SET search_path = ''` idiom

**Category:** RLS Policy Integrity / SECURITY DEFINER hardening
**Location:** `supabase/migrations/20260708120000_show_lifecycle_emails.sql` — `can_manage_show_lifecycle_email`, `ensure_show_lifecycle_email_steps*` use `SET search_path = public`; `touch_show_lifecycle_email_updated_at` (`:120-128`) sets no `search_path`
**Evidence:** These use `search_path = public` (or none) rather than the repo-standard `SET search_path = ''` with fully-qualified names used everywhere else. All reference fully-qualified names / only builtins today, so exploitability is negligible.
**Risk:** Divergence from the hardened idiom; a future edit adding an unqualified reference could become search-path-hijackable. LOW.
**Fix:** Pin `SET search_path = ''` and fully-qualify all object references.
**Auto-fixable:** Yes (mechanical).

---

## Categories Checked

| Category                    | Files Examined                 | Findings                                       | Notes                                                                                           |
| --------------------------- | ------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| RLS Policy Integrity        | 355 migrations (full timeline) | SA-021, SA-027                                 | Core RLS strong; one FORCE-sweep regression + one idiom drift                                   |
| Edge Function Auth          | 33 fns + shared                | SA-018, SA-019, SA-020, SA-023, SA-024, SA-025 | Email-origination caller-target authz cluster (SA-004 residual)                                 |
| RBAC & Privilege Escalation | migrations + rbac services     | SA-022                                         | Role tables locked; one un-REVOKE'd definer write primitive                                     |
| Client Auth Patterns        | routes, AuthContext, RBAC      | SA-009                                         | Route gating complete; role-change staleness only                                               |
| Data Exposure               | client scan                    | SA-026                                         | AskQ fail-open FIXED; one residual admin-only raw error                                         |
| Payment Security (Stripe)   | 11 Stripe/payout fns + shared  | **0**                                          | Clean — signatures, server-side pricing, refund caps, portal scoping, cron secrets all verified |
| Input Validation            | client scan                    | **0**                                          | Parameterized queries; file uploads validated; HTML sinks sanitized                             |

## Previous Audit Comparison

Prior report: `security-audit-2026-07-03.md` (17 findings: 0C/0H/8M/9L).

**Resolved since 2026-07-03 (14 of 16 prior findings + the this-week AskQ leak):**

- **SA-001** — FIXED (`20260703120000`): scoring definer fns REVOKE'd; new `refresh_class_scoring_state_authorized` wrapper enforces manager/judge/passcode authz.
- **SA-002** — FIXED (`20260703123000`): `promo_codes` policies scoped to `can_manage_show`/`can_manage_trial`/`is_site_admin`; exhibitors moved to `validate_promo_code` RPC.
- **SA-003** — FIXED: `push-trigger-scoring`/`-class-status` now call `requirePushWebhookSecret` (shared `_shared/pushWebhookAuth.ts`), parity across all 5 push triggers.
- **SA-005** — FIXED: `send-auth-email` verifies Standard-Webhooks signature, fails closed 503 when `SEND_EMAIL_HOOK_SECRET` unset.
- **SA-006** — FIXED (`20260703180000` + `20260704152531`): `user_roles` self-or-admin, audit log admin-only, catalog tables restricted to `authenticated`.
- **SA-007** — FIXED (`20260703124000`): `trial_judge_supplies` now `is_site_admin() OR can_manage_trial()`.
- **SA-008** — FIXED: `people` reads use explicit `PEOPLE_DIRECTORY_COLUMNS` + `deleted_at IS NULL`.
- **SA-010** — FIXED (except SA-026 residual): 7 call sites route through `friendlyDbError`.
- **SA-011** — FIXED (`20260704190000`): raw-passcode arm removed from `upsert_ringside_session`; reads forge-proof `app_metadata` claim; REVOKE'd from anon.
- **SA-012** — FIXED: `send-confirmation-email` secret fails closed (503 unset / 401 mismatch).
- **SA-013** — FIXED: `send-waitlist-invite` secret fails closed; grant targets the looked-up row's own email.
- **SA-014** — FIXED: `LoggingService.safeLogUrl()` strips hash fragment + auth query params.
- **SA-015** — FIXED: print paths route interpolations through `escapeHtml()` / static-markup rendering.
- **SA-016** — FIXED: `LegalPage` pipes markdown through `sanitizeHTML(...,'richText')` (DOMPurify).
- **SA-017** — FIXED for the enumerated ~16 tables (`20260703121000`) — but regressed on 5 newer tables (now SA-021).
- **AskQ cross-tenant fail-open** (found this week by `/improve`) — FIXED: `_shared/askq/showScope.ts` fails closed to an impossible UUID; regression test present; edge fn adds a caller-access check before promoting `showId` to `verifiedShowId`.

**Unchanged / still present:**

- **SA-004** — PARTIALLY fixed. Unauthed types now 403 and `entry_decision` is show-official-gated, but caller-target recipient authz is still missing → re-filed as **SA-018**, **SA-019**, **SA-020** (recipient/CC spoofing).
- **SA-009** — STILL PRESENT (carried over; MEDIUM defense-in-depth).

**New this audit:** SA-018, SA-019, SA-020, SA-021, SA-022, SA-023, SA-024, SA-025, SA-026, SA-027.

## Scope honesty (what this audit did NOT do)

- **No runtime testing** — static read-and-reason only. Pair with `qa-feature`/`audit-pages` for a live cold-session walk (esp. anon passcode + email-origination paths) before launch.
- **No dependency/supply-chain scan** (owned by `code-review-extensions`) and **no git-history secret scan**.
- **No penetration testing** — findings describe exploitability, not demonstrated exploits.
- The client scan's "no CRITICAL/HIGH" verdict is conditional on RLS server-side enforcement being intact — which the migration + edge scans independently confirmed for the core surface.
