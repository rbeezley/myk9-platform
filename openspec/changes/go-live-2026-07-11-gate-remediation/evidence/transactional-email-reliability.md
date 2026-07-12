# Transactional Email Reliability Evidence

Date: 2026-07-12

## Repository implementation

- Added byte-identical retry helpers under both Supabase deployment roots.
- Migrated all ten direct Resend senders while preserving existing business idempotency keys.
- Added content-derived SHA-256 idempotency for callers without an explicit key.
- Added repository enforcement for helper parity, caller adoption, and absence of direct endpoint bypasses.
- No Edge Function was deployed and no Auth rate limit was changed.

## Red/green evidence

- The cancellation-during-backoff test timed out at 10 seconds before abort-aware waiting was implemented.
- Focused retry, source-contract, lifecycle, confirmation-auth, results-authz, email-authz, recipient-resolution, and alert tests: **85 passed**.
- Repository typecheck: **passed** (26/26 Turbo tasks).
- Repository lint: **passed**.
- Portable helper TypeScript check with `ES2022`, `DOM`, and `DOM.Iterable`: **passed** for both mirrors.
- `openspec validate go-live-2026-07-11-gate-remediation --strict`: **passed**.
- `git diff --check`: **passed**.

## Bundle-check limitation

The root `supabase functions serve send-auth-email --no-verify-jwt` bundle check was attempted but could not start because Docker Desktop was not running. The CLI stopped before bundling. The app deployment root has no independent `config.toml`. Deployment-root safety is instead covered locally by byte parity, portable-helper TypeScript checks, and the source contract. The affected functions still require CI/reviewer evidence before merge and operator-approved bundle/deployment verification afterward.

## Remaining gates

- Human PR review and CI are required before merge.
- Edge Function deployment and production smoke tests remain shared-system gated.
- Resend must be upgraded from Free before production.
- The Supabase Auth limit remains 100/hour until the paid-plan evidence exists and a separate approved Management API PATCH raises only `rate_limit_email_sent` to 1,000/hour.
