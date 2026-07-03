## ADDED Requirements

### Requirement: Direct passcode brute-force via upsert_ringside_session is blocked
The system SHALL prevent unbounded passcode-guessing attempts against
`upsert_ringside_session`, either by requiring a pre-validated claim/token
minted by the rate-limited `validate-passcode` edge function (recommended) or by
throttling repeated failed attempts inside the RPC (interim fallback).

#### Scenario: Recommended design — raw passcode without a valid claim is denied
- **WHEN** `upsert_ringside_session` is called with a raw passcode and no valid
  edge-function-minted claim
- **THEN** the call is denied

#### Scenario: Recommended design — valid claim upserts the session
- **WHEN** `upsert_ringside_session` is called with a valid edge-function-minted
  `ringside_passcode` claim
- **THEN** the session upserts successfully

#### Scenario: Interim design — repeated wrong-passcode attempts are throttled
- **WHEN** a caller makes more than the allowed number of `upsert_ringside_session`
  calls with an incorrect passcode from the same key within the limiter's window
- **THEN** the next attempt within the window is rejected/blocked

#### Scenario: Legitimate passcode sign-in still works end-to-end
- **WHEN** a judge or steward enters a correct, unexpired ringside passcode
  through the normal sign-in flow
- **THEN** the ringside session is established, proven by a component test and
  a live cold-session ringside walk
