# Transactional Email Reliability Evidence

Date: 2026-07-12

## Repository implementation

- Added byte-identical retry helpers under both Supabase deployment roots.
- Migrated all ten direct Resend senders while preserving existing business idempotency keys.
- Added content-derived SHA-256 idempotency for callers without an explicit key.
- Added repository enforcement for helper parity, caller adoption, and absence of direct endpoint bypasses.
- Deployed the retry implementation to all 12 affected Edge Functions after PR #1296 merged.
- The Supabase Auth rate limit was not changed and remains 100/hour.

## Red/green evidence

- The cancellation-during-backoff test timed out at 10 seconds before abort-aware waiting was implemented.
- Focused retry, source-contract, lifecycle, confirmation-auth, results-authz, email-authz, recipient-resolution, and alert tests: **90 passed**.
- Repository typecheck: **passed** (26/26 Turbo tasks).
- Repository lint: **passed**.
- Portable helper TypeScript check with `ES2022`, `DOM`, and `DOM.Iterable`: **passed** for both mirrors.
- `openspec validate go-live-2026-07-11-gate-remediation --strict`: **passed**.
- `git diff --check`: **passed**.
- Post-deployment retry fault-injection suite: **21 passed** (429 + `Retry-After`, 503,
  network recovery, terminal failures, aborts, idempotency, and PII-free telemetry).
- Post-deployment deployment-root/source-contract suite: **12 passed** (byte-identical helpers,
  all direct callers routed through the helper, and no raw Resend endpoint bypass).

## Bundle-check limitation

The root `supabase functions serve send-auth-email --no-verify-jwt` bundle check was attempted but
could not start because Docker Desktop was not running. The CLI stopped before bundling. The app
deployment root has no independent `config.toml`. PR review and CI passed, and the subsequent
Supabase API deployments server-bundled all 12 functions successfully; deployment output showed
the shared `resendEmail.ts` helper in every affected bundle. This closes the earlier local Docker
limitation without claiming a local bundle run occurred.

## Live deployment — 2026-07-12

All functions were deployed with `--no-verify-jwt --use-api` to project
`sojmvhhwsjxmfistvzbe`. The previous versions below are the rollback anchors.

| Function | Previous | Deployed | State |
| --- | ---: | ---: | --- |
| `send-auth-email` | 46 | 47 | ACTIVE |
| `send-registration-email` | 43 | 44 | ACTIVE |
| `send-email` | 63 | 64 | ACTIVE |
| `send-confirmation-email` | 37 | 38 | ACTIVE |
| `send-waitlist-invite` | 30 | 31 | ACTIVE |
| `send-results` | 12 | 13 | ACTIVE |
| `push-trigger-support-message` | 3 | 4 | ACTIVE |
| `send-lifecycle-email` | 2 | 3 | ACTIVE |
| `stripe-webhook` | 77 | 78 | ACTIVE |
| `stripe-refund-entry` | 25 | 26 | ACTIVE |
| `stripe-refund-show` | 9 | 10 | ACTIVE |
| `cron-process-payouts` | 25 | 26 | ACTIVE |

Post-deploy read-back confirmed all 12 functions are ACTIVE with JWT verification disabled, as
required because the handlers perform their own authentication.

## Controlled production smoke evidence

- A credential-free POST reached every deployed handler and failed closed before any email,
  refund, payout, or trusted webhook action: nine functions returned 401, two secret-gated
  functions returned 403, and `stripe-webhook` returned 400 for its missing signature.
- One password-reset request for the operator-approved Gmail address returned 200 through
  Supabase Auth. The resulting live `email_log` row recorded `password_reset`, `delivered`, and a
  Resend message ID at `2026-07-13T00:18:42Z`. This was one message, not a bulk-mail test.
- Live 429/503 fault injection was not attempted because it would require provider disruption or
  artificial production traffic. The deterministic post-deploy fault-injection suite exercised
  429, 503, and network recovery and verified that retry telemetry contains only `attempt`,
  `status`, and `delayMs`; it passed 21/21.

## Exact rollback procedure

The retry implementation's parent commit is `4fa04090f`. The version numbers above are audit
anchors; rollback redeploys that exact prior source so it does not depend on a mutable local tree:

```bash
git worktree add --detach /private/tmp/myk9-email-retry-rollback 4fa04090f
cd /private/tmp/myk9-email-retry-rollback
supabase functions deploy send-auth-email send-registration-email send-email \
  send-confirmation-email send-waitlist-invite send-results \
  push-trigger-support-message send-lifecycle-email \
  --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt --use-api
supabase functions deploy stripe-webhook stripe-refund-entry stripe-refund-show \
  cron-process-payouts --workdir apps/myk9show \
  --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt --use-api
# After the smoke matrix succeeds:
cd -
git worktree remove /private/tmp/myk9-email-retry-rollback
```

After rollback, run the complete ordinary auth, registration, and operator-alert smoke matrix before
restoring traffic, confirm the expected deliveries and durable alert, then remove the detached
worktree. The credential-free guard matrix is useful startup/authentication evidence but is not a
substitute for those valid-path smokes.

## Remaining gates

- Resend must be upgraded from Free before production.
- The Supabase Auth limit remains 100/hour until the paid-plan evidence exists and a separate approved Management API PATCH raises only `rate_limit_email_sent` to 1,000/hour.
- Task 10.0f remains open for a controlled/provider-supported transient-failure check and valid-path
  registration-email and operator-alert smokes. Live fault injection was not improvised because it
  could create provider disruption, production records, or unintended mail; use approved fixtures
  and recipients for that final matrix.
