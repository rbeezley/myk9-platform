# waitlist-cron-outcome-monitoring Specification

## Purpose

Expose real waitlist cron failures to operators without treating retryable notification delivery failures as failed state transitions.

## Requirements

### Requirement: Operational outcomes remain observable

Authenticated waitlist cron runs SHALL report recorded operational errors, including a failed primary expired-offer lookup, as HTTP 500, retain result details, record an error check-in when monitoring is configured, and attempt an operator alert with deduplicated storage and email per scheduled window.

#### Scenario: Expired offer lookup fails

- **WHEN** the expired-offer query fails
- **THEN** the run reports failure with the query error, an error check-in, and an operator alert

#### Scenario: Notification provider requires retry

- **WHEN** state work succeeds and only retryable notification delivery fails
- **THEN** the run reports HTTP 200 and a successful check-in, retains delivery errors, and does not raise a state-failure alert

#### Scenario: Monitoring or alert delivery fails

- **WHEN** observability infrastructure is unavailable
- **THEN** the job still executes and its original operational outcome is preserved

#### Scenario: Unauthorized request

- **WHEN** a request has an invalid cron secret
- **THEN** it is rejected without executing work or reporting a scheduled check-in
