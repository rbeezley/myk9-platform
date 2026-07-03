## 1. Pre-work (required before choosing a strategy)

- [ ] 1.1 Read `upsert_ringside_session` final state
      (mig `20260531175637_fix_ringside_session_upsert_conflict.sql`) in full
- [ ] 1.2 Read `RingsideSessionHeartbeat.tsx` in full; confirm whether it
      passes a raw passcode or already carries a minted
      `ringside_passcode` claim
- [ ] 1.3 Confirm the `check_login_rate_limit` RPC signature and keying
      identifier
- [ ] 1.4 Decide recommended vs. interim strategy based on 1.1–1.3

## 2. Recommended path — close the direct raw-passcode arm

- [ ] 2.1 Write failing test: `upsert_ringside_session` called with a raw
      passcode and no valid claim is denied (red against current behavior)
- [ ] 2.2 Write the migration: change `upsert_ringside_session` to consume a
      pre-validated claim/token instead of re-validating a raw passcode;
      `REVOKE` the raw-passcode arm from `anon`
- [ ] 2.3 Update `RingsideSessionHeartbeat.tsx` to use the claim path if it
      does not already
- [ ] 2.4 Write and pass the allow-path test: valid edge-function-minted claim
      upserts the session
- [ ] 2.5 Write/update a `RingsideSessionHeartbeat` component test proving it
      uses the claim path

## 3. Interim fallback (only if 1.4 selects it)

- [ ] 3.1 Write failing test: N rapid calls with a wrong passcode from the same
      key → the (N+1)th is rejected/blocked (red against current unlimited
      behavior)
- [ ] 3.2 Write the migration adding a `check_login_rate_limit`-pattern check
      inside `upsert_ringside_session`, keyed on `auth.uid()`
- [ ] 3.3 Write and pass the allow-path test: a correct passcode within the
      limit still upserts the session
- [ ] 3.4 Document the anon-session-churn limitation in the PR description and
      track the recommended-path refactor as an immediate follow-up

## 4. Verification and rollout

- [ ] 4.1 Confirm the `anon` GRANT on the raw-passcode arm is revoked (if
      recommended path) in the new migration
- [ ] 4.2 Run `migration-auditor` subagent on the new migration
- [ ] 4.3 Run `supabase db push --dry-run`; confirm clean
- [ ] 4.4 Request Codex second opinion (auth path)
- [ ] 4.5 Push migration only after explicit user confirmation
- [ ] 4.6 Run a live cold-session ringside walk (`qa-feature`) confirming
      legitimate passcode sign-in works end-to-end
- [ ] 4.7 Update `docs/security-audit-2026-07/README.md` status table (SA-011
      row → DONE) and this change's tracking status
