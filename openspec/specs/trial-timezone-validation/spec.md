# trial-timezone-validation Specification

## Purpose
getTrialTimezone validates the stored IANA zone (Intl probe) and fails safe to America/New_York with a once-per-session Sentry report, so callers never receive a string that makes Intl/toLocaleDateString throw. Introduced by money-path-hardening-remainder (TZ-01).
## Requirements
### Requirement: Trial timezone reads validate the IANA name and fail safe
`getTrialTimezone` SHALL validate that the stored timezone is a resolvable IANA zone name and SHALL return the documented default (`'America/New_York'`) when the value is missing, empty, or invalid. Callers SHALL never receive a string that makes `Intl`/`toLocaleDateString` throw.

#### Scenario: Invalid stored timezone falls back to the default
- **WHEN** a trial row carries `timezone = 'America/Nowhere'`
- **THEN** `getTrialTimezone` returns `'America/New_York'` and downstream landing-page dates render normally (not blank)

#### Scenario: Valid timezone passes through
- **WHEN** a trial row carries `timezone = 'America/Chicago'`
- **THEN** `getTrialTimezone` returns `'America/Chicago'`

#### Scenario: DST boundaries render consistently
- **WHEN** a trial date falls on a spring-forward or fall-back boundary in a valid zone
- **THEN** formatted dates are identical regardless of the viewing device's local timezone

### Requirement: Invalid timezone values are observable
When `getTrialTimezone` falls back due to an invalid value, the system SHALL emit an observable error signal (e.g. a Sentry capture or breadcrumb including the trial id and the rejected value) so bad data can be repaired, rather than failing silently.

#### Scenario: Fallback is reported once per read path
- **WHEN** an invalid timezone triggers the fallback
- **THEN** an error event containing the rejected value is emitted
