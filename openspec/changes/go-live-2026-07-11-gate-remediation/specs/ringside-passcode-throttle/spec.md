## ADDED Requirements

### Requirement: Passcode validation fails closed when throttling is unavailable

The `validate-passcode` function SHALL return HTTP 503 before validating a passcode when `check_login_rate_limit` errors or returns unusable data. It SHALL persist a deduplicated operator alert describing the limiter failure without logging or storing the submitted passcode. It SHALL preserve HTTP 429 for a healthy limiter that denies the request.

#### Scenario: Limiter RPC errors

- **WHEN** `check_login_rate_limit` returns an error
- **THEN** the function returns 503, persists a durable alert, and does not call the passcode-validation RPC

#### Scenario: Healthy limiter rejects excess attempts

- **WHEN** `check_login_rate_limit` successfully reports that the caller is rate-limited
- **THEN** the function returns 429 and does not validate the passcode

#### Scenario: Alert contains no passcode

- **WHEN** a limiter failure alert is persisted
- **THEN** its title, detail, dedupe key, and logs contain no submitted passcode value
