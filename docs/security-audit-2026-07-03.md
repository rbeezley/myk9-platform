# Security Audit — 2026-07-03

**Mode:** Full Audit
**Checklist version:** `references/checklist.md` @ `84e656142`
**Audited commit:** `28a72d23f` (branch `claude/amazing-jemison-6c5a7b`, pinned)
**Method:** Three parallel read-only auditor subagents — (A) all 324 `supabase/migrations/*.sql` (final-state reconstruction), (B) all 30 edge functions in `supabase/functions/` + `apps/myk9show/supabase/functions/`, (C) `apps/myk9show/src/` client. Every finding verified against the actual final-state code. No code was changed during the audit.

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 8 |
| LOW | 9 |
| **Total** | **17** |

Auto-fixable: 9 of 17 findings.

**Headline:** No exploitable-now (CRITICAL/HIGH) vulnerability found. The core privilege-escalation surface (role tables, RBAC helpers, ringside passcode claim tier), the entire Stripe surface (signatures, server-side pricing, refund capping, portal scoping), and route gating are all verified correct. Residual risk is concentrated in two themes: (1) **unauthenticated / under-authorized notification & email origination** (edge functions), and (2) **information disclosure & privilege staleness** (broad reads, raw error text, no live role revocation). All 8 mediums are self-contained; none blocks a first-club test on its own, but the money-path and cross-tenant ones (SA-001, SA-002, SA-005) should close before live launch.

---

## Findings

### [MEDIUM] SA-001: Scoring/placement SECURITY DEFINER functions have no authz and no REVOKE

**Category:** RBAC & Privilege Escalation (data integrity)
**Location:** `supabase/migrations/20260525170000_server_side_scoring_completion.sql:10` (`recalculate_class_placements`), `:72` (`refresh_class_scoring_state`); redefined without guards at `20260615160000_add_shows_is_nationals_placement_source.sql:37` and `20260526200000_fix_class_completion_nationals_source.sql:32`
**Evidence:** Both are `SECURITY DEFINER SET search_path = public` with no internal `auth.uid()`/role check and no `REVOKE ... FROM PUBLIC`. Supabase grants `EXECUTE` on new `public` functions to `PUBLIC` (anon + authenticated) by default — a hazard the team documents in `20260628010000_lock_down_stamp_show_refund_grant.sql:3`. `recalculate_class_placements` runs `UPDATE public.entries SET final_placement = NULL WHERE class_id = v_class_id` then recomputes; `refresh_class_scoring_state` writes finalization state.
**Risk:** Any authenticated user (likely anon too) can call these for a show they don't manage — forcing premature finalization or rewriting official placements (e.g. wrong `p_is_nationals` flag ranks by faults instead of points). Runs as owner, bypassing `entries` RLS. Cross-tenant data-integrity tampering; no exfiltration.
**Fix:** `REVOKE ALL ON FUNCTION public.recalculate_class_placements(uuid[], boolean) FROM PUBLIC, anon, authenticated;` and same for `refresh_class_scoring_state(uuid)`. Trigger path (`handle_entry_scoring_state_change`) still fires (definer rights); grant `service_role` only if a direct server call is needed.
**Auto-fixable:** Yes (mechanical REVOKE, matches `20260628010000` pattern).

---

### [MEDIUM] SA-002: `promo_codes` INSERT open to any authenticated user; SELECT enumerable platform-wide

