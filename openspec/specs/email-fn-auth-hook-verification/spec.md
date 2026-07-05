# email-fn-auth-hook-verification Specification

## Purpose
SA-005 remediation. GoTrue routes auth emails (signup confirmation, password
reset) through the `send-auth-email` Supabase Send Email Hook, which sends via
Resend. Before this change the function did not verify the hook signature, so a
forged request could originate auth-styled mail from `@myk9show.com`. The
function now verifies the Standard-Webhooks HMAC signature (same primitive as
`resend-webhook`'s Svix HMAC) against the function-env `SEND_EMAIL_HOOK_SECRET`
and fails closed (non-200, no send) when the signature is missing/invalid or the
secret is unset. The secret is **deploy-coupled**: the function env must match
the dashboard auth-hook signing secret, cut over together so live signup/reset
mail never bounces (see `docs/operations/supabase-auth-email.md`). Deployed live
2026-07-04 (v45); verified `200` on a real dashboard-signed password-reset,
signature enforced.

## Requirements
### Requirement: send-auth-email verifies the Standard-Webhooks signature
The system SHALL verify the Standard-Webhooks HMAC signature on every
`send-auth-email` request against the registered `SEND_EMAIL_HOOK_SECRET`, and
SHALL fail closed (reject with a non-200 response, no email sent) when the
signature is missing, invalid, or the secret is unset.

#### Scenario: Unsigned or badly signed payload is rejected
- **WHEN** `send-auth-email` receives a payload with a missing or invalid
  Standard-Webhooks signature
- **THEN** the function returns a non-200 response and does not invoke the
  Resend send

#### Scenario: Correctly signed payload is accepted
- **WHEN** `send-auth-email` receives a payload signed with the registered
  `SEND_EMAIL_HOOK_SECRET`
- **THEN** the function verifies the signature and sends the auth email

#### Scenario: Missing secret configuration fails closed
- **WHEN** `SEND_EMAIL_HOOK_SECRET` is unset in the function's environment
- **THEN** the function rejects all requests with a non-200 response rather than
  accepting unverified payloads
