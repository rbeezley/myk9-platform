## MODIFIED Requirements

### Requirement: OCC retries are bounded and exhaustion parks the mutation visibly

A queued scoring mutation (the RPC/delta ringside write path) that receives a version-conflict
response SHALL be retried at most 5 times within a sync cycle, with exponential backoff and jitter
(roughly 1s growing to 30s) between attempts, after rebasing onto the authoritative version carried
in the conflict DETAIL. The mutation record in IndexedDB SHALL carry a persisted total attempt
count that survives page reloads; when that total reaches 8, the mutation SHALL be parked: excluded
from further automatic replay, retained with its full payload, and surfaced in the ringside UI as
needing review with explicit retry and discard actions. Parking SHALL never silently discard the
score. (Direct full-row UPDATE mutations are governed by the separate same-field
conflict-resolution flow and are out of scope for this bound.)

#### Scenario: Healthy conflict converges without parking

- **WHEN** a queued score write conflicts once, rebases onto the DETAIL version, and succeeds on
  the next attempt
- **THEN** the mutation completes normally and its attempt counter plays no visible role

#### Scenario: Per-cycle cap stops a hot loop

- **WHEN** a mutation conflicts 5 times within one sync cycle
- **THEN** automatic retries stop for that cycle, backoff having grown between attempts, and the
  mutation remains queued for a later cycle

#### Scenario: Persisted cap survives reloads

- **WHEN** a wedged mutation accumulates 8 total attempts across any number of page reloads
- **THEN** it is parked — no further automatic replay occurs even after reload, the payload is
  preserved, and the ringside UI shows it as needing review

#### Scenario: Parked mutation is user-recoverable

- **WHEN** a user opens the needs-review surface for a parked mutation
- **THEN** they can retry it (resetting eligibility for replay) or discard it with an explicit
  confirmation, and no other path deletes it