**Category:** RLS Policy Integrity (financial table mutation not role-restricted)
**Location:** `supabase/migrations/045_promo_codes_financial.sql:62` (INSERT), `:58` (SELECT)
**Evidence:**
- `CREATE POLICY "promo_codes_insert_policy" ON promo_codes FOR INSERT WITH CHECK (created_by = auth.uid());` — only checks you stamp yourself as creator; no check that you manage the referenced `trial_id`/`show_id`.
- `CREATE POLICY "promo_codes_select_policy" ON promo_codes FOR SELECT USING (auth.uid() IS NOT NULL);` — every logged-in user reads every code for every show.
- UPDATE was tightened later (`085_*`) to creator/secretary/admin; INSERT and SELECT were not.
**Risk:** Any exhibitor can enumerate all discount codes platform-wide and insert arbitrary codes (incl. 100%-off) on shows they have no role on. Direct financial exploit is currently blunted — `submit_show_entries` (mig `151`) computes fees server-side and ignores client promo codes — but this is a genuine cross-tenant RBAC gap on a financial config table plus a financial-data disclosure.
**Fix:** Scope INSERT with `is_trial_secretary()`/`is_club_admin()`/`can_manage_show()` on the row's trial/show; scope SELECT to show officials; validate a specific typed code via a SECURITY DEFINER RPC, not a blanket table read.
**Auto-fixable:** No (needs correct scoping predicate — design decision).

---

### [MEDIUM] SA-003: `push-trigger-scoring` and `push-trigger-class-status` have no caller authentication

**Category:** Edge Function Auth
**Location:** `supabase/functions/push-trigger-scoring/index.ts:25`; `supabase/functions/push-trigger-class-status/index.ts:19`
**Evidence:** Both use `handle<WebhookPayload>({ auth: 'none' }, ...)` and read no secret / `Authorization` header. Sibling `push-trigger-announcement` (`:45-55`) and `push-trigger-chat-message` (`:30-35`) both require `Authorization: Bearer ${PUSH_WEBHOOK_SECRET}`.
**Risk:** Anyone who knows the URL can POST a crafted DB-webhook payload. `push-trigger-scoring`: supply `record.user_id`/`record.id` → "Results Posted" push to any user. `push-trigger-class-status`: supply a known class `record.id` with `status:'in_progress'`/`old_record.status:'scheduled'` → fake "Class Starting" push to every exhibitor in that class. Notification spoofing / targeted spam; bodies are server-derived so no exfiltration.
**Fix:** Add the sibling functions' shared-secret check (`Authorization: Bearer ${PUSH_WEBHOOK_SECRET ?? SUPABASE_SERVICE_ROLE_KEY}`) and update the DB triggers to send it.
**Auto-fixable:** Yes (copy the established sibling pattern).

---

### [MEDIUM] SA-004: `send-email` lets any authenticated user send branded emails to any address

**Category:** Edge Function Auth / abuse
**Location:** `supabase/functions/send-email/index.ts:95-108` (client-callable via `apps/myk9show/src/hooks/useEntryManagementActions.ts:650`)
**Evidence:** `handle<EmailData>({ auth: 'jwt', ... })` validates only that a JWT is present and `data.to`/`data.type` exist — no check tying caller to recipient/show/entries. Sends via Resend from `myK9Show <notifications@myk9show.com>`. Contrast `send-registration-email` (`:167-209`) which checks owner/secretary/admin.
**Risk:** Any logged-in exhibitor can send templated emails (confirmation, payment receipt, entry decision, waitlist offer) to arbitrary addresses with attacker-influenced fields. Free-text is HTML-escaped (no full HTML injection), but it's a spam/phishing-from-brand-domain vector risking sender-domain reputation.
**Fix:** Authorize caller against the target (recipient == caller, or secretary/admin for the referenced show/registration), mirroring `send-registration-email`. At minimum rate-limit per user.
**Auto-fixable:** No (design decision on who may send which type).

---

### [MEDIUM] SA-005: `send-auth-email` (Supabase auth hook) does not verify the hook signature

