# Plan: Passcode Ringside Identity — judge/steward/timer read + score without an account

> **Status:** Active

**Created:** 2026-06-24. **Goal (user, 2026-06-24):** a judge or steward (the "timer" signs in with
the **steward** passcode — there is no separate `timer` role; passcode roles are
admin/judge/steward/exhibitor) who signs in with a **show passcode** (no account) must be able to read
the run order and **score** (judge) / manage run-order + check-in (steward) at `/at-show/:showId`,
offline-capable — because passcode is the *primary* real-world ringside sign-in.

> **Correction (2026-06-24):** an earlier draft of this plan misdiagnosed the root cause as
> `entries_select` on the `entries` table. The at-show **read** path actually goes through the
> column-gated view **`view_authenticated_entry_results`**, not the raw table. See "What already
> exists" — the *account*-judge path is already built; the real gap is the *passcode* identity.

---

## What already exists (verified in code 2026-06-24 — do NOT rebuild)

- **Read (account roles):** migration `20260621190000_ringside_entry_read_for_staff.sql` extends
  `view_authenticated_entry_results` with ringside-staff access flags:
  - `is_assigned_judge` — `judge_assignments` (status `confirmed|invited`, class-level) → `can_view_scores`.
  - `is_show_steward` — `user_roles` steward scoped to show/club → **rows only**, scored columns stay gated.
  - Payment/PII columns gated by `can_view_admin` = managers + entry owner only. This is the #779
    per-field cascade done correctly — judges/stewards do **not** see payment/refund/Stripe/comp/email.
  - Client reads it via `useClassEntries.ts`; e2e spec `atShowJudgeScoring.spec.ts` exists.
- **Write (account roles):** migration `20260621171500_ringside_update_entry.sql` —
  `ringside_update_entry(p_entry_id, p_fields, p_expected_version)` SECURITY DEFINER RPC authorizing
  manager / assigned-judge / show-steward, writing only whitelisted ringside columns, OCC via `version`.
  Client routing via per-mutation `viaRpc` tag (see [`plan-atshow-ringside-writes.md`](plan-atshow-ringside-writes.md)).

**Net:** a **signed-in** assigned judge can already read + score (modulo: seed `§11` applied to
staging + client RPC routing merged/deployed). The column-gating + write whitelist infra is solid and
is the foundation this plan extends — additively.

## The actual gap: passcode sessions have no server identity

Both the view and the RPC authorize on `auth.uid()`. A passcode user has none:
- `validate-passcode` (edge fn, service role) verifies the code and returns `{show_id, role, showData}`;
  the grant is stored **client-side only** (`useRingsideGrantRole`). The DB never sees it again.
- The view `REVOKE`s `anon`; an anon PostgREST read returns nothing. The RPC's authz tiers are all
  `auth.uid()`-based. So a passcode judge/timer reads 0 entries and cannot score.

## Decision (locked with user 2026-06-24): mint an anonymous session with claims

`validate-passcode` mints a **short-lived Supabase anonymous session** stamped with
`app_metadata = { show_id, ringside_role }`. Anonymous users authenticate as the `authenticated`
Postgres role (with `is_anonymous=true`), so they inherit the existing view GRANT and flow through the
**same offline replication read + `ringside_update_entry` write** paths as accounts. Authorization adds
one claim-based tier alongside the existing `auth.uid()` tiers.

Why this over a token-RPC: keeps passcode users on the offline-first replication layer (a venue loses
signal), and reuses the column-gated view + write RPC instead of a parallel bespoke path.

**Decision re-confirmed 2026-06-24 (offline is critical):** offline-first for account-LESS users
structurally requires an authenticated session — the replication layer (the offline cache + write
queue) authenticates every sync through a Supabase session, so no session ⟹ RLS denies ⟹ nothing
caches. Anonymous auth is therefore the ONLY way to put passcode users on the offline path; the
token-RPC alternative (reads bypass replication) is ruled out because it loses offline. **Consequence
accepted:** anonymous sign-ins stay ENABLED permanently (a standing MAU + abuse-surface cost, NOT a
temporary bootstrap). Bounded blast radius: a claimless anon user (no valid passcode) gets no ringside
claim and is denied by the shipped A+B gate (verified: unmarked claim → 0 rows). Phase E manages the
cost (stale-anon cleanup + optional CAPTCHA on anon sign-in); it does not remove the enabled state.

---

## Review findings folded in (2026-06-24, independent review of PR #951)

