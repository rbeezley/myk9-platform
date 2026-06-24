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

### Phase C — Edge fn: `validate-passcode` mints the session  *(security-critical)*
- **MUST stamp `kind: 'ringside_passcode'`** in app_metadata — Phases A+B (shipped in PR #951)
  honor the claim ONLY when that marker is present (review Finding 1, 2026-06-24). show_id/ringside_role
  alone are inert without it. This is a hard cross-PR contract.
- After a successful `{show_id, role}`: `supabase.auth.admin.createUser({ ... , app_metadata: { show_id,
  ringside_role: role, kind: 'ringside_passcode' }, ... })` (or reuse a per-(show,role) anon user), then
  issue a session (admin generate / sign-in) and return tokens. Short TTL; never put the passcode or
  pepper in the token. Rate-limiting already exists. Scope app_metadata to exactly the validated
  (show, role) — never client-supplied.
- **Security review required** (CLAUDE.md high-stakes + `security-audit` skill): an edge fn minting
  authenticated sessions is a new surface. Confirm: claims unforgeable (app_metadata, service-role
  only), TTL bounded, anonymous user cleanup/reuse policy, no privilege beyond the one show/role.

### Phase D — Client: adopt the minted session
- On passcode success, `supabase.auth.setSession(tokens)` so replication reads + the write RPC carry the
  JWT. Reconcile with `useRingsideGrantRole` (the client grant becomes a *consequence* of the session,
  or is kept as UI-role source while the session supplies DB identity). On ringside exit / sign-out,
  end the anonymous session. Verify offline: reads come from the replicated store under the minted JWT.

### Phase E — Project config + verification
- **Enable anonymous sign-ins** in Supabase Auth settings (operator; prerequisite — currently unused).
- Apply seed `§11`/`§12` to staging (judge_assignments + passcodes `jh3k9`/`s7m2p`).
- Live verify on staging (cold session): enter `jh3k9` → land at `/at-show/:showId` → see run order →
  score → reload → score persists. Repeat steward `s7m2p` → run-order/check-in only, scoring blocked.
- Re-walk the 05 show-day judge/steward phases; flip the scorecard ringside row toward Green.

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
