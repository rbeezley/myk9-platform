# waitlist-offer-notifications

## Purpose

Defines durable, idempotent delivery of waitlist-offer, reminder, and expiry notifications.

## Requirements

### Requirement: Every offered transition is notified regardless of promotion source

The system SHALL dispatch the offer notification when a waitlist row transitions to `offered`, whether cron, a secretary, or another authorized server path performed the promotion.

#### Scenario: Secretary promotes a waitlist row

- **WHEN** a secretary promotion commits an offered waitlist row
- **THEN** the exhibitor SHALL receive the configured offer email
- **AND** subscribed devices SHALL receive a push notification

#### Scenario: Cron promotes a waitlist row

- **WHEN** the waitlist cron promotes the next row
- **THEN** the same offer notification contract SHALL apply exactly once

### Requirement: Notification links return to the existing entry surface

Offer and reminder notifications SHALL deep-link to My Shows/My Entries with the waitlist-offer id and SHALL NOT expose a raw long-lived payment URL as the only recovery path.

#### Scenario: Exhibitor follows email or push

- **WHEN** the exhibitor follows an offer or reminder notification
- **THEN** the app SHALL open the existing My Shows/My Entries surface
- **AND** it SHALL focus the matching offer after authentication

### Requirement: Reminder and expiry delivery is idempotent

The system SHALL persist one notification-event record per waitlist row, offer cycle, and event type so normal cron retries or duplicate webhooks converge on retryable pending/processing/sent/failed state instead of creating repeated promotion, halfway reminder, or expiry events.

#### Scenario: Cron runs repeatedly after halfway point

- **WHEN** an unpaid offer crosses half of its configured offer window and cron runs more than once
- **THEN** the exhibitor SHALL receive at most one halfway reminder for that offer

#### Scenario: Offer expires

- **WHEN** an unpaid offer is successfully expired
- **THEN** the exhibitor SHALL receive at most one expiry notice
- **AND** no reminder SHALL be sent after expiry

#### Scenario: Paid offer reaches reminder query

- **WHEN** a paid or webhook-reconciling offer is encountered by reminder/expiry processing
- **THEN** the system SHALL not send an unpaid reminder or expiry notice

#### Scenario: Provider fails before accepting delivery

- **WHEN** email or push delivery fails before the provider accepts the message
- **THEN** the event SHALL be recorded as failed with a redacted error
- **AND** a later controlled retry SHALL reuse the same event record

### Requirement: Notification authorization fails closed without blocking valid offer state

The waitlist notification dispatcher SHALL require the dedicated configured secret, reject a service-role bearer as a substitute, validate event payloads, and report delivery failures without rolling back a committed promotion.

#### Scenario: Dedicated secret is missing

- **WHEN** the notification function cannot load its dedicated secret
- **THEN** it SHALL return a service-unavailable response
- **AND** it SHALL not send email or push

#### Scenario: Invalid secret is presented

- **WHEN** the function receives an invalid bearer or shared-secret value
- **THEN** it SHALL reject the request
- **AND** it SHALL not send email or push

#### Scenario: Email provider fails after promotion

- **WHEN** an offer is committed but email delivery fails
- **THEN** the offer SHALL remain valid
- **AND** the failure SHALL be logged and remain eligible for controlled retry
