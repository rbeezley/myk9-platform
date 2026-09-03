## ADDED Requirements

### Requirement: Only supported email types are accepted

The endpoint SHALL accept only `entry_decision` and `support_notification`, subject to existing resource authorization and server-derived recipient rules. Unsupported types SHALL receive HTTP 400 without sending email.

#### Scenario: Retired type is submitted

- **WHEN** an authenticated caller requests `entry_confirmation`, `payment_receipt`, `welcome`, or `waitlist_offer`
- **THEN** the request is rejected with HTTP 400 before recipient lookup or email delivery

#### Scenario: Supported type is authorized

- **WHEN** an authorized caller submits either supported type
- **THEN** the existing content, resource-based recipient, and rate-limit behavior are preserved