**Category:** Edge Function Auth
**Location:** `supabase/functions/send-auth-email/index.ts:103`
**Evidence:** `handle<AuthHookPayload>({ auth: 'none' }, ...)` with no Standard-Webhooks / `SEND_EMAIL_HOOK_SECRET` verification. Sends to `payload.user.email` with a link from `payload.email_data.token_hash`.
**Risk:** Anyone who knows the URL can POST arbitrary `{user.email, email_data}` and cause a branded "confirm email / reset password / sign in" email to any address. `token_hash` is attacker-supplied so the link won't authenticate, but it's unauthenticated branded-email origination (spam/phishing). Always-200 contract makes it quiet.
**Fix:** Verify the auth-hook signature (dashboard `whsec_...` Standard-Webhooks secret) before sending; fail closed when unset.
**Auto-fixable:** No (needs verification implemented + secret provisioned).

---

### [MEDIUM] SA-006: Full RBAC role map readable by every authenticated user

**Category:** RLS Policy Integrity / RBAC (information disclosure)
**Location:** `supabase/migrations/006_rls_policies.sql:282` (`user_roles_select`), `:273` (`roles`), `:276` (`permissions`), `:279` (`role_permissions`), `:286` (`permission_audit_log_select`)
**Evidence:** `CREATE POLICY "user_roles_select" ON user_roles FOR SELECT USING (true);` (no `TO` clause). Post-mig-156, `user_roles` carries `auth_user_id`. `permission_audit_log_select ... USING (true)` likewise.
**Risk:** Any signed-in user can enumerate every user's role assignments, show/club scoping, and `auth_user_id`, plus the full permission catalog — reveals who the admins/secretaries are and maps `auth.users` ids. Mutations are correctly locked, so this is recon/disclosure, not escalation.
**Fix:** Restrict `user_roles_select` to own rows OR `is_site_admin()`; `permission_audit_log` SELECT → `is_site_admin()`. Keep `roles`/`permissions` catalog readable if the frontend needs it, but consider `TO authenticated`. Verify frontend RBAC read paths first.
**Auto-fixable:** No (behavioral — must confirm frontend read paths).

---

### [MEDIUM] SA-007: `trial_judge_supplies` all operations gated only on `auth.uid() IS NOT NULL`

**Category:** RLS Policy Integrity (client-side-only authz on writes/deletes)
**Location:** `supabase/migrations/20260516170000_create_trial_judge_supplies.sql:77-89`
**Evidence:** SELECT/INSERT/UPDATE/DELETE all `USING (auth.uid() IS NOT NULL)`. Migration comment: "show-scoped gating happens at the application layer."
**Risk:** Any authenticated user can read/modify/delete judge-supply checklist rows for any trial in any show. Cross-tenant write/delete with authz only in the client. Low-value data → MEDIUM.
**Fix:** Scope to `can_manage_show(<trial's show_id>)` / `is_show_official()` via join to `trials`, mirroring `trial_checklist_state` in `087_security_sa017_checklist_state_rls.sql`.
**Auto-fixable:** No (needs join-scoped predicate).

---

### [MEDIUM] SA-008: `people` table fetched with `select('*')` on every authenticated login

**Category:** Data Exposure
**Location:** `apps/myk9show/src/App.tsx:177-197` (UserDataInitializer → `store.loadUsers()`), `apps/myk9show/src/services/database/users/reads.ts:20-25`
**Evidence:** `supabase.from('people').select('*, user_roles..., judge_qualifications(...)')` — no column allowlist, no caller-role gate — runs for **every** signed-in user, incl. plain exhibitors. `people.*` includes email/phone/address.
**Risk:** Entire exposure surface delegated to the `people` SELECT RLS policy. Per mig `20260611120000` that policy is `is_show_manager()`-gated, so exhibitors get few rows today — but any future loosening silently turns this into a full-PII directory dump to every client. Also needless bandwidth on every login.
**Fix:** Gate `loadUsers()` behind the admin/secretary surfaces that need it; replace `*` with an explicit column list.
**Auto-fixable:** No (needs decision on which surfaces depend on userStore).

---

### [MEDIUM→LOW] SA-009: No permission invalidation for a target user's live session on role change