- **F1 (Medium, DONE in PR #951):** the claim is now gated on an explicit
  `kind: 'ringside_passcode'` marker in app_metadata, not just generic `show_id`/`ringside_role` keys.
  Closes the only surviving forge vector (a future internal flow writing those generic keys into a
  real account's app_metadata cannot gain ringside access). Verified live: an unmarked claim reads 0
  rows + write rejected. Phase C MUST set the marker (see Phase C).
- **F2 (Low, decision):** an **exhibitor** passcode claim reads **0 rows** from
  `view_authenticated_entry_results` — `is_ringside_claim` admits only judge/steward/admin (scoring
  staff), by design. This is not a regression (anon reads 0 today). **Decision:** exhibitor at-show
  (run-order viewing without an account) is intentionally OUT of this scoring-staff read path; if
  exhibitors need a passcode run-order view, it rides a separate public/anon read path. Phase C/D must
  confirm the exhibitor at-show entry point (account `is_own_entry` path or a public path) — do not
  rely on the exhibitor passcode reaching this view.
- **F3 (Nit, docs):** "timer" is not a role — the passcode roles are admin/judge/steward/exhibitor.
  The person running the stopwatch ("the timer") signs in with the **steward** passcode. Wording
  aligned here and in the PR.

## Phases

### Phase A — DB: claim-based read tier on `view_authenticated_entry_results`
`CREATE OR REPLACE VIEW` re-emitting the current column list (from `20260621190000`) plus a new access flag:
- `is_ringside_claim_judge` = `(SELECT auth.jwt())->'app_metadata'->>'show_id' = e.show_id::text AND
  ...->>'ringside_role' = 'judge'` → folds into `can_view_scores` (judge claim scores).
- `is_ringside_claim_staff` = same show match with `ringside_role IN ('steward','admin')` → rows only
  (admin claim may also get `can_view_admin`? **decide**: keep admin passcode to rows+scores, not
  payment, unless the user wants full admin parity).
- Add both to the `WHERE`. Claims are show-scoped (a passcode is per-show), so this is show-level, not
  class-level (unlike the account judge's class-level assignment).
- `NOTIFY pgrst`. Test: claim JWT reads the show's entries; wrong-show claim reads 0; payment columns
  null for claim users.

### Phase B — DB: claim tier on `ringside_update_entry`
- Add to the RPC's authz: judge claim (show match) → full ringside whitelist; steward claim → run-order
  + check-in only (mirror the account steward tier); reject if claim `show_id` ≠ entry's show.
- Resolve claim from `(SELECT auth.jwt())->'app_metadata'` (works inside SECURITY DEFINER — JWT GUC is
  request-scoped). Keep OCC + whitelist intact. Hand-add nothing to `database.types.ts` (signature
  unchanged). Test: judge-claim writes score OK; steward-claim score rejected; cross-show claim denied.

### Confirmed mechanism (investigated 2026-06-24)

`supabase-js ^2.108.2` cannot mint a session *with* custom claims in one call. The flow is three
coordinated steps (Option 2):

1. **Client** (`pages/validatePasscode.ts`): `supabase.auth.signInAnonymously()` → anon session (so
   `auth.uid()` exists). **Requires anonymous sign-ins enabled** (Phase E — currently OFF).
2. **Edge fn** (`validate-passcode`, deployed `--no-verify-jwt`): parse the caller's anon JWT, confirm
   `is_anonymous = true` (NEVER stamp a real account), validate the passcode (existing path), then
   `admin.updateUserById(anonUserId, { app_metadata: { ...existing, kind: 'ringside_passcode',
   show_id, ringside_role: role } })`. Merge (don't clobber) existing app_metadata. Rate-limit exists.
3. **Client**: `supabase.auth.refreshSession()` so the reissued JWT carries the stamped app_metadata,
   then proceed to `/at-show/:showId`. Store the grant in `ringsideGrantStore` as today (UI role), but
   DB identity now comes from the session.

**Prerequisite ordering:** Phase E's *enable anonymous sign-ins* must happen FIRST, or C/D cannot be
tested. Enabling it is an auth/security setting — an OPERATOR action (Claude cannot change security
settings). Anonymous users count toward MAU + add abuse surface; pair with a cleanup policy for stale
ringside anon users.

### Phase C — Edge fn: `validate-passcode` mints the session  *(security-critical)* — DONE (2026-06-24, deployed to staging)
- **MUST stamp `kind: 'ringside_passcode'`** in app_metadata — Phases A+B (shipped in PR #951)
  honor the claim ONLY when that marker is present (review Finding 1, 2026-06-24). show_id/ringside_role
  alone are inert without it. This is a hard cross-PR contract. ✅ Implemented.
- **Implemented mechanism (differs from the createUser sketch below):** the CLIENT signs in anonymously
  first (Phase D step 1), so the request carries the anon user's JWT. The edge fn `getUser(bearer)`s the
  caller, and ONLY if `is_anonymous === true` calls `admin.updateUserById(callerId, { app_metadata: {
  ...existing, kind:'ringside_passcode', show_id: matchedShow.id, ringside_role: matchedRole } })` —
  merge, not clobber. `show_id`/`role` come from the server-validated passcode, never the request body.
  A real account (is_anonymous false) is never stamped. Fail-closed: a stamp error returns 500. Response
  gains `sessionStamped: boolean`. (The earlier `createUser` + token-return sketch was dropped: supabase-js
  can't mint a session with claims in one call — see "Confirmed mechanism".)
- **Security review: DONE.** `docs/security-review-2026-06-24-ringside-passcode-phase-c.md` — 0
  critical/high/medium, 2 LOW (both Phase E): anon-user TTL/cleanup + CAPTCHA. Positive controls verified
  live: no scope widening from client input, real accounts never stamped (getUser gate), no cross-user
  stamp, forge-proof storage, fail-closed, no key leakage.
- **Verified end-to-end through the deployed fn (staging, 2026-06-24):** anon sign-in → invoke
  `validate-passcode` (`jh3k9`/`s7m2p`) → `sessionStamped:true` → `refreshSession()` → JWT carries the
  claim → 18 rows (payment NULL) → RPC write OK. Invalid passcode → 401 → anon session stays claimless.

### Phase D — Client: adopt the minted session — DONE (2026-06-24)
- New orchestrator `apps/myk9show/src/pages/ringsideAnonSession.ts`:
  `startAnonymousRingsideSession(passcode)` = signInAnonymously (reuse existing anon session, don't mint
  a second orphan) → `validatePasscode` (edge fn stamps) → `refreshSession`. Drops the dangling anon
  session via `signOut` on invalid-passcode or refresh failure. `endAnonymousRingsideSession()` ends the
  session on exit (no-op for a real account) — ready for the leave-show affordance (which, like
  `clearGrant`, has no UI caller yet).
- `SmartSignInPage` account-less branch now calls the orchestrator; the signed-in branch is UNCHANGED
  (validate only, client-only grant, account session untouched — Locked Decision #8). The client grant
  still supplies the UI role + presence; the session supplies DB identity (both from the same passcode).
- Tests: `ringsideAnonSession.test.ts` (8) + updated `SmartSignInPage.test.tsx` (anon path → orchestrator).
- **Offline replay** verified by construction (session JWT carries claim; view read + RPC write honor it
  — the exact paths replication syncs through). Full offline browser walk needs the client merged
  (Vercel auto-deploys from `main`; Preview MCP serves main, not this worktree) → folds into Phase E.

### Phase E — Project config + verification
- **Enable anonymous sign-ins** in Supabase Auth settings (operator). ✅ DONE 2026-06-24.
- Apply seed `§11`/`§12` to staging. ✅ §12 passcodes applied 2026-06-24 (table was empty; pepper Vault
  secret confirmed set). ✅ §11 judge_assignments VERIFIED present (e2e-judge has 5 assignments in
  Heartland; 10 total / 5 classes).

- **ROOT CAUSE found 2026-06-24 — anon sign-ins pollute core tables (reshaped this phase).** Every
  anonymous sign-in fired `handle_new_user()` (AFTER INSERT on auth.users), creating a `people` (email
  NULL, "Unknown User"), `exhibitor_profiles`, and `user_roles` row — 4 rows per anon user, not 1. Those
  `people`/`exhibitor_profiles` NO-ACTION FK children are ALSO why a GoTrue hard-delete 500s (it cannot
  remove the auth row while they exist). **Correction to an earlier note:** supabase-js is
  `deleteUser(id, shouldSoftDelete=false)` — `deleteUser(id)` is the HARD delete (500s on anon due to the
  children) and `deleteUser(id, true)` is the SOFT delete (sets deleted_at, leaves the row). Neither
  admin-API path cleanly removes an anon user while the trigger makes those children.

- **Part 1 — trigger guard (migration `20260625000000`). ✅ DONE.** `handle_new_user()` +
  `materialize_club_access_request_from_auth_user()` re-emitted verbatim with an
  `IF NEW.is_anonymous THEN RETURN NEW` early-return at the top. Anon users now create ZERO core-table
  rows; the non-anon path is byte-for-byte unchanged. Safe because the at-show authz never needs an anon
  person row (`ringside_update_entry` treats the caller-person as NULL for passcode claims; the read
  view's claim tier is JWT-based; presence uses the client grant's sessionId). Verified live in a
  rolled-back txn: anon insert → 0 people/profiles/roles; anon row then DELETEs cleanly (cascade); normal
  insert → 1 person + 1 profile (regression intact).

- **Part 3 — recurring cleanup (migration `20260625000100`). ✅ DONE.** SECURITY DEFINER
  `cleanup_stale_ringside_anon_users(claimless_ttl, ended_grace, max_age)` + a daily 04:00 UTC pg_cron
  job. Deletes an anon user (and, defensively, any pre-fix children) when: already soft-deleted, OR
  claimless past the TTL (default 1d), OR a ringside claim whose show ended (+2d grace) / is gone / older
  than 14d. Pure SQL (no edge fn) — a direct `DELETE FROM auth.users` cascades cleanly post-Part-1.
  Every delete is scoped to `is_anonymous` anon ids ONLY; the final auth delete re-asserts
  `is_anonymous = true`. Verified live in a rolled-back txn: purged exactly the 9 staging orphans + their
  children; the 15 real auth-linked people were untouched. migration-auditor: PUSH WITH CAUTION (2 low
  WARNs — BEGIN/COMMIT added; run `db diff` after push to confirm trigger re-emit fidelity).
  Contract test: `apps/myk9show/src/test/database/anonUserTriggerCleanupContract.test.ts` (9).

- **Part 2 — one-time purge of the 9 existing orphans:** run `SELECT cleanup_stale_ringside_anon_users()`
  once after `db push` (the 9 are soft-deleted → caught by criterion (a)). TODO at deploy.

- **CAPTCHA on anonymous sign-in (TODO, operator):** Supabase Auth → Attack Protection. Bounds the
  anon-user abuse surface; not a launch blocker (claimless anon users read 0 rows + the cron purges them).
- Live verify on staging (cold session): enter `jh3k9` → land at `/at-show/:showId` → see run order →
  score → reload → score persists. Repeat steward `s7m2p` → run-order/check-in only, scoring blocked.
- Re-walk the 05 show-day judge/steward phases; flip the scorecard ringside row toward Green.

> **SA-001 correction (this PR):** `docs/security-review-2026-06-24-ringside-passcode-phase-c.md` SA-001
> says `deleteUser(id, true)` "works (hard delete)." That is backwards — see the root-cause note above.
> The cleanup mechanism is a direct SQL delete after the Part-1 trigger guard, NOT the admin API.

## Testing phase (required)
- RLS contract test mirroring `apps/myk9show/src/test/database/authenticatedEntryResultsRlsContract.test.ts`:
  claim JWT reads the show's entries, payment columns null, wrong-show claim 0 rows.
- RPC authz tests: judge-claim score OK; steward-claim score rejected, run-order OK; cross-show denied;
  OCC stale rejected.
- Client: passcode-success sets a session; exit clears it; offline read served from replicated store.
- Verify in a cold anon session ([[feedback_verify_anon_in_cold_session]]).

## Gates (CLAUDE.md)
- `/review` + `/codex:review` on the migrations and the edge fn (RLS + session minting = high-stakes).
- `supabase db push`, `supabase functions deploy`, the anonymous-sign-in project setting, and seed
  application are **shared-system** — confirm before each (Auto Mode).
- Each phase = its own PR (mixed DB+code → PR, not direct-to-main).

## Cross-references
- Existing read view: `20260621190000_ringside_entry_read_for_staff.sql`. Existing write RPC +
  client routing: `20260621171500_ringside_update_entry.sql` + [`plan-atshow-ringside-writes.md`](plan-atshow-ringside-writes.md).
- Passcode model: `20260525180000_show_passcodes.sql` (`validate_passcode`, HMAC+Vault pepper).
- Fixtures: `seed-demo.sql` §11 (judge_assignments) / §12 (passcodes `jh3k9`/`s7m2p`).
- Memory: [[project_ringside_entries_read_rls]], [[project_atshow_judge_write_rls_gap]],
  [[project_atshow_gating_map]].
- Source of the gap: show-day walk S2/S3 ([`docs/audits/2026-06-ux-journeys/05-showday-walk-2026-06-17.md`](audits/2026-06-ux-journeys/05-showday-walk-2026-06-17.md)).
