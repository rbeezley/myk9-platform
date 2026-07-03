## Why

`upsert_ringside_session(text, text, text[], text)` is `GRANT`ed to `anon` and
`authenticated` and validates a passcode inline via `validate_passcode(...)` with
no attempt throttle (SA-011, `docs/security-audit-2026-07-03.md`). The
`validate-passcode` edge function IP-rate-limits, but this direct RPC bypasses
that limiter entirely, leaving an un-throttled passcode brute-force path.
Passcode is the *primary* ringside sign-in for launch, so this is worth closing
before real shows even though the blast radius is bounded (a cracked passcode
grants only that show's ringside read/score, never financial/PII access).

## What Changes

- Recommended: close the direct un-throttled path by routing all passcode entry
  through the rate-limited `validate-passcode` edge function, and change
  `upsert_ringside_session` so its `anon`/`authenticated` grant consumes an
  already-validated claim/token minted by that function instead of
  re-validating a raw passcode itself. `REVOKE` the raw-passcode arm from `anon`.
- Interim fallback (if the claim-consuming refactor is too large for launch):
  throttle inside the RPC by calling the same `check_login_rate_limit` RPC
  pattern the edge function uses, keyed on the anon `auth.uid()` (weaker than IP
  keying, since an attacker can churn anon sessions — noted as a real
  limitation, not treated as equivalent to the recommended fix).

## Capabilities

### New Capabilities
- `ringside-passcode-throttle`: eliminates or throttles the un-throttled
  `upsert_ringside_session` passcode brute-force path (SA-011).

### Modified Capabilities
(none)

## Impact

- DB: possible migration changing `upsert_ringside_session`'s signature/grant
  (recommended path) or adding a rate-limit check inside it (interim path).
- Client: `apps/myk9show/src/features/at-show/RingsideSessionHeartbeat.tsx` may
  need to be pointed at the edge-function-minted claim path if it isn't already
  (pre-work step confirms this).
- Tests: red→green SQL/Deno test for the chosen strategy; a
  `RingsideSessionHeartbeat` component test if the claim path changes.
- Fall 2026 launch: hardens the primary judge/steward sign-in path before real
  shows. Codex second opinion required (auth path); a live cold-session
  ringside walk (`qa-feature`) recommended before calling this done, since
  passcode is the primary ringside identity.

Full technical detail: `docs/security-audit-2026-07/plan-passcode-throttle.md`.
