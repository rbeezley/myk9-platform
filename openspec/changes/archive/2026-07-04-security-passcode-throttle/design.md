## Context

`upsert_ringside_session` (mig `20260531175637_fix_ringside_session_upsert_conflict.sql:117-118`)
is granted to `anon`/`authenticated` and validates a raw passcode inline with no
throttle, while the separate `validate-passcode` edge function IP-rate-limits.
This is a bypass of that limiter for a launch-critical sign-in path. Evidence and
severity: `docs/security-audit-2026-07-03.md` SA-011 (LOW) — bounded risk (only
read/score access, never financial/PII, per the verified claim-tier design), but
a real authentication-throttle gap.

## Goals / Non-Goals

**Goals:**
- Eliminate or throttle passcode brute-force via the direct
  `upsert_ringside_session` RPC.
- Preserve legitimate passcode ringside sign-in end-to-end (component + live
  walk).
- Make no change to financial/PII exposure (unchanged by design — this is a
  read/score-tier claim, not an admin-tier one).

**Non-Goals:**
- CAPTCHA hardening on the passcode flow — explicitly parked separately per
  project memory (`project_ringside_entries_read_rls`).
- Any change to the claim-tier authorization model itself (already verified
  forge-proof by a prior security review).

## Decisions

1. **Close the direct path (recommended) over in-RPC throttling** — route all
   passcode entry through `validate-passcode`, and change
   `upsert_ringside_session` to consume an already-validated claim/token instead
   of re-validating a raw passcode. *Alternative considered:* throttle inside
   the RPC via `check_login_rate_limit` keyed on the anon `auth.uid()` — this is
   weaker because an RPC has no reliable client IP (an attacker can churn anon
   sessions to reset the key), so it races the attacker rather than removing the
   surface. Recommended path wins unless the pre-work check shows the
   `RingsideSessionHeartbeat` refactor is too large for the launch timeline, in
   which case ship the in-RPC throttle as an explicit interim with the
   recommended fix tracked as an immediate follow-up.
2. **Pre-work gates the choice** — read `upsert_ringside_session`'s current
   state and `RingsideSessionHeartbeat.tsx` in full before deciding; if the
   heartbeat client already holds an anon session with the `ringside_passcode`
   claim from `validate-passcode`, the recommended fix is a smaller change than
   it first appears (the RPC just needs to trust the existing claim rather than
   re-validate).

## Offline-First / Replication Impact

[ADDED] None to the offline-first core-data path. `upsert_ringside_session`
establishes the ringside auth session, which inherently requires network
connectivity (the passcode is validated server-side) — it is not persistent
show-day app data flowing through `@myk9/replication`, and this change does not
touch any replicated table or mutation flow. `RingsideSessionHeartbeat`'s
established-session behavior (which gates the offline-capable ringside surfaces
downstream) is preserved; only how the session is *first* authorized changes.

## Risks / Trade-offs

- [Recommended fix requires a client refactor larger than launch time allows] →
  Mitigation: ship the interim in-RPC throttle (weaker but real) and track the
  claim-consuming refactor as an immediate post-launch follow-up rather than
  leaving SA-011 fully open.
- [Interim throttle keyed on anon `auth.uid()` is bypassable by session churn] →
  Mitigation: document this explicitly as a known limitation in the PR and the
  audit remediation status, not as an equivalent fix to the recommended path.
- [Refactoring the raw-passcode arm breaks an existing legitimate ringside
  sign-in flow] → Mitigation: red→green tests plus a live cold-session ringside
  walk (`qa-feature`) before calling this done, since passcode is the primary
  ringside identity for launch.

## Migration Plan

1. Pre-work: read `upsert_ringside_session` final state and
   `RingsideSessionHeartbeat.tsx` in full; confirm whether it passes a raw
   passcode or already carries a minted claim; confirm the
   `check_login_rate_limit` RPC signature and its keying identifier.
2. If recommended path: write the migration changing
   `upsert_ringside_session`'s grant/behavior to consume a validated claim,
   `REVOKE` the raw-passcode arm from `anon`, update
   `RingsideSessionHeartbeat.tsx` if it isn't already claim-based.
3. If interim path: write the migration adding a `check_login_rate_limit` call
   inside `upsert_ringside_session`, keyed on `auth.uid()`.
4. `migration-auditor` clean; `supabase db push --dry-run` clean; push only
   after explicit confirmation. Codex second opinion ON.
5. Live cold-session ringside walk (`qa-feature`) confirming legitimate
   passcode sign-in still works end-to-end.
6. Rollback: revert to the current unthrottled RPC via a follow-up migration if
   the chosen fix blocks legitimate sign-in in production.

## Open Questions

- Does `RingsideSessionHeartbeat.tsx` already hold an anon session with the
  `ringside_passcode` claim, or does it pass a raw passcode to the RPC?
  Resolves during pre-work and determines whether the recommended fix is a
  small or large change.
