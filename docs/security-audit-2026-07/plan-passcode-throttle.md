# Fix Plan — Throttle the direct `upsert_ringside_session` passcode path (SA-011)

> **Status:** Active

Covers **SA-011** from [`../security-audit-2026-07-03.md`](../security-audit-2026-07-03.md):
`upsert_ringside_session(text, text, text[], text)` is `GRANT`ed to `anon` and
`authenticated` (mig `20260531175637_fix_ringside_session_upsert_conflict.sql:117-118`)
and validates a passcode inline via `validate_passcode(...)` with **no attempt
throttle**. The `validate-passcode` *edge function* IP-rate-limits; this direct RPC
does not, so it's a bypass of that limiter for passcode brute-force. Also flagged in
the July bug-audit's "direction" list — this plan covers it.

## Risk framing

Bounded: a cracked passcode grants one show's ringside **read/score**, never
financial/PII (the claim tier was verified to never widen `can_view_admin`). Viability
depends entirely on passcode entropy. LOW severity, but it's a real
authentication-throttle gap on a launch-critical sign-in path (passcode is the
*primary* ringside identity per project memory), so worth closing before real shows.

## Design decision — throttle-in-RPC vs. close-the-direct-path

Two viable strategies; pick one:

1. **Throttle inside the RPC.** Call the same `check_login_rate_limit` RPC (or
   equivalent) that the edge function uses, keyed by a caller identifier available
   in SQL. **Caveat:** an RPC has no reliable client IP (unlike the edge function,
   which reads request headers) — you'd key on `auth.uid()` (the anon user id) or a
   passed fingerprint, which is weaker (an attacker can churn anon sessions). Weigh
   whether this materially raises the bar.
2. **Close the direct path (recommended).** Route *all* passcode entry through the
   rate-limited `validate-passcode` edge function, and change
   `upsert_ringside_session` so the anon/authenticated grant no longer accepts a raw
   passcode — i.e. it consumes an already-validated claim/token minted by the edge
   function rather than re-validating a passcode itself. Then `REVOKE` the raw
   passcode arm from anon. This removes the un-throttled surface entirely instead of
   racing the attacker.

Recommend **(2)** if the session-heartbeat client (`RingsideSessionHeartbeat.tsx`)
can be pointed at the edge-function-minted claim path — check whether it already
holds the anon session with the `ringside_passcode` claim (from `validate-passcode`),
in which case `upsert_ringside_session` can trust the claim and never touch a raw
passcode. If that refactor is too large for launch, ship **(1)** as the interim and
note (2) as the follow-up.

## Pre-work

- Read `upsert_ringside_session` final state (`20260531175637`) and its caller
  `apps/myk9show/src/features/at-show/RingsideSessionHeartbeat.tsx` in full — confirm
  whether it passes a raw passcode or already carries the minted claim.
- Confirm the `check_login_rate_limit` RPC signature and what identifier it keys on.

## Testing phase (assertion-first — gate for completion)

- **If (1):** SQL/Deno test — N rapid `upsert_ringside_session` calls with a wrong
  passcode from the same key → the (N+1)th is rejected/blocked (assert the block
  first, red against current unlimited behavior); a correct passcode within limit →
  session upserts.
- **If (2):** test that `upsert_ringside_session` with a raw passcode and no valid
  claim → denied (red first); with a valid edge-function-minted claim → upserts. Plus
  a `RingsideSessionHeartbeat` component test proving it uses the claim path. Confirm
  the anon `GRANT` on the raw-passcode arm is revoked in the new migration.
- `migration-auditor` clean if a migration is involved; **push confirmation-gated**;
  Codex second opinion ON (auth path). Live cold-session ringside walk
  (`qa-feature`) recommended before calling it done, since this is the primary
  ringside sign-in.

## Done criteria

Passcode brute-force via the direct RPC is throttled or eliminated, proven by a
red→green test; legitimate passcode ringside sign-in still works end-to-end
(component + live walk); no financial/PII exposure change (unchanged by design).
