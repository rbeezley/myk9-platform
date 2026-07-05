## Why

Three branded-email/invite origination edge functions — `send-email`,
`send-auth-email`, and `send-waitlist-invite` — are reachable by an
under-authorized or unauthenticated caller (SA-004, SA-005, SA-013 from
`docs/security-audit-2026-07-03.md`). None of these leak data or escalate
privilege; the risk is spam/phishing from `@myk9show.com` and sender-domain
blocklisting, which is most dangerous right at launch when the domain has no
sending history and Resend/GoTrue rate limits are already fragile
(`project_auth_email_rate_limit`).

## What Changes

- **SA-004** `send-email`: add an authorization check (recipient-is-caller OR
  caller is secretary/admin for the referenced show/registration — recommend
  official-only since the call site is a secretary surface), mirroring the
  existing `send-registration-email` role check. Add per-user rate-limiting.
- **SA-005** `send-auth-email`: implement Standard-Webhooks HMAC verification of
  the Supabase Send Email Hook payload (same primitive as `resend-webhook`'s Svix
  HMAC), failing closed (non-200) when the hook secret is unset or invalid.
  **BREAKING** for ops: requires the `SEND_EMAIL_HOOK_SECRET` to be provisioned
  and registered on the auth hook before/at deploy, coordinated so real
  signup/reset emails don't bounce mid-cutover.
- **SA-013** `send-waitlist-invite`: gate the early-access grant behind a
  shared-secret header the landing form must present, so an anonymous caller with
  only a target email can no longer trigger a grant + magic link.

## Capabilities

### New Capabilities
- `email-fn-send-email-authz`: caller authorization + rate-limiting for the
  `send-email` edge function (SA-004).
- `email-fn-auth-hook-verification`: Standard-Webhooks signature verification for
  the `send-auth-email` Supabase auth hook (SA-005).
- `email-fn-waitlist-invite-authz`: shared-secret gate for the
  `send-waitlist-invite` early-access grant (SA-013).

### Modified Capabilities
(none)

## Impact

- Edge functions: `supabase/functions/send-email/index.ts`,
  `supabase/functions/send-auth-email/index.ts`,
  `supabase/functions/send-waitlist-invite/index.ts`.
- Ops: SA-005 is deploy-coupled — the auth-hook secret registration in the
  Supabase dashboard and the function deploy must flip together, tracked in the
  go-live runbook. Edge-function deploys are confirmation-gated
  (Auto-Mode shared-system rule); verify with `supabase functions list`
  post-deploy.
- Tests: Deno tests per function, assertion-first (reject path red before allow
  path). Codex second opinion required (auth-surface change).
- Fall 2026 launch: protects the platform's sending domain reputation before
  real shows generate real email volume. No UI surface change, so no
  duplication/link question applies.

Full technical detail: `docs/security-audit-2026-07/plan-email-fn-authz.md`.