**Category:** Client Auth Patterns (privilege staleness)
**Location:** `apps/myk9show/src/context/AuthContext.tsx:275-326, 487-509`; `apps/myk9show/src/services/rbac/RoleManager.ts:159, 308`
**Evidence:** `rbacData` loads once per `auth.user.id` change (no TTL, no realtime sub). `assignRole`/`revokeRole` refresh only the **admin's own** session and clear only the admin's local cache. A user whose role is revoked/expires keeps the privileged UI in an open tab until reload/re-login.
**Risk:** Client-only — writes are still blocked by RLS (verified: RPCs/helpers check `expires_at`/roles server-side). Reads that RLS still permits (e.g. global-synced replication tables) remain visible until reload. Rated MEDIUM by the client scan; effectively LOW given server-side enforcement holds.
**Fix:** Piggyback role reload on the existing 60s `userProfile` suspension poll, or subscribe to `user_roles` changes for `auth.user.id`.
**Auto-fixable:** Yes (mechanical: add `refetchInterval`-driven RBAC reload).

---

### [LOW] SA-010: Raw Postgres/Supabase error messages rendered in user-facing toasts + global fallback

**Category:** Data Exposure
**Location:** 7 live call sites + 1 fallback — `components/secretary/ShowAccessCodesCard.tsx:103`; `components/admin/users/UserDetailsDialog.tsx:202`; `components/shows/RefundAllEntriesCard.tsx:75,109`; `hooks/useProfileForm.ts:134`; `hooks/useAvatarUpload.ts:54`; `hooks/useEntryManagementActions.ts:356`; `App.tsx:147-149` (`ErrorFallback`)
**Evidence:** These render `error.message` verbatim. PostgREST/Postgres errors carry relation/constraint names and RLS policy text (e.g. `new row violates row-level security policy for table "entries"`).
**Risk:** Schema/table-name disclosure to end users; aids recon. No direct data leak.
**Fix:** Route through a `friendlyDbError(err)` mapper (code → generic copy; log the raw message via `logger.error`).
**Auto-fixable:** Yes (mechanical wrapper per call site).

---

### [LOW] SA-011: `upsert_ringside_session` RPC has no brute-force throttle

