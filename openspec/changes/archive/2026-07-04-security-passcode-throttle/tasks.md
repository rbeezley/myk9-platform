## 1. Pre-work (required before choosing a strategy)

- [x] 1.1 Read `upsert_ringside_session` final state
      (mig `20260531175637_fix_ringside_session_upsert_conflict.sql`) in full
      — two arms; raw-passcode arm calls `validate_passcode()` inline, no throttle (SA-011)
- [x] 1.2 Read `RingsideSessionHeartbeat.tsx` in full; confirm whether it
      passes a raw passcode or already carries a minted
      `ringside_passcode` claim
      — re-sent RAW passcode every 30s; BUT `validate-passcode` already mints an anon
      session stamped with the `ringside_passcode` app_metadata claim, so the session
      already carries the claim (heartbeat just wasn't using it)
- [x] 1.3 Confirm the `check_login_rate_limit` RPC signature and keying
      identifier — `check_login_rate_limit(p_ip_address)`, IP-keyed (only meaningful
      in the edge fn; an RPC has no reliable client IP → interim path is genuinely weaker)
- [x] 1.4 Decide recommended vs. interim strategy based on 1.1–1.3
      — **RECOMMENDED** chosen: claim infra already exists (view + `ringside_update_entry`
      read the same claim), so the fix is small. §3 interim NOT used.

## 2. Recommended path — close the direct raw-passcode arm

- [x] 2.1 Write failing test: `upsert_ringside_session` called with a raw
      passcode and no valid claim is denied (red against current behavior)
      — source-text contract `ringsideSessionClaimAuthzContract.test.ts` asserts
      `validate_passcode`/`_hash_passcode` are gone + no `anon` grant
- [x] 2.2 Write the migration: change `upsert_ringside_session` to consume a
      pre-validated claim/token instead of re-validating a raw passcode;
      `REVOKE` the raw-passcode arm from `anon`
      — `20260704190000_ringside_session_claim_authz.sql`
- [x] 2.3 Update `RingsideSessionHeartbeat.tsx` to use the claim path if it
      does not already — stops sending the raw passcode (`p_passcode_or_null: ''`);
      claim rides on the JWT
- [x] 2.4 Write and pass the allow-path test: valid edge-function-minted claim
      upserts the session — contract asserts the claim arm reads the show scope
      from the claim; behavioral allow-path proven live (task 4.6)
- [x] 2.5 Write/update a `RingsideSessionHeartbeat` component test proving it
      uses the claim path — asserts `p_passcode_or_null` is always `''` + a
      never-sends-a-passcode guard across all calls

## 3. Interim fallback (NOT selected — task 1.4 chose the recommended path)

- [~] 3.1 (skipped — recommended path chosen)
- [~] 3.2 (skipped — recommended path chosen)
- [~] 3.3 (skipped — recommended path chosen)
- [~] 3.4 (skipped — recommended path chosen)

## 4. Verification and rollout

- [x] 4.1 Confirm the `anon` GRANT on the raw-passcode arm is revoked (if
      recommended path) in the new migration — explicit `revoke all ... from anon`
      (Codex-caught: `revoke ... from public` does NOT drop the prior explicit anon
      grant) + `from public` + grant to `authenticated` only; contract test pins the
      explicit anon revoke
- [x] 4.2 Run `migration-auditor` subagent on the new migration — verdict SAFE TO
      PUSH, 0 FAIL/WARN; confirmed schema-qualified under `search_path=''`,
      forge-proof app_metadata-only, role-CHECK alignment, anon-revoke coherence
- [x] 4.3 Run `supabase db push --dry-run`; confirm clean — connected to remote,
      would push only `20260704190000_ringside_session_claim_authz.sql`, no conflicts
- [x] 4.4 Request Codex second opinion (auth path) — **caught a real bug**: the
      `anon` grant survived `revoke ... from public`; fixed with explicit anon revoke
      (commit `bafbe1b03`)
- [ ] 4.5 Push migration only after explicit user confirmation — **PENDING ROLLOUT**
      (operator-gated; migration on `main` but not yet deployed to staging/prod)
- [ ] 4.6 Run a live cold-session ringside walk (`qa-feature`) confirming
      legitimate passcode sign-in works end-to-end — **PENDING ROLLOUT** (needs 4.5 first)
- [ ] 4.7 Update `docs/security-audit-2026-07/README.md` status table (SA-011
      row → DONE) and this change's tracking status — **PENDING ROLLOUT** (hold until
      migration is live per the deploy-then-mark-DONE convention)

## 5. PR / CI / review / merge gate (final gate before archive)

- [x] 5.1 [ADDED] Open the PR (`ship-pr`); PR body cites `Tracked in openspec
      change: security-passcode-throttle` and notes the chosen strategy +
      (if interim) the anon-session-churn limitation — PR #1130
- [x] 5.2 [ADDED] CI green (typecheck, lint, tests) + code-reviewer subagent
      self-review loop resolved; Codex second opinion attached (auth path) —
      code-reviewer APPROVED; Codex finding applied
- [x] 5.3 [ADDED] Squash-merge to `main` from the main repo directory — this is
      the gate that must clear before the change is archived — merged 2026-07-04
      (squash `aa506c81d`, PR #1130)
