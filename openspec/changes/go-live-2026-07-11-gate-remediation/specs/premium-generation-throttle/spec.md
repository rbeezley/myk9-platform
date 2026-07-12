## ADDED Requirements

### Requirement: Premium generation is atomically rate-limited

Before any paid model request, the system SHALL atomically count and record attempts keyed by authenticated user and show. It SHALL allow at most five attempts in a rolling 15-minute window, return HTTP 429 without calling the model when exhausted, and return HTTP 503 without calling the model when limiter state cannot be checked. Request accounting SHALL use a dedicated RLS-protected table rather than `premium_generations`.

#### Scenario: Sixth attempt is rejected

- **WHEN** one authenticated user makes a sixth generation attempt for the same show inside 15 minutes
- **THEN** the function returns 429 and does not call Claude

#### Scenario: Different show has an independent window

- **WHEN** the same user has exhausted the limit for one show but requests generation for another authorized show
- **THEN** the second show's independent limit is evaluated

#### Scenario: Limiter failure is closed

- **WHEN** the atomic limiter RPC errors or returns unusable data
- **THEN** the function returns 503 and does not call Claude

### Requirement: Premium attempt retention is bounded

Premium generation attempt rows SHALL be indexed by user, show, and attempt time, and rows older than 24 hours SHALL be pruned through a scheduled or opportunistic server-side path unavailable to client roles.

#### Scenario: Old attempts are pruned

- **WHEN** the prune path runs
- **THEN** attempts older than 24 hours are deleted and newer attempts remain available for enforcement

#### Scenario: Limiter lookup is window-bounded

- **WHEN** the atomic limiter evaluates a request
- **THEN** its query is constrained to the user, show, and rolling 15-minute time window using the supporting index
