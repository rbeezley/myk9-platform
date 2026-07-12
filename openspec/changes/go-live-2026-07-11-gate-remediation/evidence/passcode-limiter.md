# Passcode Limiter Failure Evidence

**Checked:** 2026-07-12 UTC

**Shared-system mutation performed:** none

## RED

The source contract first failed because `validate-passcode` contained no orchestration seam,
continued after `check_login_rate_limit` errors, and logged the submitted passcode prefix. The pure
gate then failed all five focused behavior tests on an intentional unimplemented placeholder.

## GREEN

`rateLimitGate.ts` is Deno-free and accepts no passcode value or prefix. It:

- treats returned RPC errors, rejected limiter calls, and missing/malformed rows as unavailable;
- attempts one durable `operator_alerts` insert with source `validate-passcode`, severity `error`,
  title `Passcode rate limiter unavailable`, and IP-scoped dedupe key;
- returns the same 503 response even when the alert insert fails;
- preserves blocked-attempt recording and the existing 429 response body; and
- returns `allowed` only for a complete, usable limiter row.

The Edge handler exits on the gate response before calling `validate_passcode`, retains the
existing CORS headers, and no longer logs the submitted passcode prefix. The established
`login_attempts.passcode_prefix` forensic record remains limited to the existing
`record_login_attempt` path and is never copied into an operator alert or log.

Verification:

- focused rate-limit, source-contract, and CORS tests: 11 passed under the CI app Vitest config;
- `pnpm typecheck`: 26/26 tasks passed; and
- `pnpm lint`: 14/14 tasks passed.

No Edge Function was deployed. Runtime closure of SA-024 requires approval to deploy
`validate-passcode`, then smoke the healthy allowed/429 paths and a controlled limiter-failure 503
with one deduplicated operator alert. Rollback is redeploying the last-good function revision.
