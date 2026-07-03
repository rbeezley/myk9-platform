## ADDED Requirements

### Requirement: send-waitlist-invite requires a valid shared secret
The system SHALL reject `send-waitlist-invite` requests that do not present the
shared secret issued to the landing form, and SHALL NOT grant access or generate
a magic link on a denied request.

#### Scenario: Request without the shared secret is denied
- **WHEN** `send-waitlist-invite` is called without the shared secret/token
- **THEN** the function rejects the request and does not call `generateLink` or
  set `access_granted_at`

#### Scenario: Request with a valid shared secret proceeds
- **WHEN** `send-waitlist-invite` is called with the valid shared secret/token
- **THEN** the function grants access and sends the magic link

#### Scenario: Repeated valid requests are idempotent
- **WHEN** `send-waitlist-invite` is called a second time with a valid shared
  secret for the same email
- **THEN** the function does not re-send the invite (`access_invite_sent_at` is
  a no-op on the second call)
