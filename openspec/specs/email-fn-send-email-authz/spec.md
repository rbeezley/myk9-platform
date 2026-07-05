# email-fn-send-email-authz Specification

## Purpose
SA-004 remediation. The `send-email` edge function originates branded
`@myk9show.com` mail (entry-status notices, custom secretary messages). Before
this change it invoked Resend without authorizing the caller, so any party could
originate mail from the platform domain — a spam/phishing and domain-reputation
risk at launch. The function now requires an authenticated caller (`401` with no
JWT) who is a secretary/admin for the referenced show/registration (mirroring
`send-registration-email`'s role check), and applies per-user rate-limiting
(reusing the `check_login_rate_limit` RPC pattern) so a single caller cannot
originate unbounded volume. Deployed live 2026-07-04 (v58); verified `401` on an
unauthenticated call.

## Requirements
### Requirement: send-email requires show-official authorization
The system SHALL reject calls to the `send-email` edge function from a caller
who is not a secretary or admin for the referenced show/registration, and SHALL
NOT invoke the email provider on a denied call.

#### Scenario: Non-official caller is denied
- **WHEN** a user with no official role on the referenced show calls
  `send-email` for another address
- **THEN** the function returns a 403-class error and does not invoke the Resend
  send

#### Scenario: Show official can send
- **WHEN** a secretary or admin for the referenced show calls `send-email`
- **THEN** the function proceeds and invokes the Resend send

### Requirement: send-email is rate-limited per user
The system SHALL apply per-user rate-limiting to `send-email` so a single caller
cannot originate unbounded email volume.

#### Scenario: Caller exceeds the rate limit
- **WHEN** a caller invokes `send-email` more than the allowed number of times
  within the limiter's window
- **THEN** subsequent calls within the window are rejected
