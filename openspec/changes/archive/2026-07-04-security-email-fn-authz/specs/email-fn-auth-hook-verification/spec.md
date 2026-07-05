## ADDED Requirements

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