**Category:** Edge Function Auth / RBAC (passcode validation)
**Location:** `supabase/migrations/20260531175637_fix_ringside_session_upsert_conflict.sql:40-64,117-118` (final state); originally `20260530210555_phase_3_ringside_sessions.sql`
**Evidence:** `grant execute on function public.upsert_ringside_session(text, text, text[], text) to anon, authenticated;` — the function calls `validate_passcode(p_passcode_or_null)` inline with no attempt throttle. The `validate-passcode` **edge function** *does* IP-rate-limit; this direct RPC path does not. (Confirmed live at `28a72d23f`; matches the July bug-audit's documented MED item.)
**Risk:** Passcode brute-force via the direct RPC, bypassing the edge function's limiter. Viability depends on passcode entropy. A cracked passcode grants one show's ringside read/score, never financial/PII.
**Fix:** Add attempt throttling inside the RPC, or route passcode entry exclusively through the rate-limited edge function and revoke direct anon EXECUTE.
**Auto-fixable:** No (design decision — throttle strategy vs. RPC removal).

---

### [LOW] SA-012: `send-confirmation-email` caller-secret is optional (fails open when unset)

**Category:** Edge Function Auth
**Location:** `supabase/functions/send-confirmation-email/index.ts:334-340`
**Evidence:** `const FUNCTION_SECRET = Deno.env.get('HERITAGE_CONFIRMATION_SECRET'); if (FUNCTION_SECRET) { ...check... }` — when unset there is no auth (`auth: 'none'`). `resend-webhook` (`:77-81`) shows the correct fail-closed (503) pattern.
**Risk:** If the secret is unconfigured, an anonymous caller can trigger confirmation sends. Bounded (only trials with `confirmation_date = today` + entries still `pending/failed`; idempotent on `confirmation_email_sent_at`) → forced-send/spam of legitimate emails.
**Fix:** Require `HERITAGE_CONFIRMATION_SECRET`; return 503 when unset.
**Auto-fixable:** Yes (invert optional check to fail-closed).

---

### [LOW] SA-013: `send-waitlist-invite` unauthenticated; grants early access + magic link from a body email

**Category:** Edge Function Auth
**Location:** `supabase/functions/send-waitlist-invite/index.ts:79-131`
**Evidence:** `handle<InvitePayload>({ auth: 'none', ... })`; on a matching `platform_waitlist` row (`role='club_official'`, null `access_invite_sent_at`) it calls `auth.admin.generateLink({type:'magiclink'})` and stamps `access_granted_at`.
**Risk:** Unauthenticated caller can force "grant early access + email magic link" for any club_official already on the waitlist. Link goes to that email (not attacker) and is idempotent → premature-grant / one-shot spam, not takeover.
**Fix:** Add a shared-secret header or move the grant behind an authenticated admin action.
**Auto-fixable:** No (design decision on the invite trigger).

---

### [LOW] SA-014: Remote log transport ships `window.location.href` (may capture auth tokens in URL hash)

**Category:** Data Exposure
**Location:** `apps/myk9show/src/services/LoggingService.ts:146-153` (`RemoteTransport.flush`)
**Evidence:** Every flushed batch includes the full current URL. During `/auth/callback` and `/reset-password`, Supabase puts `access_token`/`refresh_token`/recovery tokens in the URL hash; an ERROR-level log in that window (ERROR forces immediate flush, `:125`) ships the tokens to `receive-logs`.
**Risk:** Credentials at rest in the first-party logging pipeline; timing-dependent. `LocalStorageTransport` also persists up to 1000 INFO+ entries locally.
**Fix:** Strip hash (and known token query params) before attaching: `url.split('#')[0]`.
**Auto-fixable:** Yes.

---

### [LOW] SA-015: Print windows interpolate secretary-authored strings into raw HTML (`document.write`)

**Category:** Input Validation
**Location:** `apps/myk9show/src/features/pipeline/print/print-service.ts:21,40` (`<title>${title}` embeds `classInfo.className` raw); `apps/myk9show/src/components/secretary/ShowAccessCodesCard.tsx:125-147` (`${showName}`/`${showDate}` raw). (`EntryReceipt.tsx:237-245` is safe — React-escaped innerHTML + system-generated title.)
**Evidence:** A class/show name containing `</title><script>...` executes in the print popup, which is same-origin (opened via `window.open('', '_blank')`) → session-context script execution.
**Risk:** Stored XSS, but author and victim are both show staff (secretaries create names; secretaries print) — minimal trust-tier crossing. Escalates only if names ever become externally suppliable.
**Fix:** HTML-escape interpolations (5-line `escapeHtml`) in `generatePrintHTML` and `printSlip`.
**Auto-fixable:** Yes.

---

### [LOW] SA-016: LegalPage renders homegrown markdown-to-HTML without sanitization

**Category:** Input Validation
**Location:** `apps/myk9show/src/pages/LegalPage.tsx:61,73-198`
**Evidence:** `dangerouslySetInnerHTML={{ __html: html }}` where `markdownToHtml`/`inlineFormat` do no HTML escaping and the link regex accepts any protocol (`javascript:` passes at `:196`). Input is `/legal/terms-of-service.md` — a same-origin static deploy asset (paths hardcoded, `publicRoutes.tsx:514,525`).
**Risk:** Exploitable only by someone who can modify the deployed static file (already game over). Regression risk if reused for CMS/user content. (Also noted in the July bug-audit's "direction" list.)
**Fix:** Pipe output through existing `sanitizeHTML(html, 'richText')`.
**Auto-fixable:** Yes.

---

### [LOW] SA-017: FORCE ROW LEVEL SECURITY missing on ~16 live tables

**Category:** RLS Policy Integrity (defense-in-depth)
**Location:** created-in files — `analytics_events` (096), `chatbot_feedback`/`chatbot_query_log`/`user_guide` (105), `club_access_requests` (20260524120000), `entry_payment_links` (20260620200000), `entry_submissions` (151), `notifications` (153), `organization_agreements` (122), `platform_waitlist` (197), `result_submissions` (126), `role_requests` (20260524195251), `show_incidents` (20260519163003), `show_messages`/`show_message_threads` (106), `training_goals` (20260511153000), `trial_judge_supplies` (20260516170000)
**Evidence:** Each has `ENABLE ROW LEVEL SECURITY` but no `FORCE`. The project standardized FORCE in `021`/`086`/`093`; these later tables were never swept.
**Risk:** ENABLE already enforces RLS for anon/authenticated (non-owner app roles), so no exploit via the normal client. FORCE additionally binds the table-owner role — matters when a SECURITY DEFINER function owned by `postgres` reads these expecting RLS. Genuine defense-in-depth given the app connects as non-owner roles.
**Fix:** `ALTER TABLE public.<t> FORCE ROW LEVEL SECURITY;` per table, matching 021/086.
**Auto-fixable:** Yes.

---

## Categories Checked

| Category | Files Examined | Findings | Notes |
|----------|---------------|----------|-------|
| RLS Policy Integrity | 324 migrations (full timeline) | SA-002, SA-006, SA-007, SA-017 | Core RLS strong; gaps in financial config + defense-in-depth |
| Edge Function Auth | ~19 + shared | SA-003, SA-005, SA-011, SA-012, SA-013 | Notification/email origination cluster |
| RBAC & Privilege Escalation | migrations + rbac services | SA-001, SA-006 | Role-table mutations correctly locked; scoring RPCs unguarded |
| Client Auth Patterns | ~18 (routes, AuthContext, RBAC) | SA-009 | Route gating complete; staleness gap only |
| Data Exposure | ~14 | SA-008, SA-010, SA-014 | select('*'), raw errors, URL-in-logs |
| Payment Security (Stripe) | ~11 Stripe fns + shared | **0** | Clean — signatures, server-side pricing, refund caps, portal scoping all verified |
| Input Validation | ~10 | SA-015, SA-016 | Parameterized queries; two same-origin HTML sinks |

## Previous Audit Comparison

Prior reports were **diff reviews**, not full audits — this is the **first full audit**, so most findings are new-to-record rather than regressions.

- **`security-review-2026-06-24-ringside-passcode-phase-c.md`** — its 2 LOWs (anon-user/claim persistence, no server-side claim TTL) are Phase-E deferred ops items, not re-surfaced here. This audit independently **re-confirms** the ringside claim tier is forge-proof and never widens `can_view_admin` (payment/PII) columns.
- **`docs/archive/security-review-2026-06-11-*.md`** — verified the tightened `dogs`/`people` RLS closed cross-tenant reads; still holds. SA-008 is the *client* over-fetch that leans on that same policy — complementary, not contradictory.
- **`docs/improve-audit-2026-07/` (bug audit)** — SA-011 (`upsert_ringside_session` no throttle) and SA-016 (LegalPage markdown) match its documented "direction" items; re-confirmed live at `28a72d23f`. This audit does **not** re-litigate its REJECTED ledger (webhook `.every()`, cart-overflow refund, idempotency keys, `ringside_update_entry` empty-payload OCC, quota eviction, INSERT 23505) — all previously vetted as non-issues.

## Scope honesty (what this audit did NOT do)

- **No runtime testing** — static read-and-reason only. Pair with `qa-feature`/`audit-pages` for a live cold-session walk before launch (esp. anon passcode paths).
- **No dependency/supply-chain scan** (owned by `code-review-extensions`) and **no git-history secret scan**.
- **No penetration testing** — findings describe exploitability, not demonstrated exploits.
- Client scan's "no CRITICAL/HIGH" verdict is **conditional on RLS server-side enforcement being intact** — which Categories 1–3 independently confirmed for the core surface.
