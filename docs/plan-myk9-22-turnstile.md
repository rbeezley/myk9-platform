# MYK9-22 — Ringside CAPTCHA hardening

## Scope

- Treat the existing scheduled cleanup in migrations `20260625000100` and
  `20260625000200` as the completed TTL/hard-delete acceptance criterion; do
  not add a duplicate cleanup job.
- Add Cloudflare Turnstile to the public Supabase Auth flows so project-level
  CAPTCHA protection can be enabled without breaking email or anonymous auth.
- Require a fresh CAPTCHA token before creating an anonymous ringside session.
- Keep CAPTCHA disabled when no public site key is configured, allowing code
  and shared-system configuration to be deployed in separate, safe steps.

The issue's “CAPTCHA on validate-passcode” wording is implemented at the
anonymous-auth boundary immediately before `validate-passcode`: Supabase
verifies the Turnstile token before it creates the anonymous user that the edge
function can stamp. The edge function keeps its existing IP rate limit. A
direct call cannot issue a usable anonymous ringside session without first
passing the CAPTCHA-protected Auth boundary, and one single-use Turnstile token
must not be submitted to both Supabase Auth and Cloudflare Siteverify.

## Implementation

1. Add a reusable Turnstile challenge component and typed client configuration.
2. Thread CAPTCHA tokens through anonymous sign-in and the public email auth
   methods affected by Supabase CAPTCHA protection.
3. Mount/reset the challenge on sign-in, sign-up, password-recovery, resend,
   and the admin-triggered password-recovery form.
4. Allow Turnstile in production and runtime CSP policies; document the public
   environment key and the separate Supabase secret/operator step.

## Testing phase

1. Unit-test anonymous sign-in token forwarding and fail-closed behavior.
2. Unit-test the shared Turnstile component lifecycle and token reset behavior.
3. Update auth-hook contract tests for CAPTCHA token forwarding.
4. Update page tests for disabled-until-verified behavior when CAPTCHA is
   configured, while preserving current behavior when it is not configured.
5. Add static CSP/config assertions and run focused tests, TypeScript checks,
   lint for changed files, and the full app unit suite.

## Shared-system activation (separate approval)

1. Create Cloudflare Turnstile widgets/keys for staging and production.
2. Set `VITE_TURNSTILE_SITE_KEY` in the matching Vercel environments.
3. Enable Turnstile CAPTCHA in Supabase Auth with the secret key.
4. Re-walk new and reused anonymous passcode sessions, email sign-in, sign-up,
   recovery, resend, and admin-triggered recovery on staging before production
   activation.
