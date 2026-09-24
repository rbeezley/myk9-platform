## ADDED Requirements

### Requirement: Account entry identity survives a cold offline boot

The system SHALL persist an authenticated user's confirmed person identifier in an account-scoped device cache and SHALL restore that identifier before an online profile lookup completes. A cached identifier MUST only be used for the same authenticated user and MUST be cleared when that account is replaced or signed out.

#### Scenario: Cold offline boot with a persisted identity

- **WHEN** a previously identified exhibitor starts the app offline with a persisted authenticated session
- **THEN** account-level entry reads SHALL execute with that exhibitor's persisted person identifier
- **AND** the local entry replica SHALL remain reachable without waiting for the profile network request

#### Scenario: Account changes on a shared device

- **WHEN** the authenticated user changes or signs out
- **THEN** the prior user's persisted person identifier MUST NOT be exposed to the new or signed-out session

### Requirement: Account entry surfaces distinguish unresolved and absent identity

The system MUST distinguish a profile lookup that has not resolved from a completed lookup that confirms no person record. An unresolved identity MUST NOT be presented as a confirmed empty entry history.

#### Scenario: Profile lookup is paused or unavailable and no cache exists

- **WHEN** authentication has settled but the person identity has neither resolved online nor been restored from cache
- **THEN** account entry surfaces SHALL remain in an unresolved state
- **AND** SHALL NOT claim that the exhibitor has no entries

#### Scenario: Profile lookup confirms no person record

- **WHEN** the authoritative profile lookup completes successfully with no matching person
- **THEN** identity state SHALL record a confirmed missing person separately from an unresolved lookup
