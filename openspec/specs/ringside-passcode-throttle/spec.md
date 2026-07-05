# ringside-passcode-throttle Specification

## Purpose
Close the SA-011 un-throttled passcode brute-force path against
`upsert_ringside_session` (the ringside presence heartbeat RPC). The RPC no
longer re-validates a raw passcode inline; instead it authorizes on the
forge-proof `app_metadata { kind:'ringside_passcode', show_id, ringside_role }`
claim minted (and IP-rate-limited) by the `validate-passcode` edge function, and
is not executable by `anon`. This removes the brute-force surface rather than
merely throttling it, while preserving legitimate passcode ringside sign-in.

## Requirements
### Requirement: Direct passcode brute-force via upsert_ringside_session is blocked
The system SHALL prevent unbounded passcode-guessing attempts against
`upsert_ringside_session` by requiring a pre-validated claim minted by the
rate-limited `validate-passcode` edge function. `upsert_ringside_session` SHALL
NOT re-validate a raw passcode, SHALL read the ringside role and show scope only
from the forge-proof `app_metadata` claim (never from client input or
`user_metadata`), and SHALL NOT be executable by the `anon` role.

#### Scenario: Raw passcode without a valid claim is denied
- **WHEN** `upsert_ringside_session` is called with a raw passcode and no valid
  edge-function-minted claim (and no authenticated account context)
- **THEN** the call is denied

#### Scenario: Valid claim upserts the session
- **WHEN** `upsert_ringside_session` is called by a session carrying a valid
  edge-function-minted `ringside_passcode` claim
- **THEN** the ringside session upserts successfully, scoped to the claim's show
  and role

#### Scenario: Legitimate passcode sign-in still works end-to-end
- **WHEN** a judge or steward enters a correct, unexpired ringside passcode
  through the normal sign-in flow
- **THEN** the ringside session is established, proven by a component test and
  a live cold-session ringside walk
