# Security Audit — 2026-06-24

**Mode:** Diff Review (branch: `claude/relaxed-kirch-a0f1e8`, Phase C edge-fn change)
**Checklist version:** references/checklist.md @ 84e656142
**Scope:** `supabase/functions/validate-passcode/index.ts` — new anonymous-session ringside-claim minting path.

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 2 |
| **Total** | **2** |

Auto-fixable: 0 of 2 (both are design/ops items tied to planned Phase E, not mechanical code fixes)

## What the change does

After a passcode validates, if the request carries an **anonymous** Supabase session
(JWT bearer), the function stamps that user's `app_metadata` with
`{ kind: 'ringside_passcode', show_id, ringside_role }` via the service-role admin
API. The client then refreshes its session so the reissued JWT carries the claim,
which the shipped A+B DB tier (view + `ringside_update_entry`) authorizes on.

## Findings

### [LOW] SA-001: Minted claim + anonymous user persist until Phase E cleanup (no server-side TTL on the claim)

**Category:** Edge Function Auth (session lifetime)
**Location:** `supabase/functions/validate-passcode/index.ts` (stamping block)
**Evidence:** The stamp writes `app_metadata` durably on the anon user. The JWT
expires per the project's default (access-token TTL + refresh token), but the
**anon user row and its claim persist indefinitely** until an external cleanup
deletes them. There is no per-claim expiry timestamp.
**Risk:** Accumulation of stale anon users (MAU cost, abuse surface). NOT a direct
exploit: a stale claim only ever grants the one show/role it was minted for, and
financial/PII columns are never exposed to any claim (verified A+B). The blast
radius of a leaked anon refresh token is one show's run-order/scoring — show-day
operational data, shareable by passcode design.
**Fix:** Phase E (DONE — migrations `20260625000000` + `20260625000100`): a daily pg_cron
job deletes stale ringside anon users.
**CORRECTION (2026-06-25):** an earlier version of this note had the supabase-js
semantics backwards. The signature is `deleteUser(id, shouldSoftDelete = false)`, so
`deleteUser(id)` is the HARD delete and `deleteUser(id, true)` is the SOFT delete. The
hard delete **500s** on anon users — not because of the API, but because the
`handle_new_user()` trigger created `people` + `exhibitor_profiles` rows (NO-ACTION FK
children of auth.users) for every anon sign-in, blocking removal. The real fix is
two-part: (1) migration `20260625000000` stops the trigger from creating those children
for `is_anonymous` users; (2) migration `20260625000100` deletes stale anon users via a
direct SQL `DELETE FROM auth.users` (cascade-clean post-fix), NOT the admin API.
**Auto-fixable:** No (shipped as the Phase E migrations).

### [LOW] SA-002: No CAPTCHA / bot mitigation on the anonymous sign-in surface

**Category:** Edge Function Auth (abuse surface)
**Location:** Out of this function — `supabase.auth.signInAnonymously()` is client-side
(Phase D); anon sign-in is a project-level auth setting.
**Evidence:** Anonymous sign-ins are enabled project-wide (required for offline
ringside). Each sign-in mints an anon user; an invalid passcode after sign-in leaves
a claimless orphan (cleaned by SA-001's job).
**Risk:** A bot could mass-create anonymous users. The `validate-passcode` IP rate
limit (5/15min, 30min block) caps passcode *guessing*, but anon *sign-in* itself is
not rate-limited by this function. Bounded: a claimless anon user gets **0 rows + writes
rejected** by the shipped A+B gate (verified live — unmarked claim reads nothing).
**Fix:** Phase E (recommended, operator): enable CAPTCHA on anonymous sign-ins in
Supabase Auth → Attack Protection. Pair with the SA-001 cleanup job.
**Auto-fixable:** No (operator dashboard setting).

## Positive controls verified (no finding)

These were checked against the session-minting threat model and **pass**:

1. **No scope widening from client input.** `show_id`/`ringside_role` are stamped from
   `matchedShow.id` / `matchedRole` (the `validate_passcode` RPC result), never from the
   request body. A caller can only obtain a claim for a show/role they hold a valid
   passcode for.
2. **Real accounts cannot be stamped (no privilege escalation).** Stamping is gated on
   `caller?.is_anonymous === true`, read from `auth.getUser(bearer)` — an authoritative
   GoTrue validation, not a client-settable field. **Verified live:** an anon token →
   `getUser.is_anonymous = true`; the publishable anon key (user-less) → error + null user
   → skipped. A real-account token returns `is_anonymous` false/undefined → skipped.
3. **No cross-user stamping.** The stamp targets `caller.id` resolved from the bearer the
   caller presents — an attacker can only stamp the session whose token they already hold.
4. **Forge-proof storage.** `app_metadata` is service-role-writable only; the DB reads it
   exclusively (never `user_metadata`). The explicit `kind='ringside_passcode'` marker is
   required by the A+B tier — generic `show_id`/`ringside_role` keys are inert without it.
5. **Fail-closed on stamp error.** If `updateUserById` fails for an anon caller, the
   function returns 500 (not a false success) — the client cannot proceed believing it has
   access it lacks.
6. **No secret/key leakage.** `getUser(bearer)` uses the caller's own token; the service
   role key is never returned or logged. Logs record only the role string, no token/id/PII.
7. **Rate limiting upstream of the stamp.** Stamping occurs only after the existing IP
   rate-limit check and a successful passcode match.
8. **CORS unchanged** (origin-scoped `getCorsHeaders`); no new surface.

## Categories Checked

| Category | Files Examined | Findings | Skipped |
|----------|---------------|----------|---------|
| RLS Policy Integrity | 0 | 0 | No migration changed |
| Edge Function Auth | 1 | 2 (LOW) | — |
| RBAC & Privilege Escalation | 0 | 0 | No RBAC/migration changed |
| Client Auth Patterns | 0 | 0 | No client change in this diff (Phase D separate) |
| Data Exposure | 1 | 0 | — |
| Payment Security | 0 | 0 | No Stripe code changed |
| Input Validation | 1 | 0 | — |

## Previous Audit Comparison

First security review of this branch — no prior report for this scope. The A+B DB
tier (PR #951) was independently reviewed (3 findings, all addressed); this review
covers the Phase C edge-fn surface that activates that tier.

## Verdict

The session-minting path is **safe to deploy**. Both findings are LOW and are managed
by the already-planned Phase E (anon cleanup job + optional CAPTCHA) — neither blocks
the Phase C/D merge, but Phase E should not be dropped. The hard-delete requirement
(SA-001) is a concrete, verified implementation constraint for that job.
